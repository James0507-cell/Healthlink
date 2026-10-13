/**
 * Authentication server actions.
 */
"use server";

import { redirect } from "next/navigation";
import { cookies, headers } from "next/headers";
import { createSession, destroySession, getSession, SESSION_COOKIE, requestMeta } from "@/lib/auth";
import { run, writeAudit, get } from "@/lib/db";
import { migrate } from "@/lib/db";
import { isSeeded, seed } from "@/lib/seed";

export interface LoginState {
  error?: string;
  email?: string;
}

/** Ensure the schema and demo data exist before the first sign-in attempt. */
function ensureReady() {
  try {
    migrate();
    if (!isSeeded()) seed();
  } catch (e) {
    console.error("HealthLink bootstrap failed:", e);
  }
}

export async function loginAction(_prev: LoginState, formData: FormData): Promise<LoginState> {
  ensureReady();

  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");

  if (!email || !password) {
    return { error: "Enter both your email address and password.", email };
  }

  const meta = await requestMeta();
  const result = await createSession(email, password, meta);

  if (!result.ok) {
    return { error: result.message, email };
  }

  const cookieStore = await cookies();
  cookieStore.set(SESSION_COOKIE, result.token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 8 * 3600,
  });

  redirect("/dashboard");
}

/**
 * Clear a session cookie whose server-side session no longer exists.
 * Called by the layout when the token verifies but the session record is gone
 * (revoked, expired, or the database was rebuilt), so the user can sign in
 * again instead of being bounced in a redirect loop.
 */
export async function clearStaleSessionAction() {
  const cookieStore = await cookies();
  cookieStore.delete(SESSION_COOKIE);
  redirect("/login");
}

export async function logoutAction() {
  const session = await getSession();
  const cookieStore = await cookies();
  if (session) {
    await destroySession(session.sessionId, {
      id: session.id,
      email: session.email,
      fullName: session.fullName,
      role: session.role,
      facilityId: session.facilityId,
      facilityName: session.facilityName,
      prcLicense: null,
      specialization: null,
    });
  }
  cookieStore.delete(SESSION_COOKIE);
  redirect("/login");
}

/** Bootstrap the demo database from the UI (used on a fresh checkout). */
export async function seedDemoDataAction(): Promise<{ ok: boolean; message: string }> {
  try {
    migrate();
    const summary = seed({ reset: true });
    return {
      ok: true,
      message: `Demo data loaded: ${summary.facilities} facilities, ${summary.users} users, ${summary.patients} patients, ${summary.referrals} referrals.`,
    };
  } catch (e) {
    return { ok: false, message: `Could not load demo data: ${(e as Error).message}` };
  }
}

/** Narrow helper for pages that need the client IP for audit rows. */
export async function currentRequestMeta() {
  const h = await headers();
  return {
    ip: h.get("x-forwarded-for")?.split(",")[0]?.trim() ?? undefined,
    userAgent: h.get("user-agent") ?? undefined,
  };
}

/** Force-close every active session for a user (security page action). */
export async function revokeAllSessionsAction(userId: string) {
  const session = await getSession();
  if (!session) throw new Error("UNAUTHENTICATED");
  if (session.role !== "hie_admin" && session.id !== userId) {
    throw new Error("FORBIDDEN: you may only end your own sessions.");
  }
  const target = get<{ email: string }>("SELECT email FROM users WHERE id = ?", userId);
  run("UPDATE sessions SET revoked_at = ? WHERE user_id = ? AND revoked_at IS NULL", new Date().toISOString(), userId);
  writeAudit({
    action: "E",
    eventType: "security",
    eventSubtype: "sessions-revoked",
    actorUserId: session.id,
    actorName: session.fullName,
    actorRole: session.role,
    actorFacility: session.facilityId,
    outcome: "0",
    description: `Revoked all active sessions for ${target?.email ?? userId}.`,
  });
}
