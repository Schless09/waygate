import { redirect } from "next/navigation";
import { CandidateForm } from "@/components/candidate-form";
import { Progress } from "@/components/progress";
import { getCandidate } from "@/lib/auth";

export default async function Home() {
  const candidate = await getCandidate();
  if (candidate?.completed_at) redirect("/done");
  if (candidate) redirect("/instructions");

  return (
    <main className="mx-auto min-h-screen w-full max-w-3xl px-6 py-12 sm:py-16">
      <Progress current={0} />
      <div className="mx-auto max-w-lg rounded-xl border border-slate-200 bg-white p-8 shadow-sm sm:p-10">
        <p className="text-sm font-medium uppercase tracking-wider text-slate-500">Candidate assessment</p>
        <h1 className="mt-3 text-3xl font-semibold tracking-tight">Audio annotation trial</h1>
        <p className="mt-4 leading-7 text-slate-600">
          Transcribe two short meeting clips. Enter your details to review the instructions.
        </p>
        <CandidateForm />
      </div>
    </main>
  );
}
