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
console.log("\nReferral reason coverage check:");
const reasonMap: Record<string, string[]> = {
  "specialist-consult": ["I10", "I20", "E11.9", "J45"],
  "diagnostic-workup": ["R07.4", "R10.4", "R51"],
  "emergency-transfer": ["I21.9", "I63.9", "S06.0X0"],
  admission: ["J18.9", "A91", "K35.80"],
  "surgical-evaluation": ["K35.80", "K80.20", "N20.0"],
  "second-opinion": ["C50.9"],
  "continuity-of-care": ["I50.9", "N18.9"],
  "maternal-referral": ["O14.90", "O20.0"],
  rehabilitation: ["M17.9", "M54.5"],
};
for (const [reason, needed] of Object.entries(reasonMap)) {
  const missing = needed.filter((c) => !(c in ICD10));
  console.log(`  ${reason.padEnd(20)} ${missing.length ? `MISSING: ${missing.join(", ")}` : "covered"}`);
}
