import { ICD10, LOINC, SNOMED, REASON_FOR_REFERRAL } from "../src/lib/fhir/terminology";

const codes = Object.values(ICD10);
console.log(`ICD-10 entries: ${codes.length}`);
console.log(`LOINC entries: ${Object.keys(LOINC).length}`);
console.log(`SNOMED entries: ${Object.keys(SNOMED).length}`);
console.log(`Reason codes: ${REASON_FOR_REFERRAL.length}\n`);

const terms = [
  "angina", "chest", "dyspnoea", "asthma", "fracture", "wound", "infection", "sepsis",
  "anaemia", "hypothyroid", "epilep", "migraine", "vertigo", "cataract", "hernia",
  "abscess", "pneumonia", "diarrh", "gastritis", "ulcer", "arthrit", "back pain",
  "stroke", "heart failure", "renal", "kidney", "liver", "hepat", "thyroid",
  "labour", "pregnan", "diabet", "hypertens", "tubercul", "dengue", "cancer", "neoplasm",
];

console.log("Term coverage:");
for (const term of terms) {
  const hits = codes.filter((x) => x.display.toLowerCase().includes(term));
  console.log(`  ${term.padEnd(12)} ${hits.length ? hits.map((h) => h.code).join(", ") : "— NONE"}`);
}

// Which referral reasons have no plausible matching code?
//
// These lists name codes that the subset is expected to contain. The subset is
// deliberately small and curated (see AGENTS.md), so this is a coverage report:
// a gap here means a clinician could not pick a category-appropriate code, not
// that validation fails — a code outside the subset is only a warning.
console.log("\nReferral reason coverage check:");
const reasonMap: Record<string, string[]> = {
  // Angina and asthma are present in their clinically specific forms
  // (I20.0/I20.9, J45.909/J45.901); the three-character "I20"/"J45" header codes
  // are not in the subset, which is why they are named explicitly here.
  "specialist-consult": ["I10", "I20.9", "E11.9", "J45.909"],
  "diagnostic-workup": ["R07.4", "R10.4", "R51"],
  "emergency-transfer": ["I21.9", "I63.9", "S06.0X0"],
  admission: ["J18.9", "A91", "K35.80"],
  "surgical-evaluation": ["K35.80", "K80.20", "N20.0"],
  // The subset carries the site-specific breast neoplasm code rather than the
  // unspecified C50.9, which is the more useful choice for a second opinion.
  "second-opinion": ["C50.919", "C18.9"],
  "continuity-of-care": ["I50.9", "N18.9"],
  "maternal-referral": ["O14.90", "O20.0"],
  rehabilitation: ["M17.9", "M54.5"],
};

let gaps = 0;
for (const [reason, needed] of Object.entries(reasonMap)) {
  const missing = needed.filter((c) => !(c in ICD10));
  if (missing.length) gaps++;
  console.log(`  ${reason.padEnd(20)} ${missing.length ? `MISSING: ${missing.join(", ")}` : "covered"}`);
}

console.log(`\n${Object.keys(reasonMap).length - gaps} of ${Object.keys(reasonMap).length} referral reasons have full ICD-10 coverage.`);
if (gaps) {
  console.log("A gap is acceptable — the subset is intentionally small — but it should be a decision, not an oversight.");
}

