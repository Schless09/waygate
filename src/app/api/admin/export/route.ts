import { isAdmin } from "@/lib/auth";
import { integrityReport } from "@/lib/integrity";
import type { PiiResult } from "@/lib/pii";
import type { QaChecks } from "@/lib/scoring/qa-checks";
import { isPracticeClip } from "@/lib/practice";
import type { ReferenceUtterance, Telemetry } from "@/lib/types";
import { getSupabaseAdmin } from "@/lib/supabase";

const csvCell = (value: unknown) => `"${String(value ?? "").replaceAll('"', '""')}"`;

export async function GET() {
  if (!(await isAdmin())) return new Response("Unauthorized", { status: 401 });

  const { data, error } = await getSupabaseAdmin()
    .from("trial_attempts")
    .select(
      "candidate:trial_candidates(name,email,created_at),assessment:trial_assessments(role,completed_at),clip:trial_clips(slug,title,sort_order,duration_seconds,reference_utterances,task_type),started_at,submitted_at,active_seconds,transcript,telemetry,qa_review,score:trial_scores(wer,transcription_score,speaker_score,pace_score,pace_ratio,format_score,total_score,claude_feedback,pii_result,error)",
    )
    .order("submitted_at", { ascending: false });
  if (error) return new Response(error.message, { status: 500 });

  const header = [
    "name", "email", "candidate_created_at", "role", "completed_at", "clip", "practice", "started_at",
    "submitted_at", "active_seconds", "wer", "transcription_score", "speaker_score",
    "pace_score", "pace_ratio", "format_score", "total_score", "qa_errors_fixed", "qa_errors_missed", "pii_recall", "pii_precision", "pii_missed", "integrity_score", "integrity_reasons", "review_notes", "error",
  ];
  const rows = (data ?? []).map((row) => {
    const candidate = Array.isArray(row.candidate) ? row.candidate[0] : row.candidate;
    const assessment = Array.isArray(row.assessment) ? row.assessment[0] : row.assessment;
    const clip = Array.isArray(row.clip) ? row.clip[0] : row.clip;
    const score = Array.isArray(row.score) ? row.score[0] : row.score;
    const pii = score?.pii_result as PiiResult | null | undefined;
    const qaChecks = (score?.claude_feedback as { qa_checks?: QaChecks } | null)?.qa_checks;
    const integrity = row.submitted_at && clip?.task_type !== "pii"
      ? integrityReport({
          telemetry: row.telemetry as Partial<Telemetry> | null,
          transcript: row.transcript ?? "",
          utterances: (clip?.reference_utterances ?? []) as ReferenceUtterance[],
          durationSeconds: clip?.duration_seconds ?? 0,
          activeSeconds: row.active_seconds,
          role: assessment?.role ?? "annotator",
        })
      : null;
    return [
      candidate?.name, candidate?.email, candidate?.created_at, assessment?.role, assessment?.completed_at,
      clip?.title, clip ? isPracticeClip(clip.sort_order) : "", row.started_at, row.submitted_at, row.active_seconds, score?.wer,
      score?.transcription_score, score?.speaker_score, score?.pace_score, score?.pace_ratio,
      score?.format_score, score?.total_score,
      qaChecks ? `${qaChecks.caught}/${qaChecks.total}` : "",
      qaChecks?.checks.filter((check) => !check.fixed).map((check) => `turn ${check.turn} ${check.type}`).join("; "),
      pii?.recall, pii?.precision,
      pii?.entities.filter((entity) => entity.status !== "found").map((entity) => `${entity.text} (${entity.status})`).join("; "),
      integrity?.score,
      integrity?.reasons.map((reason) => `${reason.label} (-${reason.penalty})`).join("; "),
      (row.qa_review as { notes?: string } | null)?.notes, score?.error,
    ].map(csvCell).join(",");
  });

  return new Response([header.join(","), ...rows].join("\n"), {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": 'attachment; filename="assessment-results.csv"',
    },
  });
}
