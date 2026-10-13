/**
 * Dump the current demo state so a walkthrough script matches reality.
 */
import { all, get, verifyAuditChain } from "../src/lib/db";

const referrals = all<{
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
const users = all<{ email: string; full_name: string; role: string; facility_name: string | null }>(
  `SELECT u.email, u.full_name, u.role, f.name AS facility_name
     FROM users u LEFT JOIN facilities f ON f.id = u.facility_id
    ORDER BY u.role, u.email`,
);
for (const u of users) {
  console.log(`  ${u.role.padEnd(22)} ${u.email.padEnd(38)} ${u.facility_name ?? "network"}`);
}

console.log(`\nAUDIT: ${get<{ n: number }>("SELECT COUNT(*) AS n FROM audit_events")?.n} events`);
const chain = verifyAuditChain();
console.log(`AUDIT CHAIN: ${chain.intact ? "intact" : "BROKEN"} (${chain.checked} records)`);

console.log("\nMESSAGES\n");
const msgs = all<{ referral_number: string; kind: string; subject: string | null }>(
  `SELECT r.referral_number, m.kind, m.subject
     FROM referral_messages m JOIN referrals r ON r.id = m.referral_id
    ORDER BY m.created_at`,
);
for (const m of msgs) console.log(`  ${m.referral_number}  ${m.kind}  ${m.subject ?? ""}`);
