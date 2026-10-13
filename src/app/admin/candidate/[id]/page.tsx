import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { RescoreButton } from "@/components/admin-actions";
import { isAdmin } from "@/lib/auth";
import { effortFlags, quizScore, tagUsage, timestampAccuracy } from "@/lib/quality-checks";
import type { ReferenceUtterance, Telemetry } from "@/lib/types";
import { getSupabaseAdmin } from "@/lib/supabase";

export const dynamic = "force-dynamic";

const scoreValue = (value: number | null | undefined) =>
  value === null || value === undefined ? "—" : value.toFixed(1);

export default async function CandidateDetail({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  if (!(await isAdmin())) redirect("/admin");
  const { id } = await params;
  const { data: candidate } = await getSupabaseAdmin()
    .from("trial_candidates")
    .select("id,name,email,created_at,completed_at")
    .eq("id", id)
    .maybeSingle();
  if (!candidate) notFound();

  const { data: attempts } = await getSupabaseAdmin()
    .from("trial_attempts")
    .select("id,started_at,submitted_at,active_seconds,transcript,telemetry,qa_review,assessment:trial_assessments(role),clip:trial_clips(title,role,sort_order,duration_seconds,reference_text,reference_utterances),score:trial_scores(wer,transcription_score,speaker_score,pace_score,pace_ratio,format_score,total_score,claude_feedback,scored_at,error)")
    .eq("candidate_id", id)
    .order("started_at");

  return (
    <main className="mx-auto min-h-screen max-w-6xl px-6 py-12">
      <Link href="/admin" className="text-sm text-slate-600 hover:text-slate-900">← All candidates</Link>
      <div className="mt-6">
        <h1 className="text-3xl font-semibold">{candidate.name}</h1>
        <p className="mt-1 text-slate-600">{candidate.email}</p>
      </div>

      <div className="mt-8 space-y-10">
        {(attempts ?? []).map((attempt) => {
          const clip = Array.isArray(attempt.clip) ? attempt.clip[0] : attempt.clip;
          const assessment = Array.isArray(attempt.assessment) ? attempt.assessment[0] : attempt.assessment;
          const score = Array.isArray(attempt.score) ? attempt.score[0] : attempt.score;
          const feedback = (score?.claude_feedback ?? {}) as Record<string, unknown>;
          const telemetry = attempt.telemetry as Partial<Telemetry> | null;
          const utterances = (clip?.reference_utterances ?? []) as ReferenceUtterance[];
          const transcript = attempt.transcript ?? "";
          const quiz = quizScore(telemetry?.quizAnswers);
          const timestamps = timestampAccuracy(transcript, utterances);
          const tags = tagUsage(transcript, utterances);
          const flags = attempt.submitted_at
            ? effortFlags(telemetry, clip?.duration_seconds ?? 0, attempt.active_seconds)
            : [];
          return (
            <section key={attempt.id} className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
              <div className="flex items-center justify-between gap-4">
                <div><p className="text-sm capitalize text-slate-500">{assessment?.role === "qa" ? "QA reviewer" : "Annotator"} · Clip {clip?.sort_order}</p><h2 className="text-xl font-semibold">{clip?.title}</h2></div>
                {attempt.submitted_at && <RescoreButton attemptId={attempt.id} />}
              </div>
              {score?.error && <p className="mt-4 rounded-lg bg-red-50 p-3 text-sm text-red-800">{score.error}</p>}
              <dl className="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-4 lg:grid-cols-7">
                {[
                  ["Total", scoreValue(score?.total_score)],
                  ["Transcription", scoreValue(score?.transcription_score)],
                  ["Speaker", scoreValue(score?.speaker_score)],
                  ["Pace", scoreValue(score?.pace_score)],
                  ["Format", scoreValue(score?.format_score)],
                  ["WER", scoreValue(score?.wer)],
                  ["Pace ratio", scoreValue(score?.pace_ratio)],
                ].map(([label, value]) => <div key={label} className="rounded-lg bg-slate-50 p-3"><dt className="text-xs text-slate-500">{label}</dt><dd className="mt-1 font-semibold">{value}</dd></div>)}
              </dl>
              <dl className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-4">
                {[
                  ["Guideline quiz", quiz ? `${quiz.correct}/${quiz.total}` : "—"],
                  ["Timestamps", timestamps.count ? `${timestamps.count} · median drift ${timestamps.medianDrift?.toFixed(0)}s` : "None"],
                  ["[crosstalk] tags", `${tags.crosstalk} · ${tags.overlapsInAudio} overlaps in audio`],
                  ["[inaudible] tags", String(tags.inaudible)],
                ].map(([label, value]) => <div key={label} className="rounded-lg border border-slate-200 p-3"><dt className="text-xs text-slate-500">{label}</dt><dd className="mt-1 text-sm font-semibold">{value}</dd></div>)}
              </dl>
              {flags.length > 0 && (
                <div className="mt-4 rounded-lg bg-amber-50 p-4 text-sm text-amber-900">
                  <strong>Effort red flags</strong>
                  <ul className="mt-2 list-disc pl-5">{flags.map((flag) => <li key={flag}>{flag}</li>)}</ul>
                </div>
              )}
              <div className="mt-6 grid gap-5 lg:grid-cols-3">
                <div><h3 className="text-sm font-semibold">Telemetry</h3><pre className="mt-2 overflow-auto rounded-lg bg-slate-950 p-4 text-xs text-slate-100">{JSON.stringify(attempt.telemetry, null, 2)}</pre></div>
                <div><h3 className="text-sm font-semibold">Strengths</h3><ul className="mt-2 list-disc pl-5 text-sm text-slate-700">{((feedback.strengths as string[]) ?? []).map((item) => <li key={item}>{item}</li>)}</ul></div>
                <div><h3 className="text-sm font-semibold">Weaknesses</h3><ul className="mt-2 list-disc pl-5 text-sm text-slate-700">{((feedback.weaknesses as string[]) ?? []).map((item) => <li key={item}>{item}</li>)}</ul></div>
              </div>
              <div className="mt-5 grid gap-4 sm:grid-cols-2">
                <div className="rounded-lg bg-slate-50 p-4 text-sm"><strong>Speaker notes</strong><p className="mt-2 whitespace-pre-wrap text-slate-700">{String(feedback.notes ?? "—")}</p></div>
                <div className="rounded-lg bg-slate-50 p-4 text-sm"><strong>Format notes</strong><p className="mt-2 whitespace-pre-wrap text-slate-700">{String(feedback.format_notes ?? "—")}</p></div>
              </div>
              {assessment?.role === "qa" && (
                <div className="mt-5 rounded-lg border border-slate-200 p-4 text-sm">
                  <strong>Candidate reviewer notes</strong>
                  <p className="mt-2 whitespace-pre-wrap text-slate-700">
                    {String((attempt.qa_review as { notes?: string } | null)?.notes ?? "—")}
                  </p>
                </div>
              )}
              <div className="mt-6 grid gap-5 lg:grid-cols-2">
                <div><h3 className="mb-2 text-sm font-semibold">Candidate transcript</h3><pre className="max-h-[500px] overflow-auto whitespace-pre-wrap rounded-lg border border-slate-200 p-4 font-mono text-xs leading-5">{attempt.transcript || "—"}</pre></div>
                <div><h3 className="mb-2 text-sm font-semibold">Reference transcript</h3><pre className="max-h-[500px] overflow-auto whitespace-pre-wrap rounded-lg border border-slate-200 p-4 font-mono text-xs leading-5">{clip?.reference_text || "—"}</pre></div>
              </div>
            </section>
          );
        })}
      </div>
    </main>
  );
}
