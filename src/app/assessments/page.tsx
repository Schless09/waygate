import { GraduationCap } from "lucide-react";
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
      <p className="eyebrow">Candidate assessments</p>
      <h1 className="mt-3 text-4xl font-medium tracking-tight">Choose a role</h1>
      <p className="mt-3 max-w-2xl text-slate-600">
        You may complete either or both assessments. Each role starts with an optional practice clip, followed by two scored clips, and can be taken once.
      </p>
      <aside className="mt-8 flex gap-4 rounded-2xl bg-gradient-to-br from-brand-50 to-white p-6 ring-1 ring-brand-200">
        <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-brand-600 text-white shadow-md shadow-brand-600/30">
          <GraduationCap className="size-5" />
        </span>
        <div>
          <h2 className="text-lg font-semibold tracking-tight">New here? Warm up with a practice clip first</h2>
          <p className="mt-1 leading-6 text-slate-600">
            Every role includes an <strong className="font-semibold text-slate-800">optional, unscored</strong> practice clip so you can get used to the audio player, shortcuts and transcript format before the real test. You&apos;ll see feedback right after you submit, and it never counts toward your result.
          </p>
          <p className="mt-2 text-sm text-slate-500">
            Choose <span className="font-medium text-brand-700">Try a practice clip first</span> after reading the instructions. You can also switch to practice from Clip 1 if you change your mind.
          </p>
        </div>
      </aside>
      <div className="mt-8 grid gap-6 sm:grid-cols-2">
        <RoleCard
          role="annotator"
          title="Transcription Annotator"
          description="Create accurate, speaker-attributed transcripts from two meeting clips."
          status={status("annotator")}
        />
        <RoleCard
          role="qa"
          title="QA Reviewer"
          description="Review and correct two intentionally flawed transcripts, then explain the most important issues."
          status={status("qa")}
        />
      </div>
    </main>
  );
}
