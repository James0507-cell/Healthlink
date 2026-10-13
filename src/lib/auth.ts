/**
 * Authentication and role-based access control.
 *
 * Least-privilege model: every role declares exactly the permissions it needs.
 * Facility scoping is enforced separately (see `canAccessReferral`): a user may
 * only act on referrals where their facility is the referrer or the receiver,
 * unless they hold a cross-facility role (e.g. HIE administrator, auditor).
 */

import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { SignJWT, jwtVerify } from "jose";
import { randomBytes } from "node:crypto";
import { all, get, run, verifyPassword, writeAudit, newId, type AuditInput } from "./db";

export const SESSION_COOKIE = "healthlink_session";
const SESSION_HOURS = 8;

/** Dev-only fallback secret; production must set HEALTHLINK_SECRET. */
const SECRET = new TextEncoder().encode(
  process.env.HEALTHLINK_SECRET ?? "healthlink-development-secret-do-not-use-in-production-4f8a2c",
);

/* ------------------------------------------------------------------ */
/* Roles and permissions                                               */
/* ------------------------------------------------------------------ */

export const ROLES = {
  PHYSICIAN: "physician",
  SPECIALIST: "specialist",
  NURSE: "nurse",
  REFERRAL_COORDINATOR: "referral_coordinator",
  MEDICAL_RECORDS: "medical_records_officer",
  FACILITY_ADMIN: "facility_admin",
  HIE_ADMIN: "hie_admin",
  AUDITOR: "privacy_auditor",
  PATIENT: "patient",
} as const;

export type Role = (typeof ROLES)[keyof typeof ROLES];

export const ROLE_LABELS: Record<Role, string> = {
  [ROLES.PHYSICIAN]: "Physician",
  [ROLES.SPECIALIST]: "Specialist",
  [ROLES.NURSE]: "Nurse",
  [ROLES.REFERRAL_COORDINATOR]: "Referral Coordinator",
  [ROLES.MEDICAL_RECORDS]: "Medical Records Officer",
  [ROLES.FACILITY_ADMIN]: "Facility Administrator",
  [ROLES.HIE_ADMIN]: "HIE Administrator",
  [ROLES.AUDITOR]: "Privacy / Compliance Auditor",
  [ROLES.PATIENT]: "Patient",
};

export const PERMISSIONS = {
  // Referrals
  REFERRAL_CREATE: "referral:create",
  REFERRAL_READ_OWN_FACILITY: "referral:read:own-facility",
  REFERRAL_READ_CROSS_FACILITY: "referral:read:cross-facility",
  REFERRAL_ROUTE: "referral:route",
  REFERRAL_TRIAGE: "referral:triage",
  REFERRAL_ACCEPT: "referral:accept",
  REFERRAL_REQUEST_INFO: "referral:request-info",
  REFERRAL_COMPLETE: "referral:complete",
  REFERRAL_FEEDBACK: "referral:feedback",
  REFERRAL_CANCEL: "referral:cancel",

  // Clinical data
  PATIENT_CREATE: "patient:create",
  PATIENT_READ: "patient:read",
  PATIENT_UPDATE: "patient:update",
  ATTACHMENT_ADD: "attachment:add",
  ATTACHMENT_READ: "attachment:read",
  ATTACHMENT_PURGE: "attachment:purge",

  // Consent
  CONSENT_RECORD: "consent:record",
  CONSENT_READ: "consent:read",
  CONSENT_REVOKE: "consent:revoke",

  // FHIR
  FHIR_READ: "fhir:read",
  FHIR_WRITE: "fhir:write",
  FHIR_VALIDATE: "fhir:validate",
  FHIR_MAP: "fhir:map",

  // Governance
  AUDIT_READ: "audit:read",
  AUDIT_EXPORT: "audit:export",
  ACCESS_REQUEST_DECIDE: "access-request:decide",
  ACCESS_REQUEST_CREATE: "access-request:create",
  RETENTION_MANAGE: "retention:manage",
  DIRECTORY_MANAGE: "directory:manage",
  USER_MANAGE: "user:manage",
  CONFIG_MANAGE: "config:manage",
  REPORT_VIEW: "report:view",
  PATIENT_STATUS_VIEW: "patient:status-view",
} as const;

export type Permission = (typeof PERMISSIONS)[keyof typeof PERMISSIONS];

const CLINICAL_WRITE: Permission[] = [
  PERMISSIONS.REFERRAL_CREATE,
  PERMISSIONS.REFERRAL_ROUTE,
  PERMISSIONS.REFERRAL_TRIAGE,
  PERMISSIONS.REFERRAL_ACCEPT,
  PERMISSIONS.REFERRAL_REQUEST_INFO,
  PERMISSIONS.REFERRAL_COMPLETE,
  PERMISSIONS.REFERRAL_FEEDBACK,
  PERMISSIONS.REFERRAL_CANCEL,
];

const CLINICAL_READ: Permission[] = [
  PERMISSIONS.REFERRAL_READ_OWN_FACILITY,
  PERMISSIONS.PATIENT_READ,
  PERMISSIONS.CONSENT_READ,
  PERMISSIONS.ATTACHMENT_READ,
];

export const ROLE_PERMISSIONS: Record<Role, Permission[]> = {
  [ROLES.PHYSICIAN]: [
    ...CLINICAL_WRITE,
    ...CLINICAL_READ,
    PERMISSIONS.PATIENT_CREATE,
    PERMISSIONS.PATIENT_UPDATE,
    PERMISSIONS.ATTACHMENT_ADD,
    PERMISSIONS.CONSENT_RECORD,
    // A patient may withdraw authorisation by telling their own doctor. The
    // permission belongs to every patient-facing clinical role, not only to
    // specialists, otherwise withdrawal depends on which role is at the desk.
    PERMISSIONS.CONSENT_REVOKE,
    PERMISSIONS.FHIR_READ,
    PERMISSIONS.FHIR_MAP,
    PERMISSIONS.FHIR_VALIDATE,
    PERMISSIONS.REPORT_VIEW,
    PERMISSIONS.ACCESS_REQUEST_CREATE,
  ],
  [ROLES.SPECIALIST]: [
    ...CLINICAL_WRITE,
    ...CLINICAL_READ,
    PERMISSIONS.PATIENT_CREATE,
    PERMISSIONS.PATIENT_UPDATE,
    PERMISSIONS.ATTACHMENT_ADD,
    PERMISSIONS.CONSENT_RECORD,
    PERMISSIONS.CONSENT_REVOKE,
    PERMISSIONS.FHIR_READ,
    PERMISSIONS.FHIR_MAP,
    PERMISSIONS.FHIR_VALIDATE,
    PERMISSIONS.REPORT_VIEW,
    PERMISSIONS.ACCESS_REQUEST_CREATE,
  ],
  [ROLES.NURSE]: [
    ...CLINICAL_WRITE,
    ...CLINICAL_READ,
    PERMISSIONS.PATIENT_CREATE,
    PERMISSIONS.PATIENT_UPDATE,
    PERMISSIONS.ATTACHMENT_ADD,
    PERMISSIONS.CONSENT_RECORD,
    // Nurses take the call when a patient withdraws authorisation, so the
    // permission sits with this role as well as with physicians.
    PERMISSIONS.CONSENT_REVOKE,
    PERMISSIONS.FHIR_READ,
    PERMISSIONS.FHIR_VALIDATE,
    PERMISSIONS.ACCESS_REQUEST_CREATE,
  ],
  [ROLES.REFERRAL_COORDINATOR]: [
    // Coordinates the loop but does not make clinical decisions.
    PERMISSIONS.REFERRAL_CREATE,
    PERMISSIONS.REFERRAL_ROUTE,
    PERMISSIONS.REFERRAL_READ_OWN_FACILITY,
    PERMISSIONS.REFERRAL_FEEDBACK,
    PERMISSIONS.PATIENT_READ,
    PERMISSIONS.PATIENT_CREATE,
    PERMISSIONS.ATTACHMENT_ADD,
    PERMISSIONS.ATTACHMENT_READ,
    PERMISSIONS.CONSENT_READ,
    PERMISSIONS.CONSENT_RECORD,
    PERMISSIONS.FHIR_READ,
    PERMISSIONS.FHIR_VALIDATE,
    PERMISSIONS.REPORT_VIEW,
    PERMISSIONS.ACCESS_REQUEST_CREATE,
  ],
  [ROLES.MEDICAL_RECORDS]: [
    PERMISSIONS.REFERRAL_READ_OWN_FACILITY,
    PERMISSIONS.PATIENT_READ,
    PERMISSIONS.PATIENT_CREATE,
    PERMISSIONS.ATTACHMENT_READ,
    PERMISSIONS.ATTACHMENT_ADD,
    PERMISSIONS.CONSENT_READ,
    PERMISSIONS.CONSENT_RECORD,
    PERMISSIONS.FHIR_READ,
    PERMISSIONS.FHIR_VALIDATE,
    PERMISSIONS.REPORT_VIEW,
    PERMISSIONS.ACCESS_REQUEST_CREATE,
  ],
  [ROLES.FACILITY_ADMIN]: [
    PERMISSIONS.REFERRAL_READ_OWN_FACILITY,
    PERMISSIONS.PATIENT_READ,
    PERMISSIONS.ATTACHMENT_READ,
    PERMISSIONS.CONSENT_READ,
    PERMISSIONS.FHIR_READ,
    PERMISSIONS.REPORT_VIEW,
    PERMISSIONS.USER_MANAGE,
    PERMISSIONS.DIRECTORY_MANAGE,
    PERMISSIONS.AUDIT_READ,
    PERMISSIONS.ACCESS_REQUEST_DECIDE,
    PERMISSIONS.ACCESS_REQUEST_CREATE,
  ],
  [ROLES.HIE_ADMIN]: [
    PERMISSIONS.REFERRAL_READ_CROSS_FACILITY,
    PERMISSIONS.REFERRAL_READ_OWN_FACILITY,
    PERMISSIONS.PATIENT_READ,
    PERMISSIONS.ATTACHMENT_READ,
    PERMISSIONS.ATTACHMENT_PURGE,
    PERMISSIONS.CONSENT_READ,
    PERMISSIONS.FHIR_READ,
    PERMISSIONS.FHIR_WRITE,
    PERMISSIONS.FHIR_VALIDATE,
    PERMISSIONS.FHIR_MAP,
    PERMISSIONS.AUDIT_READ,
    PERMISSIONS.AUDIT_EXPORT,
    PERMISSIONS.ACCESS_REQUEST_DECIDE,
    PERMISSIONS.RETENTION_MANAGE,
    PERMISSIONS.DIRECTORY_MANAGE,
    PERMISSIONS.USER_MANAGE,
    PERMISSIONS.CONFIG_MANAGE,
    PERMISSIONS.REPORT_VIEW,
  ],
  [ROLES.AUDITOR]: [
    // Read-only across the system, and cannot see attachment binaries or
    // modify anything. Purpose is oversight, not care delivery.
    PERMISSIONS.REFERRAL_READ_CROSS_FACILITY,
    PERMISSIONS.REFERRAL_READ_OWN_FACILITY,
    PERMISSIONS.PATIENT_READ,
    PERMISSIONS.CONSENT_READ,
    PERMISSIONS.AUDIT_READ,
    PERMISSIONS.AUDIT_EXPORT,
    PERMISSIONS.REPORT_VIEW,
  ],
  [ROLES.PATIENT]: [PERMISSIONS.PATIENT_STATUS_VIEW],
};

/** Which roles may see the "cross-facility" view of referrals. */
export const CROSS_FACILITY_ROLES: Role[] = [ROLES.HIE_ADMIN, ROLES.AUDITOR];

/* ------------------------------------------------------------------ */
/* Session model                                                       */
/* ------------------------------------------------------------------ */

export interface SessionUser {
  id: string;
  email: string;
  fullName: string;
  role: Role;
  facilityId: string | null;
  facilityName: string | null;
  prcLicense: string | null;
  specialization: string | null;
}

export interface Session extends SessionUser {
  sessionId: string;
  permissions: Permission[];
  expiresAt: string;
}

/* ------------------------------------------------------------------ */
/* Session token create / verify                                       */
/* ------------------------------------------------------------------ */

export async function createSession(
  email: string,
  password: string,
  meta: { ip?: string; userAgent?: string } = {},
): Promise<
  | { ok: true; token: string; sessionId: string; user: SessionUser }
  | { ok: false; reason: "invalid-credentials" | "inactive" | "locked"; message: string }
> {
  const row = get<{
    id: string;
    email: string;
    password_salt: string;
    password_hash: string;
    full_name: string;
    role: string;
    facility_id: string | null;
    prc_license: string | null;
    specialization: string | null;
    active: number;
    failed_logins: number;
    locked_until: string | null;
  }>("SELECT * FROM users WHERE lower(email) = lower(?)", email);

  if (!row) {
    return { ok: false, reason: "invalid-credentials", message: "Email or password is incorrect." };
  }

  if (row.locked_until && new Date(row.locked_until) > new Date()) {
    return {
      ok: false,
      reason: "locked",
      message: `Account temporarily locked after repeated failed sign-ins. Try again after ${new Date(row.locked_until).toLocaleTimeString()}.`,
    };
  }

  if (!verifyPassword(password, row.password_salt, row.password_hash)) {
    const failed = (row.failed_logins ?? 0) + 1;
    const lockUntil = failed >= 5 ? new Date(Date.now() + 15 * 60 * 1000).toISOString() : null;
    run("UPDATE users SET failed_logins = ?, locked_until = ? WHERE id = ?", failed, lockUntil, row.id);
    writeAudit({
      action: "E",
      eventType: "login",
      eventSubtype: "failed",
      actorUserId: row.id,
      actorName: row.full_name,
      actorRole: row.role,
      outcome: "8",
      outcomeDesc: "Invalid credentials",
      description: `Failed sign-in attempt for ${row.email}${lockUntil ? " - account locked for 15 minutes" : ""}.`,
      ipAddress: meta.ip ?? null,
      userAgent: meta.userAgent ?? null,
    });
    return { ok: false, reason: "invalid-credentials", message: "Email or password is incorrect." };
  }

  if (!row.active) {
    writeAudit({
      action: "E",
      eventType: "login",
      eventSubtype: "rejected",
      actorUserId: row.id,
      actorName: row.full_name,
      outcome: "8",
      outcomeDesc: "Account inactive",
      description: `Sign-in rejected: account ${row.email} is deactivated.`,
      ipAddress: meta.ip ?? null,
    });
    return { ok: false, reason: "inactive", message: "This account is deactivated. Contact your administrator." };
  }

  const facility = row.facility_id
    ? get<{ name: string }>("SELECT name FROM facilities WHERE id = ?", row.facility_id)
    : undefined;

  const sessionId = newId("ses");
  const now = new Date();
  const expiresAt = new Date(now.getTime() + SESSION_HOURS * 3600 * 1000);

  run(
    "INSERT INTO sessions (id, user_id, created_at, expires_at, ip_address, user_agent) VALUES (?,?,?,?,?,?)",
    sessionId,
    row.id,
    now.toISOString(),
    expiresAt.toISOString(),
    meta.ip ?? null,
    meta.userAgent ?? null,
  );

  run("UPDATE users SET last_login_at = ?, failed_logins = 0, locked_until = NULL WHERE id = ?", now.toISOString(), row.id);

  const user: SessionUser = {
    id: row.id,
    email: row.email,
    fullName: row.full_name,
    role: row.role as Role,
    facilityId: row.facility_id,
    facilityName: facility?.name ?? null,
    prcLicense: row.prc_license,
    specialization: row.specialization,
  };

  const token = await new SignJWT({
    sub: row.id,
    sid: sessionId,
    email: row.email,
    name: row.full_name,
    role: row.role,
    fid: row.facility_id,
    fname: facility?.name ?? null,
  })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt(now)
    .setExpirationTime(expiresAt)
    .setIssuer("healthlink")
    .setAudience("healthlink-app")
    .sign(SECRET);

  writeAudit({
    action: "E",
    eventType: "login",
    eventSubtype: "success",
    actorUserId: row.id,
    actorName: row.full_name,
    actorRole: row.role,
    actorFacility: row.facility_id,
    outcome: "0",
    outcomeDesc: "Success",
    description: `Successful sign-in for ${row.email} (${row.role}).`,
    ipAddress: meta.ip ?? null,
    userAgent: meta.userAgent ?? null,
    purposeCode: "treatment",
  });

  return { ok: true, token, sessionId, user };
}

export async function destroySession(sessionId: string, actor?: SessionUser) {
  run("UPDATE sessions SET revoked_at = ? WHERE id = ?", new Date().toISOString(), sessionId);
  if (actor) {
    writeAudit({
      action: "E",
      eventType: "logout",
      actorUserId: actor.id,
      actorName: actor.fullName,
      actorRole: actor.role,
      actorFacility: actor.facilityId,
      outcome: "0",
      description: `User ${actor.email} signed out.`,
    });
  }
}

/** Read and verify the session from the request cookies. */
export async function getSession(): Promise<Session | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE)?.value;
  if (!token) return null;

  try {
    const { payload } = await jwtVerify(token, SECRET, {
      issuer: "healthlink",
      audience: "healthlink-app",
    });
    const sid = payload.sid as string | undefined;
    if (!sid) return null;

    const row = get<{ revoked_at: string | null; expires_at: string }>(
      "SELECT revoked_at, expires_at FROM sessions WHERE id = ?",
      sid,
    );
    if (!row || row.revoked_at) return null;
    if (new Date(row.expires_at) < new Date()) return null;

    const role = payload.role as Role;
    return {
      sessionId: sid,
      id: payload.sub as string,
      email: payload.email as string,
      fullName: payload.name as string,
      role,
      facilityId: (payload.fid as string | null) ?? null,
      facilityName: (payload.fname as string | null) ?? null,
      prcLicense: null,
      specialization: null,
      permissions: ROLE_PERMISSIONS[role] ?? [],
      expiresAt: row.expires_at,
    };
  } catch {
    return null;
  }
}

export async function requireSession(): Promise<Session> {
  const s = await getSession();
  if (!s) throw new Error("UNAUTHENTICATED");
  return s;
}

/**
 * Page-level guard.
 *
 * `getSession()` returns null when the cookie holds an unexpired token whose
 * session record is gone — revoked, expired, or the database rebuilt. The proxy
 * cannot detect that because it only verifies the token, so every page must
 * handle it. Using `requirePageSession()` rather than `(await getSession())!`
 * means a stale cookie produces a redirect instead of a crash.
 */
export async function requirePageSession(): Promise<Session> {
  const s = await getSession();
  if (!s) redirect("/login");
  return s;
}

/**
 * Guard a page against a missing session AND a missing permission.
 * Redirects rather than throwing, because a page render must not crash.
 */
export async function requirePageAccess(permission: Permission): Promise<Session> {
  const s = await requirePageSession();
  if (!hasPermission(s, permission)) redirect("/dashboard");
  return s;
}

/* ------------------------------------------------------------------ */
/* Authorisation                                                       */
/* ------------------------------------------------------------------ */

export function hasPermission(session: Session, permission: Permission): boolean {
  return session.permissions.includes(permission);
}

export type DenyReason =
  | "unauthenticated"
  | "missing-permission"
  | "wrong-facility"
  | "consent-revoked"
  | "consent-expired"
  | "no-consent"
  | "break-glass-required";

export interface AuthzDecision {
  allowed: boolean;
  reason?: DenyReason;
  message?: string;
}

export interface ReferralAuthzContext {
  referringFacilityId: string;
  receivingFacilityId: string;
  status?: string;
}

/**
 * Facility-scoped access decision.
 *
 * Rules, in order:
 *  1. Cross-facility roles (HIE admin, auditor) are permitted by role.
 *  2. Otherwise the user's facility must be either the referrer or the receiver.
 *  3. A user with no facility assignment is denied (except cross-facility roles).
 */
export function canAccessReferral(
  session: Session,
  ctx: ReferralAuthzContext,
  permission: Permission,
): AuthzDecision {
  if (!hasPermission(session, permission)) {
    return {
      allowed: false,
      reason: "missing-permission",
      message: `Your role (${ROLE_LABELS[session.role]}) does not include this action.`,
    };
  }
  if (CROSS_FACILITY_ROLES.includes(session.role)) return { allowed: true };

  if (!session.facilityId) {
    return {
      allowed: false,
      reason: "wrong-facility",
      message: "Your account is not linked to a facility.",
    };
  }
  const involved =
    session.facilityId === ctx.referringFacilityId || session.facilityId === ctx.receivingFacilityId;

  if (!involved) {
    return {
      allowed: false,
      reason: "wrong-facility",
      message:
        "Your facility is not a party to this referral. Submit an access request if you have a legitimate clinical need.",
    };
  }
  return { allowed: true };
}

/** Consent gate: applies when the referral relies on patient consent. */
export function checkConsentGate(
  consent: { status: string; period_end?: string | null; purpose_code: string } | undefined,
  session: Session,
): AuthzDecision {
  if (session.role === ROLES.PATIENT) return { allowed: true };
  if (!consent) {
    return {
      allowed: false,
      reason: "no-consent",
      message: "No consent or lawful basis has been recorded for this referral.",
    };
  }
  if (consent.status === "revoked") {
    return {
      allowed: false,
      reason: "consent-revoked",
      message: "The patient has revoked consent for this exchange.",
    };
  }
  if (consent.status === "expired") {
    return { allowed: false, reason: "consent-expired", message: "The consent period for this exchange has lapsed." };
  }
  if (consent.period_end && new Date(consent.period_end) < new Date()) {
    return { allowed: false, reason: "consent-expired", message: "The consent period for this exchange has lapsed." };
  }
  return { allowed: true };
}

/* ------------------------------------------------------------------ */
/* Request context helpers                                             */
/* ------------------------------------------------------------------ */

export async function requestMeta(): Promise<{ ip?: string; userAgent?: string }> {
  const h = await headers();
  const ip =
    h.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    h.get("x-real-ip") ??
    undefined;
  const userAgent = h.get("user-agent") ?? undefined;
  return { ip, userAgent };
}

/** Server-action guard: throws if unauthorised, returns session otherwise. */
export async function guard(permission: Permission): Promise<Session> {
  const session = await getSession();
  if (!session) throw new Error("UNAUTHENTICATED");
  if (!hasPermission(session, permission)) {
    throw new Error(`FORBIDDEN: ${permission}`);
  }
  return session;
}

export async function auditFor(session: Session, input: Omit<AuditInput, "actorUserId" | "actorName" | "actorRole" | "actorFacility">) {
  return writeAudit({
    ...input,
    actorUserId: session.id,
    actorName: session.fullName,
    actorRole: session.role,
    actorFacility: session.facilityId,
  });
}

/** List active sessions for a user (for the security page). */
export function activeSessions(userId: string) {
  return all<{ id: string; created_at: string; expires_at: string; ip_address: string | null; user_agent: string | null; revoked_at: string | null }>(
    "SELECT * FROM sessions WHERE user_id = ? ORDER BY created_at DESC LIMIT 20",
    userId,
  );
}
