import { redirect } from "next/navigation";
import { CandidateForm } from "@/components/candidate-form";
import { Progress } from "@/components/progress";
import { getCandidate } from "@/lib/auth";

export default async function Home() {
  const candidate = await getCandidate();
  if (candidate) redirect("/assessments");

  return (
    <main className="mx-auto min-h-screen w-full max-w-3xl px-6 py-12 sm:py-16">
      <Progress current={0} />
      <div className="card mx-auto max-w-lg p-8 sm:p-10">
        <p className="eyebrow">Candidate assessment</p>
        <h1 className="mt-3 text-4xl font-medium tracking-tight">
          Audio <span className="bg-gradient-to-r from-brand-600 to-brand-400 bg-clip-text text-transparent">annotation</span> trial
        </h1>
        <p className="mt-4 leading-7 text-slate-600">
          Complete two short audio clips and a quick PII task, with an optional practice round first. Enter your details to review the instructions.
        </p>
        <CandidateForm />
      </div>
    </main>
  );
}
