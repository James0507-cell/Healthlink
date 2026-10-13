/**
 * Closed-loop referral workflow.
 *
 * The state machine maps a facility-friendly referral state onto the
 * standards-based `Task` and `ServiceRequest` resources, so that the same
 * workflow is expressible through the FHIR facade.
 *
 * HealthLink state        FHIR Task.status   FHIR Task.businessStatus     ServiceRequest.status
 * ---------------------------------------------------------------------------------------------
 * draft                   draft              draft                        draft
 * submitted               requested          submitted                    active
 * received                received           received-at-facility         active
 * under-review            in-progress        under-review                 active
 * info-requested          on-hold            awaiting-information         active
 * accepted                accepted           accepted                     active
 * scheduled               accepted           scheduled                    active
 * in-progress             in-progress        patient-seen                 active
 * redirected              rejected           redirected                   revoked
 * rejected                rejected           declined                     revoked
 * completed               completed          completed                    completed
 * closed-feedback         completed          closed                        completed
 * cancelled               cancelled          cancelled                    revoked
 *
 * Chapter 2 note: this is the "creation, routing, receipt, review, acceptance,
 * request for more information, redirection, completion, and feedback" model
 * described in the manuscript.
 */

import { TASK_STATUS, REQUEST_STATUS } from "./fhir/terminology";

/* ------------------------------------------------------------------ */
/* States                                                              */
/* ------------------------------------------------------------------ */

export const REFERRAL_STATES = [
  "draft",
  "submitted",
  "received",
  "under-review",
  "info-requested",
  "accepted",
  "scheduled",
  "in-progress",
  "redirected",
  "rejected",
  "completed",
  "closed-feedback",
  "cancelled",
] as const;

export type ReferralState = (typeof REFERRAL_STATES)[number];

export interface StateDefinition {
  code: ReferralState;
  label: string;
  shortLabel: string;
  description: string;
  /** Who is expected to act next. */
  awaiting: "referring" | "receiving" | "none";
  phase: 1 | 2 | 3 | 4;
  isTerminal: boolean;
  /** Tailwind classes for the status chip. */
  tone: "neutral" | "info" | "warn" | "positive" | "critical" | "done";
  fhirTaskStatus: (typeof TASK_STATUS)[number];
  fhirBusinessStatus: string;
  fhirServiceRequestStatus: (typeof REQUEST_STATUS)[number];
  /** Patient-facing wording (no clinical detail). */
  patientLabel: string;
}

export const STATES: Record<ReferralState, StateDefinition> = {
  draft: {
    code: "draft",
    label: "Draft",
    shortLabel: "Draft",
    description: "Referral is being prepared and has not been transmitted.",
    awaiting: "referring",
    phase: 1,
    isTerminal: false,
    tone: "neutral",
    fhirTaskStatus: "draft",
    fhirBusinessStatus: "draft",
    fhirServiceRequestStatus: "draft",
    patientLabel: "Being prepared by your doctor",
  },
  submitted: {
    code: "submitted",
    label: "Submitted",
    shortLabel: "Submitted",
    description: "Referral has been validated and routed toward the receiving facility.",
    awaiting: "receiving",
    phase: 1,
    isTerminal: false,
    tone: "info",
    fhirTaskStatus: "requested",
    fhirBusinessStatus: "submitted",
    fhirServiceRequestStatus: "active",
    patientLabel: "Sent to the receiving facility",
  },
  received: {
    code: "received",
    label: "Received",
    shortLabel: "Received",
    description: "The receiving facility has acknowledged receipt of the referral.",
    awaiting: "receiving",
    phase: 2,
    isTerminal: false,
    tone: "info",
    fhirTaskStatus: "received",
    fhirBusinessStatus: "received-at-facility",
    fhirServiceRequestStatus: "active",
    patientLabel: "Received by the facility",
  },
  "under-review": {
    code: "under-review",
    label: "Under review",
    shortLabel: "Review",
    description: "A receiving clinician is reviewing the referral and clinical summary.",
    awaiting: "receiving",
    phase: 2,
    isTerminal: false,
    tone: "info",
    fhirTaskStatus: "in-progress",
    fhirBusinessStatus: "under-review",
    fhirServiceRequestStatus: "active",
    patientLabel: "Being reviewed by the specialist",
  },
  "info-requested": {
    code: "info-requested",
    label: "Awaiting information",
    shortLabel: "Info needed",
    description: "The receiving facility has requested additional information or documents.",
    awaiting: "referring",
    phase: 2,
    isTerminal: false,
    tone: "warn",
    fhirTaskStatus: "on-hold",
    fhirBusinessStatus: "awaiting-information",
    fhirServiceRequestStatus: "active",
    patientLabel: "The facility needs more information",
  },
  accepted: {
    code: "accepted",
    label: "Accepted",
    shortLabel: "Accepted",
    description: "The receiving facility has accepted the referral and will arrange care.",
    awaiting: "receiving",
    phase: 3,
    isTerminal: false,
    tone: "positive",
    fhirTaskStatus: "accepted",
    fhirBusinessStatus: "accepted",
    fhirServiceRequestStatus: "active",
    patientLabel: "Accepted - an appointment will be arranged",
  },
  scheduled: {
    code: "scheduled",
    label: "Scheduled",
    shortLabel: "Scheduled",
    description: "An appointment or admission slot has been set for the patient.",
    awaiting: "receiving",
    phase: 3,
    isTerminal: false,
    tone: "positive",
    fhirTaskStatus: "accepted",
    fhirBusinessStatus: "scheduled",
    fhirServiceRequestStatus: "active",
    patientLabel: "An appointment has been scheduled",
  },
  "in-progress": {
    code: "in-progress",
    label: "Patient seen",
    shortLabel: "In progress",
    description: "The patient has attended and care is being delivered at the receiving facility.",
    awaiting: "receiving",
    phase: 3,
    isTerminal: false,
    tone: "positive",
    fhirTaskStatus: "in-progress",
    fhirBusinessStatus: "patient-seen",
    fhirServiceRequestStatus: "active",
    patientLabel: "You have been seen at the facility",
  },
  redirected: {
    code: "redirected",
    label: "Redirected",
    shortLabel: "Redirected",
    description: "The receiving facility has redirected the patient to a more appropriate service.",
    awaiting: "referring",
    phase: 3,
    isTerminal: false,
    tone: "warn",
    fhirTaskStatus: "rejected",
    fhirBusinessStatus: "redirected",
    fhirServiceRequestStatus: "revoked",
    patientLabel: "Referred on to a more suitable facility",
  },
  rejected: {
    code: "rejected",
    label: "Declined",
    shortLabel: "Declined",
    description: "The receiving facility has declined the referral, with a reason recorded.",
    awaiting: "referring",
    phase: 3,
    isTerminal: true,
    tone: "critical",
    fhirTaskStatus: "rejected",
    fhirBusinessStatus: "declined",
    fhirServiceRequestStatus: "revoked",
    patientLabel: "Not accepted - your doctor will discuss alternatives",
  },
  completed: {
    code: "completed",
    label: "Completed",
    shortLabel: "Completed",
    description: "The requested service has been delivered and the receiving facility recorded an outcome.",
    awaiting: "referring",
    phase: 4,
    isTerminal: false,
    tone: "positive",
    fhirTaskStatus: "completed",
    fhirBusinessStatus: "completed",
    fhirServiceRequestStatus: "completed",
    patientLabel: "Care at the receiving facility is complete",
  },
  "closed-feedback": {
    code: "closed-feedback",
    label: "Closed with feedback",
    shortLabel: "Closed",
    description: "Feedback has been returned to the referring provider and the loop is closed.",
    awaiting: "none",
    phase: 4,
    isTerminal: true,
    tone: "done",
    fhirTaskStatus: "completed",
    fhirBusinessStatus: "closed",
    fhirServiceRequestStatus: "completed",
    patientLabel: "Referral completed - a report was sent to your doctor",
  },
  cancelled: {
    code: "cancelled",
    label: "Cancelled",
    shortLabel: "Cancelled",
    description: "The referral was withdrawn before care was delivered.",
    awaiting: "none",
    phase: 1,
    isTerminal: true,
    tone: "neutral",
    fhirTaskStatus: "cancelled",
    fhirBusinessStatus: "cancelled",
    fhirServiceRequestStatus: "revoked",
    patientLabel: "Cancelled",
  },
};

/** Actions a user can take, and the states they are valid from. */
export interface TransitionDefinition {
  action: string;
  label: string;
  description: string;
  from: ReferralState[];
  to: ReferralState;
  /** Permissions that satisfy this action. */
  requiresAny: string[];
  /** Owning side: only this side may invoke the action. */
  side: "referring" | "receiving" | "either";
  /** Confirmation copy shown in the UI. */
  confirm?: string;
  tone?: "primary" | "danger" | "neutral";
  /** Whether the action requires a free-text note. */
  requiresNote?: boolean;
  /** Whether the action may carry a feedback message. */
  allowsFeedback?: boolean;
  /** Whether the action may carry a clinical outcome. */
  allowsOutcome?: boolean;
  /** Whether the action may set an appointment time. */
  allowsAppointment?: boolean;
}

export const TRANSITIONS: TransitionDefinition[] = [
  {
    action: "submit",
    label: "Submit & route",
    description: "Validate the referral against FHIR R4 / PH Core and route it to the receiving facility.",
    from: ["draft"],
    to: "submitted",
    requiresAny: ["referral:route"],
    side: "referring",
    confirm: "Validation must pass before the referral is routed. Continue?",
    tone: "primary",
  },
  {
    action: "receive",
    label: "Acknowledge receipt",
    description: "Confirm that the referral has arrived and entered the receiving facility's queue.",
    from: ["submitted"],
    to: "received",
    requiresAny: ["referral:triage"],
    side: "receiving",
    tone: "primary",
  },
  {
    action: "start-review",
    label: "Begin review",
    description: "Assign the referral for clinical review.",
    from: ["received"],
    to: "under-review",
    requiresAny: ["referral:triage"],
    side: "receiving",
    tone: "primary",
  },
  {
    action: "request-info",
    label: "Request more information",
    description: "Ask the referring provider for missing information or documents.",
    from: ["received", "under-review", "accepted", "scheduled"],
    to: "info-requested",
    requiresAny: ["referral:request-info"],
    side: "receiving",
    requiresNote: true,
    allowsFeedback: true,
    tone: "primary",
  },
  {
    action: "supply-info",
    label: "Provide information",
    description: "Send the requested additional information back to the receiving facility.",
    from: ["info-requested"],
    to: "under-review",
    requiresAny: ["referral:route", "referral:feedback"],
    side: "referring",
    requiresNote: true,
    allowsFeedback: true,
    tone: "primary",
  },
  {
    action: "accept",
    label: "Accept referral",
    description: "Accept the patient into the receiving facility's care.",
    from: ["received", "under-review", "info-requested"],
    to: "accepted",
    requiresAny: ["referral:accept"],
    side: "receiving",
    allowsFeedback: true,
    allowsOutcome: true,
    tone: "primary",
  },
  {
    action: "schedule",
    label: "Schedule appointment",
    description: "Record the appointment, admission, or procedure date for the patient.",
    from: ["accepted"],
    to: "scheduled",
    requiresAny: ["referral:accept"],
    side: "receiving",
    allowsFeedback: true,
    allowsAppointment: true,
    tone: "primary",
  },
  {
    action: "mark-seen",
    label: "Record patient seen",
    description: "The patient has attended the receiving facility.",
    from: ["accepted", "scheduled"],
    to: "in-progress",
    requiresAny: ["referral:accept"],
    side: "receiving",
    allowsFeedback: true,
    tone: "primary",
  },
  {
    action: "redirect",
    label: "Redirect to another service",
    description: "Send the patient to a more appropriate facility or service.",
    from: ["received", "under-review", "accepted", "scheduled", "info-requested"],
    to: "redirected",
    requiresAny: ["referral:accept"],
    side: "receiving",
    requiresNote: true,
    allowsFeedback: true,
    allowsOutcome: true,
    tone: "neutral",
  },
  {
    action: "decline",
    label: "Decline referral",
    description: "Decline the referral and record the clinical or administrative reason.",
    from: ["received", "under-review", "info-requested"],
    to: "rejected",
    requiresAny: ["referral:accept"],
    side: "receiving",
    requiresNote: true,
    allowsFeedback: true,
    allowsOutcome: true,
    tone: "danger",
  },
  {
    action: "complete",
    label: "Complete & send feedback",
    description: "Record the clinical outcome and return feedback to the referring provider.",
    from: ["accepted", "scheduled", "in-progress"],
    to: "completed",
    requiresAny: ["referral:complete"],
    side: "receiving",
    requiresNote: true,
    allowsFeedback: true,
    allowsOutcome: true,
    tone: "primary",
  },
  {
    action: "close-loop",
    label: "Acknowledge feedback & close",
    description: "The referring provider confirms receipt of feedback. Closes the referral loop.",
    from: ["completed"],
    to: "closed-feedback",
    requiresAny: ["referral:feedback"],
    side: "referring",
    allowsFeedback: true,
    tone: "primary",
  },
  {
    action: "cancel",
    label: "Cancel referral",
    description: "Withdraw the referral before care is delivered.",
    from: ["draft", "submitted", "received", "under-review", "info-requested", "accepted", "scheduled"],
    to: "cancelled",
    requiresAny: ["referral:cancel"],
    side: "either",
    requiresNote: true,
    confirm: "The receiving facility will be notified. Cancel this referral?",
    tone: "danger",
  },
];

export function transitionsFrom(state: ReferralState): TransitionDefinition[] {
  return TRANSITIONS.filter((t) => t.from.includes(state));
}

export function isTerminal(state: ReferralState): boolean {
  return STATES[state]?.isTerminal ?? false;
}

/** Which side owns the next action. */
export function awaitingSide(state: ReferralState): "referring" | "receiving" | "none" {
  return STATES[state]?.awaiting ?? "none";
}

/**
 * Compute whether a transition can be performed, considering role permissions
 * and which side (referring/receiving) the user's facility is on.
 */
export function canTransition(
  state: ReferralState,
  action: string,
  opts: { permissions: string[]; side: "referring" | "receiving" | "observer" | "cross" },
): { allowed: boolean; reason?: string } {
  const def = TRANSITIONS.find((t) => t.action === action);
  if (!def) return { allowed: false, reason: `Unknown action "${action}".` };

  if (!def.from.includes(state)) {
    return {
      allowed: false,
      reason: `"${def.label}" is not available while the referral is ${STATES[state].label.toLowerCase()}.`,
    };
  }

  const permitted = def.requiresAny.some((p) => opts.permissions.includes(p));
  if (!permitted) {
    return { allowed: false, reason: `Your role does not include the "${def.label}" action.` };
  }

  if (opts.side === "cross") return { allowed: true };

  if (def.side !== "either" && opts.side !== def.side) {
    const who = def.side === "receiving" ? "receiving facility" : "referring facility";
    return { allowed: false, reason: `"${def.label}" can only be performed by the ${who}.` };
  }

  if (opts.side === "observer") {
    return { allowed: false, reason: "Your account is not a party to this referral." };
  }

  return { allowed: true };
}

/* ------------------------------------------------------------------ */
/* Referral number generation                                          */
/* ------------------------------------------------------------------ */

/**
 * Human-readable referral number: HL-<YYYY>-<facility code>-<sequence>.
 * Sequence is zero-padded to 5 digits and unique per facility per year.
 */
export function formatReferralNumber(year: number, facilityCode: string, sequence: number): string {
  return `HL-${year}-${facilityCode.toUpperCase()}-${String(sequence).padStart(5, "0")}`;
}

/**
 * Derive a facility's short code for use in a referral number.
 *
 * Single source of truth: the seeder and the runtime generator both call this, so
 * a seeded referral and one created at runtime through the same facility always
 * carry the same prefix. They previously diverged (BHC vs BUH), which made the
 * numbering look inconsistent in the demonstration data.
 */
export function facilityShortCode(name: string, shortName?: string | null): string {
  const source = shortName?.trim() || name;
  const letters = source.replace(/[^A-Za-z]/g, "");
  return letters.slice(0, 3).toUpperCase() || "FAC";
}

/* ------------------------------------------------------------------ */
/* Validation rules applied before routing                             */
/* ------------------------------------------------------------------ */

export interface RoutingRequirement {
  key: string;
  label: string;
  satisfied: boolean;
  detail?: string;
  /** Blocking requirements prevent routing; advisory ones only warn. */
  blocking: boolean;
}

export interface RoutingCheckInput {
  patientId?: string | null;
  receivingFacilityId?: string | null;
  reasonCode?: string | null;
  reasonNarrative?: string | null;
  chiefComplaint?: string | null;
  assessment?: string | null;
  requestedAction?: string | null;
  diagnoses: Array<{ code: string; display: string; system: string; role: string }>;
  observations: Array<{ code: string; valueText?: string | null; valueNum?: number | null }>;
  attachments: Array<{ id: string; title: string }>;
  lawfulBasisCode?: string | null;
  consentId?: string | null;
  consentStatus?: string | null;
  consentRequired?: boolean;
  fhirValid?: boolean | null;
  fhirErrorCount?: number;
  fhirWarningCount?: number;
  confidentialityLevel?: string | null;
}

/**
 * Pre-routing checklist. Requires enough clinical content for the receiving
 * provider to make a decision, and a documented lawful basis.
 */
export function routingChecklist(input: RoutingCheckInput): RoutingRequirement[] {
  const reqs: RoutingRequirement[] = [];

  reqs.push({
    key: "patient",
    label: "Patient identified",
    satisfied: !!input.patientId,
    blocking: true,
    detail: input.patientId ? undefined : "Select or register the patient before routing.",
  });

  reqs.push({
    key: "receiving",
    label: "Receiving facility selected",
    satisfied: !!input.receivingFacilityId,
    blocking: true,
    detail: input.receivingFacilityId ? undefined : "Choose the facility that will receive the referral.",
  });

  reqs.push({
    key: "reason",
    label: "Reason for referral recorded",
    satisfied: !!input.reasonCode && (input.reasonCode !== "other" || !!input.reasonNarrative?.trim()),
    blocking: true,
    detail:
      input.reasonCode === "other" && !input.reasonNarrative?.trim()
        ? 'Reason "Other" needs a narrative explanation.'
        : undefined,
  });

  reqs.push({
    key: "chief-complaint",
    label: "Chief complaint documented",
    satisfied: !!input.chiefComplaint?.trim() && (input.chiefComplaint?.trim().length ?? 0) >= 3,
    blocking: true,
    detail: input.chiefComplaint?.trim() ? undefined : "Record the presenting complaint in the clinical summary.",
  });

  reqs.push({
    key: "diagnosis",
    label: "At least one coded diagnosis",
    satisfied: input.diagnoses.some((d) => !!d.code),
    blocking: true,
    detail: input.diagnoses.some((d) => !!d.code)
      ? undefined
      : "Add a diagnosis with an ICD-10 or SNOMED CT code.",
  });

  reqs.push({
    key: "assessment",
    label: "Assessment recorded",
    satisfied: !!input.assessment?.trim(),
    blocking: true,
    detail: input.assessment?.trim() ? undefined : "Summarise your clinical assessment.",
  });

  reqs.push({
    key: "requested-action",
    label: "Requested action stated",
    satisfied: !!input.requestedAction?.trim(),
    blocking: true,
    detail: input.requestedAction?.trim()
      ? undefined
      : "State what you are asking the receiving provider to do.",
  });

  reqs.push({
    key: "observation",
    label: "Objective findings attached",
    satisfied: input.observations.length > 0,
    blocking: false,
    detail: input.observations.length
      ? undefined
      : "No vital signs or results are attached. The receiving provider will have less context.",
  });

  reqs.push({
    key: "lawful-basis",
    label: "Lawful basis documented",
    satisfied: !!input.lawfulBasisCode,
    blocking: true,
    detail: input.lawfulBasisCode ? undefined : "Record the consent or other lawful basis for this exchange.",
  });

  const needsConsentRecord = !!input.consentRequired;
  reqs.push({
    key: "consent-record",
    label: "Patient authorisation on file",
    satisfied: !needsConsentRecord || (!!input.consentId && input.consentStatus === "active"),
    blocking: needsConsentRecord,
    detail: !needsConsentRecord
      ? undefined
      : input.consentId && input.consentStatus === "active"
        ? undefined
        : "The selected lawful basis requires an active consent record. Record the patient's authorisation first.",
  });

  reqs.push({
    key: "fhir-valid",
    label: "FHIR / PH Core validation passed",
    satisfied: input.fhirValid === true && (input.fhirErrorCount ?? 0) === 0,
    blocking: true,
    detail:
      input.fhirValid === true
        ? undefined
        : input.fhirValid === null || input.fhirValid === undefined
          ? "Run validation to confirm the referral can be mapped and exchanged."
          : `${input.fhirErrorCount ?? 0} validation error(s) must be resolved before routing.`,
  });

  return reqs;
}

export function blockingFailures(reqs: RoutingRequirement[]): RoutingRequirement[] {
  return reqs.filter((r) => r.blocking && !r.satisfied);
}

export function advisoryGaps(reqs: RoutingRequirement[]): RoutingRequirement[] {
  return reqs.filter((r) => !r.blocking && !r.satisfied);
}

/* ------------------------------------------------------------------ */
/* Receiving-side outcomes                                             */
/* ------------------------------------------------------------------ */

export const OUTCOMES: ReadonlyArray<{ code: string; display: string; note: string }> = [
  { code: "accepted-for-management", display: "Accepted for management", note: "Patient will be managed at this facility." },
  { code: "admitted", display: "Admitted", note: "Patient admitted for inpatient care." },
  { code: "for-outpatient-followup", display: "For outpatient follow-up", note: "Patient will be followed up in clinic." },
  { code: "for-procedure", display: "For procedure / surgery", note: "A procedure has been scheduled." },
  { code: "for-diagnostics", display: "For further diagnostics", note: "Additional diagnostic work-up ordered." },
  { code: "managed-conservatively", display: "Managed conservatively", note: "No intervention required; advice given." },
  { code: "redirected-to-tertiary", display: "Redirected to tertiary care", note: "Requires a higher level of care." },
  { code: "redirected-to-specialist", display: "Redirected to a specialist service", note: "A different specialty is more appropriate." },
  { code: "resolved", display: "Resolved", note: "The presenting problem has resolved." },
  { code: "declined-clinical", display: "Declined on clinical grounds", note: "Referral is not clinically indicated at this facility." },
  { code: "declined-capacity", display: "Declined - no capacity", note: "No available capacity at this facility." },
  { code: "patient-did-not-attend", display: "Patient did not attend", note: "The patient did not arrive for the appointment." },
  { code: "patient-declined", display: "Patient declined", note: "The patient declined the referral." },
  { code: "deceased", display: "Patient deceased", note: "Handled with appropriate sensitivity; no further clinical action." },
  { code: "other", display: "Other (specified in narrative)", note: "Outcome described in the feedback narrative." },
];

export const OUTCOME_BY_CODE = new Map(OUTCOMES.map((o) => [o.code, o]));

/* ------------------------------------------------------------------ */
/* Feedback categories                                                 */
/* ------------------------------------------------------------------ */

export const MESSAGE_KINDS: ReadonlyArray<{ code: string; display: string; tone: string }> = [
  { code: "feedback", display: "Clinical feedback", tone: "positive" },
  { code: "query", display: "Query / clarification", tone: "warn" },
  { code: "update", display: "Care update", tone: "info" },
  { code: "acknowledgment", display: "Acknowledgment", tone: "neutral" },
  { code: "information-request", display: "Request for information", tone: "warn" },
  { code: "information-supplied", display: "Information supplied", tone: "info" },
];

/* ------------------------------------------------------------------ */
/* SLA / turnaround tracking (for the dashboard)                       */
/* ------------------------------------------------------------------ */

export interface SlaTarget {
  state: ReferralState;
  /** Hours within which a response is expected. */
  hours: number;
  label: string;
}

export const SLA_TARGETS: SlaTarget[] = [
  { state: "submitted", hours: 1, label: "Acknowledge receipt" },
  { state: "received", hours: 4, label: "Begin review" },
  { state: "under-review", hours: 24, label: "Decide (accept / info / decline)" },
  { state: "accepted", hours: 72, label: "Schedule appointment" },
  { state: "completed", hours: 72, label: "Close loop with acknowledging provider" },
];

export function slaFor(state: ReferralState): SlaTarget | undefined {
  return SLA_TARGETS.find((s) => s.state === state);
}

export function slaStatus(
  state: ReferralState,
  sinceIso: string,
): { overdue: boolean; hoursElapsed: number; target?: SlaTarget } {
  const target = slaFor(state);
  if (!target) return { overdue: false, hoursElapsed: 0 };
  const hoursElapsed = (Date.now() - new Date(sinceIso).getTime()) / 3_600_000;
  return { overdue: hoursElapsed > target.hours, hoursElapsed, target };
}

/** Priority ranking for sorting worklists. */
export const PRIORITY_RANK: Record<string, number> = {
  stat: 0,
  asap: 1,
  urgent: 2,
  routine: 3,
};

export const PRIORITY_LABELS: Record<string, string> = {
  stat: "STAT",
  asap: "ASAP",
  urgent: "Urgent",
  routine: "Routine",
};

export const PRIORITY_TONE: Record<string, string> = {
  stat: "critical",
  asap: "warn",
  urgent: "warn",
  routine: "neutral",
};

/** Emergency-transfer referrals always carry the highest urgency. */
export function effectivePriority(priority: string, reasonCode: string): string {
  if (reasonCode === "emergency-transfer") return "stat";
  return priority;
}
