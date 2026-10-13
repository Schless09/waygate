import { redirect } from "next/navigation";
import { CrosstalkExample } from "@/components/crosstalk-example";
import { GuidelineQuiz } from "@/components/guideline-quiz";
import { Progress } from "@/components/progress";
import { Shortcuts } from "@/components/shortcuts";
import { getCandidate } from "@/lib/auth";
import { getSupabaseAdmin } from "@/lib/supabase";

export default async function InstructionsPage({
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
  if (!assessment) redirect("/assessments");
  if (assessment.completed_at) redirect(`/done?role=${role}`);
  const isQa = role === "qa";

  return (
    <main className="mx-auto min-h-screen w-full max-w-3xl px-6 py-12 sm:py-16">
      <Progress current={0} />
      <article className="card p-8 sm:p-10">
        <p className="eyebrow">{isQa ? "QA reviewer" : "Transcription annotator"}</p>
        <h1 className="mt-3 text-3xl font-medium tracking-tight">{isQa ? "QA review instructions" : "Annotation instructions"}</h1>
        <p className="mt-4 leading-7 text-slate-600">
          {isQa
            ? "You will review three intentionally flawed transcripts against three new five-minute meeting clips. Correct the transcript and summarize the important errors you found."
            : "You will transcribe three five-minute meeting clips. Work carefully and submit each clip when finished."}{" "}
          Your time starts on the server when you click each start button.
        </p>
        <h2 className="mt-8 text-lg font-semibold">Required format</h2>
        <ul className="mt-3 list-disc space-y-2 pl-5 text-slate-700 marker:text-brand-400 [&_code]:rounded [&_code]:bg-brand-50 [&_code]:px-1.5 [&_code]:py-0.5 [&_code]:text-sm [&_code]:text-brand-700">
          <li>{isQa ? "Correct the provided transcript while preserving one speaker turn per line." : "Write one speaker turn per line."}</li>
          <li>Label speakers A, B, C, D in order of first appearance.</li>
          <li>Use <code>[inaudible]</code> for unclear words and <code>[crosstalk]</code> for overlapping speech you can&apos;t make out.</li>
          <li>Place <code>[crosstalk]</code> inline, where the overlap happens. If you can make out the overlapping words, give each speaker their own line instead.</li>
          <li>Use clean verbatim: remove “um” and “uh”, but keep everything else.</li>
          <li>Work on your own. Live captions (turn off Chrome or macOS Live Caption), speech-to-text, and AI tools are not allowed.</li>
        </ul>
        <div className="mt-6 rounded-xl bg-[#14122b] p-5 font-mono text-sm leading-7 text-brand-100 ring-1 ring-brand-900">
          <p>[00:03] Speaker A: Should we review the launch plan?</p>
          <p>[00:07] Speaker B: Yes, the first item is [inaudible].</p>
          <p>[00:12] Speaker A: Let&apos;s start [crosstalk] there.</p>
        </div>
        <h2 className="mt-8 text-lg font-semibold">Using [crosstalk]</h2>
        <div className="mt-4"><CrosstalkExample /></div>
        <h2 className="mt-8 text-lg font-semibold">Keyboard shortcuts</h2>
        <div className="mt-4"><Shortcuts /></div>
        <GuidelineQuiz role={role} firstClipHref={isQa ? "/task/qa-clip-1" : "/task/clip-1"} />
      </article>
    </main>
  );
}
