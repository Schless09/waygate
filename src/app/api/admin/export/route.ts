import { isAdmin } from "@/lib/auth";
import { getSupabaseAdmin } from "@/lib/supabase";

const csvCell = (value: unknown) => `"${String(value ?? "").replaceAll('"', '""')}"`;

export async function GET() {
  if (!(await isAdmin())) return new Response("Unauthorized", { status: 401 });

  const { data, error } = await getSupabaseAdmin()
    .from("trial_attempts")
    .select(
      "candidate:trial_candidates(name,email,created_at),assessment:trial_assessments(role,completed_at),clip:trial_clips(slug,title),started_at,submitted_at,active_seconds,qa_review,score:trial_scores(wer,transcription_score,speaker_score,pace_score,pace_ratio,format_score,total_score,error)",
    )
    .order("submitted_at", { ascending: false });
  if (error) return new Response(error.message, { status: 500 });

  const header = [
    "name", "email", "candidate_created_at", "role", "completed_at", "clip", "started_at",
    "submitted_at", "active_seconds", "wer", "transcription_score", "speaker_score",
    "pace_score", "pace_ratio", "format_score", "total_score", "review_notes", "error",
  ];
  const rows = (data ?? []).map((row) => {
    const candidate = Array.isArray(row.candidate) ? row.candidate[0] : row.candidate;
    const assessment = Array.isArray(row.assessment) ? row.assessment[0] : row.assessment;
    const clip = Array.isArray(row.clip) ? row.clip[0] : row.clip;
    const score = Array.isArray(row.score) ? row.score[0] : row.score;
    return [
      candidate?.name, candidate?.email, candidate?.created_at, assessment?.role, assessment?.completed_at,
      clip?.title, row.started_at, row.submitted_at, row.active_seconds, score?.wer,
      score?.transcription_score, score?.speaker_score, score?.pace_score, score?.pace_ratio,
      score?.format_score, score?.total_score,
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
