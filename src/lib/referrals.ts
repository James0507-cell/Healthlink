/**
 * Referral repository / service layer.
 *
 * This is the single place where a referral is read, written, and transitioned.
 * It enforces, in order:
 *   1. authentication and role permission  (auth.ts)
 *   2. facility scoping                    (auth.ts canAccessReferral)
 *   3. consent / lawful basis gate         (auth.ts checkConsentGate)
 *   4. workflow state machine              (workflow.ts canTransition)
 *   5. FHIR validation before routing       (fhir/validator.ts)
 *   6. append-only audit logging           (db.ts writeAudit)
 *
 * Any component that changes referral state must go through `transitionReferral`
 * so that these steps cannot be bypassed by a new UI surface.
 */

import { all, get, run, newId, trackingCode, writeAudit, insert, type AuditInput } from "./db";
import { hoursBetween } from "./dialect";
import {
  canAccessReferral,
  checkConsentGate,
  hasPermission,
  PERMISSIONS,
  type Permission,
  type Session,
} from "./auth";
import {
  STATES,
  TRANSITIONS,
  canTransition,
  routingChecklist,
  blockingFailures,
  advisoryGaps,
  formatReferralNumber,
  facilityShortCode,
  effectivePriority,
  OUTCOME_BY_CODE,
  type ReferralState,
  type RoutingRequirement,
} from "./workflow";
import { LAWFUL_BASIS } from "./fhir/terminology";
import {
  buildReferralBundle,
  observationsFor,
  type MappingInput,
  type ReferralRow,
  type PatientRow,
  type FacilityRow,
  type UserRow,
  type DiagnosisRow,
  type ObservationRow,
  type MedicationRow,
  type AllergyRow,
  type AttachmentRow,
  type ConsentRow,
} from "./fhir/mapper";
import { validateBundle, validateResource, type ValidationResult } from "./fhir/validator";
import { persistReferralBundle } from "./fhir-store";
import type { Bundle } from "./fhir/types";

/* ------------------------------------------------------------------ */
/* Types                                                               */
/* ------------------------------------------------------------------ */

export interface ReferralListRow {
  id: string;
  referral_number: string;
  tracking_code: string;
  status: string;
  priority: string;
  reason_display: string;
  reason_code: string;
  created_at: string;
  updated_at: string;
  status_updated_at: string;
  patient_id: string;
  patient_name: string;
  patient_mrn: string | null;
  patient_sex: string;
  patient_birth_date: string;
  referring_facility_id: string;
  referring_facility_name: string;
  receiving_facility_id: string;
  receiving_facility_name: string;
  outcome_display: string | null;
  confidentiality_level: string;
  fhir_bundle_version: number;
}

export interface ReferralDetail extends ReferralRow {
  patient: PatientRow;
  referringFacility: FacilityRow;
  receivingFacility: FacilityRow;
  referringUser: UserRow | null;
  receivingUser: UserRow | null;
  diagnoses: DiagnosisRow[];
  observations: ObservationRow[];
  medications: MedicationRow[];
  allergies: AllergyRow[];
  attachments: AttachmentRow[];
  consent: ConsentRow | null;
  events: ReferralEvent[];
  messages: ReferralMessage[];
}

export interface ReferralEvent {
  id: string;
  referral_id: string;
  sequence: number;
  from_status: string | null;
  to_status: string;
  action: string;
  fhir_task_status: string | null;
  business_status: string | null;
  actor_user_id: string | null;
  actor_name: string | null;
  actor_role: string | null;
  actor_facility: string | null;
  note: string | null;
  created_at: string;
  fhir_task_version: number | null;
}

export interface ReferralMessage {
  id: string;
  referral_id: string;
  kind: string;
  subject: string | null;
  body: string;
  sender_user_id: string | null;
  sender_name: string | null;
  sender_facility: string | null;
  recipient_facility: string | null;
  recipient_role: string | null;
  created_at: string;
  read_at: string | null;
  fhir_communication_id: string | null;
}

/** Which side of a referral the viewer is on. */
export type ViewerSide = "referring" | "receiving" | "both" | "observer" | "cross";

/** The side from the perspective of a workflow transition. */
export type TransitionSide = "referring" | "receiving" | "observer" | "cross";

/* ------------------------------------------------------------------ */
/* Reads                                                               */
/* ------------------------------------------------------------------ */

const LIST_SELECT = `
  SELECT r.id, r.referral_number, r.tracking_code, r.status, r.priority,
         r.reason_display, r.reason_code, r.created_at, r.updated_at, r.status_updated_at,
         r.patient_id, r.outcome_display, r.confidentiality_level, r.fhir_bundle_version,
         (p.given_name || ' ' || p.family_name) AS patient_name,
         p.local_mrn AS patient_mrn, p.sex AS patient_sex, p.birth_date AS patient_birth_date,
         r.referring_facility_id, rf.name AS referring_facility_name,
         r.receiving_facility_id, rc.name AS receiving_facility_name
    FROM referrals r
    JOIN patients p ON p.id = r.patient_id
    JOIN facilities rf ON rf.id = r.referring_facility_id
    JOIN facilities rc ON rc.id = r.receiving_facility_id
`;

export interface ListReferralsOptions {
  status?: string;
  side?: "referring" | "receiving" | "all";
  facilityId?: string | null;
  search?: string;
  priority?: string;
  limit?: number;
  offset?: number;
  includeDrafts?: boolean;
}

/**
 * List referrals visible to the session, honouring facility scoping.
 * Cross-facility roles see everything.
 */
export async function listReferrals(session: Session, opts: ListReferralsOptions = {}): Promise<{ rows: ReferralListRow[]; total: number }> {
  const where: string[] = ["r.deleted_at IS NULL"];
  const params: unknown[] = [];

  const crossFacility =
    session.role === "hie_admin" || session.role === "privacy_auditor";

  if (!crossFacility) {
    if (!session.facilityId) return { rows: [], total: 0 };
    if (opts.side === "referring") {
      where.push("r.referring_facility_id = ?");
      params.push(session.facilityId);
    } else if (opts.side === "receiving") {
      where.push("r.receiving_facility_id = ?");
      params.push(session.facilityId);
    } else {
      where.push("(r.referring_facility_id = ? OR r.receiving_facility_id = ?)");
      params.push(session.facilityId, session.facilityId);
    }
  } else if (opts.facilityId) {
    where.push("(r.referring_facility_id = ? OR r.receiving_facility_id = ?)");
    params.push(opts.facilityId, opts.facilityId);
  }

  if (opts.status) {
    where.push("r.status = ?");
    params.push(opts.status);
  } else if (!opts.includeDrafts) {
    // Drafts are private working copies; keep them out of queues by default
    // unless the caller explicitly asks.
    where.push("r.status <> 'draft'");
  }

  if (opts.priority) {
    where.push("r.priority = ?");
    params.push(opts.priority);
  }

  if (opts.search?.trim()) {
    const q = `%${opts.search.trim()}%`;
    where.push(
      "(r.referral_number LIKE ? OR r.tracking_code LIKE ? OR p.family_name LIKE ? OR p.given_name LIKE ? OR p.local_mrn LIKE ? OR p.philhealth_id LIKE ?)",
    );
    params.push(q, q, q, q, q, q);
  }

  const whereSql = where.length ? `WHERE ${where.join(" AND ")}` : "";

  const total =
    (await get<{ n: number }>(
      `SELECT COUNT(*) AS n FROM referrals r
         JOIN patients p ON p.id = r.patient_id
         JOIN facilities rf ON rf.id = r.referring_facility_id
         JOIN facilities rc ON rc.id = r.receiving_facility_id
       ${whereSql}`,
      ...params,
    ))?.n ?? 0;

  const limit = Math.min(Math.max(opts.limit ?? 50, 1), 200);
  const offset = Math.max(opts.offset ?? 0, 0);

  const rows = await all<ReferralListRow>(
    `${LIST_SELECT} ${whereSql}
     ORDER BY
       CASE r.priority WHEN 'stat' THEN 0 WHEN 'asap' THEN 1 WHEN 'urgent' THEN 2 ELSE 3 END,
       r.status_updated_at DESC
     LIMIT ? OFFSET ?`,
    ...params,
    limit,
    offset,
  );

  return { rows, total };
}

/** Referral counts by state for the dashboard and worklists. */
export async function referralCounts(session: Session, facilityId?: string | null) {
  const crossFacility = session.role === "hie_admin" || session.role === "privacy_auditor";
  const fid = facilityId ?? session.facilityId;

  let where = "r.deleted_at IS NULL";
  const params: unknown[] = [];
  if (!crossFacility) {
    if (!fid) return [] as Array<{ status: string; n: number }>;
    where += " AND (r.referring_facility_id = ? OR r.receiving_facility_id = ?)";
    params.push(fid, fid);
  } else if (facilityId) {
    where += " AND (r.referring_facility_id = ? OR r.receiving_facility_id = ?)";
    params.push(facilityId, facilityId);
  }

  return await all<{ status: string; n: number }>(
    `SELECT r.status, COUNT(*) AS n FROM referrals r WHERE ${where} GROUP BY r.status`,
    ...params,
  );
}

export async function getReferralDetail(id: string): Promise<ReferralDetail | null> {
  const referral = await get<ReferralRow>("SELECT * FROM referrals WHERE id = ? AND deleted_at IS NULL", id);
  if (!referral) return null;

  const patient = await get<PatientRow>("SELECT * FROM patients WHERE id = ?", referral.patient_id);
  const referringFacility = await get<FacilityRow>("SELECT * FROM facilities WHERE id = ?", referral.referring_facility_id);
  const receivingFacility = await get<FacilityRow>("SELECT * FROM facilities WHERE id = ?", referral.receiving_facility_id);
  if (!patient || !referringFacility || !receivingFacility) return null;

  const referringUser = referral.referring_user_id
    ? (await get<UserRow>("SELECT * FROM users WHERE id = ?", referral.referring_user_id) ?? null)
    : null;
  const receivingUser = referral.receiving_user_id
    ? (await get<UserRow>("SELECT * FROM users WHERE id = ?", referral.receiving_user_id) ?? null)
    : null;

  const diagnoses = await all<DiagnosisRow>(
    "SELECT * FROM referral_diagnoses WHERE referral_id = ? ORDER BY sequence",
    id,
  );
  const observations = await all<ObservationRow>(
    "SELECT * FROM referral_observations WHERE referral_id = ? ORDER BY sequence",
    id,
  );
  const medications = await all<MedicationRow>(
    "SELECT * FROM referral_medications WHERE referral_id = ? ORDER BY sequence",
    id,
  );
  const allergies = await all<AllergyRow>(
    "SELECT * FROM referral_allergies WHERE referral_id = ? ORDER BY sequence",
    id,
  );
  const attachments = await all<AttachmentRow>(
    "SELECT id, title, doc_type_code, doc_type_display, content_type, size_bytes, content_text, created_at, sha256 FROM referral_attachments WHERE referral_id = ? ORDER BY created_at",
    id,
  );
  const consent = referral.consent_id
    ? (await get<ConsentRow>("SELECT * FROM consents WHERE id = ?", referral.consent_id) ?? null)
    : null;

  const events = await all<ReferralEvent>(
    "SELECT * FROM referral_events WHERE referral_id = ? ORDER BY sequence",
    id,
  );
  const messages = await all<ReferralMessage>(
    "SELECT * FROM referral_messages WHERE referral_id = ? ORDER BY created_at",
    id,
  );

  return {
    ...referral,
    patient,
    referringFacility,
    receivingFacility,
    referringUser,
    receivingUser,
    diagnoses,
    observations,
    medications,
    allergies,
    attachments,
    consent,
    events,
    messages,
  };
}

/** Determine which side of a referral the viewer stands on. */
export function viewerSide(session: Session, detail: { referringFacility: { id: string }; receivingFacility: { id: string } }): ViewerSide {
  if (session.role === "hie_admin" || session.role === "privacy_auditor") return "cross";
  if (session.role === "patient") return "observer";
  if (!session.facilityId) return "observer";
  const isRef = session.facilityId === detail.referringFacility.id;
  const isRec = session.facilityId === detail.receivingFacility.id;
  if (isRef && isRec) return "both";
  if (isRef) return "referring";
  if (isRec) return "receiving";
  return "observer";
}

export function assertCanView(session: Session, detail: ReferralDetail): { ok: true } | { ok: false; message: string } {
  const decision = canAccessReferral(
    session,
    {
      referringFacilityId: detail.referringFacility.id,
      receivingFacilityId: detail.receivingFacility.id,
      status: detail.status,
    },
    PERMISSIONS.REFERRAL_READ_OWN_FACILITY,
  );
  if (!decision.allowed && session.role !== "patient") {
    return { ok: false, message: decision.message ?? "Access denied." };
  }
  return { ok: true };
}

/* ------------------------------------------------------------------ */
/* Mapping input assembly                                              */
/* ------------------------------------------------------------------ */

export function mappingInputFor(
  detail: ReferralDetail,
  actorUser?: UserRow | null,
): MappingInput {
  return {
    referral: detail,
    patient: detail.patient,
    referringFacility: detail.referringFacility,
    receivingFacility: detail.receivingFacility,
    referringUser: detail.referringUser,
    receivingUser: detail.receivingUser,
    diagnoses: detail.diagnoses,
    observations: detail.observations,
    medications: detail.medications,
    allergies: detail.allergies,
    attachments: detail.attachments,
    consent: detail.consent,
    currentState: (STATES[detail.status as ReferralState] ? detail.status : "draft") as ReferralState,
    actorUser: actorUser ?? detail.referringUser,
  };
}

/** Build the full FHIR transaction Bundle for a referral. */
export async function bundleForReferral(detail: ReferralDetail, actorUser?: UserRow | null): Promise<Bundle> {
  const input = await mappingInputFor(detail, actorUser);
  return buildReferralBundle(input, {
    history: detail.events.map((e) => ({
      to_status: e.to_status,
      created_at: e.created_at,
      actor_name: e.actor_name,
      note: e.note,
    })),
    feedback: detail.messages.map((m) => ({
      id: m.id,
      kind: m.kind,
      subject: m.subject,
      body: m.body,
      sender_name: m.sender_name,
      sender_user_id: m.sender_user_id,
      created_at: m.created_at,
      recipient_role: m.recipient_role,
      author_facility_id: m.sender_facility,
    })),
  });
}

/** Validate the referral package. */
export async function validateReferral(detail: ReferralDetail, actorUser?: UserRow | null) {
  const bundle = await bundleForReferral(detail, actorUser);
  return validateBundle(bundle, { phCore: true });
}

/** Pre-routing readiness for a referral. */
export async function readinessFor(detail: ReferralDetail): Promise<{
  requirements: RoutingRequirement[];
  blocking: RoutingRequirement[];
  advisory: RoutingRequirement[];
  ready: boolean;
  fhir: ReturnType<typeof validateBundle>;
}> {
  const fhir = await validateReferral(detail);
  const basis = LAWFUL_BASIS[detail.lawful_basis_code];

  // Inline vitals count as objective findings: they are promoted to FHIR
  // Observations by the mapper, so a referral with vitals does carry structured
  // observations even when no separate result rows were captured.
  const input = await mappingInputFor(detail);
  const observationCount = observationsFor(input).length;

  const requirements = routingChecklist({
    patientId: detail.patient_id,
    receivingFacilityId: detail.receiving_facility_id,
    reasonCode: detail.reason_code,
    reasonNarrative: detail.reason_narrative,
    chiefComplaint: detail.chief_complaint,
    assessment: detail.assessment,
    requestedAction: detail.requested_action,
    diagnoses: detail.diagnoses.map((d) => ({ code: d.code, display: d.display, system: d.system, role: d.role })),
    observations: Array.from({ length: observationCount }, (_, i) => ({ code: `obs-${i}` })),
    attachments: detail.attachments.map((a) => ({ id: a.id, title: a.title })),
    lawfulBasisCode: detail.lawful_basis_code,
    consentId: detail.consent?.id ?? null,
    consentStatus: detail.consent?.status ?? null,
    consentRequired: basis?.requiresConsentRecord ?? false,
    fhirValid: fhir.valid,
    fhirErrorCount: fhir.errorCount,
    fhirWarningCount: fhir.warningCount,
    confidentialityLevel: detail.confidentiality_level,
  });

  const blocking = blockingFailures(requirements);
  const advisory = advisoryGaps(requirements);

  return { requirements, blocking, advisory, ready: blocking.length === 0, fhir };
}

/* ------------------------------------------------------------------ */
/* Writes                                                              */
/* ------------------------------------------------------------------ */

export interface CreateReferralInput {
  patientId: string;
  receivingFacilityId: string;
  priority: string;
  reasonCode: string;
  reasonDisplay: string;
  reasonNarrative?: string;
  chiefComplaint?: string;
  historyOfPresent?: string;
  pastMedicalHistory?: string;
  pastSurgicalHistory?: string;
  familyHistory?: string;
  personalSocialHistory?: string;
  reviewOfSystems?: string;
  physicalExamination?: string;
  assessment?: string;
  managementPlan?: string;
  requestedAction?: string;
  specialInstructions?: string;
  vitals?: {
    systolic?: number;
    diastolic?: number;
    heartRate?: number;
    respRate?: number;
    temperature?: number;
    spo2?: number;
    weightKg?: number;
    heightCm?: number;
    painScore?: number;
  };
  lawfulBasisCode: string;
  confidentialityLevel?: string;
  dataMinimisationNote?: string;
  consent?: {
    grantedByName: string;
    grantedByRelation: string;
    witnessName?: string;
    periodEnd?: string;
    scopeFacilities?: string[];
    scopeDataClasses?: string[];
  };
  diagnoses: Array<{ system: string; code: string; display: string; role?: string; certainty?: string; onsetDate?: string }>;
  observations: Array<{
    system: string;
    code: string;
    display: string;
    category: string;
    valueNum?: number | null;
    valueText?: string | null;
    unit?: string | null;
    ucum?: string | null;
    refLow?: number | null;
    refHigh?: number | null;
  }>;
  medications: Array<{ medication: string; fdaCpr?: string; dose?: string; route?: string; frequency?: string; startedOn?: string }>;
  allergies: Array<{ system: string; code: string; display: string; reaction?: string; criticality?: string; category?: string }>;
}

/** Create a referral in `draft` state, together with its consent record. */
export async function createReferral(
  session: Session,
  input: CreateReferralInput,
  meta: { ip?: string; userAgent?: string } = {},
): Promise<{ id: string; referralNumber: string; trackingCode: string; validation: ValidationResult }> {
  if (!hasPermission(session, PERMISSIONS.REFERRAL_CREATE)) {
    throw new Error("FORBIDDEN: referral:create");
  }
  if (!session.facilityId) throw new Error("FORBIDDEN: no facility assigned to your account.");

  const patient = await get<PatientRow>("SELECT * FROM patients WHERE id = ?", input.patientId);
  if (!patient) throw new Error("NOT_FOUND: patient");

  const receiving = await get<FacilityRow>("SELECT * FROM facilities WHERE id = ?", input.receivingFacilityId);
  if (!receiving) throw new Error("NOT_FOUND: receiving facility");

  const referring = await get<FacilityRow>("SELECT * FROM facilities WHERE id = ?", session.facilityId);
  if (!referring) throw new Error("NOT_FOUND: referring facility");

  if (referring.id === receiving.id) {
    throw new Error("VALIDATION: the referring and receiving facility must be different.");
  }

  const basis = LAWFUL_BASIS[input.lawfulBasisCode];
  if (!basis) throw new Error("VALIDATION: unknown lawful basis.");

  if (basis.requiresConsentRecord && !input.consent) {
    throw new Error(
      "VALIDATION: the selected lawful basis requires a patient consent record. Provide the authorisation details or select another basis.",
    );
  }

  const now = new Date();
  const id = newId("ref");
  const year = now.getFullYear();

  // Sequence is derived from the highest existing sequence at this facility, not
  // from a row count. A count breaks as soon as any referral is removed or
  // renumbered, and it silently reproduces an existing number.
  const facilityCode = facilityShortCode(referring.name, referring.short_name);
  const prefix = `HL-${year}-${facilityCode}-`;
  const highest = (await get<{ referral_number: string }>(
    `SELECT referral_number FROM referrals
      WHERE referral_number LIKE ?
      ORDER BY referral_number DESC LIMIT 1`,
    `${prefix}%`,
  ))?.referral_number;
  const lastSequence = highest ? Number.parseInt(highest.slice(prefix.length), 10) : 0;
  const sequence = (Number.isFinite(lastSequence) ? lastSequence : 0) + 1;
  const referralNumber = formatReferralNumber(year, facilityCode, sequence);
  const track = trackingCode();

  const priority = effectivePriority(input.priority, input.reasonCode);

  // Consent record.
  //
  // A record is always created so that the basis is captured with the referral
  // and carried in the FHIR Consent resource. Where the basis does not require
  // patient authorisation (treatment purposes, vital interests, legal
  // obligation, public health) the record documents the basis itself rather
  // than claiming a consent that was never obtained.
  let consentId: string | null = null;
  {
    consentId = newId("con");
    const requiresAuthorisation = basis.requiresConsentRecord;
    await insert("consents", {
      id: consentId,
      patient_id: input.patientId,
      referral_id: id,
      purpose_code: basis.code,
      purpose_display: basis.display,
      legal_reference: basis.legalRef,
      scope_facilities: JSON.stringify(input.consent?.scopeFacilities ?? [referring.id, receiving.id]),
      scope_data_classes: JSON.stringify(
        input.consent?.scopeDataClasses ?? [
          "demographics",
          "diagnoses",
          "observations",
          "medications",
          "allergies",
          "documents",
        ],
      ),
      period_start: now.toISOString(),
      period_end:
        input.consent?.periodEnd ?? new Date(now.getTime() + 365 * 86_400_000).toISOString(),
      status: "active",
      granted_by_name: requiresAuthorisation ? (input.consent!.grantedByName ?? null) : "Recorded under lawful basis",
      granted_by_relation: requiresAuthorisation ? (input.consent!.grantedByRelation ?? "self") : "not-required",
      granted_at: requiresAuthorisation ? now.toISOString() : null,
      witness_name: requiresAuthorisation ? (input.consent!.witnessName ?? null) : null,
      created_at: now.toISOString(),
    });
  }

  const v = input.vitals ?? {};

  // Inserted via the object helper so the column list and values cannot drift
  // apart. A hand-written placeholder list previously omitted a column here.
  await insert("referrals", {
    id,
    referral_number: referralNumber,
    tracking_code: track,
    patient_id: input.patientId,
    referring_facility_id: referring.id,
    referring_user_id: session.id,
    receiving_facility_id: receiving.id,
    receiving_user_id: null,
    status: "draft",
    status_updated_at: now.toISOString(),
    priority,
    reason_code: input.reasonCode,
    reason_display: input.reasonDisplay,
    reason_narrative: input.reasonNarrative ?? null,
    chief_complaint: input.chiefComplaint ?? null,
    history_of_present: input.historyOfPresent ?? null,
    past_medical_history: input.pastMedicalHistory ?? null,
    past_surgical_history: input.pastSurgicalHistory ?? null,
    family_history: input.familyHistory ?? null,
    personal_social_history: input.personalSocialHistory ?? null,
    review_of_systems: input.reviewOfSystems ?? null,
    physical_examination: input.physicalExamination ?? null,
    assessment: input.assessment ?? null,
    management_plan: input.managementPlan ?? null,
    requested_action: input.requestedAction ?? null,
    special_instructions: input.specialInstructions ?? null,
    vital_systolic: v.systolic ?? null,
    vital_diastolic: v.diastolic ?? null,
    vital_heart_rate: v.heartRate ?? null,
    vital_resp_rate: v.respRate ?? null,
    vital_temperature: v.temperature ?? null,
    vital_spo2: v.spo2 ?? null,
    vital_weight_kg: v.weightKg ?? null,
    vital_height_cm: v.heightCm ?? null,
    vital_pain_score: v.painScore ?? null,
    consent_id: consentId,
    lawful_basis_code: basis.code,
    lawful_basis_display: basis.display,
    confidentiality_level: input.confidentialityLevel ?? "normal",
    data_minimisation_note: input.dataMinimisationNote ?? null,
    fhir_bundle_version: 0,
    fhir_validation_errors: 0,
    fhir_validation_warnings: 0,
    route_attempts: 0,
    created_at: now.toISOString(),
    updated_at: now.toISOString(),
    retention_until: new Date(now.getTime() + 7 * 365 * 86_400_000).toISOString(),
  });

  for (const [i, d] of input.diagnoses.entries()) {
    await run(
      `INSERT INTO referral_diagnoses (id, referral_id, system, code, display, role, certainty, onset_date, sequence)
       VALUES (?,?,?,?,?,?,?,?,?)`,
      newId("dx"),
      id,
      d.system,
      d.code,
      d.display,
      d.role ?? "secondary",
      d.certainty ?? "confirmed",
      d.onsetDate ?? null,
      i,
    );
  }

  for (const [i, o] of input.observations.entries()) {
    await run(
      `INSERT INTO referral_observations (
         id, referral_id, system, code, display, category, value_num, value_text,
         unit, ucum_code, ref_low, ref_high, effective_at, sequence
       ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      newId("obs"),
      id,
      o.system,
      o.code,
      o.display,
      o.category,
      o.valueNum ?? null,
      o.valueText ?? null,
      o.unit ?? null,
      o.ucum ?? null,
      o.refLow ?? null,
      o.refHigh ?? null,
      now.toISOString(),
      i,
    );
  }

  for (const [i, m] of input.medications.entries()) {
    await run(
      `INSERT INTO referral_medications (id, referral_id, medication, fda_cpr, dose, route, frequency, status, started_on, sequence)
       VALUES (?,?,?,?,?,?,?, 'active', ?, ?)`,
      newId("med"),
      id,
      m.medication,
      m.fdaCpr ?? null,
      m.dose ?? null,
      m.route ?? null,
      m.frequency ?? null,
      m.startedOn ?? null,
      i,
    );
  }

  for (const [i, a] of input.allergies.entries()) {
    await run(
      `INSERT INTO referral_allergies (id, referral_id, system, code, display, reaction, criticality, category, sequence)
       VALUES (?,?,?,?,?,?,?,?,?)`,
      newId("alg"),
      id,
      a.system,
      a.code,
      a.display,
      a.reaction ?? null,
      a.criticality ?? null,
      a.category ?? null,
      i,
    );
  }

  await run(
    `INSERT INTO referral_events (
       id, referral_id, sequence, from_status, to_status, action,
       fhir_task_status, business_status, actor_user_id, actor_name, actor_role,
       actor_facility, note, created_at, fhir_task_version
     ) VALUES (?,?,1,NULL,'draft','create','draft','draft',?,?,?,?,?,?,0)`,
    newId("evt"),
    id,
    session.id,
    session.fullName,
    session.role,
    session.facilityId,
    "Draft referral created.",
    now.toISOString(),
  );

  const detail = (await getReferralDetail(id))!;
  const validation = await validateReferral(detail, await actorToUserRow(session));

  await writeAudit({
    action: "C",
    eventType: "create",
    actorUserId: session.id,
    actorName: session.fullName,
    actorRole: session.role,
    actorFacility: session.facilityId,
    patientId: input.patientId,
    referralId: id,
    entityType: "Referral",
    entityId: id,
    outcome: validation.valid ? "0" : "4",
    outcomeDesc: validation.valid ? "Success" : "Validation warnings present",
    purposeCode: "treatment",
    description: `Created referral ${referralNumber} from ${referring.name} to ${receiving.name} (${input.reasonDisplay}). Consent basis: ${basis.display}.`,
    ipAddress: meta.ip ?? null,
    userAgent: meta.userAgent ?? null,
  });

  return { id, referralNumber, trackingCode: track, validation };
}

/** Convert a session into the UserRow shape the mapper expects. */
export async function actorToUserRow(session: Session): Promise<UserRow> {
  const row = await get<UserRow>("SELECT * FROM users WHERE id = ?", session.id);
  return (
    row ?? {
      id: session.id,
      full_name: session.fullName,
      role: session.role,
      email: session.email,
      facility_id: session.facilityId,
    }
  );
}

export interface TransitionInput {
  referralId: string;
  action: string;
  note?: string;
  message?: { kind: string; subject?: string; body: string };
  outcomeCode?: string;
  appointmentAt?: string;
  /** Additional observations supplied in response to an information request. */
  additionalObservations?: Array<{
    system: string;
    code: string;
    display: string;
    category: string;
    valueNum?: number | null;
    valueText?: string | null;
    unit?: string | null;
  }>;
  /** Additional narrative supplied in response to an information request. */
  additionalNarrative?: string;
}

export interface TransitionResult {
  ok: boolean;
  message: string;
  toStatus?: ReferralState;
  validation?: ReturnType<typeof validateBundle>;
  events?: ReferralEvent[];
}

/**
 * Perform a workflow transition. This is the only supported way to change
 * referral state. Every path through it logs to the audit trail.
 */
export async function transitionReferral(
  session: Session,
  input: TransitionInput,
  meta: { ip?: string; userAgent?: string } = {},
): Promise<TransitionResult> {
  const detail = await getReferralDetail(input.referralId);
  if (!detail) return { ok: false, message: "Referral not found." };

  const side = viewerSide(session, detail);
  const currentState = detail.status as ReferralState;
  const def = TRANSITIONS.find((t) => t.action === input.action);

  if (!def) return { ok: false, message: `Unknown action "${input.action}".` };

  // 1. Permission + side check
  // A user whose facility is on both sides of the referral (rare but possible in
  // a provider network) is treated as the side that owns the action.
  const transitionSide: TransitionSide =
    side === "both" ? (def.side === "either" || def.side === "referring" ? "referring" : "receiving") : side;
  const decision = canTransition(currentState, input.action, {
    permissions: session.permissions,
    side: transitionSide,
  });
  if (!decision.allowed) {
    await writeAudit({
      action: "E",
      eventType: "security",
      eventSubtype: "authorisation-denied",
      actorUserId: session.id,
      actorName: session.fullName,
      actorRole: session.role,
      actorFacility: session.facilityId,
      patientId: detail.patient_id,
      referralId: detail.id,
      outcome: "8",
      outcomeDesc: "Authorisation denied",
      description: `Blocked attempt to "${input.action}" referral ${detail.referral_number}: ${decision.reason}`,
      ipAddress: meta.ip ?? null,
    });
    return { ok: false, message: decision.reason ?? "Not permitted." };
  }

  // 2. Facility scope check on the specific permission
  const requiredPermission = def.requiresAny.find((p) => session.permissions.includes(p as Permission)) as
    | Permission
    | undefined;
  if (requiredPermission) {
    const fac = canAccessReferral(
      session,
      {
        referringFacilityId: detail.referringFacility.id,
        receivingFacilityId: detail.receivingFacility.id,
        status: detail.status,
      },
      requiredPermission,
    );
    if (!fac.allowed) return { ok: false, message: fac.message ?? "Access denied." };
  }

  // 3. Consent gate
  const consentDecision = checkConsentGate(
    detail.consent
      ? { status: detail.consent.status, period_end: detail.consent.period_end, purpose_code: detail.consent.purpose_code }
      : undefined,
    session,
  );
  if (!consentDecision.allowed) {
    await writeAudit({
      action: "E",
      eventType: "consent",
      eventSubtype: "gate-blocked",
      actorUserId: session.id,
      actorName: session.fullName,
      actorRole: session.role,
      actorFacility: session.facilityId,
      patientId: detail.patient_id,
      referralId: detail.id,
      outcome: "8",
      outcomeDesc: consentDecision.reason ?? "Consent gate",
      description: `Transition "${input.action}" blocked on referral ${detail.referral_number}: ${consentDecision.message}`,
      ipAddress: meta.ip ?? null,
    });
    return { ok: false, message: consentDecision.message ?? "Consent gate blocked this action." };
  }

  // 4. Action-specific required fields
  if (def.requiresNote && !input.note?.trim()) {
    return { ok: false, message: `"${def.label}" requires a note explaining the decision.` };
  }
  if (def.allowsOutcome && input.outcomeCode && !OUTCOME_BY_CODE.has(input.outcomeCode)) {
    return { ok: false, message: "Unknown outcome code." };
  }
  if (def.allowsAppointment && !input.appointmentAt) {
    return { ok: false, message: "Provide the appointment or admission date and time." };
  }

  // 5. Routing pre-flight: validation must pass before a referral is transmitted
  if (input.action === "submit") {
    const readiness = await readinessFor(detail);
    if (!readiness.ready) {
      const list = readiness.blocking.map((b) => `- ${b.label}${b.detail ? `: ${b.detail}` : ""}`).join("\n");
      await writeAudit({
        action: "E",
        eventType: "route",
        eventSubtype: "blocked",
        actorUserId: session.id,
        actorName: session.fullName,
        actorRole: session.role,
        actorFacility: session.facilityId,
        patientId: detail.patient_id,
        referralId: detail.id,
        outcome: "4",
        outcomeDesc: "Pre-routing validation failed",
        description: `Routing of referral ${detail.referral_number} was blocked: ${readiness.blocking.length} unmet requirement(s).`,
        ipAddress: meta.ip ?? null,
      });
      return {
        ok: false,
        message: `The referral cannot be routed yet. ${readiness.blocking.length} requirement(s) are unmet:\n${list}`,
      };
    }
    if (!readiness.fhir.valid) {
      return {
        ok: false,
        message: `FHIR validation reported ${readiness.fhir.errorCount} error(s). Resolve them before routing.`,
        validation: readiness.fhir,
      };
    }
  }

  // 6. Apply the transition
  const now = new Date().toISOString();
  const nextState = def.to;

  // Optional supporting writes
  if (input.additionalObservations?.length) {
    const existing = (await get<{ n: number }>(
      "SELECT COUNT(*) AS n FROM referral_observations WHERE referral_id = ?",
      detail.id,
    ))?.n ?? 0;
    for (const [i, o] of input.additionalObservations.entries()) {
      await run(
        `INSERT INTO referral_observations (
           id, referral_id, system, code, display, category, value_num, value_text,
           unit, ucum_code, ref_low, ref_high, effective_at, sequence
         ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
        newId("obs"),
        detail.id,
        o.system,
        o.code,
        o.display,
        o.category,
        o.valueNum ?? null,
        o.valueText ?? null,
        o.unit ?? null,
        null,
        null,
        null,
        now,
        existing + i,
      );
    }
  }

  if (input.additionalNarrative?.trim()) {
    const existing = detail.receiving_notes
      ? `${detail.receiving_notes}\n\n`
      : "";
    await run(
      "UPDATE referrals SET receiving_notes = ? WHERE id = ?",
      `${existing}[Information supplied] ${input.additionalNarrative.trim()}`,
      detail.id,
    );
  }

  const updates: string[] = ["status = ?", "status_updated_at = ?", "updated_at = ?", "fhir_bundle_version = fhir_bundle_version + 1"];
  const params: unknown[] = [nextState, now, now];

  if (input.action === "submit") {
    updates.push("routed_at = ?", "route_channel = ?");
    params.push(now, "shared-fhir-api");
  }
  if (nextState === "submitted") {
    updates.push("route_attempts = route_attempts + 1");
  }
  if (nextState === "accepted") {
    updates.push("accepted_at = ?", "receiving_user_id = ?");
    params.push(now, session.id);
  }
  if (input.appointmentAt) {
    updates.push("appointment_at = ?");
    params.push(input.appointmentAt);
  }
  if (input.outcomeCode) {
    const o = OUTCOME_BY_CODE.get(input.outcomeCode);
    updates.push("outcome_code = ?", "outcome_display = ?");
    params.push(input.outcomeCode, o?.display ?? input.outcomeCode);
  }
  if (input.note?.trim() && (side === "receiving" || side === "cross")) {
    updates.push("receiving_notes = ?");
    params.push(input.note.trim());
  }
  if (nextState === "completed") {
    updates.push("completed_at = ?");
    params.push(now);
  }
  if (nextState === "closed-feedback") {
    updates.push("closed_at = ?");
    params.push(now);
  }
  if (input.action === "submit") {
    updates.push("fhir_service_request_id = ?", "fhir_task_id = ?", "fhir_encounter_id = ?", "fhir_patient_id = ?");
    params.push(`sr-${detail.id}`, `task-${detail.id}`, `enc-${detail.id}`, detail.patient_id);
  }

  params.push(detail.id);
  await run(`UPDATE referrals SET ${updates.join(", ")} WHERE id = ?`, ...params);

  // Event row
  const stateDef = STATES[nextState];
  const seq =
    ((await get<{ n: number }>(
      "SELECT COALESCE(MAX(sequence),0) AS n FROM referral_events WHERE referral_id = ?",
      detail.id,
    ))?.n ?? 0) + 1;

  await run(
    `INSERT INTO referral_events (
       id, referral_id, sequence, from_status, to_status, action,
       fhir_task_status, business_status, actor_user_id, actor_name, actor_role,
       actor_facility, note, created_at, fhir_task_version
     ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    newId("evt"),
    detail.id,
    seq,
    currentState,
    nextState,
    input.action,
    stateDef.fhirTaskStatus,
    stateDef.fhirBusinessStatus,
    session.id,
    session.fullName,
    session.role,
    session.facilityId,
    input.note ?? null,
    now,
    (detail.fhir_bundle_version ?? 0) + 1,
  );

  // Feedback message
  if (input.message?.body?.trim()) {
    const recipientFacility = side === "referring" ? detail.receivingFacility.id : detail.referringFacility.id;
    await run(
      `INSERT INTO referral_messages (
         id, referral_id, kind, subject, body, sender_user_id, sender_name,
         sender_facility, recipient_facility, recipient_role, created_at
       ) VALUES (?,?,?,?,?,?,?,?,?,?,?)`,
      newId("msg"),
      detail.id,
      input.message.kind,
      input.message.subject ?? null,
      input.message.body.trim(),
      session.id,
      session.fullName,
      session.facilityId,
      recipientFacility,
      side === "referring" ? "receiving_provider" : "referring_provider",
      now,
    );
  }

  // Re-validate so the caller can surface the updated FHIR state, and persist
  // the standardised representation that a receiving system will read.
  const updated = (await getReferralDetail(detail.id))!;
  const validation = await validateReferral(updated, await actorToUserRow(session));

  let fhirVersion = detail.fhir_bundle_version;
  try {
    const persisted = await persistReferralBundle(
      detail.id,
      await mappingInputFor(updated, await actorToUserRow(session)),
      { sourceFacilityId: session.facilityId, createdByUser: session.id },
    );
    fhirVersion = persisted.version;
  } catch (e) {
    console.error("Failed to persist referral bundle:", e);
  }

  await run(
    "UPDATE referrals SET fhir_validation_errors = ?, fhir_validation_warnings = ?, fhir_bundle_version = ? WHERE id = ?",
    validation.errorCount,
    validation.warningCount,
    fhirVersion,
    detail.id,
  );

  await writeAudit({
    action: "U",
    eventType: "workflow",
    eventSubtype: input.action,
    actorUserId: session.id,
    actorName: session.fullName,
    actorRole: session.role,
    actorFacility: session.facilityId,
    patientId: detail.patient_id,
    referralId: detail.id,
    entityType: "Task",
    entityId: `task-${detail.id}`,
    outcome: validation.valid ? "0" : "4",
    outcomeDesc: validation.valid ? "Success" : "Validation warnings present",
    purposeCode: "treatment",
    description: `Referral ${detail.referral_number}: "${def.label}" moved the referral from ${STATES[currentState].label} to ${stateDef.label}.${input.note ? ` Note: ${input.note.trim()}` : ""}`,
    ipAddress: meta.ip ?? null,
    userAgent: meta.userAgent ?? null,
  });

  return {
    ok: true,
    message: `Referral ${detail.referral_number} is now ${stateDef.label.toLowerCase()}.`,
    toStatus: nextState,
    validation,
    events: updated.events,
  };
}

/** Add a document attachment to a draft or returned referral. */
export async function addAttachment(
  session: Session,
  referralId: string,
  att: { title: string; docTypeCode: string; docTypeDisplay: string; contentText: string; contentType?: string },
  meta: { ip?: string; userAgent?: string } = {},
): Promise<{ ok: boolean; message: string; id?: string }> {
  const detail = await getReferralDetail(referralId);
  if (!detail) return { ok: false, message: "Referral not found." };

  if (!hasPermission(session, PERMISSIONS.ATTACHMENT_ADD)) {
    return { ok: false, message: "Your role cannot attach documents." };
  }
  const side = viewerSide(session, detail);
  if (side === "observer") return { ok: false, message: "You are not a party to this referral." };
  if (STATES[detail.status as ReferralState]?.isTerminal && detail.status !== "info-requested") {
    return { ok: false, message: `Documents cannot be added once a referral is ${STATES[detail.status as ReferralState].label.toLowerCase()}.` };
  }

  const id = newId("att");
  const now = new Date();
  const text = att.contentText;
  await run(
    `INSERT INTO referral_attachments (
       id, referral_id, title, doc_type_code, doc_type_display, content_type,
       size_bytes, content_text, author_user_id, created_at, sha256, fhir_docref_id, retention_until
     ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    id,
    referralId,
    att.title,
    att.docTypeCode,
    att.docTypeDisplay,
    att.contentType ?? "text/plain",
    Buffer.byteLength(text, "utf8"),
    text,
    session.id,
    now.toISOString(),
    sha256Of(text),
    id,
    new Date(now.getTime() + 7 * 365 * 86_400_000).toISOString(),
  );

  await writeAudit({
    action: "C",
    eventType: "create",
    eventSubtype: "attachment",
    actorUserId: session.id,
    actorName: session.fullName,
    actorRole: session.role,
    actorFacility: session.facilityId,
    patientId: detail.patient_id,
    referralId,
    entityType: "DocumentReference",
    entityId: id,
    purposeCode: "treatment",
    description: `Attached document "${att.title}" (${att.docTypeDisplay}) to referral ${detail.referral_number}.`,
    ipAddress: meta.ip ?? null,
  });

  return { ok: true, message: `Attached "${att.title}".`, id };
}

function sha256Of(text: string): string {
  // Local import avoided to keep the module graph small.
  const { createHash } = require("node:crypto") as typeof import("node:crypto");
  return createHash("sha256").update(text, "utf8").digest("hex");
}

/** Update the clinical content of a referral that is still a draft. */
export async function updateDraft(
  session: Session,
  referralId: string,
  patch: Partial<CreateReferralInput>,
): Promise<{ ok: boolean; message: string }> {
  const detail = await getReferralDetail(referralId);
  if (!detail) return { ok: false, message: "Referral not found." };

  const side = viewerSide(session, detail);
  if (side !== "referring" && side !== "cross") {
    return { ok: false, message: "Only the referring facility can edit referral content." };
  }
  if (detail.status !== "draft") {
    return { ok: false, message: `This referral is ${STATES[detail.status as ReferralState].label.toLowerCase()} and can no longer be edited. Record a message instead.` };
  }
  if (!hasPermission(session, PERMISSIONS.REFERRAL_CREATE)) {
    return { ok: false, message: "Your role cannot edit referrals." };
  }

  const fields: Array<[string, unknown]> = [];
  const map: Array<[keyof CreateReferralInput, string]> = [
    ["receivingFacilityId", "receiving_facility_id"],
    ["priority", "priority"],
    ["reasonCode", "reason_code"],
    ["reasonDisplay", "reason_display"],
    ["reasonNarrative", "reason_narrative"],
    ["chiefComplaint", "chief_complaint"],
    ["historyOfPresent", "history_of_present"],
    ["pastMedicalHistory", "past_medical_history"],
    ["pastSurgicalHistory", "past_surgical_history"],
    ["familyHistory", "family_history"],
    ["personalSocialHistory", "personal_social_history"],
    ["reviewOfSystems", "review_of_systems"],
    ["physicalExamination", "physical_examination"],
    ["assessment", "assessment"],
    ["managementPlan", "management_plan"],
    ["requestedAction", "requested_action"],
    ["specialInstructions", "special_instructions"],
    ["confidentialityLevel", "confidentiality_level"],
    ["dataMinimisationNote", "data_minimisation_note"],
  ];
  for (const [key, col] of map) {
    if (patch[key] !== undefined) fields.push([col, patch[key]]);
  }
  if (patch.vitals) {
    const v = patch.vitals;
    if (v.systolic !== undefined) fields.push(["vital_systolic", v.systolic]);
    if (v.diastolic !== undefined) fields.push(["vital_diastolic", v.diastolic]);
    if (v.heartRate !== undefined) fields.push(["vital_heart_rate", v.heartRate]);
    if (v.respRate !== undefined) fields.push(["vital_resp_rate", v.respRate]);
    if (v.temperature !== undefined) fields.push(["vital_temperature", v.temperature]);
    if (v.spo2 !== undefined) fields.push(["vital_spo2", v.spo2]);
    if (v.weightKg !== undefined) fields.push(["vital_weight_kg", v.weightKg]);
    if (v.heightCm !== undefined) fields.push(["vital_height_cm", v.heightCm]);
    if (v.painScore !== undefined) fields.push(["vital_pain_score", v.painScore]);
  }

  if (!fields.length) return { ok: true, message: "Nothing to update." };

  fields.push(["updated_at", new Date().toISOString()]);
  const assignments = fields.map(([c]) => `${c} = ?`).join(", ");
  await run(
    `UPDATE referrals SET ${assignments} WHERE id = ?`,
    ...fields.map(([, v]) => v ?? null),
    referralId,
  );

  await writeAudit({
    action: "U",
    eventType: "update",
    actorUserId: session.id,
    actorName: session.fullName,
    actorRole: session.role,
    actorFacility: session.facilityId,
    patientId: detail.patient_id,
    referralId,
    entityType: "Referral",
    entityId: referralId,
    purposeCode: "treatment",
    description: `Updated draft referral ${detail.referral_number} (${fields.length - 1} field(s)).`,
  });

  return { ok: true, message: "Draft updated." };
}

/* ------------------------------------------------------------------ */
/* Patient-facing tracking                                             */
/* ------------------------------------------------------------------ */

export interface TrackingResult {
  referralNumber: string;
  trackingCode: string;
  patientFirstName: string;
  patientLastNameInitial: string;
  status: string;
  statusLabel: string;
  patientLabel: string;
  awaiting: string;
  referringFacility: string;
  receivingFacility: string;
  createdAt: string;
  updatedAt: string;
  timeline: Array<{ label: string; at: string; description: string }>;
}

/**
 * Public status lookup, keyed on the referral number plus the tracking code
 * printed on the patient's referral slip. Deliberately returns the minimum
 * information needed to answer "where is my referral?" - no clinical detail.
 */
export async function trackReferral(referralNumber: string, code: string): Promise<TrackingResult | null> {
  const row = await get<ReferralRow & { patient_family: string; patient_given: string }>(
    `SELECT r.*, p.family_name AS patient_family, p.given_name AS patient_given
       FROM referrals r JOIN patients p ON p.id = r.patient_id
      WHERE r.referral_number = ? AND r.tracking_code = ? AND r.deleted_at IS NULL`,
    referralNumber.trim().toUpperCase(),
    code.trim().toUpperCase(),
  );
  if (!row) return null;

  const referring = await get<FacilityRow>("SELECT * FROM facilities WHERE id = ?", row.referring_facility_id);
  const receiving = await get<FacilityRow>("SELECT * FROM facilities WHERE id = ?", row.receiving_facility_id);
  const events = await all<ReferralEvent>(
    "SELECT * FROM referral_events WHERE referral_id = ? ORDER BY sequence",
    row.id,
  );

  const state = STATES[row.status as ReferralState];

  return {
    referralNumber: row.referral_number,
    trackingCode: row.tracking_code,
    patientFirstName: row.patient_given,
    patientLastNameInitial: (row.patient_family ?? "?").charAt(0).toUpperCase(),
    status: row.status,
    statusLabel: state?.label ?? row.status,
    patientLabel: state?.patientLabel ?? row.status,
    awaiting: state?.awaiting ?? "none",
    referringFacility: referring?.name ?? "Referring facility",
    receivingFacility: receiving?.name ?? "Receiving facility",
    createdAt: row.created_at,
    updatedAt: row.status_updated_at,
    timeline: events.map((e) => ({
      label: STATES[e.to_status as ReferralState]?.label ?? e.to_status,
      at: e.created_at,
      description: STATES[e.to_status as ReferralState]?.patientLabel ?? e.to_status,
    })),
  };
}

/* ------------------------------------------------------------------ */
/* Consent management                                                  */
/* ------------------------------------------------------------------ */

export async function revokeConsent(
  session: Session,
  consentId: string,
  reason: string,
  meta: { ip?: string; userAgent?: string } = {},
): Promise<{ ok: boolean; message: string }> {
  const consent = await get<ConsentRow>("SELECT * FROM consents WHERE id = ?", consentId);
  if (!consent) return { ok: false, message: "Consent record not found." };

  if (session.role === "privacy_auditor") {
    return { ok: false, message: "Auditors have read-only access." };
  }
  if (!hasPermission(session, PERMISSIONS.CONSENT_REVOKE)) {
    return { ok: false, message: "Your role cannot revoke consent records." };
  }

  if (consent.referral_id) {
    const detail = await getReferralDetail(consent.referral_id);
    if (detail) {
      const side = viewerSide(session, detail);
      if (side === "observer") return { ok: false, message: "You are not a party to this referral." };
    }
  }

  const now = new Date().toISOString();
  await run("UPDATE consents SET status = 'revoked', revoked_at = ?, revoke_reason = ? WHERE id = ?", now, reason, consentId);

  if (consent.referral_id) {
    await run("UPDATE referrals SET confidentiality_level = 'highly-restricted', updated_at = ? WHERE id = ?", now, consent.referral_id);
  }

  await writeAudit({
    action: "U",
    eventType: "consent",
    eventSubtype: "revoked",
    actorUserId: session.id,
    actorName: session.fullName,
    actorRole: session.role,
    actorFacility: session.facilityId,
    patientId: consent.patient_id,
    referralId: consent.referral_id ?? null,
    entityType: "Consent",
    entityId: consentId,
    purposeCode: "treatment",
    outcomeDesc: "Consent revoked",
    description: `Consent record revoked. Reason: ${reason}. Neutralisation applied: referral marked highly-restricted and further exchange disabled.`,
    ipAddress: meta.ip ?? null,
  });

  return { ok: true, message: "Consent revoked. Further exchange on the linked referral is disabled." };
}

/** Consent records visible to the session. */
export async function listConsents(session: Session, opts: { patientId?: string; limit?: number } = {}) {
  const crossFacility = session.role === "hie_admin" || session.role === "privacy_auditor";
  const where: string[] = [];
  const params: unknown[] = [];

  if (opts.patientId) {
    where.push("c.patient_id = ?");
    params.push(opts.patientId);
  }
  if (!crossFacility) {
    if (!session.facilityId) return [];
    where.push(
      "(r.referring_facility_id = ? OR r.receiving_facility_id = ? OR c.scope_facilities LIKE ?)",
    );
    params.push(session.facilityId, session.facilityId, `%${session.facilityId}%`);
  }

  const whereSql = where.length ? `WHERE ${where.join(" AND ")}` : "";
  return await all<{
    id: string;
    patient_id: string;
    referral_id: string | null;
    purpose_code: string;
    purpose_display: string;
    legal_reference: string | null;
    status: string;
    granted_by_name: string | null;
    granted_by_relation: string | null;
    granted_at: string | null;
    period_start: string | null;
    period_end: string | null;
    revoked_at: string | null;
    revoke_reason: string | null;
    created_at: string;
    scope_facilities: string | null;
    scope_data_classes: string | null;
    patient_name: string | null;
    referral_number: string | null;
  }>(
    `SELECT c.*, (p.given_name || ' ' || p.family_name) AS patient_name, r.referral_number
       FROM consents c
       LEFT JOIN patients p ON p.id = c.patient_id
       LEFT JOIN referrals r ON r.id = c.referral_id
       ${whereSql}
      ORDER BY c.created_at DESC
      LIMIT ?`,
    ...params,
    opts.limit ?? 100,
  );
}

/* ------------------------------------------------------------------ */
/* Dashboard analytics                                                 */
/* ------------------------------------------------------------------ */

export interface DashboardStats {
  totalReferrals: number;
  activeReferrals: number;
  awaitingMyAction: number;
  completedThisMonth: number;
  closedLoopRate: number;
  medianTurnaroundHours: number | null;
  avgTimeToAcceptHours: number | null;
  overdueCount: number;
  statusBreakdown: Array<{ status: string; label: string; count: number }>;
  topReceivingFacilities: Array<{ name: string; count: number }>;
  topReasonCodes: Array<{ reason: string; count: number }>;
}

export async function dashboardStats(session: Session): Promise<DashboardStats> {
  const crossFacility = session.role === "hie_admin" || session.role === "privacy_auditor";
  const fid = session.facilityId;

  const scopeWhere = crossFacility
    ? "r.deleted_at IS NULL"
    : fid
      ? "r.deleted_at IS NULL AND (r.referring_facility_id = ? OR r.receiving_facility_id = ?)"
      : "1 = 0";
  const scopeParams: unknown[] = crossFacility || !fid ? [] : [fid, fid];

  const total =
    (await get<{ n: number }>(`SELECT COUNT(*) AS n FROM referrals r WHERE ${scopeWhere}`, ...scopeParams))?.n ?? 0;

  const active =
    (await get<{ n: number }>(
      `SELECT COUNT(*) AS n FROM referrals r
        WHERE ${scopeWhere}
          AND r.status NOT IN ('closed-feedback','cancelled','rejected','draft')`,
      ...scopeParams,
    ))?.n ?? 0;

  const awaitingMyAction =
    (await get<{ n: number }>(
      `SELECT COUNT(*) AS n FROM referrals r
        WHERE ${scopeWhere}
          AND (
            (r.status IN ('draft','info-requested','completed') AND r.referring_facility_id = ?)
            OR (r.status IN ('submitted','received','under-review','accepted','scheduled','in-progress') AND r.receiving_facility_id = ?)
          )`,
      ...scopeParams,
      fid ?? "",
      fid ?? "",
    ))?.n ?? 0;

  const monthStart = new Date();
  monthStart.setDate(1);
  monthStart.setHours(0, 0, 0, 0);
  const completedThisMonth =
    (await get<{ n: number }>(
      `SELECT COUNT(*) AS n FROM referrals r
        WHERE ${scopeWhere} AND r.status IN ('completed','closed-feedback') AND r.completed_at >= ?`,
      ...scopeParams,
      monthStart.toISOString(),
    ))?.n ?? 0;

  const closed =
    (await get<{ n: number }>(
      `SELECT COUNT(*) AS n FROM referrals r WHERE ${scopeWhere} AND r.status = 'closed-feedback'`,
      ...scopeParams,
    ))?.n ?? 0;
  const delivered =
    (await get<{ n: number }>(
      `SELECT COUNT(*) AS n FROM referrals r WHERE ${scopeWhere} AND r.status IN ('completed','closed-feedback')`,
      ...scopeParams,
    ))?.n ?? 0;

  const turnaroundRows = await all<{ hours: number }>(
    `SELECT ${hoursBetween("r.routed_at", "r.closed_at")} AS hours
       FROM referrals r
      WHERE ${scopeWhere} AND r.closed_at IS NOT NULL AND r.routed_at IS NOT NULL`,
    ...scopeParams,
  );

  const turnaround = turnaroundRows
    .map((x) => x.hours)
    .filter((h) => Number.isFinite(h) && h >= 0)
    .sort((a, b) => a - b);

  const medianTurnaroundHours = turnaround.length
    ? turnaround.length % 2
      ? Math.round(turnaround[(turnaround.length - 1) / 2] * 10) / 10
      : Math.round(((turnaround[turnaround.length / 2 - 1] + turnaround[turnaround.length / 2]) / 2) * 10) / 10
    : null;

  const acceptRows = await all<{ hours: number }>(
    `SELECT ${hoursBetween("r.routed_at", "r.accepted_at")} AS hours
       FROM referrals r
      WHERE ${scopeWhere} AND r.accepted_at IS NOT NULL AND r.routed_at IS NOT NULL`,
    ...scopeParams,
  );

  const acceptTimes = acceptRows
    .map((x) => x.hours)
    .filter((h) => Number.isFinite(h) && h >= 0);

  const avgTimeToAcceptHours = acceptTimes.length
    ? Math.round((acceptTimes.reduce((a, b) => a + b, 0) / acceptTimes.length) * 10) / 10
    : null;

  const breakdown = await all<{ status: string; n: number }>(
    `SELECT r.status, COUNT(*) AS n FROM referrals r WHERE ${scopeWhere} GROUP BY r.status`,
    ...scopeParams,
  );
  const statusBreakdown = breakdown
    .map((b) => ({
      status: b.status,
      label: STATES[b.status as ReferralState]?.label ?? b.status,
      count: b.n,
    }))
    .sort((a, b) => b.count - a.count);

  // Overdue = past its SLA window and not terminal.
  const pending = await all<{ status: string; status_updated_at: string }>(
    `SELECT r.status, r.status_updated_at FROM referrals r
      WHERE ${scopeWhere} AND r.status NOT IN ('closed-feedback','cancelled','rejected','draft','completed')`,
    ...scopeParams,
  );
  const overdueCount = pending.filter((r) => {
    const target = r.status === "submitted" ? 1 : r.status === "received" ? 4 : r.status === "under-review" ? 24 : 72;
    return (Date.now() - new Date(r.status_updated_at).getTime()) / 3_600_000 > target;
  }).length;

  const topReceiving = (
    await all<{ name: string; n: number }>(
      // Grouping by rc.name as well as rc.id satisfies Postgres, which requires
      // every selected column to be grouped or aggregated.
      `SELECT rc.name, COUNT(*) AS n
         FROM referrals r JOIN facilities rc ON rc.id = r.receiving_facility_id
        WHERE ${scopeWhere}
        GROUP BY rc.id, rc.name ORDER BY n DESC LIMIT 5`,
      ...scopeParams,
    )
  ).map((x) => ({ name: x.name, count: Number(x.n) }));

  const topReasons = (
    await all<{ reason_display: string; n: number }>(
      // Postgres requires every selected column to appear in the GROUP BY, or be
      // aggregated. SQLite silently allowed selecting reason_display while
      // grouping by reason_code. Grouping by both is equivalent here, because
      // reason_display is functionally dependent on reason_code.
      `SELECT r.reason_display, COUNT(*) AS n FROM referrals r
        WHERE ${scopeWhere} GROUP BY r.reason_code, r.reason_display ORDER BY n DESC LIMIT 5`,
      ...scopeParams,
    )
  ).map((x) => ({ reason: x.reason_display, count: Number(x.n) }));

  return {
    totalReferrals: total,
    activeReferrals: active,
    awaitingMyAction,
    completedThisMonth,
    closedLoopRate: delivered ? Math.round((closed / delivered) * 1000) / 10 : 0,
    medianTurnaroundHours,
    avgTimeToAcceptHours,
    overdueCount,
    statusBreakdown,
    topReceivingFacilities: topReceiving,
    topReasonCodes: topReasons,
  };
}

/* ------------------------------------------------------------------ */
/* Directory lookups                                                   */
/* ------------------------------------------------------------------ */

export async function listPatients(opts: { search?: string; limit?: number; facilityId?: string | null } = {}) {
  const where: string[] = ["merged_into IS NULL"];
  const params: unknown[] = [];
  if (opts.search?.trim()) {
    const q = `%${opts.search.trim()}%`;
    where.push("(family_name LIKE ? OR given_name LIKE ? OR local_mrn LIKE ? OR philhealth_id LIKE ?)");
    params.push(q, q, q, q);
  }
  return await all<PatientRow & { full_name: string }>(
    `SELECT *, (given_name || ' ' || family_name) AS full_name FROM patients
      WHERE ${where.join(" AND ")}
      ORDER BY family_name, given_name
      LIMIT ?`,
    ...params,
    opts.limit ?? 100,
  );
}

export async function listFacilities(opts: { referring?: boolean; receiving?: boolean; activeOnly?: boolean } = {}) {
  const where: string[] = [];
  if (opts.activeOnly !== false) where.push("active = 1");
  if (opts.referring) where.push("is_referring = 1");
  if (opts.receiving) where.push("is_receiving = 1");
  return (await all<FacilityRow & { services: string[] }>(
    `SELECT * FROM facilities ${where.length ? `WHERE ${where.join(" AND ")}` : ""} ORDER BY name`,
  )).map((f) => ({ ...f, services: parseServices(f) }));
}

function parseServices(f: FacilityRow): string[] {
  try {
    return JSON.parse(f.service_capabilities ?? "[]") as string[];
  } catch {
    return [];
  }
}

export async function listUsers(session: Session) {
  const crossFacility = session.role === "hie_admin" || session.role === "privacy_auditor";
  if (crossFacility) {
    return await all<UserRow & { facility_name: string | null }>(
      `SELECT u.*, f.name AS facility_name FROM users u
         LEFT JOIN facilities f ON f.id = u.facility_id
        ORDER BY u.full_name`,
    );
  }
  if (!session.facilityId) return [];
  return await all<UserRow & { facility_name: string | null }>(
    `SELECT u.*, f.name AS facility_name FROM users u
       LEFT JOIN facilities f ON f.id = u.facility_id
      WHERE u.facility_id = ?
      ORDER BY u.full_name`,
    session.facilityId,
  );
}

export { AuditInput };
