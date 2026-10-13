import { NextResponse } from "next/server";
import { z } from "zod";
import { getCandidate } from "@/lib/auth";
import { PRACTICE_SORT_ORDER } from "@/lib/practice";
import { getSupabaseAdmin } from "@/lib/supabase";

const inputSchema = z.object({ role: z.enum(["annotator", "qa"]), slug: z.string().min(1) });

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

  const { data: clip } = await supabase
    .from("trial_clips")
    .select("id,slug,sort_order")
    .eq("role", input.data.role)
    .eq("slug", input.data.slug)
    .maybeSingle();
  if (!clip || clip.sort_order <= PRACTICE_SORT_ORDER) {
    return NextResponse.json({ error: "Only scored clips can be restarted." }, { status: 400 });
  }
  const { data: attempts, error: attemptsError } = await supabase
    .from("trial_attempts")
    .select("*, clip:trial_clips(title,sort_order), score:trial_scores(*)")
    .eq("assessment_id", assessment.id)
    .eq("clip_id", clip.id);
  if (attemptsError) return NextResponse.json({ error: attemptsError.message }, { status: 500 });
  if (!attempts?.length) {
    return NextResponse.json({ error: "You haven't started this clip yet." }, { status: 400 });
  }
  if (attempts[0].submitted_at) {
    return NextResponse.json({ error: "This clip has already been submitted." }, { status: 409 });
  }

  // Claim the restart before deleting anything so a double click can't use it twice.
  const { data: claimed, error: claimError } = await supabase
    .from("trial_assessments")
    .update({
      restart_count: 1,
      restarted_at: new Date().toISOString(),
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

  return NextResponse.json({ next: `/task/${clip.slug}` });
}
