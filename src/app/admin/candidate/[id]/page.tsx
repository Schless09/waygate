import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft, ShieldCheck, TriangleAlert } from "lucide-react";
import { RescoreButton } from "@/components/admin-actions";
import { ScorePill } from "@/components/score-pill";
import { isAdmin } from "@/lib/auth";
import { integrityReport } from "@/lib/integrity";
import { isPracticeClip, realClipNumber } from "@/lib/practice";
import { quizScore, tagUsage, timestampAccuracy } from "@/lib/quality-checks";
import type { ReferenceUtterance, Telemetry } from "@/lib/types";
import { getSupabaseAdmin } from "@/lib/supabase";

export const dynamic = "force-dynamic";

type DiscardedAttempt = {
  id: string;
  submitted_at: string | null;
  active_seconds: number | null;
  clip: { title: string } | null;
  score: { total_score: number | null } | { total_score: number | null }[] | null;
};

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

  const { data: restarts } = await getSupabaseAdmin()
    .from("trial_assessments")
    .select("role,restarted_at,discarded_attempts")
    .eq("candidate_id", id)
    .not("restarted_at", "is", null);

  return (
    <main className="mx-auto min-h-screen max-w-6xl px-6 py-12">
      <Link href="/admin" className="inline-flex items-center gap-1 text-sm font-medium text-brand-700 hover:text-brand-900"><ArrowLeft className="size-4" /> All candidates</Link>
      <div className="mt-6">
        <h1 className="text-3xl font-medium tracking-tight">{candidate.name}</h1>
        <p className="mt-1 text-slate-600">{candidate.email}</p>
      </div>

      {(restarts ?? []).map((restart) => {
        const discarded = (restart.discarded_attempts ?? []) as DiscardedAttempt[];
        return (
          <section key={restart.role} className="card mt-8 border-l-4 border-l-amber-400 p-6">
            <p className="eyebrow">{restart.role === "qa" ? "QA reviewer" : "Annotator"} · Restarted</p>
            <h2 className="mt-1 text-lg font-medium tracking-tight">
              Used their one restart on {new Date(restart.restarted_at!).toLocaleString()}
            </h2>
            <p className="mt-1 text-sm text-slate-600">
              This in-progress clip attempt was discarded and the clip restarted. The candidate had already heard some of this audio, so treat the second attempt with that in mind.
            </p>
            <ul className="mt-4 divide-y divide-brand-100 text-sm">
              {discarded.map((attempt) => {
                const score = Array.isArray(attempt.score) ? attempt.score[0] : attempt.score;
                return (
                  <li key={attempt.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
                    <span className="font-medium">{attempt.clip?.title ?? "Clip"}</span>
                    <span className="flex items-center gap-4 text-slate-600">
                      <span>{attempt.submitted_at ? "Submitted" : "In progress"}</span>
                      <span>{Math.round((attempt.active_seconds ?? 0) / 60)} min</span>
                      <ScorePill value={score?.total_score} />
                    </span>
                  </li>
                );
              })}
            </ul>
          </section>
        );
      })}

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
          const integrity = attempt.submitted_at
            ? integrityReport({
                telemetry,
                transcript,
                utterances,
                durationSeconds: clip?.duration_seconds ?? 0,
                activeSeconds: attempt.active_seconds,
                role: assessment?.role ?? "annotator",
              })
            : null;
          const { heard, snapshots, ...telemetrySummary } = telemetry ?? {};
          return (
            <section key={attempt.id} className="card p-6 sm:p-8">
              <div className="flex items-center justify-between gap-4">
                <div><p className="eyebrow">{assessment?.role === "qa" ? "QA reviewer" : "Annotator"} · {clip && isPracticeClip(clip.sort_order) ? "Practice (not counted)" : `Clip ${realClipNumber(clip?.sort_order ?? 0)}`}</p><h2 className="mt-1 text-xl font-medium tracking-tight">{clip?.title}</h2></div>
                <div className="ml-auto text-right"><p className="text-xs text-slate-500">Total</p><div className="mt-1 text-lg"><ScorePill value={score?.total_score} /></div></div>
                {attempt.submitted_at && <RescoreButton attemptId={attempt.id} />}
              </div>
              {score?.error && <p className="mt-4 rounded-lg bg-red-50 p-3 text-sm text-red-800">{score.error}</p>}
              <dl className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
                {[
                  ["Transcription", scoreValue(score?.transcription_score)],
                  ["Speaker", scoreValue(score?.speaker_score)],
                  ["Pace", scoreValue(score?.pace_score)],
                  ["Format", scoreValue(score?.format_score)],
                  ["WER", scoreValue(score?.wer)],
                  ["Pace ratio", scoreValue(score?.pace_ratio)],
                ].map(([label, value]) => <div key={label} className="rounded-xl bg-brand-50/60 p-3 ring-1 ring-brand-100"><dt className="text-xs text-slate-500">{label}</dt><dd className="mt-1 font-semibold">{value}</dd></div>)}
              </dl>
              <dl className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
                {[
                  ["Guideline quiz", quiz ? `${quiz.correct}/${quiz.total}` : "—"],
                  ["Timestamps", timestamps.count ? `${timestamps.count} · median drift ${timestamps.medianDrift?.toFixed(0)}s` : "None"],
                  ["[crosstalk] tags", `${tags.crosstalk} · ${tags.overlapsInAudio} overlaps in audio`],
                  ["[inaudible] tags", String(tags.inaudible)],
                ].map(([label, value]) => <div key={label} className="rounded-xl p-3 ring-1 ring-slate-200"><dt className="text-xs text-slate-500">{label}</dt><dd className="mt-1 text-sm font-semibold">{value}</dd></div>)}
              </dl>
              {integrity && (
                <div className={`mt-4 rounded-xl p-4 text-sm ring-1 ${integrity.reasons.length ? "bg-amber-50 text-amber-900 ring-amber-200" : "bg-emerald-50 text-emerald-900 ring-emerald-200"}`}>
                  <div className="flex items-center justify-between gap-3">
                    <strong className="flex items-center gap-1.5">
                      {integrity.reasons.length ? <TriangleAlert className="size-4" /> : <ShieldCheck className="size-4" />} Integrity
                    </strong>
                    <ScorePill value={integrity.score} />
                  </div>
                  {integrity.reasons.length > 0 ? (
                    <ul className="mt-3 space-y-1.5">
                      {integrity.reasons.map((reason) => (
                        <li key={reason.label} className="flex items-start justify-between gap-4">
                          <span>{reason.label}</span>
                          <span className="shrink-0 font-semibold tabular-nums">−{reason.penalty}</span>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="mt-2">No suspicious behaviour detected.</p>
                  )}
                  <p className="mt-3 text-xs opacity-70">Review the evidence before acting; each signal can have an innocent explanation.</p>
                </div>
              )}
              <div className="mt-6 grid gap-5 lg:grid-cols-3">
                <div><h3 className="text-sm font-semibold">Telemetry</h3><pre className="mt-2 overflow-auto rounded-lg bg-slate-950 p-4 text-xs text-slate-100">{telemetry ? JSON.stringify({ ...telemetrySummary, heardRanges: heard?.length, snapshots: snapshots?.length }, null, 2) : "—"}</pre></div>
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
