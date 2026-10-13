import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { z } from "zod";
import { CANDIDATE_COOKIE } from "@/lib/auth";
import { getSupabaseAdmin } from "@/lib/supabase";

const inputSchema = z.object({
  name: z.string().trim().min(2).max(120),
  email: z.string().trim().email().max(320).transform((value) => value.toLowerCase()),
});

export async function POST(request: Request) {
  const parsed = inputSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Enter a valid name and email." }, { status: 400 });
  }

  const supabase = getSupabaseAdmin();
  const { data: existing, error: lookupError } = await supabase
    .from("candidates")
    .select("id,completed_at")
    .eq("email", parsed.data.email)
    .maybeSingle();

  if (lookupError) {
    return NextResponse.json({ error: "Unable to start the assessment." }, { status: 500 });
  }
  const sessionToken = randomUUID();
  const result = existing
    ? await supabase
        .from("candidates")
        .update({ name: parsed.data.name, session_token: sessionToken })
        .eq("id", existing.id)
    : await supabase.from("candidates").insert({
        name: parsed.data.name,
        email: parsed.data.email,
        session_token: sessionToken,
      });

  if (result.error) {
    return NextResponse.json({ error: "Unable to start the assessment." }, { status: 500 });
  }

  const response = NextResponse.json({ ok: true });
  response.cookies.set(CANDIDATE_COOKIE, sessionToken, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24,
  });
  return response;
}
