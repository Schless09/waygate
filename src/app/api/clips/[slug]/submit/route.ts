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
  pasteCount: z.number().int().min(0).default(0),
  pastedChars: z.number().int().min(0).default(0),
  quizAnswers: z.array(z.number().int().min(-1).max(3)).max(10).optional(),
  pauseCount: z.number().int().min(0).optional(),
  longestPlayRun: z.number().min(0).finite().optional(),
  keystrokes: z.number().int().min(0).optional(),
  largeInserts: z.number().int().min(0).optional(),
  largeInsertChars: z.number().int().min(0).optional(),
  heard: z.array(z.tuple([z.number().int().min(0), z.number().int().min(0)])).max(1000).optional(),
  snapshots: z
    .array(z.object({ t: z.number().int().min(0), heardTo: z.number().min(0), tail: z.string().max(500) }))
    .max(200)
    .optional(),
});

const inputSchema = z.object({
  transcript: z.string().trim().min(1).max(100_000),
  telemetry: telemetrySchema,
  reviewNotes: z.string().trim().max(10_000).optional(),
});

export async function POST(
  request: Request,
  { params }: { params: Promise<{ slug: string }> },
) {
  const candidate = await getCandidate();
  if (!candidate) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const input = inputSchema.safeParse(await request.json().catch(() => null));
  if (!input.success) {
    return NextResponse.json({ error: "A transcript is required." }, { status: 400 });
  }

  const { slug } = await params;
  const supabase = getSupabaseAdmin();
  const { data: clip } = await supabase
    .from("trial_clips")
    .select("id,slug,sort_order,role")
    .eq("slug", slug)
    .maybeSingle();
  if (!clip) return NextResponse.json({ error: "Clip not found" }, { status: 404 });
  if (clip.role === "qa" && (!input.data.reviewNotes || input.data.reviewNotes.length < 20)) {
    return NextResponse.json({ error: "Reviewer notes are required." }, { status: 400 });
  }
  const { data: assessment } = await supabase
    .from("trial_assessments")
    .select("id,completed_at")
    .eq("candidate_id", candidate.id)
    .eq("role", clip.role)
    .maybeSingle();
  if (!assessment || assessment.completed_at) {
    return NextResponse.json({ error: "Assessment unavailable" }, { status: 409 });
  }
  const { data: attempt } = await supabase
    .from("trial_attempts")
    .select("id,started_at,submitted_at")
    .eq("assessment_id", assessment.id)
    .eq("clip_id", clip.id)
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
    .from("trial_attempts")
    .update({
      submitted_at: submittedAt.toISOString(),
      active_seconds: activeSeconds,
      transcript: input.data.transcript,
      telemetry: input.data.telemetry,
      qa_review: clip.role === "qa" ? { notes: input.data.reviewNotes } : null,
    })
    .eq("id", attempt.id)
    .is("submitted_at", null);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Mark completion with a simple count query that avoids exposing reference data.
  const { count: clipCount } = await supabase
    .from("trial_clips")
    .select("id", { count: "exact", head: true })
    .eq("role", clip.role);
  const { count: submittedCount } = await supabase
    .from("trial_attempts")
    .select("id", { count: "exact", head: true })
    .eq("assessment_id", assessment.id)
    .not("submitted_at", "is", null);
  if (clipCount && submittedCount === clipCount) {
    await supabase
      .from("trial_assessments")
      .update({ completed_at: submittedAt.toISOString() })
      .eq("id", assessment.id);
  }

  const { data: nextClip } = clipCount === submittedCount
    ? { data: null }
    : await supabase
        .from("trial_clips")
        .select("slug")
        .eq("role", clip.role)
        .gt("sort_order", clip.sort_order)
        .order("sort_order")
        .limit(1)
        .maybeSingle();

  after(() => scoreAttempt(attempt.id));
  return NextResponse.json({
    ok: true,
    complete: clipCount === submittedCount,
    nextSlug: nextClip?.slug ?? null,
  });
}
