import { NextResponse } from "next/server";
import { z } from "zod";
import { ADMIN_COOKIE, getAdminToken, verifyAdminPassword } from "@/lib/auth";

export async function POST(request: Request) {
  const parsed = z
    .object({ password: z.string().min(1).max(500) })
    .safeParse(await request.json().catch(() => null));
  if (!parsed.success || !verifyAdminPassword(parsed.data.password)) {
    return NextResponse.json({ error: "Incorrect password." }, { status: 401 });
  }

  const response = NextResponse.json({ ok: true });
  response.cookies.set(ADMIN_COOKIE, getAdminToken(), {
    httpOnly: true,
    sameSite: "strict",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 8,
  });
  return response;
}
