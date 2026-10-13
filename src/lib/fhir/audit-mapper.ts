/**
 * AuditEvent mapping (FHIR R4).
 *
 * PH Core v0.2.0 does not profile AuditEvent, so HealthLink maps to the FHIR R4
 * base resource and records the alignment gap. AuditEvent complements
 * Provenance: Provenance records authorship of clinical content, AuditEvent
 * records security-relevant activity (who accessed what, when, and the
 * outcome), which is the traceability requirement in RA 10173 and NPC
 * guidance.
 */

import type { AuditEvent, Coding, Reference } from "./types";
import { CS, ID_SYS } from "./terminology";

export interface AuditRow {
  id: string;
  occurred_at: string;
  action: string;
  event_type: string;
  event_subtype?: string | null;
  actor_user_id?: string | null;
  actor_name?: string | null;
  actor_role?: string | null;
  actor_facility?: string | null;
  patient_id?: string | null;
  referral_id?: string | null;
  entity_type?: string | null;
  entity_id?: string | null;
  outcome: string;
  outcome_desc?: string | null;
  purpose_code?: string | null;
  description: string;
  ip_address?: string | null;
  network_type?: string | null;
}

/**
 * Map HealthLink's internal event types onto FHIR R4 AuditEvent.
 * `type` uses the DICOM/HL7 audit event type code system (110100-110114),
 * which is the code system R4 specifies for AuditEvent.type.
 */
const EVENT_TYPE_MAP: Record<string, { code: string; display: string; system: string; action: AuditEvent["action"] }> = {
  login: { code: "110122", display: "Login", system: CS.HL7_AUDIT_EVENT_TYPE, action: "E" },
  logout: { code: "110123", display: "Logout", system: CS.HL7_AUDIT_EVENT_TYPE, action: "E" },
  create: { code: "restful-create", display: "Create", system: CS.HL7_RESTFUL_INTERACTION, action: "C" },
  read: { code: "restful-read", display: "Read", system: CS.HL7_RESTFUL_INTERACTION, action: "R" },
  update: { code: "restful-update", display: "Update", system: CS.HL7_RESTFUL_INTERACTION, action: "U" },
  delete: { code: "restful-delete", display: "Delete", system: CS.HL7_RESTFUL_INTERACTION, action: "D" },
  export: { code: "110106", display: "Export", system: CS.HL7_AUDIT_EVENT_TYPE, action: "R" },
  search: { code: "restful-search", display: "Search", system: CS.HL7_RESTFUL_INTERACTION, action: "R" },
  validate: { code: "validate", display: "Validate", system: CS.HL_LOCAL, action: "E" },
  route: { code: "transmit", display: "Transmit", system: CS.HL_LOCAL, action: "E" },
  consent: { code: "consent-change", display: "Consent change", system: CS.HL_LOCAL, action: "U" },
  workflow: { code: "workflow-transition", display: "Workflow transition", system: CS.HL_LOCAL, action: "U" },
  security: { code: "security-alert", display: "Security alert", system: CS.HL_LOCAL, action: "E" },
  retention: { code: "retention-sweep", display: "Retention sweep", system: CS.HL_LOCAL, action: "D" },
  access: { code: "access-decision", display: "Access decision", system: CS.HL_LOCAL, action: "E" },
};

export function mapAuditEvent(a: AuditRow): AuditEvent {
  const type = EVENT_TYPE_MAP[a.event_type] ?? {
    code: a.event_type,
    display: a.event_type,
    system: CS.HL_LOCAL,
    action: (a.action as AuditEvent["action"]) ?? "E",
  };

  const subtypes: Coding[] = [];
  if (a.event_subtype) {
    subtypes.push({ system: CS.HL_LOCAL, code: a.event_subtype, display: a.event_subtype.replace(/-/g, " ") });
  }

  const entity: AuditEvent["entity"] = [];
  if (a.referral_id) {
    entity.push({
      what: { reference: `ServiceRequest/sr-${a.referral_id}` },
      type: { system: CS.HL7_AUDIT_ENTITY_TYPE, code: "2", display: "System Object" },
      role: { system: CS.HL7_OBJECT_ROLE, code: "3", display: "Report" },
      lifecycle: { system: CS.HL7_DATA_OPERATION, code: "R", display: "read" },
      name: a.referral_id,
      description: "HealthLink referral",
    });
  }
  if (a.patient_id && !a.referral_id) {
    entity.push({
      what: { reference: `Patient/${a.patient_id}` },
      type: { system: CS.HL7_AUDIT_ENTITY_TYPE, code: "1", display: "Person" },
      role: { system: CS.HL7_OBJECT_ROLE, code: "1", display: "Patient" },
      name: a.patient_id,
    });
  }

  const agent: AuditEvent["agent"] = [
    {
      type: {
        coding: [{ system: CS.HL7_PROVENANCE_PARTICIPANT, code: "humanuser", display: "human user" }],
      },
      role: a.actor_role
        ? [{ coding: [{ system: CS.HL_LOCAL, code: a.actor_role, display: a.actor_role.replace(/_/g, " ") }] }]
        : undefined,
      ...(a.actor_user_id
        ? { who: { reference: `Practitioner/${a.actor_user_id}`, display: a.actor_name ?? undefined } }
        : {}),
      altId: a.actor_user_id ?? undefined,
      name: a.actor_name ?? undefined,
      requestor: true,
      ...(a.actor_facility ? { location: { identifier: { system: ID_SYS.DOH_NHFR, value: a.actor_facility } } } : {}),
      ...(a.ip_address || a.network_type
        ? { network: { address: a.ip_address ?? undefined, type: a.network_type ?? undefined } }
        : {}),
      ...(a.purpose_code
        ? {
            purposeOfUse: [
              {
                coding: [
                  {
                    system: CS.HL7_V3_PURPOSE_OF_USE,
                    code: a.purpose_code === "treatment" ? "TREAT" : a.purpose_code.toUpperCase(),
                    display: a.purpose_code,
                  },
                ],
              },
            ],
          }
        : {}),
    },
  ];

  return {
    resourceType: "AuditEvent",
    id: a.id,
    meta: {
      profile: ["http://hl7.org/fhir/StructureDefinition/AuditEvent"],
      tag: [{ system: CS.HL_LOCAL, code: "phcore-gap", display: "No PH Core profile in v0.2.0" }],
    },
    type: {
      system: type.system,
      code: type.code,
      display: type.display,
    },
    ...(subtypes.length ? { subtype: subtypes } : {}),
    action: type.action,
    period: { start: a.occurred_at },
    recorded: a.occurred_at,
    outcome: normalizeOutcome(a.outcome),
    ...(a.outcome_desc ? { outcomeDesc: a.outcome_desc } : {}),
    ...(a.purpose_code
      ? {
          purposeOfEvent: [
            {
              coding: [
                {
                  system: CS.HL7_V3_PURPOSE_OF_USE,
                  code: a.purpose_code === "treatment" ? "TREAT" : a.purpose_code.toUpperCase(),
                  display: a.purpose_code,
                },
              ],
            },
          ],
        }
      : {}),
    agent,
    source: {
      site: "HealthLink HIE",
      identifier: { system: CS.HL_LOCAL, value: "healthlink-middleware" },
      type: [{ system: CS.HL7_AUDIT_SOURCE_TYPE, code: "4", display: "Application Server" }],
    },
    ...(entity.length ? { entity } : {}),
  };

  function normalizeOutcome(o: string): AuditEvent["outcome"] {
    return (["0", "4", "8", "12"].includes(o) ? o : "0") as AuditEvent["outcome"];
  }
}

/** Human-readable outcome text for the audit log UI. */
export function auditOutcomeLabel(outcome: string): string {
  switch (outcome) {
    case "0":
      return "Success";
    case "4":
      return "Minor failure";
    case "8":
      return "Serious failure";
    case "12":
      return "Major failure";
    default:
      return "Unknown";
  }
}

/** Map a HealthLink action code to a security level for display. */
export function auditActionLabel(action: string): string {
  switch (action) {
    case "C":
      return "Create";
    case "R":
      return "Read";
    case "U":
      return "Update";
    case "D":
      return "Delete";
    case "E":
      return "Execute";
    default:
      return action;
  }
}

export { ID_SYS };
