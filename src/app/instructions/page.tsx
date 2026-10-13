import Link from "next/link";
import { redirect } from "next/navigation";
import { Progress } from "@/components/progress";
import { getCandidate } from "@/lib/auth";

export default async function InstructionsPage() {
  const candidate = await getCandidate();
  if (!candidate) redirect("/");
  if (candidate.completed_at) redirect("/done");

  return (
    <main className="mx-auto min-h-screen w-full max-w-3xl px-6 py-12 sm:py-16">
      <Progress current={0} />
      <article className="rounded-xl border border-slate-200 bg-white p-8 shadow-sm sm:p-10">
        <h1 className="text-3xl font-semibold">Instructions</h1>
        <p className="mt-4 leading-7 text-slate-600">
          You will transcribe two five-minute meeting clips. Work carefully and submit each clip when finished. Your time starts on the server when you click its start button.
        </p>
        <h2 className="mt-8 text-lg font-semibold">Required format</h2>
        <ul className="mt-3 list-disc space-y-2 pl-5 text-slate-700">
          <li>Write one speaker turn per line.</li>
          <li>Label speakers A, B, C, D in order of first appearance.</li>
          <li>Use <code>[inaudible]</code> for unclear words and <code>[crosstalk]</code> for overlapping speech.</li>
          <li>Use clean verbatim: remove “um” and “uh”, but keep everything else.</li>
        </ul>
        <div className="mt-6 rounded-lg bg-slate-100 p-5 font-mono text-sm leading-7">
          <p>[00:03] Speaker A: Should we review the launch plan?</p>
          <p>[00:07] Speaker B: Yes, the first item is [inaudible].</p>
          <p>[00:12] Speaker A: [crosstalk] Let&apos;s start there.</p>
        </div>
        <h2 className="mt-8 text-lg font-semibold">Keyboard shortcuts</h2>
        <p className="mt-3 text-slate-600">
          Ctrl+Space plays or pauses · Ctrl+Left skips back 5 seconds · Ctrl+T inserts the current timestamp.
        </p>
        <Link href="/task/clip-1" className="mt-8 block rounded-lg bg-slate-900 px-5 py-3 text-center font-medium text-white hover:bg-slate-700">
          Continue to Clip 1
        </Link>
      </article>
    </main>
  );
}
