/**
 * Seed / reset the HealthLink database.
 *
 * Usage:
 *   npm run db:reset     # delete and re-seed with synthetic demo data
 *   node scripts/db-reset.mjs
 */

import { resetAndSeed, seed, DEMO_PASSWORD, FACILITIES, USERS, PATIENTS, SCENARIOS } from "../src/lib/seed.ts";
import { migrate } from "../src/lib/db.ts";

const reset = process.argv.includes("--reset") || true;

console.log("HealthLink - database setup\n");

migrate();
console.log("[1/2] Schema created (or already present).");

const summary = reset ? resetAndSeed() : seed();

console.log("[2/2] Synthetic demo data loaded.\n");
console.log("  Facilities        :", summary.facilities);
console.log("  Users             :", summary.users);
console.log("  Patients          :", summary.patients);
console.log("  Consent records   :", summary.consents);
console.log("  Referrals         :", summary.referrals);
console.log("  Workflow events   :", summary.events);
console.log("  Feedback messages :", summary.messages);
console.log("  Observations      :", summary.observations);
console.log("  Audit events      :", summary.auditEvents);

console.log("\nDemo accounts (password for all:", DEMO_PASSWORD, ")");
console.log("  Referring    physician@buhangin.example.ph    Dr. Antonio Reyes (family medicine)");
console.log("  Referring    nurse@buhangin.example.ph        Nurse Maria Dela Cruz");
console.log("  Referring    coordinator@buhangin.example.ph  Josefina Bautista (referral coordinator)");
console.log("  Referring    physician@agdao.example.ph       Dr. Liza Santos");
console.log("  Referring    physician@talomo.example.ph      Dr. Ramon Villanueva");
console.log("  Receiving    specialist@synapse.example.ph    Dr. Emmanuel Cruz (cardiology)");
console.log("  Receiving    obgyn@synapse.example.ph         Dr. Patricia Navarro (OB-GYN)");
console.log("  Receiving    nurse@synapse.example.ph         Nurse Bernadette Tan");
console.log("  Receiving    specialist@dmgmc.example.ph      Dr. Amina Abdul (pulmonology)");
console.log("  Receiving    internist@dmgmc.example.ph       Dr. Fernando Gonzales");
console.log("  Governance   admin@healthlink.example.ph      HIE administrator");
console.log("  Governance   auditor@healthlink.example.ph    Privacy / compliance auditor");
console.log("\nAll data is synthetic. No real patient or provider information is used.");
