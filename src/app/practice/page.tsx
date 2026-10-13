import Link from "next/link";
import { ArrowRight, Loader2, Sparkles } from "lucide-react";
import { redirect } from "next/navigation";
import { AutoRefresh } from "@/components/auto-refresh";
import { PiiPractice } from "@/components/pii-practice";
import { Progress } from "@/components/progress";
import { ScorePill } from "@/components/score-pill";
import { getCandidate } from "@/lib/auth";
import { PRACTICE_SORT_ORDER } from "@/lib/practice";
import { getSupabaseAdmin } from "@/lib/supabase";

export const dynamic = "force-dynamic";

type Feedback = { strengths?: string[]; weaknesses?: string[]; format_notes?: string; notes?: string };

export default async function PracticeResultsPage({
  searchParams,
}: {
  searchParams: Promise<{ role?: string }>;
}) {
  const candidate = await getCandidate();
  if (!candidate) redirect("/");
  const role = (await searchParams).role;
  if (role !== "annotator" && role !== "qa") redirect("/assessments");

  const supabase = getSupabaseAdmin();
  const { data: assessment } = await supabase
    .from("trial_assessments")
    .select("id,completed_at")
    .eq("candidate_id", candidate.id)
    .eq("role", role)
    .maybeSingle();
  if (!assessment) redirect("/assessments");

  const { data: clips } = await supabase
    .from("trial_clips")
    .select("id,slug,sort_order")
    .eq("role", role)
    .order("sort_order");
  const practiceClip = clips?.find((clip) => clip.sort_order === PRACTICE_SORT_ORDER);
  const firstRealClip = clips?.find((clip) => clip.sort_order > PRACTICE_SORT_ORDER);
  if (!practiceClip) redirect(`/instructions?role=${role}`);

  const { data: attempt } = await supabase
    .from("trial_attempts")
    .select("submitted_at,score:trial_scores(transcription_score,speaker_score,format_score,total_score,wer,claude_feedback,scored_at,error)")
    .eq("assessment_id", assessment.id)
    .eq("clip_id", practiceClip.id)
    .maybeSingle();
  if (!attempt?.submitted_at) redirect(`/task/${practiceClip.slug}`);

  const score = Array.isArray(attempt.score) ? attempt.score[0] : attempt.score;
  const ready = Boolean(score?.scored_at || score?.error);
  const feedback = (score?.claude_feedback ?? {}) as Feedback;
  const isQa = role === "qa";

  return (
    <main className="mx-auto min-h-screen w-full max-w-3xl px-6 py-12 sm:py-16">
      <Progress current={0} role={role} />
      <article className="card p-8 sm:p-10">
        <p className="eyebrow">Practice round · not scored</p>
        <h1 className="mt-3 text-3xl font-medium tracking-tight">Your practice feedback</h1>

        {!ready ? (
          <div className="mt-8 flex items-center gap-3 rounded-xl bg-brand-50 p-5 text-brand-800 ring-1 ring-brand-100">
            <AutoRefresh />
            <Loader2 className="size-5 animate-spin" />
            Scoring your practice transcript. This usually takes under 15 seconds…
          </div>
        ) : score?.error ? (
          <p className="mt-8 rounded-xl bg-amber-50 p-5 text-amber-900 ring-1 ring-amber-200">
            We couldn&apos;t generate feedback for this practice round, but you can still start the assessment.
          </p>
        ) : (
          <>
            <dl className="mt-8 grid grid-cols-2 gap-3 sm:grid-cols-4">
              {[
                ["Overall", score?.total_score],
                [isQa ? "Corrections" : "Accuracy", score?.transcription_score],
                ["Speakers", score?.speaker_score],
                [isQa ? "Review notes" : "Format", score?.format_score],
              ].map(([label, value]) => (
                <div key={label as string} className="rounded-xl bg-brand-50/60 p-4 ring-1 ring-brand-100">
                  <dt className="text-xs text-slate-500">{label}</dt>
                  <dd className="mt-2 text-lg"><ScorePill value={value as number | null} /></dd>
                </div>
              ))}
            </dl>
            <div className="mt-6 grid gap-5 sm:grid-cols-2">
              <div>
                <h2 className="text-sm font-semibold text-emerald-700">What went well</h2>
                <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-slate-700">
                  {(feedback.strengths ?? []).map((item) => <li key={item}>{item}</li>)}
                </ul>
              </div>
              <div>
                <h2 className="text-sm font-semibold text-rose-700">What to improve</h2>
                <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-slate-700">
                  {(feedback.weaknesses ?? []).map((item) => <li key={item}>{item}</li>)}
                </ul>
              </div>
            </div>
            {feedback.format_notes && (
              <p className="mt-6 rounded-xl bg-slate-50 p-4 text-sm leading-6 text-slate-700 ring-1 ring-slate-200">
                <strong className="flex items-center gap-1.5 text-slate-900"><Sparkles className="size-4 text-brand-500" /> Format tips</strong>
                <span className="mt-1 block">{feedback.format_notes}</span>
              </p>
            )}
          </>
        )}
      </article>

      {!isQa && <PiiPractice />}

      <div className="mt-6">
        {assessment.completed_at ? (
          <Link href={`/done?role=${role}`} className="btn-secondary mt-8 w-full">Back to your results</Link>
        ) : (
          firstRealClip && (
            <Link href={`/task/${firstRealClip.slug}`} className="btn-primary mt-8 w-full">
              Start the assessment <ArrowRight className="size-4" />
            </Link>
          )
        )}
        <p className="mt-3 text-center text-xs text-slate-500">
          {isQa ? "The assessment has two scored clips." : "The assessment has two scored clips followed by a PII task."} Your time starts when you click start on each one.
        </p>
      </div>
    </main>
  );
}
