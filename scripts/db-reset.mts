/**
 * Seed / reset the HealthLink database.
 *
 * Uses whichever backend DATABASE_URL selects:
 *   unset        -> SQLite at data/healthlink.db (or HEALTHLINK_DB)
 *   postgres://  -> that Postgres database
 *
 * `.env.local` is loaded when present, so `npm run db:reset` targets the same
 * database that `npm run dev` will use, without exporting anything by hand.
 *
 * Usage:
 *   npm run db:reset
 *
 * On SQLite this replaces the file. On Postgres it deletes and re-inserts the
 * demo rows, so the schema is left in place.
 */

import { readFileSync } from "node:fs";
import { existsSync, unlinkSync } from "node:fs";

// `--sqlite` forces SQLite even when DATABASE_URL is present. Useful for
// regenerating the local demo database without touching a deployed one.
const forceSqlite = process.argv.includes("--sqlite");

// Load .env.local before importing db.ts, so dialect() sees DATABASE_URL.
if (!forceSqlite) {
  try {
    for (const line of readFileSync(".env.local", "utf8").split("\n")) {
      const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
      if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2].trim();
    }
  } catch {
    /* no .env.local — SQLite will be used */
  }
} else {
  // Clear any inherited value so the dialect resolves to SQLite.
  delete process.env.DATABASE_URL;
}

const { migrate, dialect, dbPath, closeDb } = await import("../src/lib/db.ts");
const { resetAndSeed, DEMO_PASSWORD } = await import("../src/lib/seed.ts");

console.log("HealthLink - database setup\n");
console.log(`Backend: ${dialect()}${dialect() === "sqlite" ? ` (${dbPath()})` : ""}${forceSqlite ? " [forced]" : ""}`);

// A stale SQLite file would not have later columns (such as audit_events.seq).
// Removing it lets migrate() recreate the schema cleanly.
if (dialect() === "sqlite" && existsSync(dbPath())) {
  try {
    unlinkSync(dbPath());
    console.log("Removed the existing SQLite file so the schema is recreated.");
  } catch {
    /* locked; migrate() will handle what it can */
  }
}

await migrate();
console.log("[1/2] Schema created (or already present).");

const summary = await resetAndSeed();
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

await closeDb();
