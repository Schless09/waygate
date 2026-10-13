import { NextResponse } from "next/server";
import { z } from "zod";
import { getCandidate } from "@/lib/auth";
import { getSupabaseAdmin } from "@/lib/supabase";

const inputSchema = z.object({ role: z.enum(["annotator", "qa"]) });

export async function POST(request: Request) {
  const candidate = await getCandidate();
  if (!candidate) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const input = inputSchema.safeParse(await request.json().catch(() => null));
  if (!input.success) return NextResponse.json({ error: "Invalid role" }, { status: 400 });

  const supabase = getSupabaseAdmin();
  const { data: existing } = await supabase
    .from("trial_assessments")
    .select("id,role,completed_at")
    .eq("candidate_id", candidate.id)
    .eq("role", input.data.role)
    .maybeSingle();
  if (existing?.completed_at) {
    return NextResponse.json(
      { error: "You've already completed this assessment." },
      { status: 409 },
    );
  }
  if (existing) return NextResponse.json(existing);

  const { data, error } = await supabase
    .from("trial_assessments")
    .insert({ candidate_id: candidate.id, role: input.data.role })
    .select("id,role,completed_at")
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}
