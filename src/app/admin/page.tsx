import Link from "next/link";
import { AdminLogin } from "@/components/admin-actions";
import { isAdmin } from "@/lib/auth";
import { getSupabaseAdmin } from "@/lib/supabase";

export const dynamic = "force-dynamic";

type AttemptRow = {
  active_seconds: number | null;
  submitted_at: string | null;
  clip: { sort_order: number } | { sort_order: number }[] | null;
  score: { total_score: number | null; error: string | null; scored_at: string | null } | { total_score: number | null; error: string | null; scored_at: string | null }[] | null;
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
        <div className="rounded-xl border border-slate-200 bg-white p-8 shadow-sm">
          <h1 className="text-2xl font-semibold">Admin</h1>
          <p className="mt-2 text-slate-600">Enter the admin password to continue.</p>
          <AdminLogin />
        </div>
      </main>
    );
  }

  const { data: candidates, error } = await getSupabaseAdmin()
    .from("candidates")
    .select("id,name,email,created_at,completed_at,attempts(active_seconds,submitted_at,clip:clips(sort_order),score:scores(total_score,error,scored_at))")
    .order("created_at", { ascending: false });
  if (error) throw error;

  const rows = (candidates ?? []).map((candidate) => {
    const attempts = (candidate.attempts ?? []) as AttemptRow[];
    const scores = attempts
      .map((attempt) => one(attempt.score)?.total_score)
      .filter((value): value is number => value !== null && value !== undefined);
    const status = attempts.some((attempt) => one(attempt.score)?.error)
      ? "error"
      : attempts.length && attempts.every((attempt) => one(attempt.score)?.scored_at)
        ? "scored"
        : attempts.some((attempt) => attempt.submitted_at)
          ? "scoring"
          : "in progress";
    return {
      ...candidate,
      attempts,
      overall: scores.length ? scores.reduce((sum, score) => sum + score, 0) / scores.length : null,
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
          <h1 className="text-3xl font-semibold">Assessment results</h1>
          <p className="mt-2 text-slate-600">{rows.length} candidates</p>
        </div>
        <div className="flex gap-3">
          <Link href="/admin?sort=score" className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium">Sort by score</Link>
          <a href="/api/admin/export" className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white">Export CSV</a>
          <form action="/api/admin/logout" method="post"><button className="rounded-lg border border-slate-300 px-4 py-2 text-sm">Sign out</button></form>
        </div>
      </div>
      <div className="mt-8 overflow-x-auto rounded-xl border border-slate-200 bg-white">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-slate-200 bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
            <tr><th className="p-4">Candidate</th><th className="p-4">Date</th><th className="p-4">Clip 1</th><th className="p-4">Clip 2</th><th className="p-4">Overall</th><th className="p-4">Time</th><th className="p-4">Status</th></tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {rows.map((candidate) => {
              const byClip = (order: number) => candidate.attempts.find((attempt) => one(attempt.clip)?.sort_order === order);
              const first = byClip(1);
              const second = byClip(2);
              return (
                <tr key={candidate.id} className="hover:bg-slate-50">
                  <td className="p-4"><Link href={`/admin/candidate/${candidate.id}`} className="font-medium underline-offset-2 hover:underline">{candidate.name}</Link><span className="block text-slate-500">{candidate.email}</span></td>
                  <td className="p-4 text-slate-600">{new Date(candidate.created_at).toLocaleDateString()}</td>
                  <td className="p-4">{one(first?.score ?? null)?.total_score?.toFixed(1) ?? "—"}</td>
                  <td className="p-4">{one(second?.score ?? null)?.total_score?.toFixed(1) ?? "—"}</td>
                  <td className="p-4 font-semibold">{candidate.overall?.toFixed(1) ?? "—"}</td>
                  <td className="p-4 text-slate-600">{[first, second].map((attempt) => attempt?.active_seconds ? `${Math.round(attempt.active_seconds / 60)}m` : "—").join(" / ")}</td>
                  <td className="p-4 capitalize">{candidate.status}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </main>
  );
}
