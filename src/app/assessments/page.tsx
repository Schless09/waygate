import { redirect } from "next/navigation";
import { RoleCard } from "@/components/role-card";
import { getCandidate } from "@/lib/auth";
import { getSupabaseAdmin } from "@/lib/supabase";

export default async function AssessmentsPage() {
  const candidate = await getCandidate();
  if (!candidate) redirect("/");
  const { data } = await getSupabaseAdmin()
    .from("trial_assessments")
    .select("role,completed_at")
    .eq("candidate_id", candidate.id);

  const status = (role: string): "not started" | "in progress" | "completed" => {
    const assessment = data?.find((item) => item.role === role);
    return assessment?.completed_at ? "completed" : assessment ? "in progress" : "not started";
  };

  return (
    <main className="mx-auto min-h-screen w-full max-w-4xl px-6 py-14">
      <p className="text-sm font-medium uppercase tracking-wider text-slate-500">Candidate assessments</p>
      <h1 className="mt-3 text-3xl font-semibold">Choose a role</h1>
      <p className="mt-3 max-w-2xl text-slate-600">
        You may complete either or both assessments. Each role uses three different audio clips and can be attempted once.
      </p>
      <div className="mt-8 grid gap-6 sm:grid-cols-2">
        <RoleCard
          role="annotator"
          title="Transcription Annotator"
          description="Create accurate, speaker-attributed transcripts from three meeting clips."
          status={status("annotator")}
        />
        <RoleCard
          role="qa"
          title="QA Reviewer"
          description="Review and correct three intentionally flawed transcripts, then explain the most important issues."
          status={status("qa")}
        />
      </div>
    </main>
  );
}
