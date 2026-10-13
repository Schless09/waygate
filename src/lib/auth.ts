import "server-only";

import { createHmac, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import { getSupabaseAdmin } from "@/lib/supabase";

export const CANDIDATE_COOKIE = "trial_session";
export const ADMIN_COOKIE = "trial_admin";

function adminToken() {
  const password = process.env.ADMIN_PASSWORD;
  if (!password) throw new Error("ADMIN_PASSWORD is not configured");
  return createHmac("sha256", password).update("waygate-admin").digest("hex");
}

export function verifyAdminPassword(password: string) {
  const expected = process.env.ADMIN_PASSWORD ?? "";
  const left = Buffer.from(password);
  const right = Buffer.from(expected);
  return left.length === right.length && timingSafeEqual(left, right);
}

export async function isAdmin() {
  const value = (await cookies()).get(ADMIN_COOKIE)?.value;
  if (!value) return false;
  const left = Buffer.from(value);
  const right = Buffer.from(adminToken());
  return left.length === right.length && timingSafeEqual(left, right);
}

export function getAdminToken() {
  return adminToken();
}

export async function getCandidate() {
  const token = (await cookies()).get(CANDIDATE_COOKIE)?.value;
  if (!token) return null;

  const { data } = await getSupabaseAdmin()
    .from("trial_candidates")
    .select("id,name,email,completed_at,created_at")
    .eq("session_token", token)
    .maybeSingle();
  return data;
}
