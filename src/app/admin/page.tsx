import Link from "next/link";
import { ArrowDownWideNarrow, Download, LockKeyhole, LogOut } from "lucide-react";
import { AdminLogin } from "@/components/admin-actions";
import { ScorePill } from "@/components/score-pill";
import { isAdmin } from "@/lib/auth";
import { integrityReport } from "@/lib/integrity";
import { isPracticeClip, PRACTICE_SORT_ORDER } from "@/lib/practice";
import { quizScore } from "@/lib/quality-checks";
import type { ReferenceUtterance, Telemetry } from "@/lib/types";
import { getSupabaseAdmin } from "@/lib/supabase";

export const dynamic = "force-dynamic";

type ClipRow = { sort_order: number; duration_seconds: number; reference_utterances: ReferenceUtterance[]; task_type: string };

type AttemptRow = {
  active_seconds: number | null;
  submitted_at: string | null;
  transcript: string | null;
  telemetry: Partial<Telemetry> | null;
  clip: ClipRow | ClipRow[] | null;
  score: { total_score: number | null; error: string | null; scored_at: string | null } | { total_score: number | null; error: string | null; scored_at: string | null }[] | null;
};

const STATUS_STYLES: Record<string, string> = {
  scored: "bg-emerald-50 text-emerald-700",
  scoring: "bg-brand-50 text-brand-700",
  "in progress": "bg-slate-100 text-slate-600",
  error: "bg-rose-50 text-rose-700",
};

function one<T>(value: T | T[] | null): T | null {
  return Array.isArray(value) ? value[0] ?? null : value;
}

export default async function AdminPage({
  searchParams,
}: {
  searchParams: Promise<{ sort?: string }>;
}) {
  if (!(await isAdmin())) {
    return (
      <main className="mx-auto min-h-screen max-w-md px-6 py-24">
        <div className="card p-8">
          <span className="grid size-11 place-items-center rounded-xl bg-brand-50 text-brand-600 ring-1 ring-brand-100"><LockKeyhole className="size-5" /></span>
          <h1 className="mt-4 text-2xl font-medium tracking-tight">Admin</h1>
          <p className="mt-2 text-slate-600">Enter the admin password to continue.</p>
          <AdminLogin />
        </div>
      </main>
    );
  }

  const { data: assessments, error } = await getSupabaseAdmin()
    .from("trial_assessments")
    .select("id,role,created_at,completed_at,restart_count,candidate:trial_candidates(id,name,email),attempts:trial_attempts(active_seconds,submitted_at,transcript,telemetry,clip:trial_clips(sort_order,duration_seconds,reference_utterances,task_type),score:trial_scores(total_score,error,scored_at))")
    .order("created_at", { ascending: false });
  if (error) throw error;

  const rows = (assessments ?? []).map((assessment) => {
    const allAttempts = (assessment.attempts ?? []) as AttemptRow[];
    const attempts = allAttempts.filter((attempt) => !isPracticeClip(one(attempt.clip)?.sort_order ?? 0));
    const practice = allAttempts.find((attempt) => isPracticeClip(one(attempt.clip)?.sort_order ?? 0));
    const candidate = one(assessment.candidate);
    // The PII task is short, so it counts half as much as an audio clip.
    const weighted = attempts
      .map((attempt) => ({
        score: one(attempt.score)?.total_score,
        weight: one(attempt.clip)?.task_type === "pii" ? 0.5 : 1,
      }))
      .filter((item): item is { score: number; weight: number } => item.score !== null && item.score !== undefined);
    const totalWeight = weighted.reduce((sum, item) => sum + item.weight, 0);
    const status = attempts.some((attempt) => one(attempt.score)?.error)
      ? "error"
      : attempts.length && attempts.every((attempt) => one(attempt.score)?.scored_at)
        ? "scored"
        : attempts.some((attempt) => attempt.submitted_at)
          ? "scoring"
          : "in progress";
    const quiz = allAttempts.map((attempt) => quizScore(attempt.telemetry?.quizAnswers)).find(Boolean) ?? null;
    const integrityScores = attempts
      .filter((attempt) => attempt.submitted_at && one(attempt.clip)?.task_type !== "pii")
      .map((attempt) => {
        const clip = one(attempt.clip);
        return integrityReport({
          telemetry: attempt.telemetry,
          transcript: attempt.transcript ?? "",
          utterances: clip?.reference_utterances ?? [],
          durationSeconds: clip?.duration_seconds ?? 0,
          activeSeconds: attempt.active_seconds,
          role: assessment.role,
        })?.score;
      })
      .filter((value): value is number => value !== undefined);
    const integrity = integrityScores.length ? Math.min(...integrityScores) : null;
    return {
      ...assessment,
      candidate,
      attempts,
      practice,
      quiz,
      integrity,
      overall: totalWeight ? weighted.reduce((sum, item) => sum + item.score * item.weight, 0) / totalWeight : null,
      status,
    };
  });
  if ((await searchParams).sort === "score") {
    rows.sort((a, b) => (b.overall ?? -1) - (a.overall ?? -1));
  }

  return (
    <main className="mx-auto min-h-screen max-w-6xl px-6 py-12">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <p className="eyebrow">Admin</p>
          <h1 className="mt-2 text-3xl font-medium tracking-tight">Assessment results</h1>
          <p className="mt-1 text-slate-600">{rows.length} role assessments</p>
        </div>
        <div className="flex gap-2">
          <Link href="/admin?sort=score" className="btn-secondary"><ArrowDownWideNarrow className="size-4" /> Sort by score</Link>
          <a href="/api/admin/export" className="btn-primary px-4 py-2.5 text-sm"><Download className="size-4" /> Export CSV</a>
          <form action="/api/admin/logout" method="post"><button className="btn-secondary"><LogOut className="size-4" /> Sign out</button></form>
        </div>
      </div>
      <div className="card mt-8 max-h-[75vh] overflow-auto">
        <table className="w-full text-left text-sm">
          <thead className="sticky top-0 z-10 border-b border-brand-100 bg-brand-50/95 text-xs uppercase tracking-wide text-brand-800 backdrop-blur">
            <tr><th className="p-4">Candidate</th><th className="p-4">Role</th><th className="p-4">Date</th><th className="p-4">Practice</th><th className="p-4">Clip 1</th><th className="p-4">Clip 2</th><th className="p-4">PII</th><th className="p-4">Overall</th><th className="p-4">Time</th><th className="p-4">Quiz</th><th className="p-4">Integrity</th><th className="p-4">Status</th></tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {rows.map((assessment) => {
              const byClip = (order: number) => assessment.attempts.find((attempt) => one(attempt.clip)?.sort_order === order);
              const first = byClip(PRACTICE_SORT_ORDER + 1);
              const second = byClip(PRACTICE_SORT_ORDER + 2);
              const pii = assessment.attempts.find((attempt) => one(attempt.clip)?.task_type === "pii");
              return (
                <tr key={assessment.id} className="transition-colors hover:bg-brand-50/50">
                  <td className="p-4"><Link href={`/admin/candidate/${assessment.candidate?.id}`} className="font-medium underline-offset-2 hover:underline">{assessment.candidate?.name}</Link><span className="block text-slate-500">{assessment.candidate?.email}</span></td>
                  <td className="p-4 capitalize">{assessment.role === "qa" ? "QA reviewer" : "Annotator"}</td>
                  <td className="p-4 text-slate-600">{new Date(assessment.created_at).toLocaleDateString()}</td>
                  <td className="p-4 opacity-60"><ScorePill value={one(assessment.practice?.score ?? null)?.total_score} /></td>
                  <td className="p-4"><ScorePill value={one(first?.score ?? null)?.total_score} /></td>
                  <td className="p-4"><ScorePill value={one(second?.score ?? null)?.total_score} /></td>
                  <td className="p-4">{assessment.role === "qa" ? <span className="text-slate-400">n/a</span> : <ScorePill value={one(pii?.score ?? null)?.total_score} />}</td>
                  <td className="p-4 text-base"><ScorePill value={assessment.overall} /></td>
                  <td className="whitespace-nowrap p-4 text-slate-600">{[first, second, ...(assessment.role === "qa" ? [] : [pii])].map((attempt) => attempt?.active_seconds ? `${Math.round(attempt.active_seconds / 60)}m` : "—").join(" / ")}</td>
                  <td className="p-4">{assessment.quiz ? `${assessment.quiz.correct}/${assessment.quiz.total}` : "—"}</td>
                  <td className="p-4">
                    <ScorePill value={assessment.integrity} />
                  </td>
                  <td className="p-4"><span className={`whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-medium capitalize ${STATUS_STYLES[assessment.status] ?? ""}`}>{assessment.status}</span>{assessment.restart_count > 0 && <span className="ml-1.5 whitespace-nowrap rounded-full bg-amber-50 px-2.5 py-0.5 text-xs font-medium text-amber-700 ring-1 ring-amber-200">Restarted</span>}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </main>
  );
}
