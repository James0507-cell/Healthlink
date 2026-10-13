/**
 * Dump the current demo state so a walkthrough script matches reality.
 *
 * Reads whichever backend DATABASE_URL selects, loading `.env.local` first, so
 * this inspects the same database that `npm run dev` uses. Without loading it,
 * a developer with Postgres configured would silently be shown a stale SQLite
 * file — which is exactly the confusion this script exists to prevent.
 */
import { readFileSync } from "node:fs";

try {
  for (const line of readFileSync(".env.local", "utf8").split("\n")) {
    const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
    if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2].trim();
  }
} catch {
  /* no .env.local */
}

const { all, get, verifyAuditChain, dialect, dbPath, closeDb } = await import("../src/lib/db");

console.log(`Backend: ${dialect()}${dialect() === "sqlite" ? ` (${dbPath()})` : ""}\n`);

const referrals = await all<{
  referral_number: string;
  tracking_code: string;
  status: string;
  priority: string;
  reason_display: string;
  patient_name: string;
  referring: string;
  receiving: string;
  created_at: string;
  status_updated_at: string;
}>(
  `SELECT r.referral_number, r.tracking_code, r.status, r.priority, r.reason_display,
          (p.given_name || ' ' || p.family_name) AS patient_name,
          rf.name AS referring, rc.name AS receiving,
          r.created_at, r.status_updated_at
     FROM referrals r
     JOIN patients p ON p.id = r.patient_id
     JOIN facilities rf ON rf.id = r.referring_facility_id
     JOIN facilities rc ON rc.id = r.receiving_facility_id
    WHERE r.deleted_at IS NULL
    ORDER BY r.created_at`,
);

console.log(`REFERRALS (${referrals.length})\n`);
for (const r of referrals) {
  console.log(`${r.referral_number}  [${r.status}]  ${r.priority}`);
  console.log(`  patient : ${r.patient_name}`);
  console.log(`  reason  : ${r.reason_display}`);
  console.log(`  route   : ${r.referring}  ->  ${r.receiving}`);
  console.log(`  tracking: ${r.tracking_code}`);
  console.log();
}

console.log("USERS\n");
const users = await all<{ email: string; full_name: string; role: string; facility_name: string | null }>(
  `SELECT u.email, u.full_name, u.role, f.name AS facility_name
     FROM users u LEFT JOIN facilities f ON f.id = u.facility_id
    ORDER BY u.role, u.email`,
);
for (const u of users) {
  console.log(`  ${u.role.padEnd(22)} ${u.email.padEnd(38)} ${u.facility_name ?? "network"}`);
}

console.log(`\nAUDIT: ${(await get<{ n: number }>("SELECT COUNT(*) AS n FROM audit_events"))?.n} events`);
const chain = await verifyAuditChain();
console.log(`AUDIT CHAIN: ${chain.intact ? "intact" : "BROKEN"} (${chain.checked} records)`);

console.log("\nMESSAGES\n");
const msgs = await all<{ referral_number: string; kind: string; subject: string | null }>(
  `SELECT r.referral_number, m.kind, m.subject
     FROM referral_messages m JOIN referrals r ON r.id = m.referral_id
    ORDER BY m.created_at`,
);
for (const m of msgs) console.log(`  ${m.referral_number}  ${m.kind}  ${m.subject ?? ""}`);

await closeDb();
