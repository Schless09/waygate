import { ArrowRight, PartyPopper } from "lucide-react";
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
      <Progress current={3} />
      <div className="card p-12 text-center">
        <div className="relative mx-auto grid size-16 place-items-center">
          <span className="absolute inset-0 animate-ping rounded-full bg-brand-200 opacity-60 [animation-iteration-count:2]" />
          <span className="relative grid size-16 place-items-center rounded-full bg-gradient-to-br from-brand-500 to-brand-700 text-white shadow-lg shadow-brand-600/30">
            <PartyPopper className="size-7" />
          </span>
        </div>
        <h1 className="mt-6 text-3xl font-medium tracking-tight">Submitted. Thank you!</h1>
        <p className="mx-auto mt-3 max-w-md text-slate-600">
          Your {role === "qa" ? "QA reviewer" : "annotation"} assessment is in. Our team will review it and be in touch soon.
        </p>
        <a href="/assessments" className="btn-secondary mt-8">
          View other assessments <ArrowRight className="size-4" />
        </a>
      </div>
    </main>
  );
}
