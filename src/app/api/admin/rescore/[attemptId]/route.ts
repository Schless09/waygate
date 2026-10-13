import { after, NextResponse } from "next/server";
import { isAdmin } from "@/lib/auth";
import { scoreAttempt } from "@/lib/scoring/score-attempt";
import { getSupabaseAdmin } from "@/lib/supabase";

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ attemptId: string }> },
) {
  if (!(await isAdmin())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { attemptId } = await params;
  const { data } = await getSupabaseAdmin()
    .from("trial_attempts")
    .select("id")
    .eq("id", attemptId)
    .not("submitted_at", "is", null)
    .maybeSingle();
  if (!data) return NextResponse.json({ error: "Attempt not found" }, { status: 404 });

  await getSupabaseAdmin().from("trial_scores").upsert(
    { attempt_id: attemptId, error: null, scored_at: null },
    { onConflict: "attempt_id" },
  );
  after(() => scoreAttempt(attemptId));
  return NextResponse.json({ ok: true });
}
