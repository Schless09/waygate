import { NextResponse } from "next/server";
import { z } from "zod";
import { getCandidate } from "@/lib/auth";
import { PRACTICE_SORT_ORDER } from "@/lib/practice";
import { getSupabaseAdmin } from "@/lib/supabase";

const inputSchema = z.object({ role: z.enum(["annotator", "qa"]) });

export async function POST(request: Request) {
  const candidate = await getCandidate();
  if (!candidate) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const input = inputSchema.safeParse(await request.json().catch(() => null));
  if (!input.success) return NextResponse.json({ error: "Invalid role" }, { status: 400 });

  const supabase = getSupabaseAdmin();
  const { data: assessment } = await supabase
    .from("trial_assessments")
    .select("id,restart_count")
    .eq("candidate_id", candidate.id)
    .eq("role", input.data.role)
    .maybeSingle();
  if (!assessment) return NextResponse.json({ error: "Assessment not found" }, { status: 404 });
  if (assessment.restart_count >= 1) {
    return NextResponse.json({ error: "You've already used your one restart." }, { status: 409 });
  }

  const { data: clips } = await supabase
    .from("trial_clips")
    .select("id,slug")
    .eq("role", input.data.role)
    .gt("sort_order", PRACTICE_SORT_ORDER)
    .order("sort_order");
  const clipIds = (clips ?? []).map((clip) => clip.id);
  const { data: attempts, error: attemptsError } = await supabase
    .from("trial_attempts")
    .select("*, clip:trial_clips(title,sort_order), score:trial_scores(*)")
    .eq("assessment_id", assessment.id)
    .in("clip_id", clipIds);
  if (attemptsError) return NextResponse.json({ error: attemptsError.message }, { status: 500 });
  if (!attempts?.length) {
    return NextResponse.json({ error: "There's nothing to restart yet." }, { status: 400 });
  }

  // Claim the restart before deleting anything so a double click can't use it twice.
  const { data: claimed, error: claimError } = await supabase
    .from("trial_assessments")
    .update({
      restart_count: 1,
      restarted_at: new Date().toISOString(),
      completed_at: null,
      discarded_attempts: attempts,
    })
    .eq("id", assessment.id)
    .eq("restart_count", 0)
    .select("id");
  if (claimError) return NextResponse.json({ error: claimError.message }, { status: 500 });
  if (!claimed?.length) {
    return NextResponse.json({ error: "You've already used your one restart." }, { status: 409 });
  }

  const { error: deleteError } = await supabase
    .from("trial_attempts")
    .delete()
    .in("id", attempts.map((attempt) => attempt.id));
  if (deleteError) return NextResponse.json({ error: deleteError.message }, { status: 500 });

  return NextResponse.json({
    next: `/task/${clips![0].slug}`,
    slugs: clips!.map((clip) => clip.slug),
  });
}
