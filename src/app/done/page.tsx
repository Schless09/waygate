import { redirect } from "next/navigation";
import { Progress } from "@/components/progress";
import { getCandidate } from "@/lib/auth";

export const instant = false;

export default async function DonePage() {
  const candidate = await getCandidate();
  if (!candidate) redirect("/");
  if (!candidate.completed_at) redirect("/instructions");

  return (
    <main className="mx-auto min-h-screen w-full max-w-3xl px-6 py-12 sm:py-16">
      <Progress current={3} />
      <div className="rounded-xl border border-slate-200 bg-white p-12 text-center shadow-sm">
        <div className="mx-auto grid size-12 place-items-center rounded-full bg-emerald-100 text-xl text-emerald-800">✓</div>
        <h1 className="mt-5 text-3xl font-semibold">Thanks, we&apos;ll be in touch.</h1>
        <p className="mt-3 text-slate-600">Your assessment has been submitted successfully.</p>
      </div>
    </main>
  );
}
