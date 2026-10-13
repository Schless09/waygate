import { after, NextResponse } from "next/server";
import { z } from "zod";
import { getCandidate } from "@/lib/auth";
import { scoreAttempt } from "@/lib/scoring/score-attempt";
import { getSupabaseAdmin } from "@/lib/supabase";

const telemetrySchema = z.object({
  totalPlayTime: z.number().min(0).finite(),
  seekCount: z.number().int().min(0),
  rewindCount: z.number().int().min(0),
  playbackSpeeds: z.array(z.number().min(0.5).max(2)).max(20),
  blurCount: z.number().int().min(0),
});

const inputSchema = z.object({
  transcript: z.string().trim().min(1).max(100_000),
  telemetry: telemetrySchema,
});

export async function POST(
  request: Request,
  { params }: { params: Promise<{ slug: string }> },
) {
  const candidate = await getCandidate();
  if (!candidate || candidate.completed_at) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const input = inputSchema.safeParse(await request.json().catch(() => null));
  if (!input.success) {
    return NextResponse.json({ error: "A transcript is required." }, { status: 400 });
  }

  const { slug } = await params;
  const supabase = getSupabaseAdmin();
  const { data: attempt } = await supabase
    .from("attempts")
    .select("id,started_at,submitted_at,clip:clips!inner(slug)")
    .eq("candidate_id", candidate.id)
    .eq("clips.slug", slug)
    .maybeSingle();

  if (!attempt) return NextResponse.json({ error: "Start this clip first." }, { status: 409 });
  if (attempt.submitted_at) {
    return NextResponse.json({ error: "This clip is already submitted." }, { status: 409 });
  }

  const submittedAt = new Date();
  const activeSeconds = Math.max(
    0,
    Math.round((submittedAt.getTime() - new Date(attempt.started_at).getTime()) / 1000),
  );
  const { error } = await supabase
    .from("attempts")
    .update({
      submitted_at: submittedAt.toISOString(),
      active_seconds: activeSeconds,
      transcript: input.data.transcript,
      telemetry: input.data.telemetry,
    })
    .eq("id", attempt.id)
    .is("submitted_at", null);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Mark completion with a simple count query that avoids exposing reference data.
  const { count: clipCount } = await supabase.from("clips").select("id", { count: "exact", head: true });
  const { count: submittedCount } = await supabase
    .from("attempts")
    .select("id", { count: "exact", head: true })
    .eq("candidate_id", candidate.id)
    .not("submitted_at", "is", null);
  if (clipCount && submittedCount === clipCount) {
    await supabase
      .from("candidates")
      .update({ completed_at: submittedAt.toISOString() })
      .eq("id", candidate.id);
  }

  after(() => scoreAttempt(attempt.id));
  return NextResponse.json({ ok: true, complete: clipCount === submittedCount });
}
