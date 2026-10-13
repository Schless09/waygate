import { notFound, redirect } from "next/navigation";
import { AudioTask } from "@/components/audio-task";
import { Progress } from "@/components/progress";
import { getCandidate } from "@/lib/auth";
import { getSupabaseAdmin } from "@/lib/supabase";

export const dynamic = "force-dynamic";

export default async function TaskPage({ params }: { params: Promise<{ slug: string }> }) {
  const candidate = await getCandidate();
  if (!candidate) redirect("/");
  if (candidate.completed_at) redirect("/done");
  const { slug } = await params;
  if (!["clip-1", "clip-2", "clip-3"].includes(slug)) notFound();

  const supabase = getSupabaseAdmin();
  const { data: clip } = await supabase
    .from("clips")
    .select("id,slug,title,audio_path,duration_seconds,speaker_count,difficulty,sort_order")
    .eq("slug", slug)
    .single();
  if (!clip) notFound();

  const { data: attempt } = await supabase
    .from("attempts")
    .select("id,started_at,submitted_at")
    .eq("candidate_id", candidate.id)
    .eq("clip_id", clip.id)
    .maybeSingle();
  if (attempt?.submitted_at) {
    const { data: nextClip } = await supabase
      .from("clips")
      .select("slug")
      .gt("sort_order", clip.sort_order)
      .order("sort_order")
      .limit(1)
      .maybeSingle();
    redirect(nextClip ? `/task/${nextClip.slug}` : "/done");
  }

  if (clip.sort_order > 1) {
    const { data: priorClips } = await supabase
      .from("clips")
      .select("id,slug,sort_order")
      .lt("sort_order", clip.sort_order)
      .order("sort_order");
    const priorIds = (priorClips ?? []).map((item) => item.id);
    const { data: completedAttempts } = await supabase
      .from("attempts")
      .select("clip_id")
      .eq("candidate_id", candidate.id)
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
      <Progress current={clip.sort_order} />
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
        step={clip.sort_order}
      />
    </main>
  );
}
