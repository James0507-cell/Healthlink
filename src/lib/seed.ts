/**
 * Synthetic demo dataset for the HealthLink prototype.
 *
 * EVERYTHING in this file is fabricated for demonstration. No real patient,
 * provider, or facility data is used, in line with the ethics and data privacy
 * commitments in Chapter 3 of the manuscript:
 *   - HealthLink demonstrates with "synthetic, de-identified, or minimum
 *     necessary information".
 *   - "Actual patient records will not be used for development or testing".
 *
 * Facility identifiers are prefixed `SYN-` and PSGC codes are the real public
 * geographic codes so that PH Core address mapping can be exercised. Facility
 * names are fictional composites, not the real Davao City institutions.
 */

import { hashPassword, newId, trackingCode, sha256, run, get, all, migrate, insert, writeAudit, exec } from "./db";
import { facilityShortCode, formatReferralNumber } from "./workflow";
import { persistReferralBundle } from "./fhir-store";
import { mappingInputFor, getReferralDetail } from "./referrals";

/* ------------------------------------------------------------------ */
/* Facilities                                                          */
/* ------------------------------------------------------------------ */

const REGION = { code: "1100000000", display: "Region XI (Davao Region)" };
const PROVINCE = { code: "1102400000", display: "Davao del Sur" };
const CITY = { code: "112402000", display: "City of Davao" };

interface SeedFacility {
  key: string;
  nhfr: string;
  hcpn: string;
  pan: string;
  pen: string | null;
  name: string;
  short: string;
  orgTypeCode: string;
  orgTypeDisplay: string;
  level: string;
  ownership: string;
  barangay: { code: string; display: string };
  addressLine: string;
  postal: string;
  phone: string;
  email: string;
  referring: number;
  receiving: number;
  services: string[];
}

const FACILITIES: SeedFacility[] = [
  {
    key: "bhc-buhangin",
    nhfr: "SYN-HFC-1100001",
    hcpn: "SYN-HCPN-DVAO-01",
    pan: "SYN-PAN-2026-000101",
    pen: null,
    name: "Buhangin District Health Center",
    short: "Buhangin DHC",
    orgTypeCode: "prov",
    orgTypeDisplay: "Healthcare Provider",
    level: "primary",
    ownership: "public",
    barangay: { code: "112402050", display: "Buhangin" },
    addressLine: "Km. 8, Buhangin Road",
    postal: "8000",
    phone: "+63-82-555-0101",
    email: "referrals@buhangin-dhc.example.ph",
    referring: 1,
    receiving: 0,
    services: ["Primary care consultation", "Maternal care", "Immunization", "DOTS (TB)", "Referral coordination"],
  },
  {
    key: "hc-agdao",
    nhfr: "SYN-HFC-1100002",
    hcpn: "SYN-HCPN-DVAO-01",
    pan: "SYN-PAN-2026-000102",
    pen: null,
    name: "Agdao Community Health Center",
    short: "Agdao CHC",
    orgTypeCode: "prov",
    orgTypeDisplay: "Healthcare Provider",
    level: "primary",
    ownership: "public",
    barangay: { code: "112402002", display: "Agdao" },
    addressLine: "Agdao Public Market Access Road",
    postal: "8000",
    phone: "+63-82-555-0102",
    email: "referrals@agdao-chc.example.ph",
    referring: 1,
    receiving: 0,
    services: ["Primary care consultation", "Prenatal care", "Family planning", "Referral coordination"],
  },
  {
    key: "clinic-talomo",
    nhfr: "SYN-HFC-1100003",
    hcpn: "SYN-HCPN-DVAO-02",
    pan: "SYN-PAN-2026-000103",
    pen: null,
    name: "Talomo Family Care Clinic",
    short: "Talomo FCC",
    orgTypeCode: "prov",
    orgTypeDisplay: "Healthcare Provider",
    level: "primary",
    ownership: "private",
    barangay: { code: "112402131", display: "Talomo" },
    addressLine: "Talomo Proper, McArthur Highway",
    postal: "8000",
    phone: "+63-82-555-0103",
    email: "clinic@talomo-familycare.example.ph",
    referring: 1,
    receiving: 0,
    services: ["Outpatient consultation", "Chronic disease management", "Laboratory referral"],
  },
  {
    key: "lst-tertiary",
    nhfr: "SYN-HFC-1100010",
    hcpn: "SYN-HCPN-DVAO-02",
    pan: "SYN-PAN-2026-000201",
    pen: "SYN-PEN-2026-0009",
    name: "Synapse Regional Medical Center",
    short: "SRMC",
    orgTypeCode: "prov",
    orgTypeDisplay: "Healthcare Provider",
    level: "tertiary",
    ownership: "private",
    barangay: { code: "112402100", display: "Matina Crossing" },
    addressLine: "Matina Crossing, Davao-Bukidnon Road",
    postal: "8000",
    phone: "+63-82-555-0200",
    email: "referrals@synapse-regional.example.ph",
    referring: 0,
    receiving: 1,
    services: [
      "Emergency department",
      "Internal medicine",
      "Cardiology",
      "Surgery",
      "Obstetrics and gynecology",
      "Pediatrics",
      "Intensive care",
      "CT and MRI",
    ],
  },
  {
    key: "gov-medical",
    nhfr: "SYN-HFC-1100011",
    hcpn: "SYN-HCPN-DVAO-01",
    pan: "SYN-PAN-2026-000202",
    pen: null,
    name: "Davao Metro Government Medical Center",
    short: "DMGMC",
    orgTypeCode: "prov",
    orgTypeDisplay: "Healthcare Provider",
    level: "tertiary",
    ownership: "public",
    barangay: { code: "112402074", display: "Ilang" },
    addressLine: "Ilang, Davao-Calinan Road",
    postal: "8000",
    phone: "+63-82-555-0201",
    email: "referrals@davao-metro-gmc.example.ph",
    referring: 0,
    receiving: 1,
    services: [
      "Emergency department",
      "Internal medicine",
      "Pulmonology (TB-DOTS)",
      "Infectious disease",
      "Obstetrics",
      "Dialysis",
      "Level II laboratory",
    ],
  },
  {
    key: "diag-davao",
    nhfr: "SYN-HFC-1100020",
    hcpn: "SYN-HCPN-DVAO-02",
    pan: "SYN-PAN-2026-000301",
    pen: "SYN-PEN-2026-0011",
    name: "Davao Diagnostic Imaging and Laboratory Center",
    short: "DDILC",
    orgTypeCode: "prov",
    orgTypeDisplay: "Healthcare Provider",
    level: "diagnostic",
    ownership: "private",
    barangay: { code: "112402128", display: "Tagluno" },
    addressLine: "J.P. Laurel Avenue",
    postal: "8000",
    phone: "+63-82-555-0300",
    email: "results@davao-diag.example.ph",
    referring: 0,
    receiving: 1,
    services: ["Clinical laboratory", "X-ray", "Ultrasound", "CT scan", "ECG"],
  },
];

/* ------------------------------------------------------------------ */
/* Reference values                                                    */
/* ------------------------------------------------------------------ */

const CIVIL_STATUS = ["single", "married", "widowed", "separated", "annulled", "unknown"];

const BLOOD_TYPES = ["A+", "A-", "B+", "B-", "AB+", "AB-", "O+", "O-"];

/**
 * All accounts share this password so a demo can switch roles quickly.
 * It is obvious and documented so it can never be mistaken for a real secret.
 */
export const DEMO_PASSWORD = "HealthLink!2026";

interface SeedUser {
  key: string;
  email: string;
  name: string;
  family: string;
  given: string;
  prefix: string | null;
  role: string;
  facility: string | null;
  prc: string | null;
  specialization: string | null;
  phone: string;
}

const USERS: SeedUser[] = [
  // --- Referring side: Buhangin District Health Center
  {
    key: "dr-reyes",
    email: "physician@buhangin.example.ph",
    name: "Dr. Antonio Reyes",
    family: "Reyes",
    given: "Antonio",
    prefix: "Dr.",
    role: "physician",
    facility: "bhc-buhangin",
    prc: "SYN-PRC-0104321",
    specialization: "Family Medicine",
    phone: "+63-917-555-1001",
  },
  {
    key: "nurse-dela-cruz",
    email: "nurse@buhangin.example.ph",
    name: "Nurse Maria Dela Cruz",
    family: "Dela Cruz",
    given: "Maria",
    prefix: null,
    role: "nurse",
    facility: "bhc-buhangin",
    prc: "SYN-PRC-0208871",
    specialization: "Public Health Nursing",
    phone: "+63-917-555-1002",
  },
  {
    key: "coord-buhangin",
    email: "coordinator@buhangin.example.ph",
    name: "Josefina Bautista",
    family: "Bautista",
    given: "Josefina",
    prefix: null,
    role: "referral_coordinator",
    facility: "bhc-buhangin",
    prc: null,
    specialization: "Referral Coordination",
    phone: "+63-917-555-1003",
  },

  // --- Referring side: Agdao Community Health Center
  {
    key: "dr-santos",
    email: "physician@agdao.example.ph",
    name: "Dr. Liza Santos",
    family: "Santos",
    given: "Liza",
    prefix: "Dr.",
    role: "physician",
    facility: "hc-agdao",
    prc: "SYN-PRC-0105567",
    specialization: "Internal Medicine",
    phone: "+63-917-555-1004",
  },
  {
    key: "nurse-agdao",
    email: "nurse@agdao.example.ph",
    name: "Nurse Carmela Lim",
    family: "Lim",
    given: "Carmela",
    prefix: null,
    role: "nurse",
    facility: "hc-agdao",
    prc: "SYN-PRC-0209902",
    specialization: "Maternal Care",
    phone: "+63-917-555-1005",
  },

  // --- Referring side: Talomo Family Care Clinic
  {
    key: "dr-villanueva",
    email: "physician@talomo.example.ph",
    name: "Dr. Ramon Villanueva",
    family: "Villanueva",
    given: "Ramon",
    prefix: "Dr.",
    role: "physician",
    facility: "clinic-talomo",
    prc: "SYN-PRC-0107712",
    specialization: "General Practice",
    phone: "+63-917-555-1006",
  },

  // --- Receiving side: Synapse Regional Medical Center
  {
    key: "dr-cruz",
    email: "specialist@synapse.example.ph",
    name: "Dr. Emmanuel Cruz",
    family: "Cruz",
    given: "Emmanuel",
    prefix: "Dr.",
    role: "specialist",
    facility: "lst-tertiary",
    prc: "SYN-PRC-0102233",
    specialization: "Cardiology",
    phone: "+63-917-555-2001",
  },
  {
    key: "dr-navarro",
    email: "obgyn@synapse.example.ph",
    name: "Dr. Patricia Navarro",
    family: "Navarro",
    given: "Patricia",
    prefix: "Dr.",
    role: "specialist",
    facility: "lst-tertiary",
    prc: "SYN-PRC-0102244",
    specialization: "Obstetrics and Gynecology",
    phone: "+63-917-555-2002",
  },
  {
    key: "nurse-synapse",
    email: "nurse@synapse.example.ph",
    name: "Nurse Bernadette Tan",
    family: "Tan",
    given: "Bernadette",
    prefix: null,
    role: "nurse",
    facility: "lst-tertiary",
    prc: "SYN-PRC-0203344",
    specialization: "Emergency Nursing",
    phone: "+63-917-555-2003",
  },
  {
    key: "coord-synapse",
    email: "coordinator@synapse.example.ph",
    name: "Roderick Manalo",
    family: "Manalo",
    given: "Roderick",
    prefix: null,
    role: "referral_coordinator",
    facility: "lst-tertiary",
    prc: null,
    specialization: "Referral Intake",
    phone: "+63-917-555-2004",
  },

  // --- Receiving side: Davao Metro Government Medical Center
  {
    key: "dr-abdul",
    email: "specialist@dmgmc.example.ph",
    name: "Dr. Amina Abdul",
    family: "Abdul",
    given: "Amina",
    prefix: "Dr.",
    role: "specialist",
    facility: "gov-medical",
    prc: "SYN-PRC-0103355",
    specialization: "Pulmonology",
    phone: "+63-917-555-3001",
  },
  {
    key: "dr-gonzales",
    email: "internist@dmgmc.example.ph",
    name: "Dr. Fernando Gonzales",
    family: "Gonzales",
    given: "Fernando",
    prefix: "Dr.",
    role: "physician",
    facility: "gov-medical",
    prc: "SYN-PRC-0103366",
    specialization: "Internal Medicine",
    phone: "+63-917-555-3002",
  },
  {
    key: "nurse-dmgmc",
    email: "nurse@dmgmc.example.ph",
    name: "Nurse Grace Villareal",
    family: "Villareal",
    given: "Grace",
    prefix: null,
    role: "nurse",
    facility: "gov-medical",
    prc: "SYN-PRC-0204455",
    specialization: "TB-DOTS",
    phone: "+63-917-555-3003",
  },

  // --- Diagnostic facility
  {
    key: "coord-diag",
    email: "coordinator@davaodiag.example.ph",
    name: "Ellen Marquez",
    family: "Marquez",
    given: "Ellen",
    prefix: null,
    role: "referral_coordinator",
    facility: "diag-davao",
    prc: null,
    specialization: "Diagnostic Intake",
    phone: "+63-917-555-4001",
  },

  // --- Governance roles
  {
    key: "admin-hie",
    email: "admin@healthlink.example.ph",
    name: "HIE Administrator",
    family: "Administrator",
    given: "HIE",
    prefix: null,
    role: "hie_admin",
    facility: null,
    prc: null,
    specialization: "HIE Operations",
    phone: "+63-917-555-9001",
  },
  {
    key: "auditor-privacy",
    email: "auditor@healthlink.example.ph",
    name: "Privacy Compliance Auditor",
    family: "Auditor",
    given: "Privacy",
    prefix: null,
    role: "privacy_auditor",
    facility: null,
    prc: null,
    specialization: "Data Privacy and Compliance",
    phone: "+63-917-555-9002",
  },
  {
    key: "records-buhangin",
    email: "records@buhangin.example.ph",
    name: "Marilou Ocampo",
    family: "Ocampo",
    given: "Marilou",
    prefix: null,
    role: "medical_records_officer",
    facility: "bhc-buhangin",
    prc: null,
    specialization: "Health Information Management",
    phone: "+63-917-555-1007",
  },
  {
    key: "admin-buhangin",
    email: "admin@buhangin.example.ph",
    name: "Ricardo Salazar",
    family: "Salazar",
    given: "Ricardo",
    prefix: null,
    role: "facility_admin",
    facility: "bhc-buhangin",
    prc: null,
    specialization: "Facility Administration",
    phone: "+63-917-555-1008",
  },
];

/* ------------------------------------------------------------------ */
/* Patients (synthetic)                                                */
/* ------------------------------------------------------------------ */

interface SeedPatient {
  key: string;
  mrn: string;
  philhealth: string;
  philsys: string | null;
  family: string;
  given: string;
  middle: string | null;
  sex: string;
  birth: string;
  civil: string;
  blood: string;
  barangay: { code: string; display: string };
  addressLine: string;
  phone: string;
  occupation: string;
  pwd?: { id: string };
}

const PATIENTS: SeedPatient[] = [
  {
    key: "p-abad",
    mrn: "BHC-2026-000101",
    philhealth: "SYN-63-120458901-3",
    philsys: "SYN-PSN-1101-2001-0001",
    family: "Abad",
    given: "Ernesto",
    middle: "Lumactod",
    sex: "male",
    birth: "1971-04-18",
    civil: "married",
    blood: "O+",
    barangay: { code: "112402050", display: "Buhangin" },
    addressLine: "Purok 4, Km. 9, Buhangin",
    phone: "+63-918-555-5001",
    occupation: "Tricycle driver",
  },
  {
    key: "p-maquiling",
    mrn: "BHC-2026-000102",
    philhealth: "SYN-63-120458902-1",
    philsys: null,
    family: "Maquiling",
    given: "Rosario",
    middle: "Bautista",
    sex: "female",
    birth: "1958-11-02",
    civil: "widowed",
    blood: "A+",
    barangay: { code: "112402050", display: "Buhangin" },
    addressLine: "Purok 2, Cabantian Road",
    phone: "+63-918-555-5002",
    occupation: "Retired teacher",
  },
  {
    key: "p-sarmiento",
    mrn: "AGC-2026-000211",
    philhealth: "SYN-63-220459101-7",
    philsys: "SYN-PSN-1102-1998-0032",
    family: "Sarmiento",
    given: "Jomar",
    middle: "Fuentes",
    sex: "male",
    birth: "1998-07-25",
    civil: "single",
    blood: "B+",
    barangay: { code: "112402002", display: "Agdao" },
    addressLine: "Purok 7, Agdao Proper",
    phone: "+63-918-555-5003",
    occupation: "Warehouse worker",
  },
  {
    key: "p-tan",
    mrn: "AGC-2026-000212",
    philhealth: "SYN-63-220459102-5",
    philsys: null,
    family: "Tan",
    given: "Michelle",
    middle: "Ang",
    sex: "female",
    birth: "1994-01-14",
    civil: "married",
    blood: "AB+",
    barangay: { code: "112402002", display: "Agdao" },
    addressLine: "Purok 3, Lapu-lapu Street",
    phone: "+63-918-555-5004",
    occupation: "Call center agent",
  },
  {
    key: "p-dela-pena",
    mrn: "TFC-2026-000331",
    philhealth: "SYN-63-330459301-9",
    philsys: "SYN-PSN-1103-1985-0047",
    family: "Dela Peña",
    given: "Rodel",
    middle: "Ibarra",
    sex: "male",
    birth: "1985-09-30",
    civil: "married",
    blood: "O-",
    barangay: { code: "112402131", display: "Talomo" },
    addressLine: "Block 5, Talomo Proper",
    phone: "+63-918-555-5005",
    occupation: "Construction foreman",
  },
  {
    key: "p-basilio",
    mrn: "TFC-2026-000332",
    philhealth: "SYN-63-330459302-7",
    philsys: null,
    family: "Basilio",
    given: "Anna Liza",
    middle: "Ramos",
    sex: "female",
    birth: "1996-03-08",
    civil: "married",
    blood: "A-",
    barangay: { code: "112402131", display: "Talomo" },
    addressLine: "Purok 9, Talomo River",
    phone: "+63-918-555-5006",
    occupation: "Sari-sari store owner",
  },
  {
    key: "p-fuentes",
    mrn: "BHC-2026-000103",
    philhealth: "SYN-63-120458903-1",
    philsys: null,
    family: "Fuentes",
    given: "Danilo",
    middle: "Perez",
    sex: "male",
    birth: "1966-06-11",
    civil: "married",
    blood: "B-",
    barangay: { code: "112402055", display: "Callawa" },
    addressLine: "Sitio Balite, Callawa",
    phone: "+63-918-555-5007",
    occupation: "Farmer",
  },
  {
    key: "p-caballero",
    mrn: "AGC-2026-000213",
    philhealth: "SYN-63-220459103-3",
    philsys: "SYN-PSN-1104-1979-0058",
    family: "Caballero",
    given: "Teresita",
    middle: "Ocampo",
    sex: "female",
    birth: "1979-12-19",
    civil: "separated",
    blood: "O+",
    barangay: { code: "112402002", display: "Agdao" },
    addressLine: "Purok 1, R. Castillo Extension",
    phone: "+63-918-555-5008",
    occupation: "Market vendor",
  },
];

/* ------------------------------------------------------------------ */
/* Clinical scenarios                                                  */
/* ------------------------------------------------------------------ */

interface SeedReferral {
  key: string;
  patient: string;
  referring: string;
  referringUser: string;
  receiving: string;
  receivingUser: string | null;
  status: string;
  priority: string;
  reasonCode: string;
  reasonDisplay: string;
  reasonNarrative: string;
  chiefComplaint: string;
  hpi: string;
  pmh: string;
  psh: string;
  famhx: string;
  social: string;
  ros: string;
  pe: string;
  assessment: string;
  plan: string;
  requested: string;
  instructions: string;
  vitals: {
    systolic?: number;
    diastolic?: number;
    hr?: number;
    rr?: number;
    temp?: number;
    spo2?: number;
    weight?: number;
    height?: number;
    pain?: number;
  };
  diagnoses: Array<{ system: string; code: string; display: string; role: string; certainty?: string }>;
  observations: Array<{
    system: string;
    code: string;
    display: string;
    category: string;
    valueNum?: number;
    valueText?: string;
    unit?: string;
    ucum?: string;
    refLow?: number;
    refHigh?: number;
  }>;
  medications: Array<{ medication: string; fda?: string; dose: string; route: string; frequency: string }>;
  allergies: Array<{ system: string; code: string; display: string; reaction: string; criticality: string; category: string }>;
  lawfulBasis: string;
  confidentiality: string;
  /** Ordered timeline of transitions, with who performed them. */
  timeline: Array<{ to: string; action: string; actor: string | null; note?: string; hoursAfter: number; fhirTaskVersion: number }>;
  outcome?: { code: string; display: string; notes: string };
  appointmentHours?: number;
  feedback?: Array<{ kind: string; subject: string; body: string; actor: string; hoursAfter: number }>;
}

const SCENARIOS: SeedReferral[] = [
  /* ---------------------------------------------------------------- */
  /* 1. Dengue with warning signs - closed loop, completed            */
  /* ---------------------------------------------------------------- */
  {
    key: "ref-dengue",
    patient: "p-sarmiento",
    referring: "hc-agdao",
    referringUser: "dr-santos",
    receiving: "gov-medical",
    receivingUser: "dr-gonzales",
    status: "closed-feedback",
    priority: "urgent",
    reasonCode: "admission",
    reasonDisplay: "Admission / confinement",
    reasonNarrative:
      "Patient has dengue with warning signs and requires monitored admission for fluid management and serial platelet monitoring. The Agdao Community Health Center has no inpatient capability.",
    chiefComplaint: "Four days of high-grade fever with abdominal pain and vomiting",
    hpi:
      "Four days of continuous fever up to 39.8 degrees Celsius, partially relieved by paracetamol. Associated with generalized body aches, retro-orbital headache, abdominal pain, and two episodes of vomiting. No bleeding episodes reported. No cough or colds. Oral intake decreasing since yesterday. Patient denies travel outside Davao Region in the past month.",
    pmh: "No known chronic illness. No previous hospital admissions.",
    psh: "None",
    famhx: "Mother has hypertension. No family history of bleeding disorders.",
    social: "Non-smoker, occasional alcohol use. Works in a warehouse in Agdao. Reports mosquito bites at home.",
    ros: "Positive for fever, headache, myalgia, abdominal pain, and vomiting. Negative for cough, dysuria, and rash.",
    pe:
      "Awake, coherent, but appears weak. Temperature 38.6 C. Blood pressure 100/60 mmHg. Heart rate 108 bpm. Respiratory rate 22/min. SpO2 98% on room air. Capillary refill < 2 seconds. No petechiae or ecchymoses. Abdomen soft, epigastric tenderness, no guarding. No hepatomegaly appreciated.",
    assessment:
      "Dengue fever with warning signs (persistent vomiting, abdominal pain, rising haematocrit with falling platelets). Currently hemodynamically stable with borderline narrow pulse pressure. Not yet in shock.",
    plan:
      "Given warmed IV fluids at the health center, paracetamol 500 mg every 6 hours as needed, and oral rehydration. Serial monitoring of vital signs every 4 hours was started before transfer. Dengue NS1 antigen and complete blood count were requested and are attached.",
    requested: "Please evaluate for admission and start monitored fluid management with serial platelet and haematocrit monitoring.",
    instructions: "Patient has been advised to continue oral fluids during transport. Please review serial monitoring results from the health center.",
    vitals: { systolic: 100, diastolic: 60, hr: 108, rr: 22, temp: 38.6, spo2: 98, weight: 62, height: 170, pain: 5 },
    diagnoses: [
      { system: "icd10", code: "A91", display: "Dengue haemorrhagic fever", role: "primary", certainty: "confirmed" },
      { system: "icd10", code: "R50.9", display: "Fever, unspecified", role: "secondary", certainty: "confirmed" },
    ],
    observations: [
      { system: "loinc", code: "777-3", display: "Platelets [#/volume] in Blood by Automated count", category: "laboratory", valueNum: 96, unit: "10^3/uL", ucum: "10*3/uL", refLow: 150, refHigh: 400 },
      { system: "loinc", code: "718-7", display: "Hemoglobin [Mass/volume] in Blood", category: "laboratory", valueNum: 15.2, unit: "g/dL", ucum: "g/dL", refLow: 12, refHigh: 17.5 },
      { system: "loinc", code: "6690-2", display: "Leukocytes [#/volume] in Blood by Automated count", category: "laboratory", valueNum: 3.6, unit: "10^3/uL", ucum: "10*3/uL", refLow: 4, refHigh: 11 },
      { system: "loinc", code: "34533-7", display: "Dengue virus NS1 antigen [Presence] in Serum", category: "laboratory", valueText: "Positive", unit: null as unknown as string },
      { system: "loinc", code: "8867-4", display: "Heart rate", category: "vital-signs", valueNum: 108, unit: "beats/min", ucum: "/min", refLow: 60, refHigh: 100 },
      { system: "loinc", code: "8310-5", display: "Body temperature", category: "vital-signs", valueNum: 38.6, unit: "C", ucum: "Cel", refLow: 36.1, refHigh: 37.2 },
    ],
    medications: [
      { medication: "Paracetamol 500 mg tablet", dose: "500 mg", route: "Oral", frequency: "Every 6 hours as needed" },
      { medication: "Oral rehydration salts", dose: "1 sachet", route: "Oral", frequency: "After each loose stool" },
    ],
    allergies: [{ system: "snomed", code: "91936005", display: "Allergy to penicillin", reaction: "Generalized urticaria", criticality: "high", category: "medication" }],
    lawfulBasis: "treatment-purpose",
    confidentiality: "normal",
    timeline: [
      { to: "submitted", action: "submit", actor: "dr-santos", note: "Referral validated against FHIR R4 / PH Core and routed to Davao Metro Government Medical Center.", hoursAfter: 0, fhirTaskVersion: 1 },
      { to: "received", action: "receive", actor: "nurse-dmgmc", note: "Received in the emergency department intake queue.", hoursAfter: 0.4, fhirTaskVersion: 2 },
      { to: "under-review", action: "start-review", actor: "dr-gonzales", note: null as unknown as string, hoursAfter: 0.8, fhirTaskVersion: 3 },
      { to: "accepted", action: "accept", actor: "dr-gonzales", note: "Accepted for admission under Internal Medicine. Dengue with warning signs, for monitored hydration.", hoursAfter: 1.2, fhirTaskVersion: 4 },
      { to: "scheduled", action: "schedule", actor: "coord-dmgmc" as unknown as string, note: "Emergency department bed 7 prepared; patient advised to proceed immediately.", hoursAfter: 1.5, fhirTaskVersion: 5 },
      { to: "in-progress", action: "mark-seen", actor: "dr-gonzales", note: "Patient arrived and was seen in the emergency department.", hoursAfter: 3, fhirTaskVersion: 6 },
      { to: "completed", action: "complete", actor: "dr-gonzales", note: "Completed monitored hydration. Platelets recovered to 168. Patient discharged with follow-up instructions.", hoursAfter: 72, fhirTaskVersion: 7 },
      { to: "closed-feedback", action: "close-loop", actor: "dr-santos", note: "Feedback acknowledged. Patient reviewed at the health center on day 7; recovering well.", hoursAfter: 100, fhirTaskVersion: 8 },
    ],
    outcome: {
      code: "accepted-for-management",
      display: "Accepted for management",
      notes:
        "Admitted for 3 days for monitored hydration. Nadir platelet count 78 on day 5, recovered to 168 by discharge. Haematocrit remained stable. No bleeding, no shock. Dengue NS1 positive. Discharged improved on hospital day 3 with instructions to return for follow-up and to the health center for platelet monitoring.",
    },
    appointmentHours: 4,
    feedback: [
      {
        kind: "feedback",
        subject: "Admission outcome and discharge summary - dengue with warning signs",
        body:
          "Patient was admitted on the day of referral and managed with monitored IV hydration per dengue with warning signs protocol. Serial monitoring showed a platelet nadir of 78 x10^3/uL on day 5 with a stable haematocrit, so no blood products were required. He remained hemodynamically stable throughout with no evidence of shock or bleeding. Discharged improved on hospital day 3 with a platelet count of 168 x10^3/uL.\n\nDischarge medications: paracetamol 500 mg every 6 hours as needed, oral fluids.\n\nFollow-up: please monitor a complete blood count on day 7 at the health center as arranged, and refer back immediately if there is persistent vomiting, abdominal pain, bleeding, or lethargy.",
        actor: "dr-gonzales",
        hoursAfter: 73,
      },
      {
        kind: "acknowledgment",
        subject: "Feedback received - patient reviewed at day 7",
        body:
          "Thank you for the detailed discharge summary. The patient was reviewed at the health center on day 7. He is asymptomatic, oral intake is normal, and the repeat platelet count was 212 x10^3/uL. No further referral needed at this time. Closing the loop with thanks from the Agdao team.",
        actor: "dr-santos",
        hoursAfter: 100,
      },
    ],
  },

  /* ---------------------------------------------------------------- */
  /* 2. Acute chest pain - emergency transfer, completed              */
  /* ---------------------------------------------------------------- */
  {
    key: "ref-acs",
    patient: "p-dela-pena",
    referring: "clinic-talomo",
    referringUser: "dr-villanueva",
    receiving: "lst-tertiary",
    receivingUser: "dr-cruz",
    status: "completed",
    priority: "stat",
    reasonCode: "emergency-transfer",
    reasonDisplay: "Emergency transfer / higher level of care",
    reasonNarrative:
      "Patient presents with acute central chest pain and an ECG showing ST elevation. The clinic has no cardiac catheterization laboratory or intensive care capability. Immediate transfer is required.",
    chiefComplaint: "Severe central chest pain for 90 minutes",
    hpi:
      "Sudden onset of severe central chest pain 90 minutes before consultation, described as heavy pressure radiating to the left arm and jaw. Associated with diaphoresis, nausea, and shortness of breath. Pain is not relieved by rest. Patient took no medication before presentation. No prior similar episodes. He reports skipping his maintenance medicines for hypertension for the past three weeks.",
    pmh: "Hypertension for 6 years, poorly controlled. No known diabetes. No previous myocardial infarction.",
    psh: "Appendectomy in 2015.",
    famhx: "Father died of myocardial infarction at age 58.",
    social: "Smoker, 1 pack per day for 20 years. Occasional alcohol. Construction foreman.",
    ros: "Positive for chest pain, dyspnea, diaphoresis, and nausea. Negative for fever, cough, and palpitations.",
    pe:
      "Anxious, diaphoretic, in moderate distress. Blood pressure 168/98 mmHg. Heart rate 112 bpm and regular. Respiratory rate 24/min. SpO2 94% on room air. Temperature 36.8 C. Lungs clear. Heart sounds normal, no murmurs, no jugular venous distension. No chest wall tenderness. No edema. Peripheral pulses intact.",
    assessment:
      "Acute coronary syndrome, likely ST-elevation myocardial infarction of the anterior wall. Ongoing chest pain with hemodynamic stability but signs of sympathetic activation and mild hypoxaemia. Requires immediate reperfusion assessment.",
    plan:
      "Aspirin 300 mg chewed, clopidogrel 300 mg loading dose, and sublingual nitroglycerin given with partial relief. Oxygen started via nasal cannula. IV access established with two lines. 12-lead ECG, troponin I, and random blood glucose requested and attached. Ambulance arranged with continuous cardiac monitoring.",
    requested: "Immediate cardiology evaluation for primary percutaneous coronary intervention and admission to the intensive care unit.",
    instructions: "Patient transferred via ambulance with monitoring. Aspirin and clopidogrel already given. Please note the attached ECG and troponin result.",
    vitals: { systolic: 168, diastolic: 98, hr: 112, rr: 24, temp: 36.8, spo2: 94, weight: 84, height: 172, pain: 9 },
    diagnoses: [
      { system: "icd10", code: "I21.0", display: "Acute transmural myocardial infarction of anterior wall", role: "primary", certainty: "confirmed" },
      { system: "icd10", code: "I10", display: "Essential (primary) hypertension", role: "secondary", certainty: "confirmed" },
    ],
    observations: [
      { system: "loinc", code: "10839-9", display: "Troponin I.cardiac [Mass/volume] in Serum or Plasma", category: "laboratory", valueNum: 2.5, unit: "ng/mL", ucum: "ng/mL", refHigh: 0.04 },
      { system: "loinc", code: "2093-3", display: "Cholesterol [Mass/volume] in Serum or Plasma", category: "laboratory", valueNum: 242, unit: "mg/dL", ucum: "mg/dL", refHigh: 200 },
      { system: "loinc", code: "8601-7", display: "EKG impression", category: "exam", valueText: "Sinus tachycardia. ST elevation in V1-V4 with reciprocal ST depression in the inferior leads, consistent with anterior STEMI." },
      { system: "loinc", code: "8480-6", display: "Systolic blood pressure", category: "vital-signs", valueNum: 168, unit: "mmHg", ucum: "mm[Hg]", refHigh: 120 },
      { system: "loinc", code: "8867-4", display: "Heart rate", category: "vital-signs", valueNum: 112, unit: "beats/min", ucum: "/min", refLow: 60, refHigh: 100 },
      { system: "loinc", code: "59408-5", display: "Oxygen saturation in Arterial blood by Pulse oximetry", category: "vital-signs", valueNum: 94, unit: "%", ucum: "%", refLow: 95 },
    ],
    medications: [
      { medication: "Aspirin 80 mg tablet", dose: "300 mg", route: "Oral", frequency: "Single loading dose given" },
      { medication: "Clopidogrel 75 mg tablet", dose: "300 mg", route: "Oral", frequency: "Single loading dose given" },
      { medication: "Amlodipine 10 mg tablet", dose: "10 mg", route: "Oral", frequency: "Once daily (not taken for 3 weeks)" },
    ],
    allergies: [],
    lawfulBasis: "vital-interest",
    confidentiality: "restricted",
    timeline: [
      { to: "submitted", action: "submit", actor: "dr-villanueva", note: "Emergency transfer validated and routed with stat priority.", hoursAfter: 0, fhirTaskVersion: 1 },
      { to: "received", action: "receive", actor: "nurse-synapse", note: "Received by the emergency department; cardiology notified immediately.", hoursAfter: 0.1, fhirTaskVersion: 2 },
      { to: "under-review", action: "start-review", actor: "dr-cruz", note: "Reviewing ECG and troponin; catheterization laboratory being activated.", hoursAfter: 0.2, fhirTaskVersion: 3 },
      { to: "accepted", action: "accept", actor: "dr-cruz", note: "Accepted for primary PCI. Catheterization laboratory on standby. Patient to bypass triage on arrival.", hoursAfter: 0.25, fhirTaskVersion: 4 },
      { to: "in-progress", action: "mark-seen", actor: "dr-cruz", note: "Patient arrived by ambulance; taken directly to the catheterization laboratory.", hoursAfter: 0.8, fhirTaskVersion: 5 },
      { to: "completed", action: "complete", actor: "dr-cruz", note: "Primary PCI performed with a drug-eluting stent to the left anterior descending artery. Patient stable post-procedure.", hoursAfter: 5, fhirTaskVersion: 6 },
    ],
    outcome: {
      code: "for-procedure",
      display: "For procedure / surgery",
      notes:
        "Door-to-balloon time 42 minutes. Culprit lesion in the proximal left anterior descending artery with successful drug-eluting stent deployment and TIMI 3 flow. Peak troponin I 18.4 ng/mL. Echocardiogram showed anterior wall hypokinesia with an ejection fraction of 45%. Admitted to the coronary care unit and discharged on day 5.",
    },
    appointmentHours: 1,
    feedback: [
      {
        kind: "feedback",
        subject: "Emergency PCI completed - anterior STEMI",
        body:
          "Patient underwent successful primary PCI within 42 minutes of arrival. A drug-eluting stent was deployed to the proximal LAD with TIMI 3 flow restored. He remained hemodynamically stable throughout, with no arrhythmia and no re-infarction.\n\nDischarge medications: aspirin 80 mg once daily indefinitely, clopidogrel 75 mg once daily for 12 months, atorvastatin 40 mg once nightly, metoprolol 50 mg twice daily, ramipril 5 mg once daily.\n\nCardiology clinic follow-up is scheduled in 2 weeks. Please reinforce medication adherence and enrol him in the hypertension follow-up at the clinic, as the 3-week gap in his maintenance medication appears to have contributed to this event. Cardiac rehabilitation referral has been made.",
        actor: "dr-cruz",
        hoursAfter: 120,
      },
    ],
  },

  /* ---------------------------------------------------------------- */
  /* 3. Poorly controlled diabetes - awaiting information             */
  /* ---------------------------------------------------------------- */
  {
    key: "ref-dm",
    patient: "p-maquiling",
    referring: "bhc-buhangin",
    referringUser: "dr-reyes",
    receiving: "lst-tertiary",
    receivingUser: null,
    status: "info-requested",
    priority: "routine",
    reasonCode: "specialist-consult",
    reasonDisplay: "Specialist consultation",
    reasonNarrative:
      "Type 2 diabetes mellitus with persistently elevated HbA1c despite maximal oral therapy at the health center. Please assess for insulin initiation and evaluate for complications.",
    chiefComplaint: "Poorly controlled blood sugar with numbness of both feet",
    hpi:
      "Known type 2 diabetes mellitus for 14 years, managed with metformin and glimepiride at the health center. Home fasting blood glucose has been consistently between 180 and 240 mg/dL for the past three months. Patient reports numbness and tingling of both feet for the past year and occasional blurring of vision. No polyuria, polydipsia, or weight loss. No hypoglycemic episodes reported.",
    pmh: "Type 2 diabetes mellitus for 14 years. Hypertension for 10 years. Dyslipidaemia.",
    psh: "Cataract surgery, right eye, 2021.",
    famhx: "Both parents had type 2 diabetes mellitus.",
    social: "Widow, lives with a daughter. Non-smoker, no alcohol. Sedentary. Diet includes rice at every meal and sweetened coffee three times daily.",
    ros: "Positive for bilateral foot numbness and blurring of vision. Negative for chest pain, dyspnea, and urinary symptoms.",
    pe:
      "Well-appearing, not in distress. Blood pressure 148/86 mmHg. Heart rate 84 bpm. Respiratory rate 18/min. Weight 68 kg, height 152 cm, BMI 29.4 kg/m2. Bilateral pedal edema absent. Diminished vibration sense to the mid-shin bilaterally. Reduced pinprick sensation over both feet in a stocking distribution. Ankle reflexes absent bilaterally. Monofilament test absent at the first metatarsal head bilaterally. No foot ulcers or callosities. Fundoscopy shows no proliferative changes on direct inspection.",
    assessment:
      "Type 2 diabetes mellitus, uncontrolled, with diabetic peripheral neuropathy (bilateral, moderate). Suspected diabetic nephropathy. Hypertension, above target. Overweight.",
    plan:
      "Metformin 850 mg twice daily continued. Glimepiride 4 mg once daily continued. Amlodipine 10 mg once daily continued. Counseled on diet, foot care, and medication adherence. Baseline and follow-up laboratory work requested and attached.",
    requested: "Specialist assessment for intensification of therapy including consideration of insulin, and screening for diabetic nephropathy and retinopathy.",
    instructions: "Patient has been advised to fast for 8 hours before the appointment for repeat lipid and glucose testing.",
    vitals: { systolic: 148, diastolic: 86, hr: 84, rr: 18, temp: 36.6, spo2: 98, weight: 68, height: 152, pain: 0 },
    diagnoses: [
      { system: "icd10", code: "E11.40", display: "Type 2 diabetes mellitus with diabetic neuropathy, unspecified", role: "primary", certainty: "confirmed" },
      { system: "icd10", code: "I10", display: "Essential (primary) hypertension", role: "secondary", certainty: "confirmed" },
      { system: "icd10", code: "E78.5", display: "Hyperlipidaemia, unspecified", role: "secondary", certainty: "provisional" },
    ],
    observations: [
      { system: "loinc", code: "4548-4", display: "Hemoglobin A1c/Hemoglobin.total in Blood", category: "laboratory", valueNum: 9.4, unit: "%", ucum: "%", refHigh: 5.7 },
      { system: "loinc", code: "1558-6", display: "Fasting glucose [Mass/volume] in Serum or Plasma", category: "laboratory", valueNum: 186, unit: "mg/dL", ucum: "mg/dL", refLow: 70, refHigh: 99 },
      { system: "loinc", code: "2160-0", display: "Creatinine [Mass/volume] in Serum or Plasma", category: "laboratory", valueNum: 1.42, unit: "mg/dL", ucum: "mg/dL", refLow: 0.6, refHigh: 1.2 },
      { system: "loinc", code: "3094-0", display: "Urea nitrogen [Mass/volume] in Serum or Plasma", category: "laboratory", valueNum: 28, unit: "mg/dL", ucum: "mg/dL", refLow: 7, refHigh: 20 },
      { system: "loinc", code: "13457-7", display: "Cholesterol in LDL [Mass/volume] in Serum or Plasma by calculation", category: "laboratory", valueNum: 148, unit: "mg/dL", ucum: "mg/dL", refHigh: 100 },
      { system: "loinc", code: "39156-5", display: "Body mass index (BMI) [Ratio]", category: "vital-signs", valueNum: 29.4, unit: "kg/m2", ucum: "kg/m2", refLow: 18.5, refHigh: 24.9 },
    ],
    medications: [
      { medication: "Metformin 850 mg tablet", dose: "850 mg", route: "Oral", frequency: "Twice daily with meals" },
      { medication: "Glimepiride 4 mg tablet", dose: "4 mg", route: "Oral", frequency: "Once daily before breakfast" },
      { medication: "Amlodipine 10 mg tablet", dose: "10 mg", route: "Oral", frequency: "Once daily" },
    ],
    allergies: [{ system: "snomed", code: "294505008", display: "Allergy to aspirin", reaction: "Gastric pain and epigastric burning", criticality: "low", category: "medication" }],
    lawfulBasis: "patient-consent",
    confidentiality: "normal",
    timeline: [
      { to: "submitted", action: "submit", actor: "dr-reyes", note: "Referral validated and routed to Synapse Regional Medical Center endocrinology service.", hoursAfter: 0, fhirTaskVersion: 1 },
      { to: "received", action: "receive", actor: "coord-synapse", note: "Received by referral intake; queued for endocrinology review.", hoursAfter: 2, fhirTaskVersion: 2 },
      { to: "under-review", action: "start-review", actor: "dr-cruz", note: null as unknown as string, hoursAfter: 26, fhirTaskVersion: 3 },
      {
        to: "info-requested",
        action: "request-info",
        actor: "dr-cruz",
        note: "The attached laboratory results are dated five months ago. Please provide a repeat HbA1c, creatinine with estimated glomerular filtration rate, and a urine albumin-to-creatinine ratio performed within the last month, together with the current medication list verified by the pharmacy.",
        hoursAfter: 27,
        fhirTaskVersion: 4,
      },
    ],
    feedback: [
      {
        kind: "information-request",
        subject: "Additional laboratory results needed before endocrinology review",
        body:
          "Thank you for this referral. Before I can decide on insulin initiation I need recent baseline data, because the attached results are five months old and the creatinine of 1.42 mg/dL is concerning for diabetic nephropathy.\n\nPlease provide:\n1. Repeat HbA1c within the last month\n2. Serum creatinine with estimated glomerular filtration rate\n3. Urine albumin-to-creatinine ratio (spot urine)\n4. A verified current medication list, including any over-the-counter medicines and supplements\n\nOnce these are available I can proceed to a treatment plan. I have provisionally flagged this as for possible insulin initiation with nephrology co-management if the albumin-to-creatinine ratio is elevated.",
        actor: "dr-cruz",
        hoursAfter: 27,
      },
    ],
  },

  /* ---------------------------------------------------------------- */
  /* 4. Referral currently under review - live queue                  */
  /* ---------------------------------------------------------------- */
  {
    key: "ref-tb",
    patient: "p-fuentes",
    referring: "bhc-buhangin",
    referringUser: "nurse-dela-cruz",
    receiving: "gov-medical",
    receivingUser: "dr-abdul",
    status: "under-review",
    priority: "routine",
    reasonCode: "diagnostic-workup",
    reasonDisplay: "Diagnostic work-up",
    reasonNarrative:
      "Two weeks of productive cough with a positive sputum smear at the health center. Patient has not started treatment. Requesting pulmonology assessment and enrolment in the TB-DOTS programme.",
    chiefComplaint: "Productive cough for two weeks with afternoon fever",
    hpi:
      "Two weeks of productive cough with whitish sputum, associated with afternoon fever and night sweats. Patient reports a 4 kg weight loss over two months and easy fatigability. No haemoptysis. No chest pain. A household contact was treated for pulmonary tuberculosis three years ago. Two sputum specimens were collected at the health center and both were positive for acid-fast bacilli.",
    pmh: "No known chronic illness. No previous tuberculosis treatment.",
    psh: "None",
    famhx: "Unremarkable.",
    social: "Farmer, works in a rice field in Callawa. Smokes 5 cigarettes per day. Lives with six family members in a two-room house.",
    ros: "Positive for cough, fever, night sweats, weight loss, and fatigability. Negative for haemoptysis and chest pain.",
    pe:
      "Thin, chronically ill-appearing but ambulatory. Temperature 37.9 C. Blood pressure 110/70 mmHg. Heart rate 92 bpm. Respiratory rate 20/min. SpO2 96% on room air. Weight 54 kg, height 168 cm, BMI 19.1 kg/m2. Chest examination reveals decreased breath sounds over the right upper lung field with fine crackles. No lymphadenopathy. No edema.",
    assessment:
      "Pulmonary tuberculosis, smear-positive, right upper lobe, on a background of probable undernutrition. No current haemoptysis or respiratory distress.",
    plan:
      "Sputum specimens collected and sent. Symptomatic treatment with paracetamol given. Patient educated on cough etiquette, sputum disposal, and the importance of mask use while in public. Household contacts have been referred separately for screening at the health center. The patient has not yet started anti-tuberculosis therapy.",
    requested: "Pulmonology assessment and enrolment in the TB-DOTS programme, with chest radiography and baseline laboratory work including liver enzymes and creatinine.",
    instructions: "Patient has been provided a surgical mask for transport. Please assess the household contacts' screening results which are being processed at the health center.",
    vitals: { systolic: 110, diastolic: 70, hr: 92, rr: 20, temp: 37.9, spo2: 96, weight: 54, height: 168, pain: 0 },
    diagnoses: [
      { system: "icd10", code: "A15.0", display: "Tuberculosis of lung", role: "primary", certainty: "confirmed" },
      { system: "icd10", code: "R05", display: "Cough", role: "secondary", certainty: "confirmed" },
    ],
    observations: [
      { system: "loinc", code: "718-7", display: "Hemoglobin [Mass/volume] in Blood", category: "laboratory", valueNum: 10.8, unit: "g/dL", ucum: "g/dL", refLow: 12, refHigh: 17.5 },
      { system: "loinc", code: "6690-2", display: "Leukocytes [#/volume] in Blood by Automated count", category: "laboratory", valueNum: 12.4, unit: "10^3/uL", ucum: "10*3/uL", refLow: 4, refHigh: 11 },
      { system: "loinc", code: "1988-5", display: "C reactive protein [Mass/volume] in Serum or Plasma", category: "laboratory", valueNum: 34, unit: "mg/L", ucum: "mg/L", refHigh: 5 },
      { system: "loinc", code: "39156-5", display: "Body mass index (BMI) [Ratio]", category: "vital-signs", valueNum: 19.1, unit: "kg/m2", ucum: "kg/m2", refLow: 18.5, refHigh: 24.9 },
      { system: "loinc", code: "8310-5", display: "Body temperature", category: "vital-signs", valueNum: 37.9, unit: "C", ucum: "Cel", refLow: 36.1, refHigh: 37.2 },
    ],
    medications: [],
    allergies: [],
    lawfulBasis: "public-health",
    confidentiality: "normal",
    timeline: [
      { to: "submitted", action: "submit", actor: "nurse-dela-cruz", note: "Referral routed to Davao Metro Government Medical Center pulmonology service. Sputum smear positive for acid-fast bacilli.", hoursAfter: 0, fhirTaskVersion: 1 },
      { to: "received", action: "receive", actor: "nurse-dmgmc", note: "Received at TB-DOTS intake.", hoursAfter: 1.5, fhirTaskVersion: 2 },
      { to: "under-review", action: "start-review", actor: "dr-abdul", note: "Reviewing smear results and arranging chest radiography.", hoursAfter: 6, fhirTaskVersion: 3 },
    ],
  },

  /* ---------------------------------------------------------------- */
  /* 5. Maternal referral waiting to be received                      */
  /* ---------------------------------------------------------------- */
  {
    key: "ref-maternal",
    patient: "p-tan",
    referring: "hc-agdao",
    referringUser: "nurse-agdao",
    receiving: "lst-tertiary",
    receivingUser: null,
    status: "submitted",
    priority: "urgent",
    reasonCode: "maternal-referral",
    reasonDisplay: "Maternal and newborn referral",
    reasonNarrative:
      "G2P1 at 35 weeks gestation with elevated blood pressure and proteinuria on two occasions. The health center has no obstetric capability. Needs specialist assessment for possible pre-eclampsia.",
    chiefComplaint: "Headache and bilateral leg swelling at 35 weeks gestation",
    hpi:
      "Thirty-five weeks gestation by last menstrual period, with two prenatal visits at the health center. Reports headache for three days and progressive swelling of both legs and feet. No visual disturbances, no epigastric pain, no vaginal bleeding, and no leakage of fluid. Fetal movement is reported as normal. Blood pressure at today's visit was 152/96 mmHg, and a repeat measurement 4 hours later was 150/94 mmHg. Urine dipstick showed 2+ protein on both occasions.",
    pmh: "First pregnancy was unremarkable, delivered vaginally in 2019. No hypertension outside of pregnancy.",
    psh: "None",
    famhx: "Mother had hypertension in pregnancy.",
    social: "Married, lives with her husband and daughter. Works in a call center on night shift. Non-smoker, no alcohol.",
    ros: "Positive for headache and bipedal edema. Negative for blurred vision, epigastric pain, and dysuria.",
    pe:
      "Alert and coherent. Blood pressure 152/96 mmHg, confirmed on repeat. Heart rate 96 bpm. Respiratory rate 20/min. Temperature 36.7 C. Bilateral pitting edema to the mid-shin. Chest clear. Gravid abdomen consistent with 35 weeks, fundal height 33 cm. Fetal heart tones 148 bpm by Doppler. No uterine contractions. No vaginal bleeding or discharge.",
    assessment:
      "G2P1 (1001) at 35 weeks by last menstrual period, with gestational hypertension and proteinuria meeting criteria for pre-eclampsia without severe features. Currently no signs of severe disease.",
    plan:
      "Baseline laboratory work requested including complete blood count, liver enzymes, creatinine, and urinalysis. Advised on left lateral positioning and to report headache, visual changes, or epigastric pain immediately. Fetal heart tones monitored by Doppler. Referral prepared for same-day specialist assessment.",
    requested: "Obstetric assessment for pre-eclampsia, laboratory evaluation, fetal wellbeing assessment, and a plan for timing and mode of delivery.",
    instructions: "Patient is to be accompanied by her husband during transport. Please assess urgently if blood pressure rises above 160/110 mmHg or if she reports visual changes or epigastric pain.",
    vitals: { systolic: 152, diastolic: 96, hr: 96, rr: 20, temp: 36.7, spo2: 99, weight: 72, height: 158, pain: 4 },
    diagnoses: [
      { system: "icd10", code: "O14.90", display: "Unspecified pre-eclampsia, unspecified trimester", role: "primary", certainty: "provisional" },
      { system: "icd10", code: "Z34.90", display: "Encounter for supervision of normal pregnancy, unspecified", role: "secondary", certainty: "confirmed" },
    ],
    observations: [
      { system: "loinc", code: "8480-6", display: "Systolic blood pressure", category: "vital-signs", valueNum: 152, unit: "mmHg", ucum: "mm[Hg]", refHigh: 120 },
      { system: "loinc", code: "8462-4", display: "Diastolic blood pressure", category: "vital-signs", valueNum: 96, unit: "mmHg", ucum: "mm[Hg]", refHigh: 80 },
      { system: "loinc", code: "24357-6", display: "Urinalysis macro (dipstick) panel", category: "laboratory", valueText: "Protein 2+, no glucose, no ketones, no blood, no nitrites, no leukocyte esterase" },
      { system: "loinc", code: "718-7", display: "Hemoglobin [Mass/volume] in Blood", category: "laboratory", valueNum: 11.2, unit: "g/dL", ucum: "g/dL", refLow: 12, refHigh: 17.5 },
      { system: "loinc", code: "777-3", display: "Platelets [#/volume] in Blood by Automated count", category: "laboratory", valueNum: 218, unit: "10^3/uL", ucum: "10*3/uL", refLow: 150, refHigh: 400 },
      { system: "loinc", code: "2160-0", display: "Creatinine [Mass/volume] in Serum or Plasma", category: "laboratory", valueNum: 0.78, unit: "mg/dL", ucum: "mg/dL", refLow: 0.6, refHigh: 1.2 },
    ],
    medications: [
      { medication: "Ferrous sulfate + folic acid tablet", dose: "1 tablet", route: "Oral", frequency: "Once daily" },
      { medication: "Calcium carbonate 500 mg tablet", dose: "500 mg", route: "Oral", frequency: "Twice daily" },
    ],
    allergies: [],
    lawfulBasis: "patient-consent",
    confidentiality: "restricted",
    timeline: [
      { to: "submitted", action: "submit", actor: "nurse-agdao", note: "Referral validated and routed to Synapse Regional Medical Center obstetric service with urgent priority.", hoursAfter: 0, fhirTaskVersion: 1 },
    ],
  },

  /* ---------------------------------------------------------------- */
  /* 6. Draft referral - not yet routed                               */
  /* ---------------------------------------------------------------- */
  {
    key: "ref-caballero",
    patient: "p-caballero",
    referring: "hc-agdao",
    referringUser: "dr-santos",
    receiving: "diag-davao",
    receivingUser: null,
    status: "draft",
    priority: "routine",
    reasonCode: "diagnostic-workup",
    reasonDisplay: "Diagnostic work-up",
    reasonNarrative:
      "Epigastric pain with unintentional weight loss. Requesting upper abdominal ultrasound and hepatobiliary laboratory panel to rule out biliary or hepatic pathology before considering gastroenterology referral.",
    chiefComplaint: "Recurrent epigastric pain with weight loss over two months",
    hpi:
      "Two months of recurrent epigastric pain, described as burning and occurring after meals, occasionally radiating to the right shoulder. Associated with early satiety and a 5 kg unintentional weight loss. No vomiting, no melena, and no haematemesis. Pain partially relieved by antacids. No known history of gastritis or peptic ulcer disease.",
    pmh: "No known chronic illness.",
    psh: "None",
    famhx: "Father had gallbladder stones.",
    social: "Separated, works as a market vendor. No smoking, no alcohol. Eats irregularly at the market.",
    ros: "Positive for epigastric pain, early satiety, and weight loss. Negative for vomiting, melena, and jaundice.",
    pe:
      "Not in distress. Blood pressure 118/76 mmHg. Heart rate 88 bpm. Weight 49 kg, height 156 cm, BMI 20.1 kg/m2. Mild epigastric tenderness on deep palpation without guarding or rebound. No organomegaly. No jaundice. No palpable masses.",
    assessment:
      "Epigastric pain with unintentional weight loss, for further evaluation. Differential includes peptic ulcer disease, cholelithiasis, and, less likely, gastric malignancy.",
    plan:
      "Antacid therapy started. Patient advised to keep a symptom diary. Diagnostic imaging and laboratory work requested to guide further management.",
    requested: "Upper abdominal ultrasound and a hepatobiliary laboratory panel including liver enzymes, bilirubin, amylase, lipase, and a complete blood count.",
    instructions: "Patient advised to fast for 8 hours before the ultrasound.",
    vitals: { systolic: 118, diastolic: 76, hr: 88, rr: 18, temp: 36.5, spo2: 99, weight: 49, height: 156, pain: 4 },
    diagnoses: [
      { system: "icd10", code: "R10.4", display: "Other and unspecified abdominal pain", role: "primary", certainty: "provisional" },
    ],
    observations: [
      { system: "loinc", code: "39156-5", display: "Body mass index (BMI) [Ratio]", category: "vital-signs", valueNum: 20.1, unit: "kg/m2", ucum: "kg/m2", refLow: 18.5, refHigh: 24.9 },
    ],
    medications: [
      { medication: "Aluminum hydroxide + magnesium hydroxide suspension", dose: "10 mL", route: "Oral", frequency: "Three times daily as needed" },
    ],
    allergies: [],
    lawfulBasis: "patient-consent",
    confidentiality: "normal",
    timeline: [
      { to: "draft", action: "create", actor: "dr-santos", note: "Draft referral prepared. Awaiting validation before routing.", hoursAfter: 0, fhirTaskVersion: 0 },
    ],
  },
];

/* ------------------------------------------------------------------ */
/* Seed execution                                                      */
/* ------------------------------------------------------------------ */

export interface SeedSummary {
  facilities: number;
  users: number;
  patients: number;
  consents: number;
  referrals: number;
  events: number;
  messages: number;
  observations: number;
  auditEvents: number;
}

/**
 * Referral numbers for the seeded scenarios.
 *
 * Derived from the same format the runtime generator uses, so a seeded referral
 * and one created at runtime through the same facility carry a consistent
 * prefix. Sequences are allocated per facility in scenario order.
 */
function assignReferralNumbers(): Map<string, string> {
  const year = new Date().getFullYear();
  const sequences = new Map<string, number>();
  const out = new Map<string, string>();

  for (const s of SCENARIOS) {
    const facility = FACILITIES.find((f) => f.key === s.referring);
    if (!facility) continue;
    const code = facilityShortCode(facility.name, facility.short);
    const next = (sequences.get(facility.key) ?? 0) + 1;
    sequences.set(facility.key, next);
    out.set(s.key, formatReferralNumber(year, code, next));
  }

  return out;
}

function isoHoursAgo(hours: number, baseMs = Date.now()): string {
  return new Date(baseMs - hours * 3_600_000).toISOString();
}

/**
 * Deterministic tracking code for a seeded referral.
 *
 * WHY IT IS DETERMINISTIC: the evaluation scenario document quotes exact
 * referral numbers and tracking codes so a facilitator can follow a printed
 * script. Random codes would change on every `npm run db:reset` and invalidate
 * the script.
 *
 * WHAT THIS IS NOT: this is not a security mechanism. The salt below is in
 * source control, so anyone who can read this repository can compute the
 * tracking code for any referral number. That is acceptable ONLY because the
 * dataset is synthetic and public.
 *
 * In a real deployment the tracking code must be unpredictable, because it is
 * the second factor that lets a patient view their referral without an account.
 * `trackingCode()` in db.ts — used for referrals created at runtime — produces a
 * cryptographically random code for exactly that reason. A production seeder
 * would likewise need per-deployment random codes, and the scenario script would
 * have to read them from the database rather than quote them.
 */
function seedTrackingCode(referralNumber: string): string {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  // Public, documented, non-secret. See the note above.
  const digest = sha256(`healthlink-public-demo-salt-v1:${referralNumber}`);
  let out = "";
  for (let i = 0; i < 10; i++) {
    out += alphabet[parseInt(digest.slice(i * 2, i * 2 + 2), 16) % alphabet.length];
  }
  return `${out.slice(0, 5)}-${out.slice(5)}`;
}

function criticalityCode(c: string): string {
  return c === "high" ? "high" : c === "low" ? "low" : "unable-to-assess";
}

function systemKey(system: string): string {
  if (system === "icd10") return "http://hl7.org/fhir/sid/icd-10";
  if (system === "snomed") return "http://snomed.info/sct";
  if (system === "loinc") return "http://loinc.org";
  return system;
}

export async function seed(opts: { reset?: boolean } = {}): Promise<SeedSummary> {
  await migrate();

  if (opts.reset) {
    // Depends on the active dialect: delete order is the same, but execution differs.
    // Deleted in dependency order: children before parents. fhir_resources
    // references users, so it must go before users as well as before facilities.
    await exec(`
      DELETE FROM audit_events;
      DELETE FROM api_tokens;
      DELETE FROM access_requests;
      DELETE FROM sessions;
      DELETE FROM fhir_resources;
      DELETE FROM referral_messages;
      DELETE FROM referral_events;
      DELETE FROM referral_attachments;
      DELETE FROM referral_allergies;
      DELETE FROM referral_medications;
      DELETE FROM referral_observations;
      DELETE FROM referral_diagnoses;
      DELETE FROM referrals;
      DELETE FROM consents;
      DELETE FROM patients;
      DELETE FROM users;
      DELETE FROM facilities;
      DELETE FROM system_settings;
    `);
  } else {
    const existing = await get<{ n: number }>("SELECT COUNT(*) AS n FROM facilities");
    if (existing && existing.n > 0) {
      return summarise();
    }
  }

  const now = new Date();
  const isoNow = now.toISOString();

  /* --- facilities --- */
  const facilityId = new Map<string, string>();
  for (const f of FACILITIES) {
    const id = newId("fac");
    facilityId.set(f.key, id);
    await insert("facilities", {
      id,
      nhfr_code: f.nhfr,
      hcpn_code: f.hcpn,
      philhealth_pan: f.pan,
      philhealth_pen: f.pen,
      name: f.name,
      short_name: f.short,
      org_type_code: f.orgTypeCode,
      org_type_display: f.orgTypeDisplay,
      level: f.level,
      ownership: f.ownership,
      region_code: REGION.code,
      region_display: REGION.display,
      province_code: PROVINCE.code,
      province_display: PROVINCE.display,
      city_code: CITY.code,
      city_display: CITY.display,
      barangay_code: f.barangay.code,
      barangay_display: f.barangay.display,
      address_line: f.addressLine,
      postal_code: f.postal,
      phone: f.phone,
      email: f.email,
      is_referring: f.referring,
      is_receiving: f.receiving,
      service_capabilities: JSON.stringify(f.services),
      fhir_endpoint: `http://localhost:3000/fhir/${f.key}`,
      active: 1,
    });  }

  /* --- users --- */
  const userId = new Map<string, string>();
  const { salt, hash } = hashPassword(DEMO_PASSWORD);
  for (const u of USERS) {
    const id = newId("usr");
    userId.set(u.key, id);
    await insert("users", {
      id,
      email: u.email,
      password_salt: salt,
      password_hash: hash,
      full_name: u.name,
      family_name: u.family,
      given_name: u.given,
      prefix: u.prefix,
      role: u.role,
      facility_id: u.facility ? (facilityId.get(u.facility) ?? null) : null,
      prc_license: u.prc,
      specialization: u.specialization,
      phone: u.phone,
      active: 1,
      mfa_enabled: 0,
      created_at: isoNow,
    });
  }

  /* --- patients --- */
  const patientId = new Map<string, string>();
  for (const p of PATIENTS) {
    const id = newId("pat");
    patientId.set(p.key, id);
    await insert("patients", {
      id,
      local_mrn: p.mrn,
      philhealth_id: p.philhealth,
      philsys_id: p.philsys,
      family_name: p.family,
      given_name: p.given,
      middle_name: p.middle,
      sex: p.sex,
      birth_date: p.birth,
      civil_status: p.civil,
      blood_type: p.blood,
      region_code: REGION.code,
      region_display: REGION.display,
      province_code: PROVINCE.code,
      province_display: PROVINCE.display,
      city_code: CITY.code,
      city_display: CITY.display,
      barangay_code: p.barangay.code,
      barangay_display: p.barangay.display,
      address_line: p.addressLine,
      postal_code: "8000",
      phone: p.phone,
      occupation: p.occupation,
      nationality: "Filipino",
      is_pwd: p.pwd ? 1 : 0,
      pwd_id: p.pwd?.id ?? null,
      created_by_user: null,
      created_at: isoNow,
      updated_at: isoNow,
    });
  }

  /* --- referrals + clinical detail + timeline + feedback --- */
  const referralNumbers = assignReferralNumbers();
  let eventCount = 0;
  let messageCount = 0;
  let observationCount = 0;
  let consentCount = 0;

  for (const s of SCENARIOS) {
    const refId = newId("ref");
    const referralNumber = referralNumbers.get(s.key)!;
    const pid = patientId.get(s.patient)!;
    const refFac = facilityId.get(s.referring)!;
    const recFac = facilityId.get(s.receiving)!;
    const refUser = userId.get(s.referringUser) ?? null;
    const scenarioUserKey = s.receivingUser ?? s.timeline.find((t) => t.actor && userId.has(t.actor))?.actor ?? null;
    const recUser = scenarioUserKey ? (userId.get(scenarioUserKey) ?? null) : null;

    // The scenario timeline drives the dates so the story is internally consistent.
    const totalHours = s.timeline[s.timeline.length - 1]?.hoursAfter ?? 0;
    const createdAt = isoHoursAgo(totalHours + 2);
    const statusUpdatedAt = isoHoursAgo(totalHours);

    // --- consent record ---
    const basisRequiresConsent = s.lawfulBasis === "patient-consent";
    const consentId = newId("con");
    const consentStatus = s.status === "cancelled" ? "revoked" : "active";
    const seedPatient = PATIENTS.find((p) => p.key === s.patient);
    const patientDisplayName = seedPatient ? `${seedPatient.given} ${seedPatient.family}` : "Patient";
    await insert("consents", {
      id: consentId,
      patient_id: pid,
      referral_id: refId,
      purpose_code: s.lawfulBasis,
      purpose_display: basisLabel(s.lawfulBasis),
      legal_reference: basisLegalRef(s.lawfulBasis),
      scope_facilities: JSON.stringify([refFac, recFac]),
      scope_data_classes: JSON.stringify(["demographics", "diagnoses", "observations", "medications", "allergies", "documents"]),
      period_start: isoHoursAgo(totalHours + 3),
      period_end: new Date(Date.now() + 365 * 24 * 3_600_000).toISOString(),
      status: consentStatus,
      // Where the basis is patient authorisation, name the person who gave it;
      // otherwise the record documents the basis itself rather than claiming a
      // consent that was never obtained.
      granted_by_name: basisRequiresConsent ? patientDisplayName : "Recorded under lawful basis",
      granted_by_relation: basisRequiresConsent ? "self" : "not-required",
      granted_at: basisRequiresConsent ? isoHoursAgo(totalHours + 3) : null,
      witness_name: basisRequiresConsent ? "Nurse Maria Dela Cruz (witness)" : null,
      created_at: isoHoursAgo(totalHours + 3),
    });
    consentCount++;

    // --- referral row ---
    const acceptedAt = s.timeline.find((t) => t.to === "accepted") ? isoHoursAgo(totalHours - (s.timeline.find((t) => t.to === "accepted")?.hoursAfter ?? 0)) : null;
    const completedAt = s.timeline.find((t) => t.to === "completed") ? isoHoursAgo(totalHours - (s.timeline.find((t) => t.to === "completed")?.hoursAfter ?? 0)) : null;
    const closedAt = s.timeline.find((t) => t.to === "closed-feedback") ? isoHoursAgo(totalHours - (s.timeline.find((t) => t.to === "closed-feedback")?.hoursAfter ?? 0)) : null;

    await insert("referrals", {
      id: refId,
      referral_number: referralNumber,
      tracking_code: seedTrackingCode(referralNumber),
      patient_id: pid,
      referring_facility_id: refFac,
      referring_user_id: refUser,
      receiving_facility_id: recFac,
      receiving_user_id: recUser,
      status: s.status,
      status_updated_at: statusUpdatedAt,
      priority: s.priority,
      reason_code: s.reasonCode,
      reason_display: s.reasonDisplay,
      reason_narrative: s.reasonNarrative,
      chief_complaint: s.chiefComplaint,
      history_of_present: s.hpi,
      past_medical_history: s.pmh,
      past_surgical_history: s.psh,
      family_history: s.famhx,
      personal_social_history: s.social,
      review_of_systems: s.ros,
      physical_examination: s.pe,
      assessment: s.assessment,
      management_plan: s.plan,
      requested_action: s.requested,
      special_instructions: s.instructions,
      vital_systolic: s.vitals.systolic ?? null,
      vital_diastolic: s.vitals.diastolic ?? null,
      vital_heart_rate: s.vitals.hr ?? null,
      vital_resp_rate: s.vitals.rr ?? null,
      vital_temperature: s.vitals.temp ?? null,
      vital_spo2: s.vitals.spo2 ?? null,
      vital_weight_kg: s.vitals.weight ?? null,
      vital_height_cm: s.vitals.height ?? null,
      vital_pain_score: s.vitals.pain ?? null,
      consent_id: consentId,
      lawful_basis_code: s.lawfulBasis,
      lawful_basis_display: basisLabel(s.lawfulBasis),
      confidentiality_level: s.confidentiality,
      data_minimisation_note:
        s.confidentiality === "normal"
          ? "Minimum necessary data set for referral review."
          : "Restricted: clinical detail limited to what the receiving provider needs for the decision.",
      outcome_code: s.outcome?.code ?? null,
      outcome_display: s.outcome?.display ?? null,
      receiving_notes: s.outcome?.notes ?? null,
      appointment_at: s.appointmentHours != null ? isoHoursAgo(totalHours - s.appointmentHours) : null,
      accepted_at: acceptedAt,
      completed_at: completedAt,
      closed_at: closedAt,
      fhir_service_request_id: s.status === "draft" ? null : `sr-${refId}`,
      fhir_task_id: s.status === "draft" ? null : `task-${refId}`,
      fhir_encounter_id: s.status === "draft" ? null : `enc-${refId}`,
      fhir_bundle_version: s.timeline.length,
      fhir_patient_id: pid,
      fhir_validation_errors: 0,
      fhir_validation_warnings: s.status === "draft" ? 0 : s.lawfulBasis === "patient-consent" ? 0 : 1,
      routed_at: s.status === "draft" ? null : isoHoursAgo(totalHours),
      route_attempts: s.status === "draft" ? 0 : 1,
      route_channel: s.status === "draft" ? null : "shared-fhir-api",
      created_at: createdAt,
      updated_at: statusUpdatedAt,
      retention_until: new Date(Date.now() + 7 * 365 * 24 * 3_600_000).toISOString(),
    });

    // diagnoses
    for (const [i, d] of s.diagnoses.entries()) {
      await run(
        `INSERT INTO referral_diagnoses (id, referral_id, system, code, display, role, certainty, sequence)
         VALUES (?,?,?,?,?,?,?,?)`,
        newId("dx"),
        refId,
        systemKey(d.system),
        d.code,
        d.display,
        d.role,
        d.certainty ?? "confirmed",
        i,
      );
    }

    // observations
    for (const [i, o] of s.observations.entries()) {
      await run(
        `INSERT INTO referral_observations (
           id, referral_id, system, code, display, category, value_num, value_text,
           unit, ucum_code, ref_low, ref_high, effective_at, sequence
         ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
        newId("obs"),
        refId,
        systemKey(o.system),
        o.code,
        o.display,
        o.category,
        o.valueNum ?? null,
        o.valueText ?? null,
        o.unit ?? null,
        o.ucum ?? null,
        o.refLow ?? null,
        o.refHigh ?? null,
        isoHoursAgo(totalHours + 1),
        i,
      );
      observationCount++;
    }

    // medications
    for (const [i, m] of s.medications.entries()) {
      await run(
        `INSERT INTO referral_medications (id, referral_id, medication, dose, route, frequency, status, sequence)
         VALUES (?,?,?,?,?,?,?,?)`,
        newId("med"),
        refId,
        m.medication,
        m.dose,
        m.route,
        m.frequency,
        "active",
        i,
      );
    }

    // allergies
    for (const [i, a] of s.allergies.entries()) {
      await run(
        `INSERT INTO referral_allergies (id, referral_id, system, code, display, reaction, criticality, category, sequence)
         VALUES (?,?,?,?,?,?,?,?,?)`,
        newId("alg"),
        refId,
        systemKey(a.system),
        a.code,
        a.display,
        a.reaction,
        criticalityCode(a.criticality),
        a.category,
        i,
      );
    }

    // clinical attachments
    const attachments = buildAttachments(s, refId, referralNumber);
    for (const att of attachments) {
      await run(
        `INSERT INTO referral_attachments (
           id, referral_id, title, doc_type_code, doc_type_display, content_type,
           size_bytes, content_text, author_user_id, created_at, sha256, fhir_docref_id, retention_until
         ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`,
        att.id,
        refId,
        att.title,
        att.docTypeCode,
        att.docTypeDisplay,
        "text/plain",
        Buffer.byteLength(att.text, "utf8"),
        att.text,
        refUser,
        isoHoursAgo(totalHours + 1),
        sha256(att.text),
        att.id,
        new Date(Date.now() + 7 * 365 * 24 * 3_600_000).toISOString(),
      );
    }

    // timeline events (closed-loop audit of the workflow)
    for (const [i, t] of s.timeline.entries()) {
      const actorKey = t.actor && userId.has(t.actor) ? t.actor : null;
      const actorId = actorKey ? userId.get(actorKey) : null;
      const actorName = actorKey
        ? (USERS.find((u) => u.key === actorKey)?.name ?? null)
        : t.actor === "coord-dmgmc"
          ? "Roderick Manalo"
          : null;
      const actorRole = actorKey ? (USERS.find((u) => u.key === actorKey)?.role ?? null) : null;
      const actorFacilityKey = actorKey ? (USERS.find((u) => u.key === actorKey)?.facility ?? null) : null;

      const fromStatus = i === 0 ? null : s.timeline[i - 1].to;

      await run(
        `INSERT INTO referral_events (
           id, referral_id, sequence, from_status, to_status, action,
           fhir_task_status, business_status, actor_user_id, actor_name, actor_role,
           actor_facility, note, created_at, fhir_task_version
         ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
        newId("evt"),
        refId,
        i + 1,
        fromStatus,
        t.to,
        t.action,
        fhirTaskStatusFor(t.to),
        fhirBusinessStatusFor(t.to),
        actorId,
        actorName,
        actorRole,
        actorFacilityKey ? (facilityId.get(actorFacilityKey) ?? null) : null,
        t.note ?? null,
        isoHoursAgo(totalHours - t.hoursAfter),
        t.fhirTaskVersion,
      );
      eventCount++;
    }

    // feedback messages
    for (const f of s.feedback ?? []) {
      const actorKey = userId.has(f.actor) ? f.actor : null;
      const actorUser = actorKey ? USERS.find((u) => u.key === actorKey) : undefined;
      const senderFacilityIsReceiving = actorUser?.facility === s.receiving;
      await run(
        `INSERT INTO referral_messages (
           id, referral_id, kind, subject, body, sender_user_id, sender_name,
           sender_facility, recipient_facility, recipient_role, created_at, read_at
         ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`,
        newId("msg"),
        refId,
        f.kind,
        f.subject,
        f.body,
        actorKey ? (userId.get(actorKey) ?? null) : null,
        actorUser?.name ?? "HealthLink",
        senderFacilityIsReceiving ? s.receiving : s.referring,
        senderFacilityIsReceiving ? s.referring : s.receiving,
        "referring_provider",
        isoHoursAgo(totalHours - f.hoursAfter),
        isoHoursAgo(totalHours - f.hoursAfter - 2),
      );
      messageCount++;
    }
  }

  /* --- audit events: a representative trail, hash-chained --- */
  seedAuditTrail(userId, facilityId, patientId);

  /* --- materialise the FHIR resource store --- */
  // Every non-draft referral is persisted in the standardised representation
  // that the FHIR facade serves, so what a receiving system reads is exactly
  // what HealthLink validated.
  const seededReferrals = await all<{ id: string }>("SELECT id FROM referrals WHERE status <> 'draft'");
  let storedResources = 0;
  for (const r of seededReferrals) {
    const detail = await getReferralDetail(r.id);
    if (!detail) continue;
    try {
      const res = await persistReferralBundle(r.id, await mappingInputFor(detail), {
        sourceFacilityId: detail.referring_facility_id,
      });
      storedResources += res.stored;
      await run("UPDATE referrals SET fhir_bundle_version = ? WHERE id = ?", res.version, r.id);
    } catch (e) {
      console.error(`Failed to persist bundle for ${r.id}:`, e);
    }
  }

  setSettingInternal("retention.default_years", "7", "system");
  setSettingInternal("retention.attachments_months", "84", "system");
  setSettingInternal("access.default_ttl_hours", "24", "system");
  setSettingInternal("system.seeded_at", isoNow, "system");
  setSettingInternal("system.fhir_store_resources", String(storedResources), "system");

  void eventCount;
  void messageCount;
  void observationCount;
  void consentCount;

  return summarise();
}

async function setSettingInternal(key: string, value: string, by: string) {
  await run(
    `INSERT INTO system_settings (key, value, updated_at, updated_by) VALUES (?,?,?,?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
    key,
    value,
    new Date().toISOString(),
    by,
  );
}

function fhirTaskStatusFor(state: string): string {
  const map: Record<string, string> = {
    draft: "draft",
    submitted: "requested",
    received: "received",
    "under-review": "in-progress",
    "info-requested": "on-hold",
    accepted: "accepted",
    scheduled: "accepted",
    "in-progress": "in-progress",
    redirected: "rejected",
    rejected: "rejected",
    completed: "completed",
    "closed-feedback": "completed",
    cancelled: "cancelled",
  };
  return map[state] ?? "unknown";
}

function fhirBusinessStatusFor(state: string): string {
  const map: Record<string, string> = {
    draft: "draft",
    submitted: "submitted",
    received: "received-at-facility",
    "under-review": "under-review",
    "info-requested": "awaiting-information",
    accepted: "accepted",
    scheduled: "scheduled",
    "in-progress": "patient-seen",
    redirected: "redirected",
    rejected: "declined",
    completed: "completed",
    "closed-feedback": "closed",
    cancelled: "cancelled",
  };
  return map[state] ?? state;
}

function basisLabel(code: string): string {
  const map: Record<string, string> = {
    "patient-consent": "Patient consent (written or electronic)",
    "treatment-purpose": "Provision of medical treatment / care coordination",
    "vital-interest": "Protection of the data subject's vital interests",
    "lawful-obligation": "Compliance with a legal obligation",
    "public-health": "Public health and safety functions",
  };
  return map[code] ?? code;
}

function basisLegalRef(code: string): string {
  const map: Record<string, string> = {
    "patient-consent": "RA 10173 s.12(a); NPC Advisory Opinion No. 2018-056",
    "treatment-purpose": "RA 10173 s.12(b) / s.13(b)",
    "vital-interest": "RA 10173 s.12(c)",
    "lawful-obligation": "RA 10173 s.12(c) / s.13(c)",
    "public-health": "RA 10173 s.13(d)",
  };
  return map[code] ?? "";
}

/** Synthetic clinical documents attached to a referral. */
function buildAttachments(
  s: SeedReferral,
  refId: string,
  referralNumber: string,
): Array<{ id: string; title: string; docTypeCode: string; docTypeDisplay: string; text: string }> {
  const out: Array<{ id: string; title: string; docTypeCode: string; docTypeDisplay: string; text: string }> = [];

  const labLines = s.observations
    .filter((o) => o.category === "laboratory")
    .map((o) => {
      const val = o.valueNum != null ? o.valueNum : (o.valueText ?? "-");
      const range = o.refLow != null || o.refHigh != null ? ` (reference ${o.refLow ?? ""}${o.refLow != null && o.refHigh != null ? "-" : ""}${o.refHigh ?? ""}${o.unit ? " " + o.unit : ""})` : "";
      return `  ${o.display}: ${val}${o.valueNum != null && o.unit ? " " + o.unit : ""}${range}`;
    })
    .join("\n");

  if (labLines) {
    out.push({
      id: newId("att"),
      title: "Laboratory results",
      docTypeCode: "lab-result",
      docTypeDisplay: "Laboratory result",
      text:
        `LABORATORY RESULT\n` +
        `Referral: ${referralNumber}\n` +
        `Prepared at the referring facility\n\n` +
        `${labLines}\n\n` +
        `Interpretation: see the referring provider's assessment.\n` +
        `Synthetic demonstration data - not a real patient record.`,
    });
  }

  const examLines = s.observations
    .filter((o) => o.category === "exam" || o.category === "imaging")
    .map((o) => `  ${o.display}: ${o.valueText ?? "-"}`)
    .join("\n");

  if (examLines) {
    out.push({
      id: newId("att"),
      title: "Diagnostic examination report",
      docTypeCode: "diagnostic-report",
      docTypeDisplay: "Diagnostic report",
      text:
        `DIAGNOSTIC EXAMINATION REPORT\n` +
        `Referral: ${referralNumber}\n\n` +
        `${examLines}\n\n` +
        `Synthetic demonstration data - not a real patient record.`,
    });
  }

  out.push({
    id: newId("att"),
    title: "Referral clinical summary",
    docTypeCode: "referral-summary",
    docTypeDisplay: "Referral summary",
    text:
      `REFERRAL CLINICAL SUMMARY\n` +
      `Referral number: ${referralNumber}\n` +
      `Reason for referral: ${s.reasonDisplay}\n\n` +
      `CHIEF COMPLAINT\n${s.chiefComplaint}\n\n` +
      `HISTORY OF PRESENT ILLNESS\n${s.hpi}\n\n` +
      `PAST MEDICAL HISTORY\n${s.pmh}\n\n` +
      `PAST SURGICAL HISTORY\n${s.psh}\n\n` +
      `FAMILY HISTORY\n${s.famhx}\n\n` +
      `PERSONAL AND SOCIAL HISTORY\n${s.social}\n\n` +
      `REVIEW OF SYSTEMS\n${s.ros}\n\n` +
      `PHYSICAL EXAMINATION\n${s.pe}\n\n` +
      `ASSESSMENT\n${s.assessment}\n\n` +
      `MANAGEMENT TO DATE\n${s.plan}\n\n` +
      `REQUESTED ACTION\n${s.requested}\n\n` +
      `SPECIAL INSTRUCTIONS\n${s.instructions}\n\n` +
      `Synthetic demonstration data - not a real patient record.`,
  });

  void refId;
  return out;
}

/**
 * A representative audit trail for the seeded demo.
 *
 * Routed through `writeAudit` with an `occurredAt` override so that the seeded
 * history is hashed and chained by exactly the same code path that runs live.
 * Duplicating the hash construction here is what previously allowed the seeded
 * chain to diverge from the verifier.
 */
async function seedAuditTrail(
  userId: Map<string, string>,
  facilityId: Map<string, string>,
  patientId: Map<string, string>,
) {
  const entries: Array<{
    action: "C" | "R" | "U" | "D" | "E";
    eventType: string;
    eventSubtype?: string;
    actor: string | null;
    patient?: string;
    referral?: string;
    entityType?: string;
    entityId?: string;
    description: string;
    outcome?: "0" | "4" | "8" | "12";
    hoursAgo: number;
    purpose?: string;
    ip?: string;
  }> = [
    { action: "E", eventType: "login", eventSubtype: "success", actor: "dr-santos", description: "Successful sign-in for physician@agdao.example.ph (physician).", hoursAgo: 240, purpose: "treatment", ip: "192.168.10.21" },
    { action: "C", eventType: "create", actor: "dr-santos", patient: "p-sarmiento", entityType: "Referral", description: "Created referral for dengue with warning signs.", hoursAgo: 239 },
    { action: "E", eventType: "validate", actor: "dr-santos", entityType: "Bundle", description: "Validated referral against FHIR R4 and PH Core v0.2.0 profiles: 0 errors, 2 warnings.", hoursAgo: 239 },
    { action: "E", eventType: "route", actor: "dr-santos", entityType: "ServiceRequest", description: "Routed referral over the shared FHIR API to Davao Metro Government Medical Center.", hoursAgo: 239 },
    { action: "R", eventType: "read", actor: "nurse-dmgmc", patient: "p-sarmiento", entityType: "ServiceRequest", description: "Opened referral at receiving facility for triage.", hoursAgo: 238.6, purpose: "treatment", ip: "192.168.20.11" },
    { action: "U", eventType: "workflow", actor: "nurse-dmgmc", entityType: "Task", description: "Acknowledged receipt of referral.", hoursAgo: 238.6 },
    { action: "R", eventType: "read", actor: "dr-gonzales", patient: "p-sarmiento", entityType: "DocumentReference", description: "Reviewed clinical summary and attached laboratory results.", hoursAgo: 238.2, purpose: "treatment" },
    { action: "U", eventType: "workflow", actor: "dr-gonzales", entityType: "Task", description: "Accepted referral for admission under Internal Medicine.", hoursAgo: 237.8 },
    { action: "C", eventType: "create", actor: "dr-gonzales", entityType: "Communication", description: "Recorded clinical outcome and discharge summary as feedback.", hoursAgo: 168 },
    { action: "R", eventType: "read", actor: "dr-santos", patient: "p-sarmiento", entityType: "Communication", description: "Read feedback and discharge summary returned by the receiving facility.", hoursAgo: 140 },
    { action: "U", eventType: "workflow", actor: "dr-santos", entityType: "Task", description: "Acknowledged feedback and closed the referral loop.", hoursAgo: 140 },

    { action: "E", eventType: "login", eventSubtype: "failed", actor: "dr-villanueva", description: "Failed sign-in attempt for physician@talomo.example.ph.", outcome: "8", hoursAgo: 130, ip: "203.177.8.44" },
    { action: "E", eventType: "login", eventSubtype: "success", actor: "dr-villanueva", description: "Successful sign-in for physician@talomo.example.ph (physician).", hoursAgo: 129.9, ip: "203.177.8.44" },
    { action: "C", eventType: "create", actor: "dr-villanueva", patient: "p-dela-pena", entityType: "Referral", description: "Created emergency transfer referral for suspected anterior STEMI.", hoursAgo: 129 },
    { action: "E", eventType: "validate", actor: "dr-villanueva", entityType: "Bundle", description: "Validated referral: 0 errors, 1 advisory finding (allergy history not recorded).", hoursAgo: 129 },
    { action: "E", eventType: "route", actor: "dr-villanueva", entityType: "ServiceRequest", description: "Routed emergency transfer with STAT priority to Synapse Regional Medical Center.", hoursAgo: 129 },
    { action: "R", eventType: "read", actor: "nurse-synapse", patient: "p-dela-pena", entityType: "ServiceRequest", description: "Opened emergency referral in the receiving queue.", hoursAgo: 128.9, purpose: "treatment" },
    { action: "U", eventType: "workflow", actor: "dr-cruz", entityType: "Task", description: "Accepted referral for primary PCI; catheterization laboratory activated.", hoursAgo: 128.7 },
    { action: "C", eventType: "create", actor: "dr-cruz", entityType: "Communication", description: "Recorded post-procedure outcome and cardiac discharge summary.", hoursAgo: 125 },
    { action: "R", eventType: "export", actor: "auditor-privacy", entityType: "Bundle", description: "Exported audit trail for the period covering the emergency transfer, for compliance review.", hoursAgo: 100, purpose: "oversight" },

    { action: "E", eventType: "login", eventSubtype: "success", actor: "dr-reyes", description: "Successful sign-in for physician@buhangin.example.ph (physician).", hoursAgo: 96, purpose: "treatment", ip: "192.168.30.5" },
    { action: "C", eventType: "create", actor: "dr-reyes", patient: "p-maquiling", entityType: "Referral", description: "Created referral for poorly controlled type 2 diabetes mellitus.", hoursAgo: 95 },
    { action: "E", eventType: "consent", actor: "dr-reyes", patient: "p-maquiling", entityType: "Consent", description: "Recorded patient consent for referral exchange; scope limited to the receiving facility.", hoursAgo: 95 },
    { action: "E", eventType: "route", actor: "dr-reyes", entityType: "ServiceRequest", description: "Routed referral to Synapse Regional Medical Center endocrinology service.", hoursAgo: 94.8 },
    { action: "U", eventType: "workflow", actor: "dr-cruz", entityType: "Task", description: "Requested additional information: recent HbA1c, creatinine with eGFR, and urine albumin-to-creatinine ratio.", hoursAgo: 68 },
    { action: "R", eventType: "read", actor: "dr-reyes", entityType: "Communication", description: "Read the request for additional information from the receiving facility.", hoursAgo: 50 },

    { action: "E", eventType: "login", eventSubtype: "success", actor: "nurse-dela-cruz", description: "Successful sign-in for nurse@buhangin.example.ph (nurse).", hoursAgo: 30, purpose: "treatment" },
    { action: "C", eventType: "create", actor: "nurse-dela-cruz", patient: "p-fuentes", entityType: "Referral", description: "Created referral for smear-positive pulmonary tuberculosis.", hoursAgo: 29 },
    { action: "E", eventType: "route", actor: "nurse-dela-cruz", entityType: "ServiceRequest", description: "Routed referral to the Davao Metro Government Medical Center TB-DOTS programme.", hoursAgo: 28.9 },
    { action: "U", eventType: "workflow", actor: "dr-abdul", entityType: "Task", description: "Began clinical review of the tuberculosis referral.", hoursAgo: 23 },

    { action: "E", eventType: "login", eventSubtype: "success", actor: "nurse-agdao", description: "Successful sign-in for nurse@agdao.example.ph (nurse).", hoursAgo: 8, purpose: "treatment", ip: "192.168.10.33" },
    { action: "C", eventType: "create", actor: "nurse-agdao", patient: "p-tan", entityType: "Referral", description: "Created urgent maternal referral for suspected pre-eclampsia at 35 weeks.", hoursAgo: 7 },
    { action: "E", eventType: "consent", actor: "nurse-agdao", patient: "p-tan", entityType: "Consent", description: "Recorded patient consent for referral exchange to the receiving obstetric service.", hoursAgo: 7 },
    { action: "E", eventType: "route", actor: "nurse-agdao", entityType: "ServiceRequest", description: "Routed urgent maternal referral to Synapse Regional Medical Center.", hoursAgo: 6.9 },

    { action: "R", eventType: "read", actor: "admin-hie", entityType: "Referral", description: "Reviewed cross-facility referral queue for HIE operations monitoring.", hoursAgo: 3, purpose: "operations" },
    { action: "R", eventType: "read", actor: "auditor-privacy", entityType: "ServiceRequest", description: "Reviewed the audit hash-chain integrity report: chain intact.", hoursAgo: 2, purpose: "oversight" },
    { action: "U", eventType: "security", actor: "admin-hie", entityType: "Configuration", description: "Updated retention policy: default retention set to 7 years for clinical records.", hoursAgo: 1.5 },

    // Two refused attempts, so the trail demonstrates that blocked access is
    // recorded rather than silently discarded.
    { action: "R", eventType: "security", eventSubtype: "facade-scope-denied", actor: "dr-villanueva", entityType: "ServiceRequest", description: "Refused: attempted to open a referral belonging to another facility's patient.", outcome: "8", hoursAgo: 1.2, ip: "203.177.8.44" },
    { action: "E", eventType: "security", eventSubtype: "attachment-denied", actor: "coord-diag", entityType: "DocumentReference", description: "Refused: role does not include attachment access.", outcome: "8", hoursAgo: 0.8, ip: "192.168.50.7" },
  ];

  // Insert oldest first so the chain is built in chronological order.
  const ordered = [...entries].sort((a, b) => b.hoursAgo - a.hoursAgo);

  for (const e of ordered) {
    const actorId = e.actor ? (userId.get(e.actor) ?? null) : null;
    const actor = e.actor ? USERS.find((u) => u.key === e.actor) : undefined;

    await writeAudit({
      action: e.action,
      eventType: e.eventType,
      eventSubtype: e.eventSubtype,
      actorUserId: actorId,
      actorName: actor?.name ?? null,
      actorRole: actor?.role ?? null,
      actorFacility: actor?.facility ? (facilityId.get(actor.facility) ?? null) : null,
      patientId: e.patient ? (patientId.get(e.patient) ?? null) : null,
      entityType: e.entityType ?? null,
      entityId: e.entityId ?? null,
      outcome: e.outcome ?? "0",
      outcomeDesc: e.outcome === "8" ? "Failure" : "Success",
      purposeCode: e.purpose ?? null,
      description: e.description,
      ipAddress: e.ip ?? null,
      networkType: e.ip ? "2" : null,
      occurredAt: isoHoursAgo(e.hoursAgo),
    });
  }
}

async function summarise(): Promise<SeedSummary> {
  const count = async (table: string) => (await get<{ n: number }>(`SELECT COUNT(*) AS n FROM ${table}`))?.n ?? 0;
  return {
    facilities: await count("facilities"),
    users: await count("users"),
    patients: await count("patients"),
    consents: await count("consents"),
    referrals: await count("referrals"),
    events: await count("referral_events"),
    messages: await count("referral_messages"),
    observations: await count("referral_observations"),
    auditEvents: await count("audit_events"),
  };
}

export async function resetAndSeed(): Promise<SeedSummary> {
  return await seed({ reset: true });
}

export async function isSeeded(): Promise<boolean> {
  const row = await get<{ n: number }>("SELECT COUNT(*) AS n FROM facilities");
  return (row?.n ?? 0) > 0;
}

export { FACILITIES, USERS, PATIENTS, SCENARIOS, all };
