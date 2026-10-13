import "server-only";

import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import { getSupabaseAdmin } from "@/lib/supabase";
import { CLAUDE_MODEL, SCORE_WEIGHTS } from "./config";
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

async function evaluateWithClaude(reference: unknown, candidate: string) {
  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  const prompt = `Reference utterances (speaker labels and seconds):
${JSON.stringify(reference)}

Candidate transcript:
${candidate}

Evaluate speaker attribution. Find the best mapping from candidate labels to reference labels, estimate the percentage of words assigned to the correct speaker, verify the speaker count, and count missed and false turn changes.
Also evaluate format: [mm:ss] timestamps and whether they are roughly within 5 seconds of reference turn starts, appropriate [inaudible]/[crosstalk] usage, and clean verbatim (filler "um"/"uh" removed, other content retained).

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
    .from("attempts")
    .select(
      "id,transcript,active_seconds,clip:clips(duration_seconds,reference_text,reference_utterances)",
    )
    .eq("id", attemptId)
    .single();

  if (error || !attempt) throw error ?? new Error("Attempt not found");
  const clip = Array.isArray(attempt.clip) ? attempt.clip[0] : attempt.clip;
  if (!clip) throw new Error("Clip not found");

  const wer = wordErrorRate(clip.reference_text, attempt.transcript ?? "");
  const transcriptionScore = Math.max(0, 100 * (1 - wer));
  const pace = paceScore(attempt.active_seconds, clip.duration_seconds);

  await supabase.from("scores").upsert(
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
    );
    const total =
      transcriptionScore * SCORE_WEIGHTS.transcription +
      feedback.speaker_score * SCORE_WEIGHTS.speaker +
      pace.score * SCORE_WEIGHTS.pace +
      feedback.format_score * SCORE_WEIGHTS.format;

    const { error: saveError } = await supabase.from("scores").upsert(
      {
        attempt_id: attemptId,
        wer,
        transcription_score: transcriptionScore,
        speaker_score: feedback.speaker_score,
        pace_score: pace.score,
        pace_ratio: pace.ratio,
        format_score: feedback.format_score,
        total_score: total,
        claude_feedback: feedback,
        scored_at: new Date().toISOString(),
        error: null,
      },
      { onConflict: "attempt_id" },
    );
    if (saveError) throw saveError;
  } catch (scoringError) {
    const message =
      scoringError instanceof Error ? scoringError.message : "Unknown scoring error";
    await supabase.from("scores").upsert(
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
