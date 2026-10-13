import { notFound, redirect } from "next/navigation";
import { AudioTask } from "@/components/audio-task";
import { Progress } from "@/components/progress";
import { PracticeSwitchButton } from "@/components/practice-switch-button";
import { RestartButton } from "@/components/restart-button";
import { getCandidate } from "@/lib/auth";
import { isPracticeClip, PRACTICE_SORT_ORDER, realClipNumber } from "@/lib/practice";
import { getSupabaseAdmin } from "@/lib/supabase";

export const dynamic = "force-dynamic";

export default async function TaskPage({ params }: { params: Promise<{ slug: string }> }) {
  const candidate = await getCandidate();
  if (!candidate) redirect("/");
  const { slug } = await params;

  const supabase = getSupabaseAdmin();
  const { data: clip } = await supabase
    .from("trial_clips")
    .select("id,slug,title,audio_path,duration_seconds,speaker_count,difficulty,sort_order,role,qa_source_transcript")
    .eq("slug", slug)
    .single();
  if (!clip) notFound();
  const { data: assessment } = await supabase
    .from("trial_assessments")
    .select("id,completed_at,restart_count")
    .eq("candidate_id", candidate.id)
    .eq("role", clip.role)
    .maybeSingle();
  if (!assessment) redirect("/assessments");
  if (assessment.completed_at) redirect(`/done?role=${clip.role}`);

  const { data: attempt } = await supabase
    .from("trial_attempts")
    .select("id,started_at,submitted_at")
    .eq("assessment_id", assessment.id)
    .eq("clip_id", clip.id)
    .maybeSingle();
  const practice = isPracticeClip(clip.sort_order);
  if (attempt?.submitted_at && practice) redirect(`/practice?role=${clip.role}`);
  if (attempt?.submitted_at) {
    const { data: nextClip } = await supabase
      .from("trial_clips")
      .select("slug")
      .eq("role", clip.role)
      .gt("sort_order", clip.sort_order)
      .order("sort_order")
      .limit(1)
      .maybeSingle();
    redirect(nextClip ? `/task/${nextClip.slug}` : `/done?role=${clip.role}`);
  }

  const { data: otherAttempts } = await supabase
    .from("trial_attempts")
    .select("submitted_at,clip:trial_clips(slug,sort_order)")
    .eq("assessment_id", assessment.id)
    .neq("clip_id", clip.id);
  const others = (otherAttempts ?? []).flatMap((item) => {
    const otherClip = Array.isArray(item.clip) ? item.clip[0] : item.clip;
    return otherClip ? [{ submitted: Boolean(item.submitted_at), ...otherClip }] : [];
  });
  if (practice) {
    // A scored clip's timer keeps running, so practice is reached via the switch button, which resets it.
    const inProgress = others.find((item) => !item.submitted && !isPracticeClip(item.sort_order));
    if (inProgress) redirect(`/task/${inProgress.slug}`);
  }
  const practiceDone = others.some((item) => item.submitted && isPracticeClip(item.sort_order));
  const offerPractice = !practice && realClipNumber(clip.sort_order) === 1 && !practiceDone;

  if (!practice) {
    const { data: priorClips } = await supabase
      .from("trial_clips")
      .select("id,slug,sort_order")
      .eq("role", clip.role)
      .gt("sort_order", PRACTICE_SORT_ORDER)
      .lt("sort_order", clip.sort_order)
      .order("sort_order");
    const priorIds = (priorClips ?? []).map((item) => item.id);
    const { data: completedAttempts } = await supabase
      .from("trial_attempts")
      .select("clip_id")
      .eq("assessment_id", assessment.id)
      .not("submitted_at", "is", null)
      .in("clip_id", priorIds);
    const completedIds = new Set((completedAttempts ?? []).map((item) => item.clip_id));
    const missing = priorClips?.find((item) => !completedIds.has(item.id));
    if (missing) redirect(`/task/${missing.slug}`);
  }

  const { data: signed, error } = await supabase.storage
    .from("trial-audio")
    .createSignedUrl(clip.audio_path, 3600);
  if (error || !signed) throw new Error("Unable to load audio");

  return (
    <main className="mx-auto min-h-screen w-full max-w-3xl px-6 py-10 sm:py-14">
      <Progress current={practice ? 0 : realClipNumber(clip.sort_order)} />
      <AudioTask
        clip={{
          id: clip.id,
          slug: clip.slug,
          title: clip.title,
          duration_seconds: clip.duration_seconds,
          speaker_count: clip.speaker_count,
          difficulty: clip.difficulty,
          sort_order: clip.sort_order,
          audioUrl: signed.signedUrl,
        }}
        initialAttempt={attempt}
        step={realClipNumber(clip.sort_order)}
        practice={practice}
        mode={clip.role}
        initialTranscript={clip.role === "qa" ? clip.qa_source_transcript ?? "" : ""}
      />
      {!practice && (offerPractice || assessment.restart_count === 0) && (
        <div className="mt-10 flex flex-wrap items-start justify-center gap-6">
          {offerPractice && <PracticeSwitchButton role={clip.role} />}
          {assessment.restart_count === 0 && <RestartButton role={clip.role} slug={clip.slug} />}
        </div>
      )}
    </main>
  );
}
