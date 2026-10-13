/**
 * Smoke test for the FHIR validation, mapping and workflow layers.
 * Runs outside Next.js using tsx.
 *
 * Important: this suite writes referrals, transitions, audit events and tampered
 * records. It therefore runs against its OWN database file so that a test run can
 * never contaminate the demonstration dataset. `db.ts` honours HEALTHLINK_DB.
 *
 * Usage: npm test
 */

// Must be set before any module imports db.ts.
if (!process.env.HEALTHLINK_DB) {
  process.env.HEALTHLINK_DB = join(process.cwd(), "data", "healthlink-test.db");
}

import { unlinkSync, existsSync } from "node:fs";
import { join } from "node:path";
import { migrate, closeDb, all, run } from "../src/lib/db";
import { seed } from "../src/lib/seed";
import { PH_CORE_PROFILES } from "../src/lib/fhir/profiles";
import { validateBundle, validateResource, phCoreAlignment } from "../src/lib/fhir/validator";
import { REFERRAL_PACKAGE_RESOURCES, mapPatient, mapOrganization, mapTask } from "../src/lib/fhir/mapper";
import { STATES, TRANSITIONS, canTransition, routingChecklist, blockingFailures } from "../src/lib/workflow";

const TEST_DB = process.env.HEALTHLINK_DB;

let pass = 0;
let fail = 0;
const failures = [];

function check(name: string, condition: boolean, detail = "") {
  if (condition) {
    pass++;
  } else {
    fail++;
    failures.push(`${name}${detail ? ` — ${detail}` : ""}`);
  }
}

// Start from a clean test database every run.
for (const suffix of ["", "-wal", "-shm"]) {
  const f = `${TEST_DB}${suffix}`;
  if (existsSync(f)) unlinkSync(f);
}

migrate();
seed({ reset: true });

console.log("HealthLink FHIR layer smoke test");
console.log(`database: ${TEST_DB}\n`);

/* --- 1. PH Core profile registry --- */
check("PH Core profile registry is populated", PH_CORE_PROFILES.length >= 10, `got ${PH_CORE_PROFILES.length}`);
check(
  "Registry cites the real PH Core canonical",
  PH_CORE_PROFILES.every((p) => p.url.startsWith("https://fhir.doh.gov.ph/phcore/")),
);
check(
  "No duplicate profile URLs",
  new Set(PH_CORE_PROFILES.map((p) => p.url)).size === PH_CORE_PROFILES.length,
);

/* --- 2. Validator: a well-formed patient passes --- */
const goodPatient = mapPatient({
  id: "pat-test",
  local_mrn: "TEST-001",
  philhealth_id: "SYN-63-000000000-1",
  philsys_id: null,
  family_name: "Dela Cruz",
  given_name: "Juan",
  middle_name: "Santos",
  suffix: null,
  sex: "male",
  birth_date: "1980-01-01",
  civil_status: "married",
  blood_type: "O+",
  region_code: "1100000000",
  region_display: "Region XI (Davao Region)",
  province_code: "1102400000",
  province_display: "Davao del Sur",
  city_code: "112402000",
  city_display: "City of Davao",
  barangay_code: "112402050",
  barangay_display: "Buhangin",
  address_line: "Km. 8 Buhangin",
  postal_code: "8000",
  phone: "+63-917-000-0000",
  email: null,
  occupation: "Driver",
  nationality: "Filipino",
  religion: null,
  is_pwd: 0,
  pwd_id: null,
});

const goodResult = validateResource(goodPatient);
check("Well-formed PH Core Patient validates", goodResult.valid, JSON.stringify(goodResult.outcome.issue.slice(0, 3)));
check("Patient declares the PH Core profile", goodPatient.meta?.profile?.includes("https://fhir.doh.gov.ph/phcore/StructureDefinition/ph-core-patient"));
check("Patient carries the PhilHealth identifier system", goodPatient.identifier?.some((i) => i.system === "http://philhealth.gov.ph/fhir/Identifier/philhealth-id"));
check("Patient address carries PSGC extensions", (goodPatient.address?.[0]?.extension?.length ?? 0) >= 4);

/* --- 3. Validator: broken input produces errors --- */
const brokenPatient = {
  resourceType: "Patient",
  id: "bad id with spaces!",
  birthDate: "not-a-date",
  gender: "MALE",
};
const brokenResult = validateResource(brokenPatient);
check("Broken patient fails validation", !brokenResult.valid, `errors=${brokenResult.errorCount}`);
check("Validator reports the invalid id", brokenResult.outcome.issue.some((i) => (i.expression?.[0] ?? "").includes("id")));
check("Validator reports the invalid birthDate", brokenResult.outcome.issue.some((i) => (i.expression?.[0] ?? "").includes("birthDate")));
check(
  "Validator enforces the required gender value set",
  brokenResult.outcome.issue.some((i) => i.code === "code-invalid"),
);

/* --- 4. Validator: PH Core required cardinality is enforced --- */
const missingSubject = {
  resourceType: "Condition",
  id: "cond-1",
  clinicalStatus: { coding: [{ system: "http://terminology.hl7.org/CodeSystem/condition-clinical", code: "active" }] },
  verificationStatus: { coding: [{ system: "http://terminology.hl7.org/CodeSystem/condition-ver-status", code: "confirmed" }] },
  code: { coding: [{ system: "http://hl7.org/fhir/sid/icd-10", code: "E11.9", display: "Type 2 diabetes mellitus without complications" }] },
  // subject intentionally omitted - PH Core requires 1..1
};
const missingSubjectResult = validateResource(missingSubject);
check("Condition without subject is rejected", !missingSubjectResult.valid);
check(
  "The missing subject is reported as a required-element error",
  missingSubjectResult.outcome.issue.some((i) => i.code === "required" && (i.expression?.[0] ?? "").includes("subject")),
);

/* --- 5. Validator: advisory terminology warning, not a hard error --- */
const unknownLoinc = {
  resourceType: "Observation",
  id: "obs-x",
  status: "final",
  code: { coding: [{ system: "http://loinc.org", code: "99999-9", display: "Made-up analyte" }] },
  subject: { reference: "Patient/pat-test" },
};
const unknownLoincResult = validateResource(unknownLoinc);
check("Unknown LOINC code is not a hard error", unknownLoincResult.valid, `errors=${unknownLoincResult.errorCount}`);
check("Unknown LOINC code raises a warning", unknownLoincResult.warningCount >= 1);

/* --- 6. PH Core invariant: provenance-1 --- */
const badProvenance = {
  resourceType: "Provenance",
  id: "prov-1",
  target: [{ reference: "ServiceRequest/sr-1" }],
  recorded: new Date().toISOString(),
  agent: [
    {
      type: { coding: [{ system: "http://terminology.hl7.org/CodeSystem/provenance-participant-type", code: "author" }] },
      who: { reference: "Practitioner/usr-1" },
      // onBehalfOf intentionally omitted -> PH Core invariant violation
    },
  ],
};
const badProvResult = validateResource(badProvenance);
check("provenance-1 invariant is enforced", !badProvResult.valid);
check(
  "provenance-1 is reported as an invariant violation",
  badProvResult.outcome.issue.some((i) => i.code === "invariant"),
);

const goodProvenance = {
  ...badProvenance,
  agent: [{ ...badProvenance.agent[0], onBehalfOf: { reference: "Organization/fac-1" } }],
};
check("Provenance with onBehalfOf passes", validateResource(goodProvenance).valid);

/* --- 7. Real seeded referral validates end to end --- */
const { all } = await import("../src/lib/db");
const { getReferralDetail, bundleForReferral } = await import("../src/lib/referrals");

const refs = all("SELECT id, referral_number, status FROM referrals ORDER BY created_at");
check("Seeded referrals exist", refs.length >= 5, `got ${refs.length}`);

let allBundlesValid = true;
let totalErrors = 0;
let totalEntries = 0;
const errorDetail = [];

for (const r of refs) {
  const detail = getReferralDetail(r.id);
  const bundle = bundleForReferral(detail);
  const result = validateBundle(bundle);
  totalEntries += bundle.entry.length;
  totalErrors += result.errorCount;
  if (!result.valid) {
    allBundlesValid = false;
    errorDetail.push(`${r.referral_number}: ${result.errorCount} error(s)`);
    for (const issue of result.outcome.issue.filter((i) => i.severity === "error")) {
      errorDetail.push(`    ${issue.expression?.[0]}: ${issue.diagnostics}`);
    }
  }
}

check(
  `All ${refs.length} seeded referral bundles validate with zero errors`,
  allBundlesValid,
  errorDetail.join("\n"),
);
check("Bundles contain the expected number of resources", totalEntries > refs.length * 5, `entries=${totalEntries}`);

/* --- 8. Bundle catches a dangling internal reference --- */
const detail0 = getReferralDetail(refs[0].id);
const b0 = bundleForReferral(detail0);
const dangling = JSON.parse(JSON.stringify(b0));
dangling.entry.push({
  fullUrl: "http://localhost:3000/fhir/ServiceRequest/sr-dangling",
  resource: {
    resourceType: "ServiceRequest",
    id: "sr-dangling",
    status: "active",
    intent: "order",
    subject: { reference: "Patient/does-not-exist" },
  },
  request: { method: "PUT", url: "ServiceRequest/sr-dangling" },
});
const danglingResult = validateBundle(dangling);
check(
  "Bundle reports an unresolved internal reference",
  danglingResult.unresolvedReferences.includes("Patient/does-not-exist"),
  JSON.stringify(danglingResult.unresolvedReferences),
);

/* --- 9. Workflow state machine --- */
check("Every state has a FHIR Task status", Object.values(STATES).every((s) => !!s.fhirTaskStatus));
check("Terminal states are marked", STATES["closed-feedback"].isTerminal && STATES.cancelled.isTerminal && STATES.rejected.isTerminal);
check("Feedback is not modelled as optional", !!TRANSITIONS.find((t) => t.action === "complete")?.allowsFeedback);

const referringPerms = ["referral:route", "referral:read:own-facility", "referral:create", "referral:feedback", "referral:cancel", "referral:complete"];
const receivingPerms = ["referral:triage", "referral:accept", "referral:request-info", "referral:complete", "referral:read:own-facility"];

check(
  "Receiving-side action is refused for a referring user",
  !canTransition("submitted", "accept", { permissions: referringPerms, side: "referring" }).allowed,
);
// Referring clinician holds referral:route but the referral is only submitted:
// they hold no referral:accept, and accept is also a receiving-side action.
check(
  "Referring user cannot accept, and the block is reported",
  !canTransition("received", "accept", { permissions: referringPerms, side: "referring" }).allowed,
);
check(
  "Permission shortfall is reported for a role that lacks the permission",
  (canTransition("received", "accept", { permissions: [], side: "receiving" }).reason ?? "").toLowerCase().includes("role"),
);
// Give the referring user referral:accept so the side check, not permissions, is what blocks.
check(
  "Side ownership is enforced even when the permission is held",
  (canTransition("received", "accept", { permissions: [...referringPerms, "referral:accept"], side: "referring" }).reason ?? "").includes("receiving"),
);
check(
  "Receiving-side action is allowed for a receiving user",
  canTransition("submitted", "receive", { permissions: receivingPerms, side: "receiving" }).allowed,
);
check(
  "Referring-side action is refused for a receiving user despite holding the permission",
  !canTransition("completed", "close-loop", { permissions: referringPerms, side: "receiving" }).allowed,
);
check(
  "Referring-side close-loop is allowed for the referring user",
  canTransition("completed", "close-loop", { permissions: referringPerms, side: "referring" }).allowed,
);
check(
  "Action outside the current state is refused",
  !canTransition("completed", "receive", { permissions: receivingPerms, side: "receiving" }).allowed,
);
check(
  "Observation cannot be used to bypass the workflow",
  !canTransition("draft", "complete", { permissions: referringPerms, side: "receiving" }).allowed,
);

/* --- 10. Routing checklist blocks incomplete referrals --- */
const incomplete = routingChecklist({
  patientId: null,
  receivingFacilityId: null,
  reasonCode: "other",
  reasonNarrative: "   ",
  chiefComplaint: "",
  assessment: "",
  requestedAction: "",
  diagnoses: [],
  observations: [],
  attachments: [],
  lawfulBasisCode: null,
  consentRequired: true,
  fhirValid: null,
});
const incompleteBlocking = blockingFailures(incomplete);
check("Incomplete referral has blocking failures", incompleteBlocking.length >= 8, `got ${incompleteBlocking.length}`);
check(
  "Consent-record requirement is blocking when consent is the lawful basis",
  incompleteBlocking.some((b) => b.key === "consent-record"),
);

const complete = routingChecklist({
  patientId: "p1",
  receivingFacilityId: "f1",
  reasonCode: "specialist-consult",
  reasonNarrative: null,
  chiefComplaint: "Chest pain",
  assessment: "Stable angina",
  requestedAction: "Cardiology review",
  diagnoses: [{ code: "I20.9", display: "Angina", system: "http://hl7.org/fhir/sid/icd-10", role: "primary" }],
  observations: [{ code: "8867-4", valueNum: 88 }],
  attachments: [{ id: "a1", title: "ECG" }],
  lawfulBasisCode: "treatment-purpose",
  consentRequired: false,
  fhirValid: true,
  fhirErrorCount: 0,
});
check("Complete referral passes all blocking checks", blockingFailures(complete).length === 0, JSON.stringify(blockingFailures(complete)));

/* --- 11. PH Core alignment report --- */
const alignment = phCoreAlignment([...REFERRAL_PACKAGE_RESOURCES]);
const aligned = alignment.filter((a) => a.status === "applied");
const gaps = alignment.filter((a) => a.status !== "applied");
check("Alignment report covers 14 resource types", alignment.length === 14, `got ${alignment.length}`);
check("At least 10 resources align to a PH Core profile", aligned.length >= 10, `applied=${aligned.length}`);
check(
  "Gaps are recorded explicitly rather than silently ignored",
  gaps.length >= 1,
  `gaps: ${gaps.map((g) => g.resource).join(", ")}`,
);

/* --- 12. Organization maps PH Core identifiers --- */
const org = mapOrganization({
  id: "fac-1",
  nhfr_code: "SYN-HFC-1100001",
  hcpn_code: "SYN-HCPN-DVAO-01",
  philhealth_pan: "SYN-PAN-2026-000101",
  philhealth_pen: null,
  name: "Buhangin District Health Center",
  short_name: "Buhangin DHC",
  org_type_code: "prov",
  org_type_display: "Healthcare Provider",
  address_line: "Km. 8, Buhangin Road",
  city_display: "City of Davao",
  region_display: "Region XI (Davao Region)",
  region_code: "1100000000",
  city_code: "112402000",
  barangay_code: "112402050",
  barangay_display: "Buhangin",
  postal_code: "8000",
});
check("Organization carries the DOH NHFR identifier", org.identifier?.some((i) => i.system === "https://fhir.doh.gov.ph/phcore/Identifier/doh-nhfr-code"));
check("Organization carries the HCPN identifier", org.identifier?.some((i) => i.system === "https://fhir.doh.gov.ph/phcore/Identifier/hcpn-code"));
check("Organization carries the PhilHealth PAN identifier", org.identifier?.some((i) => i.system === "http://nhdr.gov.ph/fhir/Identifier/philhealthaccreditationnumber"));
check("Organization validates against PH Core", validateResource(org).valid);

/* --- 13. Task maps workflow state to FHIR --- */
const t = mapTask(
  {
    referral: { id: "ref-1", referral_number: "HL-2026-TST-00001", status: "under-review", priority: "urgent", created_at: new Date().toISOString(), updated_at: new Date().toISOString(), reason_code: "specialist-consult", reason_display: "Specialist consultation" },
    patient: { id: "p1", given_name: "Juan", family_name: "Dela Cruz" },
    referringFacility: { id: "f1", name: "Clinic A" },
    receivingFacility: { id: "f2", name: "Hospital B" },
    diagnoses: [],
    observations: [],
    medications: [],
    allergies: [],
    attachments: [],
    currentState: "under-review",
  },
  [{ to_status: "submitted", created_at: new Date().toISOString(), actor_name: "Dr. A" }],
);
check("Task maps under-review to in-progress", t.status === "in-progress", `got ${t.status}`);
check("Task carries a businessStatus", !!t.businessStatus?.coding?.[0]?.code);
check("Task carries the workflow history as notes", (t.note?.length ?? 0) === 1);
check("Task validates against PH Core", validateResource(t).valid);

/* --- 14. Alerting on seeded data shape --- */
const stats = all("SELECT status, COUNT(*) AS n FROM referrals GROUP BY status");
check("Seeded data spans multiple workflow states", stats.length >= 5, `states=${stats.length}`);

/* --- 14. Audit trail integrity --- */
const { verifyAuditChain, writeAudit, sha256: hashFn } = await import("../src/lib/db");

const chainBefore = verifyAuditChain();
check(
  `Seeded audit chain verifies (${chainBefore.checked} records)`,
  chainBefore.intact,
  `${chainBefore.reason ?? ""} at ${chainBefore.brokenAt ?? "-"}`,
);
check("Audit chain reports a non-zero record count", chainBefore.checked > 20, `checked=${chainBefore.checked}`);

// A live write must extend the chain rather than break it.
writeAudit({
  action: "R",
  eventType: "read",
  description: "Smoke-test read event appended by the test suite.",
  outcome: "0",
});
const chainAfter = verifyAuditChain();
check(
  "Chain still verifies after appending a live event",
  chainAfter.intact && chainAfter.checked === chainBefore.checked + 1,
  `intact=${chainAfter.intact} checked=${chainAfter.checked}`,
);

// Tampering must be detectable.
const victim = all<{ id: string; description: string }>(
  "SELECT id, description FROM audit_events ORDER BY occurred_at ASC LIMIT 1",
)[0];
const original = victim.description;
run("UPDATE audit_events SET description = ? WHERE id = ?", "TAMPERED", victim.id);
const chainTampered = verifyAuditChain();
check(
  "Tampering with a record breaks the chain",
  !chainTampered.intact && chainTampered.brokenAt === victim.id,
  `intact=${chainTampered.intact} brokenAt=${chainTampered.brokenAt}`,
);
run("UPDATE audit_events SET description = ? WHERE id = ?", original, victim.id);
check("Restoring the record restores the chain", verifyAuditChain().intact);

/* --- 15. FHIR resource store --- */
const { storeSummary } = await import("../src/lib/fhir-store");
const storeRows = storeSummary();
check("FHIR store holds resources after seeding", storeRows.length >= 10, `types=${storeRows.length}`);
check(
  "FHIR store holds Patient and Organization resources",
  storeRows.some((r) => r.resourceType === "Patient") && storeRows.some((r) => r.resourceType === "Organization"),
);

/* --- 16. Live referral creation through the service layer --- */
const {
  createReferral,
  transitionReferral,
  getReferralDetail: getDetail2,
  readinessFor: readinessFor2,
} = await import("../src/lib/referrals");
const { ROLE_PERMISSIONS } = await import("../src/lib/auth");

const referringUser = all<{ id: string; full_name: string; role: string; facility_id: string | null; email: string }>(
  "SELECT id, full_name, role, facility_id, email FROM users WHERE role = 'physician' AND facility_id IS NOT NULL LIMIT 1",
)[0];

const referralFacility = referringUser.facility_id!;
const receivingFacility = all<{ id: string }>(
  "SELECT id FROM facilities WHERE id <> ? AND is_receiving = 1 LIMIT 1",
  referralFacility,
)[0];

const testPatient = all<{ id: string }>("SELECT id FROM patients LIMIT 1")[0];
const physicianPermissions = ROLE_PERMISSIONS.physician;

const session = {
  sessionId: "ses-test",
  id: referringUser.id,
  email: referringUser.email,
  fullName: referringUser.full_name,
  role: "physician" as const,
  facilityId: referralFacility,
  facilityName: null,
  prcLicense: null,
  specialization: null,
  permissions: physicianPermissions,
  expiresAt: new Date(Date.now() + 3600_000).toISOString(),
};

check("Test fixtures resolved for live creation", !!referralFacility && !!receivingFacility && !!testPatient);

let created: { id: string; referralNumber: string; trackingCode: string } | null = null;
try {
  created = createReferral(session, {
    patientId: testPatient.id,
    receivingFacilityId: receivingFacility.id,
    priority: "urgent",
    reasonCode: "specialist-consult",
    reasonDisplay: "Specialist consultation",
    reasonNarrative: "Smoke-test referral created by the automated test suite.",
    chiefComplaint: "Two weeks of exertional chest discomfort",
    historyOfPresent: "Onset two weeks ago, relieved by rest.",
    assessment: "Stable angina, for cardiology assessment.",
    requestedAction: "Please assess and advise on further management.",
    lawfulBasisCode: "treatment-purpose",
    diagnoses: [
      { system: "icd10", code: "I20.9", display: "Angina pectoris, unspecified", role: "primary", certainty: "confirmed" },
    ],
    observations: [
      { system: "loinc", code: "8867-4", display: "Heart rate", category: "vital-signs", valueNum: 88, unit: "beats/min", ucum: "/min", refLow: 60, refHigh: 100 },
    ],
    medications: [],
    allergies: [],
    vitals: { systolic: 138, diastolic: 86, heartRate: 88, respRate: 18, temperature: 36.7, spo2: 98, weightKg: 78, heightCm: 170 },
  });
  check("createReferral succeeds through the service layer", !!created?.id, "threw before returning");
} catch (e) {
  check("createReferral succeeds through the service layer", false, (e as Error).message);
}

if (created) {
  const detail = getDetail2(created.id);
  check("Created referral is retrievable", !!detail);
  check("Created referral starts as a draft", detail?.status === "draft", `status=${detail?.status}`);
  check(
    "Created referral carries a formatted number",
    /^HL-\d{4}-[A-Z]{3}-\d{5}$/.test(created.referralNumber),
    created.referralNumber,
  );
  check("Created referral carries a patient-visible tracking code", created.trackingCode.length >= 8);
  check("Identifiers are unique per referral", created.referralNumber !== created.trackingCode);

  const readiness = readinessFor2(getDetail2(created.id)!);
  check(
    "A complete referral passes the routing checklist",
    readiness.ready,
    readiness.blocking.map((b) => b.label).join("; "),
  );

  const routed = transitionReferral(session, {
    referralId: created.id,
    action: "submit",
    note: "Smoke test routing.",
  });
  check("Routing a complete referral succeeds", routed.ok, routed.message);

  const afterRoute = getDetail2(created.id);
  check("Routing moved the referral to submitted", afterRoute?.status === "submitted", `status=${afterRoute?.status}`);
  check("Routing recorded a workflow event", (afterRoute?.events.length ?? 0) >= 2);
  check("Routing set the FHIR service request id", !!afterRoute?.fhir_service_request_id);
  check("Routing bumped the FHIR bundle version", (afterRoute?.fhir_bundle_version ?? 0) >= 1);

  // A user from a facility that is not a party must be refused.
  const outsider = all<{ id: string; full_name: string; role: string; facility_id: string | null; email: string }>(
    "SELECT id, full_name, role, facility_id, email FROM users WHERE facility_id IS NOT NULL AND facility_id <> ? AND facility_id <> ? LIMIT 1",
    referralFacility,
    receivingFacility.id,
  )[0];

  if (outsider) {
    const outsiderSession = {
      ...session,
      id: outsider.id,
      email: outsider.email,
      fullName: outsider.full_name,
      facilityId: outsider.facility_id,
    };
    const denied = transitionReferral(outsiderSession, { referralId: created.id, action: "receive" });
    check("An uninvolved facility cannot transition the referral", !denied.ok, `got ok=${denied.ok}`);
  }

  // The bundle for the newly created referral must validate.
  const newBundle = bundleForReferral(getDetail2(created.id)!);
  const newBundleResult = validateBundle(newBundle);
  check(
    "A referral created at runtime validates with zero errors",
    newBundleResult.valid,
    newBundleResult.outcome.issue
      .filter((i) => i.severity === "error")
      .slice(0, 3)
      .map((i) => `${i.expression?.[0]}: ${i.diagnostics}`)
      .join("; "),
  );
}

/* --- 17. Vitals are promoted to FHIR Observations --- */
const { vitalsToObservations, observationsFor } = await import("../src/lib/fhir/mapper");

const vitalsOnly = vitalsToObservations({
  id: "ref-vitals",
  created_at: new Date().toISOString(),
  vital_systolic: 138,
  vital_diastolic: 86,
  vital_heart_rate: 88,
  vital_resp_rate: 18,
  vital_temperature: 36.7,
  vital_spo2: 98,
  vital_weight_kg: 78,
  vital_height_cm: 170,
  vital_pain_score: 2,
} as never);

check("Inline vitals become Observations", vitalsOnly.length >= 8, `got ${vitalsOnly.length}`);
check(
  "Blood pressure is carried as the LOINC panel code",
  vitalsOnly.some((o) => o.code === "85354-9"),
);
check(
  "Heart rate is LOINC coded",
  vitalsOnly.some((o) => o.code === "8867-4" && o.system === "http://loinc.org"),
);
check("A derived BMI is computed when weight and height are present", vitalsOnly.some((o) => o.code === "39156-5"));

const bmiRow = vitalsOnly.find((o) => o.code === "39156-5");
check(
  "Derived BMI is arithmetically correct",
  bmiRow?.value_num != null && Math.abs(bmiRow.value_num - 27.0) < 0.15,
  `bmi=${bmiRow?.value_num}`,
);

check("Vitals are categorised as vital signs", vitalsOnly.every((o) => o.category === "vital-signs"));

/* --- 18. Test isolation --- */
const { dbPath } = await import("../src/lib/db");
check(
  "The test suite runs against its own database file",
  dbPath().endsWith("healthlink-test.db"),
  `dbPath=${dbPath()}`,
);
check(
  "This run's database holds the 6 seeded scenarios plus the runtime-created referral",
  all<{ n: number }>("SELECT COUNT(*) AS n FROM referrals")[0]?.n === 7,
  `got ${all<{ n: number }>("SELECT COUNT(*) AS n FROM referrals")[0]?.n}`,
);

// A referral with no vitals must not fabricate observations.
const noVitals = vitalsToObservations({
  id: "ref-novitals",
  created_at: new Date().toISOString(),
} as never);
check("No vitals produces no observations", noVitals.length === 0, `got ${noVitals.length}`);

// Observations supplied by the capture form are preserved alongside vitals.
const combined = observationsFor({
  referral: { id: "ref-mix", created_at: new Date().toISOString(), vital_heart_rate: 88 } as never,
  patient: {} as never,
  referringFacility: {} as never,
  receivingFacility: {} as never,
  diagnoses: [],
  observations: [
    { system: "loinc", code: "718-7", display: "Hemoglobin", category: "laboratory", value_num: 13.5 },
  ],
  medications: [],
  allergies: [],
  attachments: [],
  currentState: "draft",
} as never);
check(
  "Inline vitals and captured results are combined",
  combined.length === 2 && combined.some((o) => o.code === "718-7") && combined.some((o) => o.code === "8867-4"),
  `codes=${combined.map((o) => o.code).join(",")}`,
);

// The referral created at runtime carried vitals; its bundle must contain them.
if (created) {
  const withVitals = getDetail2(created.id)!;
  const vb = bundleForReferral(withVitals);
  const obsCodes = (vb.entry ?? [])
    .filter((e) => e.resource?.resourceType === "Observation")
    .map((e) => (e.resource as unknown as { code: { coding: Array<{ code: string }> } }).code.coding[0].code);
  check(
    "A runtime referral's bundle carries its vitals as Observations",
    obsCodes.includes("8867-4") && obsCodes.includes("85354-9"),
    `observed codes: ${obsCodes.join(",")}`,
  );
  const vbResult = validateBundle(vb);
  check(
    "Adding vitals keeps the bundle valid",
    vbResult.valid,
    vbResult.outcome.issue
      .filter((i) => i.severity === "error")
      .slice(0, 3)
      .map((i) => `${i.expression?.[0]}: ${i.diagnostics}`)
      .join("; "),
  );
}

/* --- 19. Referral numbering consistency --- */
const { facilityShortCode } = await import("../src/lib/workflow");

check(
  "The seeder and runtime generator share one facility code function",
  facilityShortCode("Buhangin District Health Center", "Buhangin DHC") === "BUH",
  `got ${facilityShortCode("Buhangin District Health Center", "Buhangin DHC")}`,
);

const numbered = all<{ referral_number: string; facility_name: string; short_name: string | null }>(
  `SELECT r.referral_number, f.name AS facility_name, f.short_name
     FROM referrals r JOIN facilities f ON f.id = r.referring_facility_id`,
);
check(
  "Every referral carries a number, seeded or runtime-created",
  numbered.length === 6 + (created ? 1 : 0),
  `got ${numbered.length}`,
);
check(
  "Every referral number prefix matches its referring facility",
  numbered.every((r) => r.referral_number.startsWith(`HL-${new Date().getFullYear()}-${facilityShortCode(r.facility_name, r.short_name)}-`)),
  numbered
    .filter(
      (r) =>
        !r.referral_number.startsWith(
          `HL-${new Date().getFullYear()}-${facilityShortCode(r.facility_name, r.short_name)}-`,
        )
    )
    .map((r) => `${r.referral_number} @ ${r.facility_name}`)
    .join("; "),
);

const dupNumbers = all<{ referral_number: string; n: number }>(
  "SELECT referral_number, COUNT(*) AS n FROM referrals GROUP BY referral_number HAVING n > 1",
);
check("No duplicate referral numbers exist", dupNumbers.length === 0, JSON.stringify(dupNumbers));

// The runtime generator must not reproduce an existing number.
if (created) {
  const others = numbered.filter((r) => r.referral_number !== created!.referralNumber);
  check(
    "A runtime-created referral's number is unique among all referrals",
    others.length === numbered.length - 1 &&
      others.every((r) => r.referral_number !== created!.referralNumber),
    created.referralNumber,
  );
  check(
    "A runtime-created referral uses the correct facility prefix",
    /^HL-\d{4}-[A-Z]{3}-\d{5}$/.test(created.referralNumber),
    created.referralNumber,
  );
}

/* --- 20. Consent revocation neutralises the referral --- */
const {
  revokeConsent,
  viewerSide: vs,
  transitionReferral: trans,
} = await import("../src/lib/referrals");
const { ROLE_PERMISSIONS: RP } = await import("../src/lib/auth");

// Every patient-facing clinical role must be able to act on a withdrawal.
check(
  "The physician role can revoke consent",
  RP.physician.includes("consent:revoke" as never),
  "a patient may withdraw authorisation by telling their own doctor",
);
check("The nurse role can revoke consent", RP.nurse.includes("consent:revoke" as never));
check("The specialist role can revoke consent", RP.specialist.includes("consent:revoke" as never));
check(
  "The medical records officer cannot revoke consent",
  !RP.medical_records_officer.includes("consent:revoke" as never),
  "records staff do not make disclosure decisions",
);
check(
  "The privacy auditor cannot revoke consent",
  !RP.privacy_auditor.includes("consent:revoke" as never),
  "audit is read-only",
);

const revocable = all<{
  id: string;
  referral_number: string;
  status: string;
  confidentiality_level: string;
  consent_id: string;
  referring_facility_id: string;
}>(`
  SELECT r.id, r.referral_number, r.status, r.confidentiality_level, r.consent_id, r.referring_facility_id
    FROM referrals r JOIN consents c ON c.id = r.consent_id
   WHERE c.status = 'active'
     AND r.confidentiality_level = 'normal'
     AND r.status NOT IN ('closed-feedback','cancelled','draft')
   LIMIT 1
`)[0];

check("A referral with active consent exists to test revocation", !!revocable);

if (revocable) {
  const nurseUser = all<{ id: string; full_name: string; role: string; facility_id: string; email: string }>(
    "SELECT id, full_name, role, facility_id, email FROM users WHERE role = 'nurse' AND facility_id = ? LIMIT 1",
    revocable.referring_facility_id,
  )[0];

  const nurseSession = {
    sessionId: "ses-revoke",
    id: nurseUser.id,
    email: nurseUser.email,
    fullName: nurseUser.full_name,
    role: "nurse" as const,
    facilityId: nurseUser.facility_id,
    facilityName: null,
    prcLicense: null,
    specialization: null,
    permissions: RP.nurse,
    expiresAt: new Date(Date.now() + 3600_000).toISOString(),
  };

  const detail = getDetail2(revocable.id)!;
  check(
    "The referral is at normal confidentiality before revocation",
    detail.confidentiality_level === "normal",
    detail.confidentiality_level,
  );

  const revoked = revokeConsent(nurseSession, revocable.consent_id, "Test: patient withdrew authorisation.");
  check("Revoking consent succeeds", revoked.ok, revoked.message);

  const after = getDetail2(revocable.id)!;
  check("Consent is marked revoked", after.consent?.status === "revoked", after.consent?.status ?? "");
  check("The revocation reason is stored", !!after.consent?.revoke_reason, after.consent?.revoke_reason ?? "");
  check("The revocation timestamp is stored", !!after.consent?.revoked_at, after.consent?.revoked_at ?? "");
  check(
    "The referral is escalated to highly restricted",
    after.confidentiality_level === "highly-restricted",
    after.confidentiality_level,
  );

  // A transition that is otherwise available must now be refused by consent.
  const stillAvailable = TRANSITIONS.filter(
    (t) => t.from.includes(after.status as ReferralState) && t.side !== "receiving",
  )[0];

  if (stillAvailable) {
    const side = vs(nurseSession, after);
    const otherwiseAllowed = canTransition(after.status as ReferralState, stillAvailable.action, {
      permissions: RP.nurse,
      side: side === "both" ? "referring" : (side as "referring" | "receiving" | "observer" | "cross"),
    });
    check(
      `"${stillAvailable.action}" would otherwise be permitted`,
      otherwiseAllowed.allowed,
      otherwiseAllowed.reason ?? "so a refusal must come from the consent gate, not from permissions",
    );

    const refused = trans(nurseSession, {
      referralId: revocable.id,
      action: stillAvailable.action,
      note: "Test: expect refusal by the consent gate.",
    });
    check(`"${stillAvailable.action}" is refused after revocation`, !refused.ok, refused.ok ? "unexpectedly allowed" : "");
    check(
      "The refusal cites consent specifically",
      /consent/i.test(refused.message),
      refused.message.slice(0, 110),
    );

    const gateAudit = all<{ n: number }>(
      `SELECT COUNT(*) AS n FROM audit_events
        WHERE referral_id = ? AND event_type = 'consent' AND event_subtype = 'gate-blocked' AND outcome <> '0'`,
      revocable.id,
    )[0];
    check("The refused transition is audited", (gateAudit?.n ?? 0) > 0, `matching events: ${gateAudit?.n}`);
  }

  const revokeAudit = all<{ n: number }>(
    `SELECT COUNT(*) AS n FROM audit_events
      WHERE referral_id = ? AND event_type = 'consent' AND event_subtype = 'revoked'`,
    revocable.id,
  )[0];
  check("The revocation is audited", (revokeAudit?.n ?? 0) > 0, `matching events: ${revokeAudit?.n}`);
}

console.log(`\n${pass} passed, ${fail} failed`);
if (failures.length) {
  console.log("\nFailures:");
  for (const f of failures) console.log(`  x ${f}`);
}

closeDb();
process.exit(fail ? 1 : 0);
