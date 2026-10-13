/**
 * Verify the Postgres backend end to end.
 *
 * Runs the full seed against the database in DATABASE_URL (Neon), then asserts
 * the things that could silently break in a dialect port:
 *
 *   - the schema creates and the seed completes
 *   - the audit hash chain verifies (ordering, the thing rowid used to provide)
 *   - reports arithmetic (julianday replacement) returns sensible numbers
 *   - JSON field extraction (json_extract replacement) works
 *   - the FHIR store version bump works
 *
 * Usage: HEALTHLINK_DB unset, DATABASE_URL set. Loaded from .env.local.
 */
import { readFileSync } from "node:fs";

// Load .env.local so DATABASE_URL is available.
try {
  for (const line of readFileSync(".env.local", "utf8").split("\n")) {
    const m = line.match(/^([A-Z_]+)=(.*)$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
  }
} catch {
  /* no .env.local */
}

const { migrate, dialect, closeDb, all, get, run, verifyAuditChain } = await import("../src/lib/db");
const { seed } = await import("../src/lib/seed");
const { dashboardStats, listReferrals, getReferralDetail, createReferral, transitionReferral, trackReferral } =
  await import("../src/lib/referrals");
const { storeSummary } = await import("../src/lib/fhir-store");
const { jsonField } = await import("../src/lib/dialect");
const { ROLE_PERMISSIONS } = await import("../src/lib/auth");

const results: string[] = [];
const check = (label: string, ok: boolean, detail = "") =>
  results.push(`${ok ? "PASS" : "FAIL"}  ${label}${detail ? ` — ${detail}` : ""}`);

console.log(`dialect: ${dialect()}`);
if (dialect() !== "postgres") {
  console.error("DATABASE_URL is not set, so this would test SQLite. Aborting.");
  process.exit(1);
}

console.log("migrating…");
await migrate();

console.log("seeding…");
const summary = await seed({ reset: true });
console.log(
  `  ${summary.facilities} facilities, ${summary.users} users, ${summary.patients} patients, ${summary.referrals} referrals, ${summary.auditEvents} audit events`,
);

check("Schema created and seed completed", summary.facilities === 6 && summary.referrals === 6);
check("Audit events written", summary.auditEvents >= 30, `${summary.auditEvents}`);

/* --- Audit chain: the critical one --- */
const chain = await verifyAuditChain();
check(
  `Audit hash chain verifies on Postgres (${chain.checked} records)`,
  chain.intact,
  chain.reason ?? "",
);

// Tamper detection must still work.
const victim = (await all<{ id: string; description: string }>(
  "SELECT id, description FROM audit_events ORDER BY seq ASC LIMIT 1",
))[0];
await run("UPDATE audit_events SET description = ? WHERE id = ?", "TAMPERED", victim.id);
const tampered = await verifyAuditChain();
check("Tampering is detected on Postgres", !tampered.intact && tampered.brokenAt === victim.id);
await run("UPDATE audit_events SET description = ? WHERE id = ?", victim.description, victim.id);
check("Restoring the record restores the chain", (await verifyAuditChain()).intact);

/* --- Ordering: two events in the same millisecond must be ordered by seq --- */
const beforeCount = (await get<{ n: number }>("SELECT COUNT(*)::int AS n FROM audit_events"))!.n;
const { writeAudit } = await import("../src/lib/db");
await writeAudit({ action: "R", eventType: "read", description: "Same-millisecond probe A.", outcome: "0" });
await writeAudit({ action: "R", eventType: "read", description: "Same-millisecond probe B.", outcome: "0" });
const afterCount = (await get<{ n: number }>("SELECT COUNT(*)::int AS n FROM audit_events"))!.n;
check("Two writes appended", afterCount === beforeCount + 2, `${beforeCount} -> ${afterCount}`);
check("Chain still verifies after consecutive writes", (await verifyAuditChain()).intact);

const seqs = await all<{ seq: number }>("SELECT seq FROM audit_events ORDER BY seq ASC");
const seqValues = seqs.map((s) => Number(s.seq));
check(
  "Sequence numbers are strictly increasing with no duplicates",
  seqValues.every((v, i) => i === 0 || v > seqValues[i - 1]),
);

/* --- Report arithmetic (julianday replacement) --- */
const session = {
  sessionId: "ses-pg",
  id: "usr-pg",
  email: "pg@example.ph",
  fullName: "Postgres Probe",
  role: "hie_admin" as const,
  facilityId: null,
  facilityName: null,
  prcLicense: null,
  specialization: null,
  permissions: ROLE_PERMISSIONS.hie_admin,
  expiresAt: new Date(Date.now() + 3_600_000).toISOString(),
};

const stats = await dashboardStats(session);
check("dashboardStats runs without SQL errors", typeof stats.totalReferrals === "number");
check(
  "Turnaround arithmetic yields a finite number or null",
  stats.medianTurnaroundHours === null || Number.isFinite(stats.medianTurnaroundHours),
  `value=${stats.medianTurnaroundHours}`,
);
check(
  "Time-to-accept arithmetic yields a finite number or null",
  stats.avgTimeToAcceptHours === null || Number.isFinite(stats.avgTimeToAcceptHours),
  `value=${stats.avgTimeToAcceptHours}`,
);

/* --- List and search --- */
const list = await listReferrals(session, { limit: 10 });
// Drafts are excluded by default, and the seeded set contains exactly one draft,
// so an unfiltered list returns 5 of the 6 scenarios.
check("listReferrals returns the non-draft referrals", list.rows.length === 5, `${list.rows.length}`);
check(
  "listReferrals can include drafts when asked",
  (await listReferrals(session, { limit: 10, includeDrafts: true })).rows.length === 6,
);
check("Count query returns a number, not a bigint string", typeof list.total === "number", typeof list.total);

const searched = await listReferrals(session, { search: "HL-2026", limit: 10 });
check("LIKE search works on Postgres", searched.rows.length > 0, `${searched.rows.length} matched`);

/* --- FHIR store: JSON extraction and version bump --- */
const detail = (await getReferralDetail(list.rows[0].id))!;
const { persistReferralBundle } = await import("../src/lib/fhir-store");
const { mappingInputFor } = await import("../src/lib/referrals");

// The seed already materialised the FHIR store, so the first explicit persist
// here bumps the version rather than creating it. What matters is that the
// version increments by exactly one, which proves jsonField() reads the stored
// version back correctly — a broken extraction would reset it to 1 each time.
const vBefore = (await get<{ v: number | null }>(
  `SELECT MAX(${jsonField("content", "meta.versionId", "int")}) AS v FROM fhir_resources WHERE referral_id = ?`,
  detail.id,
))?.v;
check("A stored version can be read back (JSON extraction works)", typeof vBefore === "number" && vBefore >= 1, `v${vBefore}`);

const first = await persistReferralBundle(detail.id, await mappingInputFor(detail));
check("FHIR store persists a bundle", first.stored > 10, `${first.stored} resources`);
check(
  "Persist increments the stored version by exactly one",
  first.version === (vBefore ?? 0) + 1,
  `${vBefore} -> ${first.version}`,
);

const second = await persistReferralBundle(detail.id, await mappingInputFor(detail));
check(
  "Version increments again on re-persist",
  second.version === first.version + 1,
  `v${first.version} -> v${second.version} — a broken jsonField() would reset this to 1`,
);

const storeRows = await storeSummary();
check("storeSummary returns typed counts", storeRows.length > 5, `${storeRows.length} types`);

/* --- Live referral lifecycle --- */
const physician = (await get<{ id: string; full_name: string; role: string; facility_id: string; email: string }>(
  "SELECT id, full_name, role, facility_id, email FROM users WHERE email = 'physician@buhangin.example.ph'",
))!;
const receiving = (await get<{ id: string }>(
  "SELECT id FROM facilities WHERE is_receiving = 1 AND id <> ? LIMIT 1",
  physician.facility_id,
))!;
const patient = (await get<{ id: string }>("SELECT id FROM patients LIMIT 1"))!;

const docSession = {
  ...session,
  id: physician.id,
  email: physician.email,
  fullName: physician.full_name,
  role: "physician" as const,
  facilityId: physician.facility_id,
  permissions: ROLE_PERMISSIONS.physician,
};

const created = await createReferral(docSession, {
  patientId: patient.id,
  receivingFacilityId: receiving.id,
  priority: "urgent",
  reasonCode: "specialist-consult",
  reasonDisplay: "Specialist consultation",
  reasonNarrative: "Postgres port verification.",
  chiefComplaint: "Chest discomfort on exertion",
  assessment: "Stable angina for assessment.",
  requestedAction: "Please review and advise.",
  lawfulBasisCode: "treatment-purpose",
  diagnoses: [{ system: "icd10", code: "I20.9", display: "Angina pectoris, unspecified", role: "primary" }],
  observations: [],
  medications: [],
  allergies: [],
  vitals: { systolic: 138, diastolic: 86, heartRate: 88 },
});

check("createReferral succeeds on Postgres", !!created.id, created.referralNumber);

const routed = await transitionReferral(docSession, { referralId: created.id, action: "submit", note: "Probe." });
check("Routing succeeds on Postgres", routed.ok, routed.message);

const after = (await getReferralDetail(created.id))!;
check("Status advanced to submitted", after.status === "submitted", after.status);
check("Workflow event recorded", after.events.length >= 2, `${after.events.length}`);
check("Chain verifies after a live transition", (await verifyAuditChain()).intact);

/* --- Public tracking lookup --- */
const tracked = await trackReferral(created.referralNumber, created.trackingCode);
check("Public tracking lookup resolves", !!tracked, "wrong code or number would return null");
check("Tracking rejects a wrong code", !(await trackReferral(created.referralNumber, "WRONG-CODE1")));

/* --- Output --- */
console.log(`\n${results.join("\n")}`);
const failed = results.filter((r) => r.startsWith("FAIL")).length;
console.log(`\n${results.length - failed} passed, ${failed} failed`);

await closeDb();
process.exit(failed ? 1 : 0);
