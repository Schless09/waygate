import "server-only";

import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import { getSupabaseAdmin } from "@/lib/supabase";
import {
  ANNOTATOR_SCORE_WEIGHTS,
  CLAUDE_MODEL,
  QA_SCORE_WEIGHTS,
} from "./config";
import { paceScore, wordErrorRate } from "./deterministic";

const claudeResultSchema = z.object({
  speaker_mapping: z.record(z.string(), z.string()),
  correct_speaker_count: z.boolean(),
  pct_words_correct_speaker: z.number().min(0).max(100),
  missed_turns: z.number().int().min(0),
  false_turns: z.number().int().min(0),
  speaker_score: z.number().min(0).max(100),
  notes: z.string(),
  format_score: z.number().min(0).max(100),
  format_notes: z.string(),
  strengths: z.array(z.string()),
  weaknesses: z.array(z.string()),
});

function extractJson(value: string) {
  const trimmed = value.trim().replace(/^```json\s*/i, "").replace(/\s*```$/, "");
  return claudeResultSchema.parse(JSON.parse(trimmed));
}

async function evaluateWithClaude(
  reference: unknown,
  candidate: string,
  role: string,
  review: unknown,
  errorKey: unknown,
) {
  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  const roleGuidance =
    role === "qa"
      ? `This is a QA review assessment. format_score measures the REVIEWER'S WORK, not the quality already present in the supplied flawed transcript.
- Compare the candidate's corrected transcript and reviewer notes with the seeded error list.
- Give credit for correctly fixing and explicitly explaining seeded errors, accurate severity judgments, and actionable feedback.
- Do not award points merely because the prefilled transcript already has valid timestamps, labels, or mostly correct words.
- Gibberish, generic, or non-actionable reviewer notes must receive format_score 0.
- If the candidate leaves all seeded errors uncorrected and unidentified, format_score must be 0.
- Base strengths and weaknesses on the candidate's review actions.`
      : `This is an annotator assessment. format_score measures timestamp format and accuracy, appropriate bracket tags, speaker-turn formatting, and clean-verbatim adherence.`;
  const prompt = `Reference utterances (speaker labels and seconds):
${JSON.stringify(reference)}

Candidate transcript:
${candidate}

Assessment role: ${role}
Reviewer notes (QA only): ${JSON.stringify(review)}
Seeded QA errors (QA only): ${JSON.stringify(errorKey)}

Evaluate speaker attribution. Find the best mapping from candidate labels to reference labels, estimate the percentage of words assigned to the correct speaker, verify the speaker count, and count missed and false turn changes.
${roleGuidance}

Return exactly this JSON shape:
{"speaker_mapping":{},"correct_speaker_count":true,"pct_words_correct_speaker":0,"missed_turns":0,"false_turns":0,"speaker_score":0,"notes":"","format_score":0,"format_notes":"","strengths":[],"weaknesses":[]}`;

  let lastError: unknown;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const response = await anthropic.messages.create({
        model: CLAUDE_MODEL,
        max_tokens: 1500,
        system:
          "You score audio transcription trials. Return only valid JSON matching the requested schema, with no markdown or commentary.",
        messages: [{ role: "user", content: prompt }],
      });
      const text = response.content.find((block) => block.type === "text");
      if (!text || text.type !== "text") throw new Error("Claude returned no text");
      return extractJson(text.text);
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError;
}

export async function scoreAttempt(attemptId: string) {
  const supabase = getSupabaseAdmin();
  const { data: attempt, error } = await supabase
    .from("trial_attempts")
    .select(
      "id,transcript,active_seconds,qa_review,assessment:trial_assessments(role),clip:trial_clips(duration_seconds,reference_text,reference_utterances,qa_source_transcript,qa_error_key)",
    )
    .eq("id", attemptId)
    .single();

  if (error || !attempt) throw error ?? new Error("Attempt not found");
  const clip = Array.isArray(attempt.clip) ? attempt.clip[0] : attempt.clip;
  const assessment = Array.isArray(attempt.assessment)
    ? attempt.assessment[0]
    : attempt.assessment;
  if (!clip) throw new Error("Clip not found");

  const wer = wordErrorRate(clip.reference_text, attempt.transcript ?? "");
  const initialQaWer =
    assessment?.role === "qa" && clip.qa_source_transcript
      ? wordErrorRate(clip.reference_text, clip.qa_source_transcript)
      : null;
  const transcriptionScore =
    initialQaWer && initialQaWer > 0
      ? Math.max(0, Math.min(100, (100 * (initialQaWer - wer)) / initialQaWer))
      : Math.max(0, 100 * (1 - wer));
  const pace = paceScore(attempt.active_seconds, clip.duration_seconds);

  await supabase.from("trial_scores").upsert(
    {
      attempt_id: attemptId,
      wer,
      transcription_score: transcriptionScore,
      pace_score: pace.score,
      pace_ratio: pace.ratio,
      error: null,
    },
    { onConflict: "attempt_id" },
  );

  try {
    const feedback = await evaluateWithClaude(
      clip.reference_utterances,
      attempt.transcript ?? "",
      assessment?.role ?? "annotator",
      attempt.qa_review,
      clip.qa_error_key,
    );
    const role = assessment?.role ?? "annotator";
    const reviewNotes =
      attempt.qa_review &&
      typeof attempt.qa_review === "object" &&
      "notes" in attempt.qa_review &&
      typeof attempt.qa_review.notes === "string"
        ? attempt.qa_review.notes
        : "";
    const reviewWordCount = reviewNotes.match(/\p{L}+/gu)?.length ?? 0;
    const formatScore =
      role === "qa" && reviewWordCount < 8
        ? Math.min(5, feedback.format_score)
        : feedback.format_score;
    const gradedFeedback =
      formatScore === feedback.format_score
        ? feedback
        : {
            ...feedback,
            format_score: formatScore,
            format_notes: `${feedback.format_notes} Reviewer notes contained fewer than eight words, so the QA review score was capped at 5.`,
          };
    const weights =
      role === "qa" ? QA_SCORE_WEIGHTS : ANNOTATOR_SCORE_WEIGHTS;
    const total =
      transcriptionScore * weights.transcription +
      gradedFeedback.speaker_score * weights.speaker +
      pace.score * weights.pace +
      gradedFeedback.format_score * weights.format;

    const { error: saveError } = await supabase.from("trial_scores").upsert(
      {
        attempt_id: attemptId,
        wer,
        transcription_score: transcriptionScore,
        speaker_score: gradedFeedback.speaker_score,
        pace_score: pace.score,
        pace_ratio: pace.ratio,
        format_score: gradedFeedback.format_score,
        total_score: total,
        claude_feedback: gradedFeedback,
        scored_at: new Date().toISOString(),
        error: null,
      },
      { onConflict: "attempt_id" },
    );
    if (saveError) throw saveError;
  } catch (scoringError) {
    const message =
      scoringError instanceof Error ? scoringError.message : "Unknown scoring error";
    await supabase.from("trial_scores").upsert(
      {
        attempt_id: attemptId,
        wer: null,
        transcription_score: null,
        pace_score: null,
        pace_ratio: null,
        speaker_score: null,
        format_score: null,
        total_score: null,
        claude_feedback: null,
        scored_at: null,
        error: message.slice(0, 2000),
      },
      { onConflict: "attempt_id" },
    );
  }
}
