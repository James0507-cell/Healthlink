"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getSession, guard, PERMISSIONS, requestMeta, hasPermission, type Session } from "@/lib/auth";
import { transitionReferral, createReferral, addAttachment, revokeConsent, readinessFor, getReferralDetail, type CreateReferralInput } from "@/lib/referrals";
import { writeAudit } from "@/lib/db";

export interface TransitionState {
  error?: string;
  success?: string;
}

/** Perform a workflow transition from the UI. */
export async function transitionAction(_prev: TransitionState, formData: FormData): Promise<TransitionState> {
  let session: Session;
  try {
    session = await guard(PERMISSIONS.REFERRAL_READ_OWN_FACILITY);
  } catch (e) {
    const msg = (e as Error).message;
    return { error: msg === "UNAUTHENTICATED" ? "Your session has ended. Sign in again." : "You are not permitted to act on referrals." };
  }

  const referralId = String(formData.get("referralId") ?? "");
  const action = String(formData.get("action") ?? "");
  const note = String(formData.get("note") ?? "").trim() || undefined;
  const outcomeCode = String(formData.get("outcomeCode") ?? "").trim() || undefined;
  const appointmentAtRaw = String(formData.get("appointmentAt") ?? "").trim();
  const messageBody = String(formData.get("messageBody") ?? "").trim();
  const messageSubject = String(formData.get("messageSubject") ?? "").trim() || undefined;
  const messageKind = String(formData.get("messageKind") ?? "feedback");

  if (!referralId || !action) return { error: "Missing referral or action." };

  const appointmentAt = appointmentAtRaw ? new Date(appointmentAtRaw).toISOString() : undefined;

  const meta = await requestMeta();
  const result = transitionReferral(
    session,
    {
      referralId,
      action,
      note,
      outcomeCode,
      appointmentAt,
      message: messageBody ? { kind: messageKind, subject: messageSubject, body: messageBody } : undefined,
    },
    meta,
  );

  if (!result.ok) return { error: result.message };

  revalidatePath(`/referrals/${referralId}`);
  revalidatePath("/referrals");
  revalidatePath("/dashboard");

  return { success: result.message };
}

/* ------------------------------------------------------------------ */
/* Referral creation                                                   */
/* ------------------------------------------------------------------ */

export interface CreateReferralState {
  error?: string;
  step?: string;
  fieldErrors?: Record<string, string>;
  createdId?: string;
}

/**
 * Create and optionally route a referral.
 *
 * The payload arrives as JSON in a single hidden field because the referral
 * form is a multi-step wizard; this keeps one server action responsible for
 * validation, persistence and audit rather than spreading it across steps.
 */
export async function createReferralAction(
  _prev: CreateReferralState,
  formData: FormData,
): Promise<CreateReferralState> {
  let session: Session;
  try {
    session = await guard(PERMISSIONS.REFERRAL_CREATE);
  } catch {
    return { error: "You are not permitted to create referrals. Sign in again or contact your administrator." };
  }

  let payload: CreateReferralInput & { routeImmediately?: boolean };
  try {
    payload = JSON.parse(String(formData.get("payload") ?? "{}"));
  } catch {
    return { error: "The referral form data could not be read. Please review the form and try again." };
  }

  // Structural validation mirroring the routing checklist, so the user gets
  // field-level feedback instead of a single opaque failure.
  const fieldErrors: Record<string, string> = {};
  if (!payload.patientId) fieldErrors.patientId = "Select or register a patient.";
  if (!payload.receivingFacilityId) fieldErrors.receivingFacilityId = "Select the receiving facility.";
  if (!payload.reasonCode) fieldErrors.reasonCode = "Choose a reason for referral.";
  if (payload.reasonCode === "other" && !payload.reasonNarrative?.trim()) {
    fieldErrors.reasonNarrative = "Describe the reason for referral.";
  }
  if (!payload.chiefComplaint?.trim()) fieldErrors.chiefComplaint = "Record the chief complaint.";
  if (!payload.assessment?.trim()) fieldErrors.assessment = "Record your clinical assessment.";
  if (!payload.requestedAction?.trim()) fieldErrors.requestedAction = "State the requested action.";
  if (!payload.lawfulBasisCode) fieldErrors.lawfulBasisCode = "Record the lawful basis for this exchange.";
  if (!payload.diagnoses?.length) fieldErrors.diagnoses = "Add at least one diagnosis with a code.";

  if (Object.keys(fieldErrors).length) {
    return { error: "Some required information is missing.", fieldErrors, step: firstStepFor(fieldErrors) };
  }

  const meta = await requestMeta();

  let created: { id: string; referralNumber: string; trackingCode: string };
  try {
    const result = createReferral(session, payload, meta);
    created = { id: result.id, referralNumber: result.referralNumber, trackingCode: result.trackingCode };
  } catch (e) {
    const message = (e as Error).message;
    if (message.startsWith("VALIDATION:")) return { error: message.replace("VALIDATION:", "").trim() };
    if (message.startsWith("NOT_FOUND:")) return { error: "The selected patient or facility no longer exists." };
    if (message.startsWith("FORBIDDEN:")) return { error: "You are not permitted to create referrals for this facility." };
    console.error("createReferral failed:", e);
    return { error: "The referral could not be saved. Please try again." };
  }

  revalidatePath("/referrals");
  revalidatePath("/dashboard");

  if (payload.routeImmediately) {
    const detail = getReferralDetail(created.id);
    if (detail) {
      const readiness = readinessFor(detail);
      if (!readiness.ready) {
        writeAudit({
          action: "E",
          eventType: "route",
          eventSubtype: "deferred",
          actorUserId: session.id,
          actorName: session.fullName,
          actorRole: session.role,
          actorFacility: session.facilityId,
          referralId: created.id,
          outcome: "4",
          outcomeDesc: "Left as draft",
          description: `Referral ${created.referralNumber} was saved as a draft: ${readiness.blocking.length} requirement(s) still unmet.`,
        });
        // Land on the detail page where the outstanding requirements are listed.
        redirect(`/referrals/${created.id}?saved=draft`);
      }
      const routed = transitionReferral(session, { referralId: created.id, action: "submit" }, meta);
      if (!routed.ok) {
        return {
          error: `Referral ${created.referralNumber} was saved as a draft, but routing failed: ${routed.message}`,
          createdId: created.id,
        };
      }
      redirect(`/referrals/${created.id}?routed=1`);
    }
  }

  redirect(`/referrals/${created.id}?saved=1`);
}

function firstStepFor(errors: Record<string, string>): string {
  const patient = ["patientId"];
  const referral = ["receivingFacilityId", "reasonCode", "reasonNarrative"];
  for (const k of Object.keys(errors)) {
    if (patient.includes(k)) return "patient";
    if (referral.includes(k)) return "referral";
  }
  return "clinical";
}

/* ------------------------------------------------------------------ */
/* Attachments                                                         */
/* ------------------------------------------------------------------ */

export interface AttachmentState {
  error?: string;
  success?: string;
}

export async function addAttachmentAction(
  _prev: AttachmentState,
  formData: FormData,
): Promise<AttachmentState> {
  let session: Session;
  try {
    session = await guard(PERMISSIONS.ATTACHMENT_ADD);
  } catch {
    return { error: "Your role cannot attach documents." };
  }

  const referralId = String(formData.get("referralId") ?? "");
  const title = String(formData.get("title") ?? "").trim();
  const docTypeCode = String(formData.get("docTypeCode") ?? "other");
  const contentText = String(formData.get("contentText") ?? "").trim();

  if (!title) return { error: "Give the document a title." };
  if (!contentText) return { error: "The document has no content." };
  if (contentText.length > 400_000) return { error: "The document is too large for the prototype (400 KB limit)." };

  const docTypeDisplay =
    {
      "lab-result": "Laboratory result",
      "diagnostic-report": "Diagnostic report",
      "referral-summary": "Referral summary",
      "clinical-note": "Clinical note",
      "discharge-summary": "Discharge summary",
      "consent-form": "Consent form",
      other: "Other document",
    }[docTypeCode] ?? "Document";

  const meta = await requestMeta();
  const result = addAttachment(
    session,
    referralId,
    { title, docTypeCode, docTypeDisplay, contentText, contentType: "text/plain" },
    meta,
  );

  if (!result.ok) return { error: result.message };

  revalidatePath(`/referrals/${referralId}`);
  return { success: result.message };
}

/* ------------------------------------------------------------------ */
/* Consent                                                             */
/* ------------------------------------------------------------------ */

export interface ConsentState {
  error?: string;
  success?: string;
}

export async function revokeConsentAction(_prev: ConsentState, formData: FormData): Promise<ConsentState> {
  let session: Session | null;
  try {
    session = await getSession();
  } catch {
    return { error: "Your session has ended." };
  }
  if (!session) return { error: "Your session has ended." };

  const consentId = String(formData.get("consentId") ?? "");
  const referralId = String(formData.get("referralId") ?? "");
  const reason = String(formData.get("reason") ?? "").trim();

  if (!consentId) return { error: "Missing consent record." };
  if (!reason) return { error: "Record the reason for revoking consent." };

  const meta = await requestMeta();
  const result = revokeConsent(session, consentId, reason, meta);
  if (!result.ok) return { error: result.message };

  if (referralId) revalidatePath(`/referrals/${referralId}`);
  revalidatePath("/consent");

  return { success: result.message };
}

/* ------------------------------------------------------------------ */
/* FHIR validation (on demand)                                         */
/* ------------------------------------------------------------------ */

export interface ValidateState {
  error?: string;
  outcome?: {
    valid: boolean;
    errorCount: number;
    warningCount: number;
    infoCount: number;
    issues: Array<{ severity: string; expression?: string; diagnostics?: string; code: string }>;
  };
}

export async function validateReferralAction(_prev: ValidateState, formData: FormData): Promise<ValidateState> {
  let session: Session;
  try {
    session = await guard(PERMISSIONS.FHIR_VALIDATE);
  } catch {
    return { error: "Your role cannot run validation." };
  }

  const referralId = String(formData.get("referralId") ?? "");
  if (!referralId) return { error: "Missing referral." };

  const detail = getReferralDetail(referralId);
  if (!detail) return { error: "Referral not found." };

  const readiness = readinessFor(detail);
  const meta = await requestMeta();

  writeAudit({
    action: "E",
    eventType: "validate",
    actorUserId: session.id,
    actorName: session.fullName,
    actorRole: session.role,
    actorFacility: session.facilityId,
    patientId: detail.patient_id,
    referralId,
    entityType: "Bundle",
    entityId: `bundle-${referralId}`,
    outcome: readiness.fhir.valid ? "0" : "4",
    outcomeDesc: readiness.fhir.valid ? "Validation passed" : "Validation errors present",
    purposeCode: "treatment",
    description: `Validated referral ${detail.referral_number} against FHIR R4 and the Draft PH Core IG v0.2.0: ${readiness.fhir.errorCount} error(s), ${readiness.fhir.warningCount} warning(s).`,
    ipAddress: meta.ip,
    userAgent: meta.userAgent,
  });

  revalidatePath(`/referrals/${referralId}`);

  return {
    outcome: {
      valid: readiness.fhir.valid,
      errorCount: readiness.fhir.errorCount,
      warningCount: readiness.fhir.warningCount,
      infoCount: readiness.fhir.infoCount,
      issues: readiness.fhir.outcome.issue.slice(0, 60).map((i) => ({
        severity: i.severity,
        expression: i.expression?.[0],
        diagnostics: i.diagnostics,
        code: i.code,
      })),
    },
  };
}

/** Re-check that the current user may still view a referral (used by API routes). */
export async function canView(referralId: string): Promise<boolean> {
  const session = await getSession();
  if (!session) return false;
  if (!hasPermission(session, PERMISSIONS.REFERRAL_READ_OWN_FACILITY)) return false;
  const detail = getReferralDetail(referralId);
  if (!detail) return false;
  if (session.role === "hie_admin" || session.role === "privacy_auditor") return true;
  return session.facilityId === detail.referringFacility.id || session.facilityId === detail.receivingFacility.id;
}
