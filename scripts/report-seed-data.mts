/**
 * Report exactly what synthetic data the seeder defines.
 * Reads the committed file so the count reflects what is in the repository.
 */
import { readFileSync } from "node:fs";

const src = readFileSync("src/lib/seed.ts", "utf8");

const count = (re: RegExp) => (src.match(re) || []).length;
const distinct = (re: RegExp) => new Set([...src.matchAll(re)].map((m) => m[1]));

console.log("Seeded definitions in src/lib/seed.ts\n");

const rows: Array<[string, number]> = [
  ["Facilities", count(/nhfr: "SYN-HFC-/g)],
  ["Staff accounts", count(/email: "[a-z.]+@[a-z]+\.example\.ph"/g)],
  ["Patients", count(/mrn: "[A-Z]{3}-2026-/g)],
  ["Referral scenarios", count(/key: "ref-[a-z-]+",/g)],
  ["Clinical documents", count(/docTypeCode: "/g)],
  ["Timeline steps", count(/to: "(submitted|received|under-review|accepted|scheduled|in-progress|completed|closed-feedback|info-requested|draft)"/g)],
  ["Feedback messages", count(/kind: "(feedback|acknowledgment|information-request|information-supplied)"/g)],
  ["Hash-chained audit events", count(/^\s{4}\{ action: "/gm)],
];

for (const [label, n] of rows) console.log(`  ${String(n).padStart(4)}  ${label}`);

console.log("");

const icd = distinct(/system: "icd10", code: "([^"]+)"/g);
const loinc = distinct(/system: "loinc", code: "([^"]+)"/g);
const snomed = distinct(/system: "snomed", code: "([^"]+)"/g);

console.log(`  distinct diagnosis codes used : ${icd.size}  ${[...icd].join(", ")}`);
console.log(`  distinct observation codes    : ${loinc.size}  ${[...loinc].join(", ")}`);
console.log(`  distinct allergy codes        : ${snomed.size}  ${[...snomed].join(", ")}`);

console.log("\nBundled terminology subsets (available to pick from)\n");
const terminology = readFileSync("src/lib/fhir/terminology.ts", "utf8");
const cs = (name: string) => {
  const m = terminology.match(new RegExp(`export const ${name}[\\s\\S]*?\\n\\};`));
  return m ? (m[0].match(/^\s{2}"?[A-Z0-9][^":]*"?: \{ code:/gm) || []).length : 0;
};
console.log(`  ICD-10 codes : ${cs("ICD10")}`);
console.log(`  LOINC codes  : ${cs("LOINC")}`);
console.log(`  SNOMED codes : ${cs("SNOMED")}`);
console.log(`  Davao barangays (PSGC): ${(terminology.match(/\{ code: "1124\d+", display:/g) || []).length}`);
