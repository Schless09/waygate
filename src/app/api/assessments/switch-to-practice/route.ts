import { NextResponse } from "next/server";
import { z } from "zod";
import { getCandidate } from "@/lib/auth";
import { PRACTICE_SORT_ORDER } from "@/lib/practice";
import { getSupabaseAdmin } from "@/lib/supabase";

const inputSchema = z.object({ role: z.enum(["annotator", "qa"]) });

// Lets a candidate who started Clip 1 go back to the optional practice clip.
// Clip 1's timer runs from its start, so the in-progress attempt is archived and
// cleared; this does not use the candidate's one restart.
export async function POST(request: Request) {
  const candidate = await getCandidate();
  if (!candidate) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const input = inputSchema.safeParse(await request.json().catch(() => null));
  if (!input.success) return NextResponse.json({ error: "Invalid role" }, { status: 400 });

  const supabase = getSupabaseAdmin();
  const { data: assessment } = await supabase
    .from("trial_assessments")
    .select("id,completed_at,discarded_attempts")
    .eq("candidate_id", candidate.id)
    .eq("role", input.data.role)
    .maybeSingle();
  if (!assessment) return NextResponse.json({ error: "Assessment not found" }, { status: 404 });
  if (assessment.completed_at) {
    return NextResponse.json({ error: "You've already completed this assessment." }, { status: 409 });
  }

  const { data: clips } = await supabase
    .from("trial_clips")
    .select("id,slug,sort_order")
    .eq("role", input.data.role)
    .order("sort_order");
  const practiceClip = clips?.find((clip) => clip.sort_order === PRACTICE_SORT_ORDER);
  if (!practiceClip) return NextResponse.json({ error: "No practice clip available." }, { status: 404 });

  const { data: attempts, error: attemptsError } = await supabase
    .from("trial_attempts")
    .select("*, clip:trial_clips(title,sort_order), score:trial_scores(*)")
    .eq("assessment_id", assessment.id);
  if (attemptsError) return NextResponse.json({ error: attemptsError.message }, { status: 500 });

  const practiceAttempt = attempts?.find((attempt) => attempt.clip_id === practiceClip.id);
  if (practiceAttempt?.submitted_at) {
    return NextResponse.json({ error: "You've already completed the practice clip." }, { status: 409 });
  }
  const realAttempts = (attempts ?? []).filter((attempt) => attempt.clip_id !== practiceClip.id);
  if (realAttempts.some((attempt) => attempt.submitted_at)) {
    return NextResponse.json(
      { error: "Practice is only available before you submit your first scored clip." },
      { status: 409 },
    );
  }

  const discardedSlugs = realAttempts.map(
    (attempt) => clips?.find((clip) => clip.id === attempt.clip_id)?.slug,
  );
  if (realAttempts.length) {
    const discardedAt = new Date().toISOString();
    const { error: archiveError } = await supabase
      .from("trial_assessments")
      .update({
        discarded_attempts: [
          ...((assessment.discarded_attempts as unknown[] | null) ?? []),
          ...realAttempts.map((attempt) => ({ ...attempt, reason: "switched_to_practice", discarded_at: discardedAt })),
        ],
      })
      .eq("id", assessment.id);
    if (archiveError) return NextResponse.json({ error: archiveError.message }, { status: 500 });
    const { error: deleteError } = await supabase
      .from("trial_attempts")
      .delete()
      .in("id", realAttempts.map((attempt) => attempt.id));
    if (deleteError) return NextResponse.json({ error: deleteError.message }, { status: 500 });
  }

  return NextResponse.json({ next: `/task/${practiceClip.slug}`, slugs: discardedSlugs.filter(Boolean) });
}
