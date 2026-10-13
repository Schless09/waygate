import { NextResponse } from "next/server";
import { getCandidate } from "@/lib/auth";
import { getSupabaseAdmin } from "@/lib/supabase";

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ slug: string }> },
) {
  const candidate = await getCandidate();
  if (!candidate || candidate.completed_at) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { slug } = await params;
  const supabase = getSupabaseAdmin();
  const { data: clip } = await supabase
    .from("clips")
    .select("id,sort_order")
    .eq("slug", slug)
    .single();
  if (!clip) return NextResponse.json({ error: "Clip not found" }, { status: 404 });

  if (clip.sort_order > 1) {
    const { data: priorClips } = await supabase
      .from("clips")
      .select("id")
      .lt("sort_order", clip.sort_order);
    const priorIds = (priorClips ?? []).map((item) => item.id);
    const { count } = await supabase
      .from("attempts")
      .select("id", { count: "exact", head: true })
      .eq("candidate_id", candidate.id)
      .not("submitted_at", "is", null)
      .in("clip_id", priorIds);
    if (count !== priorIds.length) {
      return NextResponse.json({ error: "Complete the previous clip first." }, { status: 409 });
    }
  }

  const { data: existing } = await supabase
    .from("attempts")
    .select("id,started_at,submitted_at")
    .eq("candidate_id", candidate.id)
    .eq("clip_id", clip.id)
    .maybeSingle();

  if (existing?.submitted_at) {
    return NextResponse.json({ error: "This clip is locked." }, { status: 409 });
  }
  if (existing) return NextResponse.json(existing);

  const { data, error } = await supabase
    .from("attempts")
    .insert({
      candidate_id: candidate.id,
      clip_id: clip.id,
      started_at: new Date().toISOString(),
    })
    .select("id,started_at,submitted_at")
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}
