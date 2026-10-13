import { redirect } from "next/navigation";
import { Progress } from "@/components/progress";
import { getCandidate } from "@/lib/auth";
import { getSupabaseAdmin } from "@/lib/supabase";

export default async function DonePage({
  searchParams,
}: {
  searchParams: Promise<{ role?: string }>;
}) {
  const candidate = await getCandidate();
  if (!candidate) redirect("/");
  const role = (await searchParams).role;
  if (role !== "annotator" && role !== "qa") redirect("/assessments");
  const { data: assessment } = await getSupabaseAdmin()
    .from("trial_assessments")
    .select("completed_at")
    .eq("candidate_id", candidate.id)
    .eq("role", role)
    .maybeSingle();
  if (!assessment?.completed_at) redirect(`/instructions?role=${role}`);

  return (
    <main className="mx-auto min-h-screen w-full max-w-3xl px-6 py-12 sm:py-16">
      <Progress current={4} />
      <div className="rounded-xl border border-slate-200 bg-white p-12 text-center shadow-sm">
        <div className="mx-auto grid size-12 place-items-center rounded-full bg-emerald-100 text-xl text-emerald-800">✓</div>
        <h1 className="mt-5 text-3xl font-semibold">Thanks, we&apos;ll be in touch.</h1>
        <p className="mt-3 text-slate-600">Your {role === "qa" ? "QA reviewer" : "annotation"} assessment has been submitted successfully.</p>
        <a href="/assessments" className="mt-7 inline-block rounded-lg border border-slate-300 px-5 py-3 font-medium">
          View other assessments
        </a>
      </div>
    </main>
  );
}
