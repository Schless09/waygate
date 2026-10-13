import { NextResponse } from "next/server";
import { getCandidate } from "@/lib/auth";
import { getSupabaseAdmin } from "@/lib/supabase";

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ slug: string }> },
) {
  const candidate = await getCandidate();
  if (!candidate) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { slug } = await params;
  const supabase = getSupabaseAdmin();
  const { data: clip } = await supabase
    .from("trial_clips")
    .select("id,sort_order,role")
    .eq("slug", slug)
    .single();
  if (!clip) return NextResponse.json({ error: "Clip not found" }, { status: 404 });
  const { data: assessment } = await supabase
    .from("trial_assessments")
    .select("id,completed_at")
    .eq("candidate_id", candidate.id)
    .eq("role", clip.role)
    .maybeSingle();
  if (!assessment || assessment.completed_at) {
    return NextResponse.json({ error: "Assessment unavailable" }, { status: 409 });
  }

  if (clip.sort_order > 1) {
    const { data: priorClips } = await supabase
      .from("trial_clips")
      .select("id")
      .eq("role", clip.role)
      .lt("sort_order", clip.sort_order);
    const priorIds = (priorClips ?? []).map((item) => item.id);
    const { count } = await supabase
      .from("trial_attempts")
      .select("id", { count: "exact", head: true })
      .eq("assessment_id", assessment.id)
      .not("submitted_at", "is", null)
      .in("clip_id", priorIds);
    if (count !== priorIds.length) {
      return NextResponse.json({ error: "Complete the previous clip first." }, { status: 409 });
    }
  }

  const { data: existing } = await supabase
    .from("trial_attempts")
    .select("id,started_at,submitted_at")
    .eq("assessment_id", assessment.id)
    .eq("clip_id", clip.id)
    .maybeSingle();

  if (existing?.submitted_at) {
    return NextResponse.json({ error: "This clip is locked." }, { status: 409 });
  }
  if (existing) return NextResponse.json(existing);

  const { data, error } = await supabase
    .from("trial_attempts")
    .insert({
      candidate_id: candidate.id,
      assessment_id: assessment.id,
      clip_id: clip.id,
      started_at: new Date().toISOString(),
    })
    .select("id,started_at,submitted_at")
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}
