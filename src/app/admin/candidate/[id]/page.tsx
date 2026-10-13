import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { RescoreButton } from "@/components/admin-actions";
import { isAdmin } from "@/lib/auth";
import { getSupabaseAdmin } from "@/lib/supabase";

export const instant = false;

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
    .from("candidates")
    .select("id,name,email,created_at,completed_at")
    .eq("id", id)
    .maybeSingle();
  if (!candidate) notFound();

  const { data: attempts } = await getSupabaseAdmin()
    .from("attempts")
    .select("id,started_at,submitted_at,active_seconds,transcript,telemetry,clip:clips(title,sort_order,duration_seconds,reference_text),score:scores(wer,transcription_score,speaker_score,pace_score,pace_ratio,format_score,total_score,claude_feedback,scored_at,error)")
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
          const score = Array.isArray(attempt.score) ? attempt.score[0] : attempt.score;
          const feedback = (score?.claude_feedback ?? {}) as Record<string, unknown>;
          return (
            <section key={attempt.id} className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
              <div className="flex items-center justify-between gap-4">
                <div><p className="text-sm text-slate-500">Clip {clip?.sort_order}</p><h2 className="text-xl font-semibold">{clip?.title}</h2></div>
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
              <div className="mt-6 grid gap-5 lg:grid-cols-3">
                <div><h3 className="text-sm font-semibold">Telemetry</h3><pre className="mt-2 overflow-auto rounded-lg bg-slate-950 p-4 text-xs text-slate-100">{JSON.stringify(attempt.telemetry, null, 2)}</pre></div>
                <div><h3 className="text-sm font-semibold">Strengths</h3><ul className="mt-2 list-disc pl-5 text-sm text-slate-700">{((feedback.strengths as string[]) ?? []).map((item) => <li key={item}>{item}</li>)}</ul></div>
                <div><h3 className="text-sm font-semibold">Weaknesses</h3><ul className="mt-2 list-disc pl-5 text-sm text-slate-700">{((feedback.weaknesses as string[]) ?? []).map((item) => <li key={item}>{item}</li>)}</ul></div>
              </div>
              <div className="mt-5 grid gap-4 sm:grid-cols-2">
                <div className="rounded-lg bg-slate-50 p-4 text-sm"><strong>Speaker notes</strong><p className="mt-2 whitespace-pre-wrap text-slate-700">{String(feedback.notes ?? "—")}</p></div>
                <div className="rounded-lg bg-slate-50 p-4 text-sm"><strong>Format notes</strong><p className="mt-2 whitespace-pre-wrap text-slate-700">{String(feedback.format_notes ?? "—")}</p></div>
              </div>
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
