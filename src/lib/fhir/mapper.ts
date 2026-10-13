/**
 * FHIR mapping layer.
 *
 * Translates a HealthLink referral (plus its patient, providers, facilities and
 * clinical details) into a FHIR R4 transaction Bundle whose resources conform to
 * the Draft Philippine Core Implementation Guide v0.2.0 where a PH Core profile
 * exists.
 *
 * Mapping decisions that matter for the manuscript:
 *
 *  Clinical concept                  FHIR R4 resource          PH Core profile
 *  ---------------------------------------------------------------------------
 *  Patient demographics              Patient                   ph-core-patient
 *  Referring / receiving clinician   Practitioner              ph-core-practitioner
 *  Facility                          Organization              ph-core-organization
 *  Care context                      Encounter                 ph-core-encounter
 *  The referral request itself       ServiceRequest            ph-core-serviceRequest
 *  Workflow state + status history   Task                      ph-core-task
 *  Diagnoses                         Condition                 ph-core-condition
 *  Vital signs / results             Observation               ph-core-observation
 *  Medication history                MedicationStatement       ph-core-medicationstatement
 *  Allergies                         AllergyIntolerance        ph-core-allergyintolerance
 *  Attached summaries / documents    DocumentReference         (no PH Core profile)
 *  Consent / lawful basis            Consent                   (no PH Core profile)
 *  Feedback and queries              Communication             (no PH Core profile)
 *  Authorship / traceability         Provenance                ph-core-provenance
 *
 * Resources with no PH Core profile in v0.2.0 are still mapped, annotated with
 * the FHIR R4 base profile, and the gap is reported in the alignment page. This
 * is the "alignment reference, not normative requirement" position taken in
 * Chapter 2 - the guide is explicitly a draft.
 */

import type {
  Bundle,
  BundleEntry,
  Patient,
  Practitioner,
  Organization,
  Encounter,
  Observation,
  Condition,
  AllergyIntolerance,
  MedicationStatement,
  ServiceRequest,
  Task,
  Provenance,
  Consent,
  Communication,
  DocumentReference,
  Reference,
  CodeableConcept,
  Coding,
  Annotation,
} from "./types";
import {
  CS,
  ID_SYS,
  EXT,
  PROFILE,
  PHCORE_IG,
  LOINC,
  ICD10,
  SNOMED,
  LAWFUL_BASIS,
  ACT_ENCOUNTER_DISPLAY,
  OBS_CATEGORY_VITALSIGN,
  INTERPRETATION,
  type LawfulBasis,
} from "./terminology";
import { STATES, type ReferralState, OUTCOME_BY_CODE } from "../workflow";

export const HEALTHLINK_FHIR_BASE_URL = process.env.HEALTHLINK_FHIR_BASE ?? "http://localhost:3000/fhir";

/* ------------------------------------------------------------------ */
/* Row shapes coming out of SQLite                                     */
/* ------------------------------------------------------------------ */

export interface FacilityRow {
  id: string;
  nhfr_code?: string | null;
  hcpn_code?: string | null;
  philhealth_pan?: string | null;
  philhealth_pen?: string | null;
  name: string;
  short_name?: string | null;
  org_type_code?: string | null;
  org_type_display?: string | null;
  level?: string | null;
  ownership?: string | null;
  region_code?: string | null;
  region_display?: string | null;
  province_code?: string | null;
  province_display?: string | null;
  city_code?: string | null;
  city_display?: string | null;
  barangay_code?: string | null;
  barangay_display?: string | null;
  address_line?: string | null;
  postal_code?: string | null;
  phone?: string | null;
  email?: string | null;
  service_capabilities?: string | null;
}

export interface PatientRow {
  id: string;
  local_mrn?: string | null;
  philhealth_id?: string | null;
  philsys_id?: string | null;
  family_name: string;
  given_name: string;
  middle_name?: string | null;
  suffix?: string | null;
  sex: string;
  birth_date: string;
  civil_status?: string | null;
  blood_type?: string | null;
  region_code?: string | null;
  region_display?: string | null;
  province_code?: string | null;
  province_display?: string | null;
  city_code?: string | null;
  city_display?: string | null;
  barangay_code?: string | null;
  barangay_display?: string | null;
  address_line?: string | null;
  postal_code?: string | null;
  phone?: string | null;
  email?: string | null;
  occupation?: string | null;
  nationality?: string | null;
  religion?: string | null;
  is_pwd?: number;
  pwd_id?: string | null;
}

export interface UserRow {
  id: string;
  full_name: string;
  family_name?: string | null;
  given_name?: string | null;
  prefix?: string | null;
  prc_license?: string | null;
  specialization?: string | null;
  role: string;
  facility_id?: string | null;
  phone?: string | null;
  email?: string;
}

export interface ReferralRow {
  id: string;
  referral_number: string;
  tracking_code: string;
  patient_id: string;
  referring_facility_id: string;
  referring_user_id?: string | null;
  receiving_facility_id: string;
  receiving_user_id?: string | null;
  status: string;
  status_updated_at: string;
  priority: string;
  reason_code: string;
  reason_display: string;
  reason_narrative?: string | null;
  chief_complaint?: string | null;
  history_of_present?: string | null;
  past_medical_history?: string | null;
  past_surgical_history?: string | null;
  family_history?: string | null;
  personal_social_history?: string | null;
  review_of_systems?: string | null;
  physical_examination?: string | null;
  assessment?: string | null;
  management_plan?: string | null;
  requested_action?: string | null;
  special_instructions?: string | null;
  vital_systolic?: number | null;
  vital_diastolic?: number | null;
  vital_heart_rate?: number | null;
  vital_resp_rate?: number | null;
  vital_temperature?: number | null;
  vital_spo2?: number | null;
  vital_weight_kg?: number | null;
  vital_height_cm?: number | null;
  vital_pain_score?: number | null;
  consent_id?: string | null;
  lawful_basis_code: string;
  lawful_basis_display: string;
  confidentiality_level: string;
  data_minimisation_note?: string | null;
  outcome_code?: string | null;
  outcome_display?: string | null;
  receiving_notes?: string | null;
  appointment_at?: string | null;
  accepted_at?: string | null;
  completed_at?: string | null;
  closed_at?: string | null;
  created_at: string;
  updated_at: string;
  deleted_at?: string | null;
  retention_until?: string | null;
  fhir_service_request_id?: string | null;
  fhir_task_id?: string | null;
  fhir_encounter_id?: string | null;
  fhir_bundle_id?: string | null;
  fhir_bundle_version: number;
  fhir_patient_id?: string | null;
  fhir_validation_errors: number;
  fhir_validation_warnings: number;
  routed_at?: string | null;
  route_attempts: number;
  route_channel?: string | null;
}

export interface DiagnosisRow {
  id?: string;
  system: string;
  code: string;
  display: string;
  role: string;
  onset_date?: string | null;
  certainty?: string | null;
}

export interface ObservationRow {
  id?: string;
  system: string;
  code: string;
  display: string;
  category: string;
  value_num?: number | null;
  value_text?: string | null;
  unit?: string | null;
  ucum_code?: string | null;
  interpretation?: string | null;
  ref_low?: number | null;
  ref_high?: number | null;
  effective_at?: string | null;
}

export interface MedicationRow {
  id?: string;
  medication: string;
  fda_cpr?: string | null;
  dose?: string | null;
  route?: string | null;
  frequency?: string | null;
  status: string;
  started_on?: string | null;
}

export interface AllergyRow {
  id?: string;
  system: string;
  code: string;
  display: string;
  reaction?: string | null;
  criticality?: string | null;
  category?: string | null;
}

export interface AttachmentRow {
  id: string;
  title: string;
  doc_type_code: string;
  doc_type_display: string;
  content_type: string;
  size_bytes: number;
  content_text?: string | null;
  content_b64?: string | null;
  created_at: string;
  sha256?: string | null;
}

export interface ConsentRow {
  id: string;
  patient_id: string;
  referral_id?: string | null;
  purpose_code: string;
  purpose_display: string;
  legal_reference?: string | null;
  status: string;
  period_start?: string | null;
  period_end?: string | null;
  scope_facilities?: string | null;
  scope_data_classes?: string | null;
  granted_by_name?: string | null;
  granted_by_relation?: string | null;
  granted_at?: string | null;
  revoked_at?: string | null;
  revoke_reason?: string | null;
  created_at?: string;
}

export interface MappingInput {
  referral: ReferralRow;
  patient: PatientRow;
  referringFacility: FacilityRow;
  receivingFacility: FacilityRow;
  referringUser?: UserRow | null;
  receivingUser?: UserRow | null;
  diagnoses: DiagnosisRow[];
  observations: ObservationRow[];
  medications: MedicationRow[];
  allergies: AllergyRow[];
  attachments: AttachmentRow[];
  consent?: ConsentRow | null;
  currentState: ReferralState;
  /** Actor performing the mapping (for Provenance). */
  actorUser?: UserRow | null;
}

/* ------------------------------------------------------------------ */
/* Small mapping helpers                                               */
/* ------------------------------------------------------------------ */

function codeable(system: string, code?: string | null, display?: string | null, text?: string | null): CodeableConcept {
  const cc: CodeableConcept = {};
  if (code) {
    cc.coding = [{ system, code, ...(display ? { display } : {}) }];
  }
  if (text ?? display) cc.text = (text ?? display) as string;
  if (!cc.coding && !cc.text) cc.text = "Not recorded";
  return cc;
}

function codeableFromCoding(coding: Coding[], text?: string): CodeableConcept {
  const cc: CodeableConcept = { coding };
  if (text) cc.text = text;
  return cc;
}

function ref(resourceType: string, id: string, display?: string): Reference {
  return {
    reference: `${resourceType}/${id}`,
    ...(display ? { display } : {}),
  };
}

/** PH Core PSGC address extensions. */
function psgcAddressExtensions(row: {
  region_code?: string | null;
  region_display?: string | null;
  province_code?: string | null;
  province_display?: string | null;
  city_code?: string | null;
  city_display?: string | null;
  barangay_code?: string | null;
  barangay_display?: string | null;
}) {
  const ext = [];
  if (row.region_code) {
    ext.push({
      url: EXT.PHCORE_REGION,
      valueCoding: { system: CS.PSGC, code: row.region_code, display: row.region_display ?? undefined },
    });
  }
  if (row.province_code) {
    ext.push({
      url: EXT.PHCORE_PROVINCE,
      valueCoding: { system: CS.PSGC, code: row.province_code, display: row.province_display ?? undefined },
    });
  }
  if (row.city_code) {
    ext.push({
      url: EXT.PHCORE_CITY_MUNICIPALITY,
      valueCoding: { system: CS.PSGC, code: row.city_code, display: row.city_display ?? undefined },
    });
  }
  if (row.barangay_code) {
    ext.push({
      url: EXT.PHCORE_BARANGAY,
      valueCoding: { system: CS.PSGC, code: row.barangay_code, display: row.barangay_display ?? undefined },
    });
  }
  return ext;
}

function adminGender(sex: string): "male" | "female" | "other" | "unknown" {
  const s = sex?.toLowerCase();
  if (s === "male" || s === "m") return "male";
  if (s === "female" || s === "f") return "female";
  if (s === "other") return "other";
  return "unknown";
}

/**
 * Map a HealthLink state change to the FHIR Task performed within the referral.
 * FHIR R4 provenance-activity-type codes:
 *   CREATE, UPDATE, DELETE, REPLACE, COMPLETE, NULLIFY, PATCH, APPEND, TRANSFORM
 */
function provenanceActivity(action: "create" | "update" | "complete"): CodeableConcept {
  const map = {
    create: { code: "CREATE", display: "create" },
    update: { code: "UPDATE", display: "update" },
    complete: { code: "COMPLETE", display: "complete" },
  } as const;
  const m = map[action];
  return codeableFromCoding([{ system: CS.HL7_ACTIVITY_TYPE, code: m.code, display: m.display }], m.display);
}

/* ------------------------------------------------------------------ */
/* Resource mappers                                                    */
/* ------------------------------------------------------------------ */

export function mapPatient(p: PatientRow): Patient {
  const identifiers: Patient["identifier"] = [];

  identifiers.push({
    use: "official",
    type: codeable(CS.HL_LOCAL, "local-mrn", "Local medical record number", "Local MRN"),
    system: ID_SYS.LOCAL_MRN,
    value: p.local_mrn ?? p.id,
  });

  // PH Core marks the PhilHealth and PhilSys identifier slices mustSupport.
  if (p.philhealth_id) {
    identifiers.push({
      use: "official",
      type: codeable(CS.HL_LOCAL, "philhealth-id", "PhilHealth Identification Number", "PhilHealth PIN"),
      system: ID_SYS.PHILHEALTH_ID,
      value: p.philhealth_id,
    });
  }
  if (p.philsys_id) {
    identifiers.push({
      use: "official",
      type: codeable(CS.HL_LOCAL, "philsys-id", "PhilSys Identification Number", "PhilSys ID"),
      system: ID_SYS.PHILSYS_ID,
      value: p.philsys_id,
    });
  }

  const name: Patient["name"] = [
    {
      use: "official",
      text: [p.given_name, p.middle_name, p.family_name, p.suffix].filter(Boolean).join(" "),
      family: p.family_name,
      given: [p.given_name, p.middle_name].filter((x): x is string => !!x),
      ...(p.suffix ? { suffix: [p.suffix] } : {}),
    },
  ];

  const telecom: Patient["telecom"] = [];
  if (p.phone) telecom.push({ system: "phone", value: p.phone, use: "mobile" });
  if (p.email) telecom.push({ system: "email", value: p.email });

  const address = p.address_line || p.city_code
    ? [
        {
          use: "home",
          type: "physical",
          line: p.address_line ? [p.address_line] : undefined,
          city: p.city_display ?? undefined,
          district: p.barangay_display ?? undefined,
          state: (p.province_display ?? p.region_display) ?? undefined,
          postalCode: p.postal_code ?? undefined,
          country: "PH",
          extension: psgcAddressExtensions(p),
        },
      ]
    : [];

  const extensions = [];
  if (p.is_pwd) {
    extensions.push({
      url: EXT.PHCORE_PWD_DISABILITY,
      extension: [
        ...(p.pwd_id ? [{ url: "pwdIdNumber", valueString: p.pwd_id }] : []),
      ],
    });
  }

  return {
    resourceType: "Patient",
    id: p.id,
    meta: { profile: [PROFILE.PATIENT] },
    identifier: identifiers,
    active: true,
    name,
    telecom,
    gender: adminGender(p.sex),
    birthDate: p.birth_date.slice(0, 10),
    ...(address.length ? { address } : {}),
    ...(p.civil_status ? { maritalStatus: codeable(CS.HL_LOCAL, undefined, p.civil_status, p.civil_status) } : {}),
    ...(extensions.length ? { extension: extensions } : {}),
    ...(p.nationality || p.religion || p.occupation
      ? {
          // PH Core places occupation in an extension; keep the rest as text
          // annotations on the record rather than inventing non-standard fields.
          extension: [
            ...extensions,
            ...(p.occupation ? [{ url: EXT.PHCORE_OCCUPATION, valueString: p.occupation }] : []),
          ],
        }
      : {}),
  };
}

export function mapOrganization(f: FacilityRow): Organization {
  const identifiers: Organization["identifier"] = [];
  if (f.nhfr_code) {
    identifiers.push({
      use: "official",
      type: codeable(CS.HL_LOCAL, "nhfr", "DOH National Health Facility Registry Code", "Health Facility Code (HFC)"),
      system: ID_SYS.DOH_NHFR,
      value: f.nhfr_code,
    });
  }
  if (f.hcpn_code) {
    identifiers.push({
      use: "official",
      type: codeable(CS.HL_LOCAL, "hcpn", "Health Care Provider Network Code", "HCPN code"),
      system: ID_SYS.HCPN,
      value: f.hcpn_code,
    });
  }
  if (f.philhealth_pan) {
    identifiers.push({
      use: "official",
      type: codeable(CS.HL_LOCAL, "pan", "PhilHealth Accreditation Number", "PAN"),
      system: ID_SYS.PHILHEALTH_PAN,
      value: f.philhealth_pan,
    });
  }
  if (f.philhealth_pen) {
    identifiers.push({
      use: "official",
      type: codeable(CS.HL_LOCAL, "pen", "PhilHealth Employer Number", "PEN"),
      system: ID_SYS.PHILHEALTH_PEN,
      value: f.philhealth_pen,
    });
  }

  const telecom: Organization["telecom"] = [];
  if (f.phone) telecom.push({ system: "phone", value: f.phone });
  if (f.email) telecom.push({ system: "email", value: f.email });

  const address = f.address_line || f.city_code
    ? [
        {
          use: "work",
          type: "physical",
          line: f.address_line ? [f.address_line] : undefined,
          city: f.city_display ?? undefined,
          district: f.barangay_display ?? undefined,
          state: (f.province_display ?? f.region_display) ?? undefined,
          postalCode: f.postal_code ?? undefined,
          country: "PH",
          extension: psgcAddressExtensions(f),
        },
      ]
    : [];

  return {
    resourceType: "Organization",
    id: f.id,
    meta: { profile: [PROFILE.ORGANIZATION] },
    identifier: identifiers,
    active: true,
    type: f.org_type_code
      ? [codeable(CS.HL_LOCAL, f.org_type_code, f.org_type_display ?? undefined, f.org_type_display ?? undefined)]
      : undefined,
    name: f.name,
    alias: f.short_name ? [f.short_name] : undefined,
    telecom,
    ...(address.length ? { address } : {}),
  };
}

export function mapPractitioner(u: UserRow, facility: FacilityRow): Practitioner {
  const identifiers: Practitioner["identifier"] = [];
  if (u.prc_license) {
    identifiers.push({
      use: "official",
      type: codeable(CS.HL_LOCAL, "prc", "PRC licence number", "PRC licence"),
      system: ID_SYS.PRC_LICENSE,
      value: u.prc_license,
    });
  }

  const parts = splitName(u);

  return {
    resourceType: "Practitioner",
    id: u.id,
    meta: { profile: [PROFILE.PRACTITIONER] },
    identifier: identifiers,
    active: true,
    name: [
      {
        use: "official",
        text: u.full_name,
        family: parts.family,
        given: parts.given,
        ...(parts.prefix ? { prefix: [parts.prefix] } : {}),
      },
    ],
    telecom: u.phone ? [{ system: "phone", value: u.phone }] : [],
    qualification: u.specialization
      ? [{ code: codeable(CS.HL_LOCAL, u.specialization, u.specialization, u.specialization) }]
      : [{ code: codeable(CS.HL_LOCAL, "medical-practitioner", "Medical practitioner", "Medical practitioner") }],
    ...(facility.address_line || facility.city_code
      ? {
          address: [
            {
              use: "work",
              type: "physical",
              line: facility.address_line ? [facility.address_line] : undefined,
              city: facility.city_display ?? undefined,
              state: (facility.province_display ?? facility.region_display) ?? undefined,
              country: "PH",
              extension: psgcAddressExtensions(facility),
            },
          ],
        }
      : {}),
  };
}

export function splitName(u: { full_name: string; family_name?: string | null; given_name?: string | null; prefix?: string | null }) {
  if (u.family_name) {
    return {
      family: u.family_name,
      given: u.given_name ? [u.given_name] : [u.full_name],
      prefix: u.prefix ?? undefined,
    };
  }
  // Fall back to splitting the display name.
  const tokens = u.full_name.replace(/\s+/g, " ").trim().split(" ");
  const prefix = /^(dr|dra|mr|ms|mrs|prof)\.?$/i.test(tokens[0] ?? "") ? tokens.shift() : undefined;
  const family = tokens.length > 1 ? tokens.pop() : (tokens[0] ?? u.full_name);
  return { family: family ?? u.full_name, given: tokens.length ? tokens : [family ?? u.full_name], prefix };
}

/* --- Encounter: the care context in which the referral was raised ------- */

export function mapEncounter(input: MappingInput): Encounter {
  const { referral, patient, referringFacility, referringUser, diagnoses } = input;

  const classCode = mapEncounterClass(referral, referringFacility);

  const e: Encounter = {
    resourceType: "Encounter",
    id: referral.fhir_encounter_id ?? `enc-${referral.id}`,
    meta: { profile: [PROFILE.ENCOUNTER] },
    identifier: [
      {
        use: "official",
        type: codeable(CS.HL_LOCAL, "referral", "HealthLink referral identifier", "Referral number"),
        system: ID_SYS.HL_REFERRAL,
        value: referral.referral_number,
      },
    ],
    status: mapEncounterStatus(referral.status as ReferralState),
    class: {
      system: CS.HL7_ACTAVATAR,
      code: classCode,
      display: ACT_ENCOUNTER_DISPLAY[classCode],
    },
    type: [
      codeableFromCoding(
        [{ system: CS.HL7_ENCOUNTER_TYPE, code: "referral-consultation", display: "Referral consultation" }],
        "Referral encounter",
      ),
    ],
    priority: {
      coding: [
        {
          system: "http://terminology.hl7.org/CodeSystem/v3-ActPriority",
          code: mapActPriority(referral.priority),
          display: referral.priority,
        },
      ],
      text: referral.priority,
    },
    subject: ref("Patient", patient.id, `${patient.given_name} ${patient.family_name}`),
    period: { start: referral.created_at, ...(referral.updated_at !== referral.created_at ? { end: referral.updated_at } : {}) },
    reasonCode: [
      codeableFromCoding([{ system: CS.HL_LOCAL, code: referral.reason_code, display: referral.reason_display }], referral.reason_display),
    ],
    serviceProvider: ref("Organization", referringFacility.id, referringFacility.name),
  };

  if (referringUser) {
    e.participant = [
      {
        type: [
          codeableFromCoding(
            [{ system: "http://terminology.hl7.org/CodeSystem/v3-ParticipationType", code: "REF", display: "referrer" }],
            "Referring provider",
          ),
        ],
        individual: ref("Practitioner", referringUser.id, referringUser.full_name),
      },
    ];
  }

  // Diagnoses attached to the encounter, using the diagnosis role value set.
  const confirmed = diagnoses.filter((d) => !!d.code);
  if (confirmed.length) {
    e.diagnosis = confirmed.map((d, i) => ({
      condition: ref("Condition", `cond-${referral.id}-${i}`, d.display),
      use: codeableFromCoding(
        [
          {
            system: "http://terminology.hl7.org/CodeSystem/diagnosis-role",
            code: d.role === "primary" ? "AD" : d.role === "differential" ? "DD" : "CC",
            display: d.role === "primary" ? "Admission diagnosis" : d.role === "differential" ? "Differential diagnosis" : "Chief complaint",
          },
        ],
        d.role,
      ),
      rank: i + 1,
    }));
  }

  return e;
}

function mapEncounterClass(referral: ReferralRow, referringFacility: FacilityRow): string {
  if (referral.reason_code === "emergency-transfer") return "EMER";
  if (referral.reason_code === "admission") return "IMP";
  const level = referringFacility.level?.toLowerCase();
  if (level === "primary") return "AMB";
  return "AMB";
}

function mapEncounterStatus(state: ReferralState): string {
  switch (state) {
    case "draft":
      return "planned";
    case "submitted":
    case "received":
      return "arrived";
    case "under-review":
    case "info-requested":
    case "accepted":
    case "scheduled":
      return "triaged";
    case "in-progress":
      return "in-progress";
    case "completed":
    case "closed-feedback":
      return "finished";
    case "rejected":
    case "redirected":
      return "finished";
    case "cancelled":
      return "cancelled";
    default:
      return "unknown";
  }
}

function mapActPriority(priority: string): string {
  switch (priority) {
    case "stat":
      return "S";
    case "asap":
      return "A";
    case "urgent":
      return "UR";
    default:
      return "R";
  }
}

/* --- Conditions ------------------------------------------------------- */

export function mapCondition(
  d: DiagnosisRow,
  index: number,
  input: MappingInput,
): Condition {
  const { referral, patient, referringUser, referringFacility } = input;

  const system = normalizeCodeSystem(d.system);

  const clinicalStatus = ["active", "recurrence", "relapse"].includes("active") ? "active" : "active";

  const c: Condition = {
    resourceType: "Condition",
    id: `cond-${referral.id}-${index}`,
    meta: { profile: [PROFILE.CONDITION] },
    clinicalStatus: codeableFromCoding(
      [
        {
          system: "http://terminology.hl7.org/CodeSystem/condition-clinical",
          code: clinicalStatus,
          display: clinicalStatus === "active" ? "Active" : "Active",
        },
      ],
      clinicalStatus,
    ),
    verificationStatus: codeableFromCoding(
      [
        {
          system: "http://terminology.hl7.org/CodeSystem/condition-ver-status",
          code: d.certainty === "provisional" ? "provisional" : d.certainty === "differential" ? "differential" : "confirmed",
          display: d.certainty ?? "confirmed",
        },
      ],
      d.certainty ?? "confirmed",
    ),
    category: [
      codeableFromCoding(
        [{ system: "http://terminology.hl7.org/CodeSystem/condition-category", code: "encounter-diagnosis", display: "Encounter Diagnosis" }],
        "Encounter diagnosis",
      ),
    ],
    code: codeableFromCoding([{ system, code: d.code, display: d.display }], d.display),
    subject: ref("Patient", patient.id, `${patient.given_name} ${patient.family_name}`),
    encounter: ref("Encounter", referral.fhir_encounter_id ?? `enc-${referral.id}`),
    ...(d.onset_date ? { onsetDateTime: d.onset_date } : {}),
    recordedDate: referral.created_at,
    ...(referringUser ? { recorder: ref("Practitioner", referringUser.id, referringUser.full_name) } : {}),
    ...(referringUser ? { asserter: ref("Practitioner", referringUser.id, referringUser.full_name) } : {}),
  };

  void referringFacility;
  return c;
}

function normalizeCodeSystem(system: string): string {
  const s = (system || "").toLowerCase();
  if (s.includes("icd") && s.includes("10")) return CS.ICD10;
  if (s.includes("snomed")) return CS.SNOMED;
  if (s.includes("loinc")) return CS.LOINC;
  return system;
}

/* --- Observations ----------------------------------------------------- */

export function mapObservation(
  o: ObservationRow,
  index: number,
  input: MappingInput,
): Observation {
  const { referral, patient, referringUser } = input;
  const code = normalizeCodeSystem(o.system);

  const isComponent = code === CS.LOINC && (o.code === "85354-9");
  const ucum = o.ucum_code ?? undefined;

  const categoryCode =
    o.category === "laboratory" ? "laboratory" : o.category === "imaging" ? "imaging" : o.category === "exam" ? "exam" : "vital-signs";

  const ob: Observation = {
    resourceType: "Observation",
    id: `obs-${referral.id}-${index}`,
    meta: { profile: [PROFILE.OBSERVATION] },
    status: "final",
    category: [
      codeableFromCoding([
        { system: "http://terminology.hl7.org/CodeSystem/observation-category", code: categoryCode, display: categoryCode },
      ]),
    ],
    code: codeableFromCoding([{ system: code, code: o.code, display: o.display }], o.display),
    subject: ref("Patient", patient.id, `${patient.given_name} ${patient.family_name}`),
    encounter: ref("Encounter", referral.fhir_encounter_id ?? `enc-${referral.id}`),
    effectiveDateTime: o.effective_at ?? referral.created_at,
    issued: referral.created_at,
    ...(referringUser ? { performer: [ref("Practitioner", referringUser.id, referringUser.full_name)] } : {}),
  };

  if (isComponent) {
    ob.component = [
      {
        code: codeableFromCoding([{ system: CS.LOINC, code: "8480-6", display: "Systolic blood pressure" }], "Systolic blood pressure"),
        ...(o.value_num != null ? { valueQuantity: { value: o.value_num, unit: "mmHg", system: CS.UCUM, code: "mm[Hg]" } } : {}),
      },
    ];
    return ob;
  }

  if (o.value_num != null) {
    ob.valueQuantity = {
      value: o.value_num,
      ...(o.unit ? { unit: o.unit } : {}),
      ...(ucum ? { system: CS.UCUM, code: ucum } : o.unit ? { system: CS.UCUM } : {}),
    };
  } else if (o.value_text) {
    // PH Core requires value[x] CodeableConcept when a coded value is supplied;
    // free-text findings use valueString, which the base R4 Observation allows.
    const known = LOINC[o.code];
    if (known && known.group === "imaging") {
      ob.valueCodeableConcept = { text: o.value_text };
    } else {
      ob.valueString = o.value_text;
    }
  }

  // Interpretation, either explicit or derived from the reference range.
  const interp = deriveInterpretation(o);
  if (interp) ob.interpretation = [codeableFromCoding([interp], interp.display)];

  if (o.ref_low != null || o.ref_high != null) {
    ob.referenceRange = [
      {
        ...(o.ref_low != null || o.ref_high != null
          ? {
              low: o.ref_low != null ? { value: o.ref_low, ...(o.unit ? { unit: o.unit } : {}) } : undefined,
              high: o.ref_high != null ? { value: o.ref_high, ...(o.unit ? { unit: o.unit } : {}) } : undefined,
            }
          : {}),
        ...(o.unit ? { text: `${o.ref_low ?? ""}${o.ref_low != null && o.ref_high != null ? " - " : ""}${o.ref_high ?? ""} ${o.unit}`.trim() } : {}),
      },
    ];
  }

  return ob;
}

function deriveInterpretation(o: ObservationRow): Coding | null {
  if (o.interpretation) {
    const map: Record<string, Coding> = {
      N: INTERPRETATION.NORMAL,
      H: INTERPRETATION.HIGH,
      L: INTERPRETATION.LOW,
      HH: INTERPRETATION.CRITICAL_HIGH,
      LL: INTERPRETATION.CRITICAL_LOW,
    };
    return map[o.interpretation] ?? null;
  }
  if (o.value_num == null) return null;
  const known = LOINC[o.code];
  const low = o.ref_low ?? known?.refLow;
  const high = o.ref_high ?? known?.refHigh;
  if (high != null && o.value_num > high) return INTERPRETATION.HIGH;
  if (low != null && o.value_num < low) return INTERPRETATION.LOW;
  if (low != null || high != null) return INTERPRETATION.NORMAL;
  return null;
}

/* --- MedicationStatement, AllergyIntolerance -------------------------- */

export function mapMedication(m: MedicationRow, index: number, input: MappingInput): MedicationStatement {
  const { referral, patient } = input;
  const dosageText = [m.dose, m.route, m.frequency].filter(Boolean).join(" ");

  return {
    resourceType: "MedicationStatement",
    id: `med-${referral.id}-${index}`,
    meta: { profile: [PROFILE.MEDICATION_STATEMENT] },
    status: m.status === "active" ? "active" : m.status === "completed" ? "completed" : "unknown",
    medicationCodeableConcept: m.fda_cpr
      ? codeableFromCoding(
          [{ system: CS.PH_FDA_CPR, code: m.fda_cpr, display: m.medication }],
          m.medication,
        )
      : { text: m.medication },
    subject: ref("Patient", patient.id, `${patient.given_name} ${patient.family_name}`),
    context: ref("Encounter", referral.fhir_encounter_id ?? `enc-${referral.id}`),
    ...(m.started_on ? { effectiveDateTime: m.started_on } : {}),
    dateAsserted: referral.created_at,
    ...(dosageText ? { dosage: [{ text: dosageText }] } : {}),
  };
}

export function mapAllergy(a: AllergyRow, index: number, input: MappingInput): AllergyIntolerance {
  const { referral, patient, referringUser } = input;

  return {
    resourceType: "AllergyIntolerance",
    id: `alg-${referral.id}-${index}`,
    meta: { profile: [PROFILE.ALLERGY_INTOLERANCE] },
    clinicalStatus: codeableFromCoding(
      [{ system: "http://terminology.hl7.org/CodeSystem/allergyintolerance-clinical", code: "active", display: "Active" }],
      "active",
    ),
    verificationStatus: codeableFromCoding(
      [{ system: "http://terminology.hl7.org/CodeSystem/allergyintolerance-verification", code: "confirmed", display: "Confirmed" }],
      "confirmed",
    ),
    type: "allergy",
    category: [a.category === "food" ? "food" : a.category === "environment" ? "environment" : "medication"],
    ...(a.criticality ? { criticality: a.criticality } : {}),
    code: codeableFromCoding([{ system: normalizeCodeSystem(a.system), code: a.code, display: a.display }], a.display),
    patient: ref("Patient", patient.id, `${patient.given_name} ${patient.family_name}`),
    encounter: ref("Encounter", referral.fhir_encounter_id ?? `enc-${referral.id}`),
    recordedDate: referral.created_at,
    ...(referringUser ? { recorder: ref("Practitioner", referringUser.id, referringUser.full_name) } : {}),
    ...(a.reaction
      ? {
          reaction: [
            {
              manifestation: [{ text: a.reaction }],
              description: a.reaction,
            },
          ],
        }
      : {}),
  };
}

/**
 * Convert the referral's inline vital signs into LOINC-coded Observation rows.
 *
 * Vitals are captured on the referral row as individual columns (because that is
 * the natural shape for a form and for reporting), but they must be *exchanged*
 * as standard Observations. Without this step a receiving system would see only
 * the narrative and would have to re-type the numbers, which defeats the point
 * of the exchange.
 */
export function vitalsToObservations(r: ReferralRow): ObservationRow[] {
  const at = r.created_at;
  const out: ObservationRow[] = [];

  // Blood pressure is a single panel with two components in FHIR. Modelled here
  // as the panel code carrying both values so the panel survives the mapping.
  if (r.vital_systolic != null || r.vital_diastolic != null) {
    out.push({
      system: CS.LOINC,
      code: "85354-9",
      display: "Blood pressure panel with all children optional",
      category: OBS_CATEGORY_VITALSIGN,
      value_num: r.vital_systolic ?? null,
      value_text:
        r.vital_systolic != null && r.vital_diastolic != null
          ? `${r.vital_systolic}/${r.vital_diastolic} mmHg`
          : null,
      unit: "mmHg",
      ucum_code: "mm[Hg]",
      ref_low: null,
      ref_high: 120,
      effective_at: at,
    });
  }

  const rows: Array<[string, number | null | undefined, string, string, number | null, number | null]> = [
    ["8867-4", r.vital_heart_rate, "beats/min", "/min", 60, 100],
    ["9279-1", r.vital_resp_rate, "breaths/min", "/min", 12, 20],
    ["8310-5", r.vital_temperature, "°C", "Cel", 36.1, 37.2],
    ["59408-5", r.vital_spo2, "%", "%", 95, null],
    ["29463-7", r.vital_weight_kg, "kg", "kg", null, null],
    ["8302-2", r.vital_height_cm, "cm", "cm", null, null],
    ["72514-3", r.vital_pain_score, "score", "{score}", null, 3],
  ];

  for (const [code, value, unit, ucum, refLow, refHigh] of rows) {
    if (value == null) continue;
    const entry = LOINC[code];
    out.push({
      system: CS.LOINC,
      code,
      display: entry?.display ?? code,
      category: OBS_CATEGORY_VITALSIGN,
      value_num: value,
      value_text: null,
      unit,
      ucum_code: ucum,
      ref_low: refLow,
      ref_high: refHigh,
      effective_at: at,
    });
  }

  // BMI is derived, and derived observations are exactly what LOINC panels exist
  // to express. Computed only when both inputs are present.
  if (r.vital_weight_kg != null && r.vital_height_cm != null && r.vital_height_cm > 0) {
    const m = r.vital_height_cm / 100;
    const bmi = r.vital_weight_kg / (m * m);
    if (Number.isFinite(bmi)) {
      out.push({
        system: CS.LOINC,
        code: "39156-5",
        display: LOINC["39156-5"].display,
        category: OBS_CATEGORY_VITALSIGN,
        value_num: Math.round(bmi * 10) / 10,
        value_text: null,
        unit: "kg/m2",
        ucum_code: "kg/m2",
        ref_low: 18.5,
        ref_high: 24.9,
        effective_at: at,
      });
    }
  }

  return out;
}

/** Observation rows for a referral: inline vitals first, then capture results. */
export function observationsFor(input: MappingInput): ObservationRow[] {
  return [...vitalsToObservations(input.referral), ...input.observations];
}

/* --- ServiceRequest: the referral request itself ---------------------- */

export function mapServiceRequest(input: MappingInput): ServiceRequest {
  const { referral, patient, receivingFacility, referringUser, referringFacility, diagnoses, observations, attachments } = input;
  const state = STATES[input.currentState];

  // supportingInfo points at the clinical-summary resources the receiver needs.
  const supportingInfo: Reference[] = [
    ...diagnoses.filter((d) => !!d.code).map((d, i) => ref("Condition", `cond-${referral.id}-${i}`, d.display)),
    ...observations.map((o, i) => ref("Observation", `obs-${referral.id}-${i}`, o.display)),
    ...attachments.map((a) => ref("DocumentReference", a.id, a.title)),
  ];

  const noteText = buildClinicalNarrative(input);

  const sr: ServiceRequest = {
    resourceType: "ServiceRequest",
    id: `sr-${referral.id}`,
    meta: { profile: [PROFILE.SERVICE_REQUEST] },
    identifier: [
      {
        use: "official",
        type: codeable(CS.HL_LOCAL, "referral", "HealthLink referral identifier", "Referral number"),
        system: ID_SYS.HL_REFERRAL,
        value: referral.referral_number,
      },
    ],
    status: state.fhirServiceRequestStatus,
    intent: "order",
    priority: referral.priority === "stat" ? "stat" : referral.priority === "asap" ? "asap" : referral.priority === "urgent" ? "urgent" : "routine",
    category: [
      codeableFromCoding(
        [{ system: CS.HL7_SERVICEREQUEST_CATEGORY, code: "referral", display: "Referral" }],
        "Referral",
      ),
    ],
    code: codeableFromCoding(
      [{ system: CS.HL_LOCAL, code: referral.reason_code, display: referral.reason_display }],
      referral.reason_display,
    ),
    orderDetail: [
      codeableFromCoding(
        [{ system: CS.HL_REASON_FOR_REFERRAL, code: referral.reason_code, display: referral.reason_display }],
        referral.reason_display,
      ),
    ],
    subject: ref("Patient", patient.id, `${patient.given_name} ${patient.family_name}`),
    encounter: ref("Encounter", referral.fhir_encounter_id ?? `enc-${referral.id}`),
    authoredOn: referral.created_at,
    ...(referringUser ? { requester: ref("Practitioner", referringUser.id, referringUser.full_name) } : {}),
    ...(receivingFacility
      ? { performer: [ref("Organization", receivingFacility.id, receivingFacility.name)] }
      : {}),
    ...(supportingInfo.length ? { supportingInfo } : {}),
    reasonCode: [
      codeableFromCoding([{ system: CS.HL_LOCAL, code: referral.reason_code, display: referral.reason_display }], referral.reason_display),
    ],
    ...(noteText ? { note: [{ text: noteText }] } : {}),
    ...(referral.special_instructions ? { patientInstruction: referral.special_instructions } : {}),
  };

  void referringFacility;
  return sr;
}

/** Build the structured clinical narrative carried in ServiceRequest.note. */
export function buildClinicalNarrative(input: MappingInput): string {
  const r = input.referral;
  const sections: Array<[string, string | null | undefined]> = [
    ["Reason for referral", r.reason_display],
    ["Referral narrative", r.reason_narrative],
    ["Chief complaint", r.chief_complaint],
    ["History of present illness", r.history_of_present],
    ["Past medical history", r.past_medical_history],
    ["Past surgical history", r.past_surgical_history],
    ["Family history", r.family_history],
    ["Personal and social history", r.personal_social_history],
    ["Review of systems", r.review_of_systems],
    ["Physical examination", r.physical_examination],
    ["Assessment", r.assessment],
    ["Management to date", r.management_plan],
    ["Requested action", r.requested_action],
    ["Special instructions", r.special_instructions],
  ];

  const parts = sections
    .filter(([, v]) => !!v?.trim())
    .map(([k, v]) => `${k}: ${v!.trim()}`);

  if (input.attachments.length) {
    parts.push(`Supporting documents: ${input.attachments.map((a) => a.title).join("; ")}`);
  }
  return parts.join("\n\n");
}

/* --- Task: the workflow state machine -------------------------------- */

export function mapTask(input: MappingInput, history?: Array<{ to_status: string; created_at: string; actor_name?: string | null; note?: string | null }>): Task {
  const { referral, patient, receivingFacility, referringUser, receivingUser, currentState } = input;
  const state = STATES[currentState];

  const t: Task = {
    resourceType: "Task",
    id: referral.fhir_task_id ?? `task-${referral.id}`,
    meta: { profile: [PROFILE.TASK] },
    identifier: [
      {
        use: "official",
        type: codeable(CS.HL_LOCAL, "referral", "HealthLink referral identifier", "Referral number"),
        system: ID_SYS.HL_REFERRAL,
        value: referral.referral_number,
      },
    ],
    status: state.fhirTaskStatus,
    businessStatus: codeableFromCoding(
      [{ system: CS.HL_TASK_BUSINESS_STATUS, code: state.fhirBusinessStatus, display: state.label }],
      state.label,
    ),
    intent: "order",
    priority: referral.priority === "stat" ? "stat" : referral.priority === "asap" ? "asap" : referral.priority === "urgent" ? "urgent" : "routine",
    code: codeableFromCoding(
      [{ system: CS.HL_LOCAL, code: "referral-workflow", display: "Referral workflow task" }],
      "Referral workflow task",
    ),
    description: `${referral.referral_number} - ${state.label}: ${state.description}`,
    focus: ref("ServiceRequest", `sr-${referral.id}`),
    for: ref("Patient", patient.id, `${patient.given_name} ${patient.family_name}`),
    encounter: ref("Encounter", referral.fhir_encounter_id ?? `enc-${referral.id}`),
    executionPeriod: { start: referral.created_at, end: referral.updated_at },
    authoredOn: referral.created_at,
    lastModified: referral.updated_at,
    ...(referringUser ? { requester: ref("Practitioner", referringUser.id, referringUser.full_name) } : {}),
    ...(receivingUser
      ? { owner: ref("Practitioner", receivingUser.id, receivingUser.full_name) }
      : receivingFacility
        ? { owner: ref("Organization", receivingFacility.id, receivingFacility.name) }
        : {}),
    ...(referral.reason_code
      ? { reasonCode: codeableFromCoding([{ system: CS.HL_LOCAL, code: referral.reason_code, display: referral.reason_display }], referral.reason_display) }
      : {}),
    ...(referral.outcome_code && OUTCOME_BY_CODE.get(referral.outcome_code)
      ? {
          statusReason: codeableFromCoding(
            [{ system: CS.HL_LOCAL, code: referral.outcome_code, display: OUTCOME_BY_CODE.get(referral.outcome_code)!.display }],
            OUTCOME_BY_CODE.get(referral.outcome_code)!.display,
          ),
        }
      : {}),
  };

  // The workflow history is carried as annotations so a receiving system can
  // reconstruct the closed-loop trail even if it does not store HealthLink events.
  const notes: Annotation[] = [];
  if (history?.length) {
    for (const h of history) {
      const label = (STATES as Record<string, { label: string }>)[h.to_status]?.label ?? h.to_status;
      notes.push({
        time: h.created_at,
        text: `${label}${h.actor_name ? ` by ${h.actor_name}` : ""}${h.note ? ` - ${h.note}` : ""}`,
      });
    }
  }
  if (referral.receiving_notes) {
    notes.push({ time: referral.updated_at, text: `Receiving facility notes: ${referral.receiving_notes}` });
  }
  if (notes.length) t.note = notes;

  return t;
}

/* --- Consent ---------------------------------------------------------- */

export function mapConsent(c: ConsentRow | null | undefined, patient: PatientRow, facilities: FacilityRow[], referralIds?: string[]): Consent | null {
  if (!c) return null;
  const basis: LawfulBasis | undefined = LAWFUL_BASIS[c.purpose_code];

  return {
    resourceType: "Consent",
    id: c.id,
    meta: {
      // PH Core v0.2.0 has no Consent profile; declare the R4 base explicitly
      // and record the alignment gap for the national IG.
      profile: ["http://hl7.org/fhir/StructureDefinition/Consent"],
      tag: [{ system: CS.HL_LOCAL, code: "phcore-gap", display: "No PH Core profile in v0.2.0" }],
    },
    identifier: [
      {
        use: "official",
        type: codeable(CS.HL_LOCAL, "consent", "HealthLink consent record", "Consent record"),
        system: ID_SYS.HL_CONSENT,
        value: c.id,
      },
    ],
    status: mapConsentStatus(c.status),
    scope: codeableFromCoding(
      [{ system: CS.HL7_CONSENT_SCOPE, code: "patient-privacy", display: "Privacy Consent" }],
      "Patient privacy",
    ),
    category: [
      codeableFromCoding(
        [{ system: CS.HL7_CONSENT_CATEGORY, code: "59284-0", display: "Patient Consent" }],
        "Patient consent",
      ),
      codeableFromCoding(
        [{ system: CS.HL_CONSENT_LAWFUL_BASIS, code: c.purpose_code, display: c.purpose_display }],
        c.purpose_display,
      ),
    ],
    patient: ref("Patient", patient.id, `${patient.given_name} ${patient.family_name}`),
    dateTime: c.granted_at ?? undefined,
    ...(c.period_start || c.period_end
      ? { provision: { type: "permit", period: { start: c.period_start ?? undefined, end: c.period_end ?? undefined } } }
      : { provision: { type: "permit" } }),
    policyRule: codeableFromCoding(
      [{ system: CS.HL7_CONSENT_POLICY, code: "hipaa-auth", display: "HIPAA Authorization" }],
      basis?.display ?? c.purpose_display,
    ),
    verification: [
      {
        verified: c.status === "active",
        verificationType: codeableFromCoding(
          [{ system: CS.HL_LOCAL, code: "granted-by", display: `${c.granted_by_name ?? "Patient"} (${c.granted_by_relation ?? "self"})` }],
          c.granted_by_name ?? "Patient",
        ),
      },
    ],
  };

  function mapConsentStatus(s: string): string {
    if (s === "active") return "active";
    if (s === "revoked") return "inactive";
    if (s === "rejected") return "rejected";
    if (s === "expired") return "inactive";
    return "proposed";
  }

  void facilities;
  void referralIds;
}

/* --- DocumentReference for attachments -------------------------------- */

export function mapDocumentReference(
  a: AttachmentRow,
  input: MappingInput,
): DocumentReference {
  const { referral, patient, referringUser, referringFacility } = input;

  return {
    resourceType: "DocumentReference",
    id: a.id,
    meta: {
      profile: ["http://hl7.org/fhir/StructureDefinition/DocumentReference"],
      tag: [{ system: CS.HL_LOCAL, code: "phcore-gap", display: "No PH Core profile in v0.2.0" }],
    },
    identifier: [
      {
        type: codeable(CS.HL_LOCAL, "attachment", "HealthLink attachment", "Attachment"),
        system: ID_SYS.HL_REFERRAL,
        value: `${referral.referral_number}/doc/${a.id}`,
      },
    ],
    status: "current",
    docStatus: "final",
    type: codeable(CS.HL_ATTACHMENT_TYPE, a.doc_type_code, a.doc_type_display, a.doc_type_display),
    category: [
      codeableFromCoding(
        [{ system: "http://hl7.org/fhir/us/core/CodeSystem/us-core-documentreference-category", code: "clinical-note", display: "Clinical Note" }],
        "Clinical note",
      ),
    ],
    subject: ref("Patient", patient.id, `${patient.given_name} ${patient.family_name}`),
    date: a.created_at,
    ...(referringUser ? { author: [ref("Practitioner", referringUser.id, referringUser.full_name)] } : {}),
    custodian: ref("Organization", referringFacility.id, referringFacility.name),
    description: a.title,
    securityLabel: [
      codeableFromCoding(
        [{ system: "http://terminology.hl7.org/CodeSystem/v3-Confidentiality", code: "R", display: "restricted" }],
        "Restricted",
      ),
    ],
    content: [
      {
        attachment: {
          contentType: a.content_type,
          title: a.title,
          size: a.size_bytes,
          creation: a.created_at,
          ...(a.sha256 ? { hash: Buffer.from(a.sha256, "hex").toString("base64") } : {}),
          // Inline text documents travel as base64 data; larger binaries would
          // be served from a document endpoint in a production deployment.
          ...(a.content_b64 ? { data: a.content_b64 } : {}),
          ...(a.content_text ? { data: Buffer.from(a.content_text, "utf8").toString("base64") } : {}),
        },
        format: codeableFromCoding(
          [{ system: "http://ihe.net/fhir/ValueSet/IHE.FormatCode.codesystem", code: "urn:ihe:iti:xds:2017:mimeTypeSufficient", display: "mimeType Sufficient" }],
          "mimeType sufficient",
        ) as unknown as Coding,
      },
    ],
    context: {
      encounter: [ref("Encounter", referral.fhir_encounter_id ?? `enc-${referral.id}`)],
      period: { start: referral.created_at },
    },
  };
}

/* --- Communication for feedback --------------------------------------- */

export function mapCommunication(
  m: {
    id: string;
    kind: string;
    subject?: string | null;
    body: string;
    sender_name?: string | null;
    sender_user_id?: string | null;
    created_at: string;
    recipient_role?: string | null;
  },
  input: MappingInput,
  direction: "outbound" | "inbound",
): Communication {
  const { referral, patient, referringFacility, receivingFacility } = input;

  const senderIsReferring = direction === "outbound";
  const from = senderIsReferring ? referringFacility : receivingFacility;
  const to = senderIsReferring ? receivingFacility : referringFacility;

  return {
    resourceType: "Communication",
    id: m.id,
    meta: {
      profile: ["http://hl7.org/fhir/StructureDefinition/Communication"],
      tag: [{ system: CS.HL_LOCAL, code: "phcore-gap", display: "No PH Core profile in v0.2.0" }],
    },
    status: "completed",
    category: [
      codeableFromCoding(
        [{ system: CS.HL_LOCAL, code: m.kind, display: m.kind.replace(/-/g, " ") }],
        m.kind.replace(/-/g, " "),
      ),
    ],
    priority: referral.priority === "stat" ? "stat" : "routine",
    subject: ref("Patient", patient.id, `${patient.given_name} ${patient.family_name}`),
    about: [
      ref("ServiceRequest", `sr-${referral.id}`, referral.referral_number),
      ref("Task", referral.fhir_task_id ?? `task-${referral.id}`, referral.referral_number),
    ],
    encounter: ref("Encounter", referral.fhir_encounter_id ?? `enc-${referral.id}`),
    sent: m.created_at,
    recipient: [ref("Organization", to.id, to.name)],
    ...(m.sender_user_id ? { sender: ref("Practitioner", m.sender_user_id, m.sender_name ?? undefined) } : {}),
    payload: [{ contentString: m.body }],
  };
}

/* --- Provenance ------------------------------------------------------- */

export function mapProvenance(
  input: MappingInput,
  opts: { targets: Reference[]; activity: "create" | "update" | "complete"; occurredAt?: string; reasonCode?: string },
): Provenance {
  const { referringFacility, receivingFacility, actorUser } = input;

  const who = actorUser ?? input.referringUser ?? undefined;
  const isReceivingSide = who?.facility_id === receivingFacility.id;
  const facility = isReceivingSide ? receivingFacility : referringFacility;

  const agents: Provenance["agent"] = [];

  const agentType = codeableFromCoding(
    [{ system: CS.HL7_PROVENANCE_PARTICIPANT, code: "author", display: "Author" }],
    "Author",
  );

  if (who) {
    // PH Core invariant provenance-1: onBehalfOf SHALL be present when
    // Provenance.agent.who is a Practitioner or Device.
    agents.push({
      type: agentType,
      role: [
        codeableFromCoding(
          [{ system: CS.HL7_PRACTITIONER_ROLE, code: "doctor", display: "Doctor" }],
          who.specialization ?? "Clinician",
        ),
      ],
      who: ref("Practitioner", who.id, who.full_name),
      onBehalfOf: ref("Organization", facility.id, facility.name),
    });
  } else {
    agents.push({
      type: agentType,
      who: ref("Organization", facility.id, facility.name),
    });
  }

  return {
    resourceType: "Provenance",
    id: `prov-${input.referral.id}-${opts.activity}-${Date.now().toString(36)}`,
    meta: { profile: [PROFILE.PROVENANCE] },
    target: opts.targets,
    recorded: opts.occurredAt ?? new Date().toISOString(),
    reason: [
      codeableFromCoding(
        [
          {
            system: CS.HL7_V3_PURPOSE_OF_USE,
            code: "TREAT",
            display: "Treatment",
          },
        ],
        "Treatment",
      ),
    ],
    activity: provenanceActivity(opts.activity),
    agent: agents,
  };
}

/* ------------------------------------------------------------------ */
/* Referral package Bundle                                             */
/* ------------------------------------------------------------------ */

export interface BuildBundleOptions {
  history?: Array<{ to_status: string; created_at: string; actor_name?: string | null; note?: string | null }>;
  feedback?: Array<{
    id: string;
    kind: string;
    subject?: string | null;
    body: string;
    sender_name?: string | null;
    sender_user_id?: string | null;
    created_at: string;
    recipient_role?: string | null;
    /** Which facility authored the message. */
    author_facility_id?: string | null;
  }>;
  includeProvenance?: boolean;
}

/**
 * Build the exchange Bundle for a referral.
 *
 * Uses `transaction` so the receiving facility's FHIR server can accept the
 * package atomically, with POST/PUT entries for each resource.
 */
export function buildReferralBundle(input: MappingInput, opts: BuildBundleOptions = {}): Bundle {
  // Inline vitals are promoted to Observations here, once, so every consumer of
  // the bundle (facade, download, validator, store) sees the same resource set.
  const mapped: MappingInput = { ...input, observations: observationsFor(input) };

  const entries: BundleEntry[] = [];
  const add = (resource: { resourceType: string; id?: string }, method: "POST" | "PUT") => {
    entries.push({
      fullUrl: `${HEALTHLINK_FHIR_BASE_URL}/${resource.resourceType}/${resource.id}`,
      resource: resource as never,
      request: {
        method,
        url: method === "PUT" ? `${resource.resourceType}/${resource.id}` : resource.resourceType,
      },
    });
  };

  const patient = mapPatient(mapped.patient);
  const referringFacility = mapOrganization(mapped.referringFacility);
  const receivingFacility = mapOrganization(mapped.receivingFacility);
  const encounter = mapEncounter(mapped);
  const serviceRequest = mapServiceRequest(mapped);
  const task = mapTask(mapped, opts.history);
  const conditions = mapped.diagnoses
    .filter((d) => !!d.code)
    .map((d, i) => mapCondition(d, i, mapped));
  const observations = mapped.observations.map((o, i) => mapObservation(o, i, mapped));
  const medications = mapped.medications.map((m, i) => mapMedication(m, i, mapped));
  const allergies = mapped.allergies.map((a, i) => mapAllergy(a, i, mapped));
  const documents = mapped.attachments.map((a) => mapDocumentReference(a, mapped));
  const consent = mapConsent(mapped.consent, mapped.patient, [mapped.referringFacility, mapped.receivingFacility]);

  // Transaction order follows FHIR reference dependency rules.
  add(patient, "PUT");
  add(referringFacility, "PUT");
  add(receivingFacility, "PUT");
  if (mapped.referringUser) add(mapPractitioner(mapped.referringUser, mapped.referringFacility), "PUT");
  if (mapped.receivingUser) add(mapPractitioner(mapped.receivingUser, mapped.receivingFacility), "PUT");
  add(encounter, "PUT");
  if (consent) add(consent, "PUT");
  conditions.forEach((c) => add(c, "PUT"));
  observations.forEach((o) => add(o, "PUT"));
  medications.forEach((m) => add(m, "PUT"));
  allergies.forEach((a) => add(a, "PUT"));
  documents.forEach((d) => add(d, "PUT"));
  add(serviceRequest, "PUT");
  add(task, "PUT");

  if (opts.feedback?.length) {
    for (const f of opts.feedback) {
      const direction = f.author_facility_id === mapped.referringFacility.id ? "outbound" : "inbound";
      add(mapCommunication(f, mapped, direction), "PUT");
    }
  }

  if (opts.includeProvenance !== false) {
    const targets: Reference[] = [
      ref("ServiceRequest", serviceRequest.id!, mapped.referral.referral_number),
      ref("Task", task.id!, mapped.referral.referral_number),
      ref("Encounter", encounter.id!),
    ];
    const prov = mapProvenance(mapped, {
      targets,
      activity: opts.history?.length ? "update" : "create",
    });
    add(prov, "PUT");
  }

  return {
    resourceType: "Bundle",
    id: `bundle-${mapped.referral.id}`,
    meta: {
      lastUpdated: new Date().toISOString(),
      tag: [
        {
          system: CS.HL_LOCAL,
          code: "referral-package",
          display: `HealthLink referral package aligned to ${PHCORE_IG.package}#${PHCORE_IG.version}`,
        },
      ],
    },
    type: "transaction",
    timestamp: new Date().toISOString(),
    total: entries.length,
    entry: entries,
  };
}

/** Resource types included in a referral package, for the alignment report. */
export const REFERRAL_PACKAGE_RESOURCES = [
  "Patient",
  "Practitioner",
  "Organization",
  "Encounter",
  "ServiceRequest",
  "Task",
  "Condition",
  "Observation",
  "MedicationStatement",
  "AllergyIntolerance",
  "DocumentReference",
  "Consent",
  "Communication",
  "Provenance",
] as const;

/** Re-exported so callers rendering PSGC codes do not import terminology twice. */
export { PSGC } from "./terminology";
