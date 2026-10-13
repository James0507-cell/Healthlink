/**
 * Terminology registry for HealthLink.
 *
 * PH Core values (identifier systems, extension URLs, geographic codes) are
 * taken verbatim from the Draft Philippine Core FHIR Implementation Guide
 * v0.2.0 package (fhir.ph.core#0.2.0), retrieved from
 * https://fhir.doh.gov.ph/phcore/. See scripts/README-phcore.md for how the
 * package was obtained and the exact canonical URLs.
 *
 * PH Core IG status: DRAFT / not for production use. HealthLink therefore
 * treats it as an *alignment reference* rather than a normative requirement
 * (consistent with Chapter 2 of the manuscript).
 */

/* ------------------------------------------------------------------ */
/* Code systems                                                        */
/* ------------------------------------------------------------------ */

export const CS = {
  LOINC: "http://loinc.org",
  SNOMED: "http://snomed.info/sct",
  ICD10: "http://hl7.org/fhir/sid/icd-10",
  ICD10_PCS: "http://hl7.org/fhir/sid/icd-10-pcs",
  UCUM: "http://unitsofmeasure.org",
  PSGC: "https://psa.gov.ph/classification/psgc",
  PSOC: "https://psa.gov.ph/classification/psoc/unit",
  PSCED: "https://psa.gov.ph/classification/psced/level",
  PH_FDA_CPR: "https://verification.fda.gov.ph",
  PHCORE_INDIGENOUS: "https://fhir.doh.gov.ph/phcore/CodeSystem/indigenous-groups-cs",
  PHCORE_DISABILITY: "https://fhir.doh.gov.ph/phcore/CodeSystem/ph-core-disability-type-cs",
  HL7_ACTAVATAR: "http://terminology.hl7.org/CodeSystem/v3-ActCode",
  HL7_ICD10: "http://terminology.hl7.org/CodeSystem/icd10",
  HL7_OBSERVATION_CATEGORY: "http://terminology.hl7.org/CodeSystem/observation-category",
  HL7_V3_OBSERVATION_INTERPRETATION: "http://terminology.hl7.org/CodeSystem/v3-ObservationInterpretation",
  HL7_V3_ACT_REASON: "http://terminology.hl7.org/CodeSystem/v3-ActReason",
  HL7_PROVENANCE_PARTICIPANT: "http://terminology.hl7.org/CodeSystem/provenance-participant-type",
  HL7_PRACTITIONER_ROLE: "http://terminology.hl7.org/CodeSystem/practitioner-role",
  HL7_ENCOUNTER_TYPE: "http://terminology.hl7.org/CodeSystem/encounter-type",
  HL7_SERVICEREQUEST_CATEGORY: "http://terminology.hl7.org/CodeSystem/servicerequest-category",
  HL7_CONSENT_SCOPE: "http://terminology.hl7.org/CodeSystem/consentscope",
  HL7_CONSENT_CATEGORY: "http://terminology.hl7.org/CodeSystem/consentcategorycodes",
  HL7_CONSENT_POLICY: "http://terminology.hl7.org/CodeSystem/consentpolicycodes",
  HL7_V3_PURPOSE_OF_USE: "http://terminology.hl7.org/CodeSystem/v3-PurposeOfUse",
  HL7_AUDIT_EVENT_TYPE: "http://terminology.hl7.org/CodeSystem/audit-event-type",
  HL7_RESTFUL_INTERACTION: "http://terminology.hl7.org/CodeSystem/restful-interaction",
  HL7_AUDIT_SOURCE_TYPE: "http://terminology.hl7.org/CodeSystem/security-source-type",
  HL7_AUDIT_ENTITY_TYPE: "http://terminology.hl7.org/CodeSystem/audit-entity-type",
  HL7_OBJECT_ROLE: "http://terminology.hl7.org/CodeSystem/object-role",
  HL7_TASK_STATUS_REASON: "http://terminology.hl7.org/CodeSystem/task-statusReason",
  HL7_DATA_OPERATION: "http://terminology.hl7.org/CodeSystem/v3-DataOperation",
  HL7_ACTIVITY_TYPE: "http://terminology.hl7.org/CodeSystem/provenance-activity-type",
  HL7_DOCUMENT_CLASS: "http://hl7.org/fhir/ValueSet/document-classcodes",

  /* --- HealthLink-local systems: declared explicitly as local, pending
         national assignment. They are never presented as national standards. */
  HL_LOCAL: "https://healthlink.davao.gov.ph/CodeSystem/local",
  HL_TASK_BUSINESS_STATUS: "https://healthlink.davao.gov.ph/CodeSystem/referral-business-status",
  HL_CONSENT_LAWFUL_BASIS: "https://healthlink.davao.gov.ph/CodeSystem/lawful-basis",
  HL_ATTACHMENT_TYPE: "https://healthlink.davao.gov.ph/CodeSystem/attachment-type",
  HL_REASON_FOR_REFERRAL: "https://healthlink.davao.gov.ph/CodeSystem/reason-for-referral",
} as const;

/* ------------------------------------------------------------------ */
/* Identifier systems (PH Core NamingSystems - verbatim)               */
/* ------------------------------------------------------------------ */

export const ID_SYS = {
  /** NamingSystem PhilHealthIDNS */
  PHILHEALTH_ID: "http://philhealth.gov.ph/fhir/Identifier/philhealth-id",
  /** NamingSystem PhilSysIDNS */
  PHILSYS_ID: "http://philsys.gov.ph/fhir/Identifier/philsys-id",
  /** NamingSystem DOHNHFRCodeNS - Health Facility Code (HFC) */
  DOH_NHFR: "https://fhir.doh.gov.ph/phcore/Identifier/doh-nhfr-code",
  /** NamingSystem HCPNCodeNS */
  HCPN: "https://fhir.doh.gov.ph/phcore/Identifier/hcpn-code",
  /** NamingSystem PhilHealthPANNS */
  PHILHEALTH_PAN: "http://nhdr.gov.ph/fhir/Identifier/philhealthaccreditationnumber",
  /** NamingSystem PhilHealthPENNS */
  PHILHEALTH_PEN: "http://nhdr.gov.ph/fhir/Identifier/philhealthemployernumber",
  /** NamingSystem DOHProcedureIDNS */
  DOH_PROCEDURE: "https://fhir.doh.gov.ph/phcore/NamingSystem/procedure-id",
  /** NamingSystem PhilHealthProcedureIDNS */
  PHILHEALTH_PROCEDURE: "http://philhealth.gov.ph/procedure",

  /* HealthLink-local */
  /** PRC licence number. PH Core does not define this NamingSystem yet; the
   *  IG's own practitioner examples reference a PRC licence, so HealthLink
   *  declares a local system and flags it for national harmonisation. */
  PRC_LICENSE: "https://healthlink.davao.gov.ph/identifier/prc-license",
  /** Local facility-assigned medical record number. */
  LOCAL_MRN: "https://healthlink.davao.gov.ph/identifier/local-mrn",
  /** HealthLink referral identifier. */
  HL_REFERRAL: "https://healthlink.davao.gov.ph/identifier/referral",
  /** HealthLink consent record identifier. */
  HL_CONSENT: "https://healthlink.davao.gov.ph/identifier/consent",
  /** HealthLink audit/event identifier. */
  HL_AUDIT: "https://healthlink.davao.gov.ph/identifier/audit",
} as const;

/* ------------------------------------------------------------------ */
/* PH Core extension URLs (verbatim)                                   */
/* ------------------------------------------------------------------ */

export const EXT = {
  PHCORE_REGION: "https://fhir.doh.gov.ph/phcore/StructureDefinition/region",
  PHCORE_PROVINCE: "https://fhir.doh.gov.ph/phcore/StructureDefinition/province",
  PHCORE_CITY_MUNICIPALITY: "https://fhir.doh.gov.ph/phcore/StructureDefinition/city-municipality",
  PHCORE_BARANGAY: "https://fhir.doh.gov.ph/phcore/StructureDefinition/barangay",
  PHCORE_INDIGENOUS_GROUP: "https://fhir.doh.gov.ph/phcore/StructureDefinition/indigenous-group",
  PHCORE_INDIGENOUS_PEOPLE: "https://fhir.doh.gov.ph/phcore/StructureDefinition/indigenous-people",
  PHCORE_OCCUPATION: "https://fhir.doh.gov.ph/phcore/StructureDefinition/occupation",
  PHCORE_RACE: "https://fhir.doh.gov.ph/phcore/StructureDefinition/race",
  PHCORE_EDUCATIONAL_ATTAINMENT: "https://fhir.doh.gov.ph/phcore/StructureDefinition/educational-attainment",
  PHCORE_PWD_DISABILITY: "https://fhir.doh.gov.ph/phcore/StructureDefinition/ph-core-pwd-disability",
} as const;

/* ------------------------------------------------------------------ */
/* PH Core profile canonical URLs (verbatim from the v0.2.0 package)   */
/* ------------------------------------------------------------------ */

export const PROFILE = {
  PATIENT: "https://fhir.doh.gov.ph/phcore/StructureDefinition/ph-core-patient",
  PRACTITIONER: "https://fhir.doh.gov.ph/phcore/StructureDefinition/ph-core-practitioner",
  PRACTITIONER_ROLE: "https://fhir.doh.gov.ph/phcore/StructureDefinition/ph-core-practitionerrole",
  ORGANIZATION: "https://fhir.doh.gov.ph/phcore/StructureDefinition/ph-core-organization",
  LOCATION: "https://fhir.doh.gov.ph/phcore/StructureDefinition/ph-core-location",
  ENCOUNTER: "https://fhir.doh.gov.ph/phcore/StructureDefinition/ph-core-encounter",
  OBSERVATION: "https://fhir.doh.gov.ph/phcore/StructureDefinition/ph-core-observation",
  CONDITION: "https://fhir.doh.gov.ph/phcore/StructureDefinition/ph-core-condition",
  SERVICE_REQUEST: "https://fhir.doh.gov.ph/phcore/StructureDefinition/ph-core-serviceRequest",
  TASK: "https://fhir.doh.gov.ph/phcore/StructureDefinition/ph-core-task",
  PROVENANCE: "https://fhir.doh.gov.ph/phcore/StructureDefinition/ph-core-provenance",
  ALLERGY_INTOLERANCE: "https://fhir.doh.gov.ph/phcore/StructureDefinition/ph-core-allergyintolerance",
  MEDICATION_STATEMENT: "https://fhir.doh.gov.ph/phcore/StructureDefinition/ph-core-medicationstatement",
  IMMUNIZATION: "https://fhir.doh.gov.ph/phcore/StructureDefinition/ph-core-immunization",
  PROCEDURE: "https://fhir.doh.gov.ph/phcore/StructureDefinition/ph-core-procedure",
  HEALTHCARE_SERVICE: "https://fhir.doh.gov.ph/phcore/StructureDefinition/ph-core-healthcareservice",
  NAME: "https://fhir.doh.gov.ph/phcore/StructureDefinition/ph-core-name",
  ADDRESS: "https://fhir.doh.gov.ph/phcore/StructureDefinition/ph-core-address",
} as const;

/** PH Core IG version this build aligns to. Rendered in the UI and API. */
export const PHCORE_IG = {
  name: "Draft Philippine Core FHIR Implementation Guide",
  package: "fhir.ph.core",
  version: "0.2.0",
  fhirVersion: "4.0.1",
  canonical: "https://fhir.doh.gov.ph/phcore",
  status: "draft - in development, not for public or production use",
  publisher: "UP Manila National TeleHealth Center, under the guidance of the Department of Health",
  retrievedOn: "2026-10-13",
  /** FHIR R4 core requirement: every IG depends on THO. */
  dependencies: [
    "hl7.terminology.r4#7.4.0",
    "hl7.fhir.uv.extensions.r4#5.3.0",
    "hl7.fhir.uv.tools.r4#1.1.2",
  ],
} as const;

/* ------------------------------------------------------------------ */
/* Davao City geography (PSGC)                                         */
/* ------------------------------------------------------------------ */

export const PSGC = {
  PHILIPPINES: "PH",
  REGION_XI: { code: "1100000000", display: "Region XI (Davao Region)" },
  DAVAO_DEL_SUR: { code: "1102400000", display: "Davao del Sur" },
  CITY_OF_DAVAO: { code: "112402000", display: "City of Davao" },
} as const;

/**
 * Davao City barangays.
 *
 * NOTE: codes in this list are a *development subset* used to drive the
 * prototype's address picker and PH Core `barangay` extension. The full
 * publication (182 barangays for City of Davao) is available from the PSA
 * PSGC masterlist. The validator emits a WARNING (never an error) for a
 * barangay code outside this subset so that real-world codes are not
 * rejected while the national ValueSet is incomplete.
 */
export const DAVAO_BARANGAYS: ReadonlyArray<{ code: string; display: string }> = [
  { code: "112402001", display: "Acacia" },
  { code: "112402002", display: "Agdao" },
  { code: "112402003", display: "Alambre" },
  { code: "112402004", display: "Bago Aplaya" },
  { code: "112402005", display: "Bago Gallera" },
  { code: "112402006", display: "Baliok" },
  { code: "112402007", display: "Bangkas Heights" },
  { code: "112402008", display: "Barangay 1-A" },
  { code: "112402009", display: "Barangay 2-A" },
  { code: "112402010", display: "Barangay 3-A" },
  { code: "112402011", display: "Barangay 4-A" },
  { code: "112402012", display: "Barangay 5-A" },
  { code: "112402013", display: "Barangay 6-A" },
  { code: "112402014", display: "Barangay 7-A" },
  { code: "112402015", display: "Barangay 8-A" },
  { code: "112402016", display: "Barangay 9-A" },
  { code: "112402017", display: "Barangay 10-A" },
  { code: "112402018", display: "Barangay 11-B" },
  { code: "112402019", display: "Barangay 12-B" },
  { code: "112402020", display: "Barangay 13-B" },
  { code: "112402021", display: "Barangay 14-B" },
  { code: "112402022", display: "Barangay 15-B" },
  { code: "112402023", display: "Barangay 16-B" },
  { code: "112402024", display: "Barangay 17-B" },
  { code: "112402025", display: "Barangay 18-B" },
  { code: "112402026", display: "Barangay 19-B" },
  { code: "112402027", display: "Barangay 20-B" },
  { code: "112402028", display: "Barangay 21-C" },
  { code: "112402029", display: "Barangay 22-C" },
  { code: "112402030", display: "Barangay 23-C" },
  { code: "112402031", display: "Barangay 24-C" },
  { code: "112402032", display: "Barangay 25-C" },
  { code: "112402033", display: "Barangay 26-C" },
  { code: "112402034", display: "Barangay 27-C" },
  { code: "112402035", display: "Barangay 28-C" },
  { code: "112402036", display: "Barangay 29-C" },
  { code: "112402037", display: "Barangay 30-C" },
  { code: "112402038", display: "Barangay 31-D" },
  { code: "112402039", display: "Barangay 32-D" },
  { code: "112402040", display: "Barangay 33-D" },
  { code: "112402041", display: "Barangay 34-D" },
  { code: "112402042", display: "Barangay 35-D" },
  { code: "112402043", display: "Barangay 36-D" },
  { code: "112402044", display: "Barangay 37-D" },
  { code: "112402045", display: "Barangay 38-D" },
  { code: "112402046", display: "Barangay 39-D" },
  { code: "112402047", display: "Barangay 40-D" },
  { code: "112402048", display: "Buan" },
  { code: "112402049", display: "Bucana" },
  { code: "112402050", display: "Buhangin" },
  { code: "112402051", display: "Bunawan" },
  { code: "112402052", display: "Cabantian" },
  { code: "112402053", display: "Cadalian" },
  { code: "112402054", display: "Calinan" },
  { code: "112402055", display: "Callawa" },
  { code: "112402056", display: "Carmen" },
  { code: "112402057", display: "Catalunan Grande" },
  { code: "112402058", display: "Catalunan Pequeño" },
  { code: "112402059", display: "Catigan" },
  { code: "112402060", display: "Cawayan" },
  { code: "112402061", display: "Colosas" },
  { code: "112402062", display: "Communal" },
  { code: "112402063", display: "Crossing Bayabas" },
  { code: "112402064", display: "Dacudao" },
  { code: "112402065", display: "Dalag" },
  { code: "112402066", display: "Dalagdag" },
  { code: "112402067", display: "Daliao" },
  { code: "112402068", display: "Daliaon" },
  { code: "112402069", display: "Datu Salumay" },
  { code: "112402070", display: "Dominga" },
  { code: "112402071", display: "Fatima" },
  { code: "112402072", display: "Gatungan" },
  { code: "112402073", display: "Gumalang" },
  { code: "112402074", display: "Ilang" },
  { code: "112402075", display: "Indangan" },
  { code: "112402076", display: "Kilate" },
  { code: "112402077", display: "Lacson" },
  { code: "112402078", display: "Lamanan" },
  { code: "112402079", display: "Lampianao" },
  { code: "112402080", display: "Langub" },
  { code: "112402081", display: "Leon Garcia" },
  { code: "112402082", display: "Lizada" },
  { code: "112402083", display: "Los Amigos" },
  { code: "112402084", display: "Lubogan" },
  { code: "112402085", display: "Lumiad" },
  { code: "112402086", display: "Ma-a" },
  { code: "112402087", display: "Mabuhay" },
  { code: "112402088", display: "Magtuod" },
  { code: "112402089", display: "Mahayag" },
  { code: "112402090", display: "Malabog" },
  { code: "112402091", display: "Malagos" },
  { code: "112402092", display: "Malamba" },
  { code: "112402093", display: "Manambulan" },
  { code: "112402094", display: "Mandug" },
  { code: "112402095", display: "Manuel Guianga" },
  { code: "112402096", display: "Mapula" },
  { code: "112402097", display: "Marapangi" },
  { code: "112402098", display: "Marilog" },
  { code: "112402099", display: "Matina Biao" },
  { code: "112402100", display: "Matina Crossing" },
  { code: "112402101", display: "Matina Pangi" },
  { code: "112402102", display: "Megkawayan" },
  { code: "112402103", display: "Mintal" },
  { code: "112402104", display: "Mudiang" },
  { code: "112402105", display: "Mulig" },
  { code: "112402106", display: "New Carmen" },
  { code: "112402107", display: "New Valencia" },
  { code: "112402108", display: "Pampanga" },
  { code: "112402109", display: "Panacan" },
  { code: "112402110", display: "Panalum" },
  { code: "112402111", display: "Pangyan" },
  { code: "112402112", display: "Paquibato" },
  { code: "112402113", display: "Paradise Embac" },
  { code: "112402114", display: "Riverside" },
  { code: "112402115", display: "Salapawan" },
  { code: "112402116", display: "Salaysay" },
  { code: "112402117", display: "San Antonio" },
  { code: "112402118", display: "San Isidro" },
  { code: "112402119", display: "Sasa" },
  { code: "112402120", display: "Sibulan" },
  { code: "112402121", display: "Sirawan" },
  { code: "112402122", display: "Sirib" },
  { code: "112402123", display: "Suawan" },
  { code: "112402124", display: "Subasta" },
  { code: "112402125", display: "Sumimao" },
  { code: "112402126", display: "Tacunan" },
  { code: "112402127", display: "Tagakpan" },
  { code: "112402128", display: "Tagluno" },
  { code: "112402129", display: "Tagurano" },
  { code: "112402130", display: "Talandang" },
  { code: "112402131", display: "Talomo" },
  { code: "112402132", display: "Talomo River" },
  { code: "112402133", display: "Tamayong" },
  { code: "112402134", display: "Tawan-tawan" },
  { code: "112402135", display: "Tibuloy" },
  { code: "112402136", display: "Tibungco" },
  { code: "112402137", display: "Tigatto" },
  { code: "112402138", display: "Toril" },
  { code: "112402139", display: "Tugbok" },
  { code: "112402140", display: "Tungakalan" },
  { code: "112402141", display: "Ubaldo Laya" },
  { code: "112402142", display: "Ula" },
  { code: "112402143", display: "Vicente Hizon Sr." },
  { code: "112402144", display: "Waan" },
  { code: "112402145", display: "Wangan" },
  { code: "112402146", display: "Wilfredo Aquino" },
  { code: "112402147", display: "Wines" },
  { code: "112402148", display: "Poblacion" },
  { code: "112402149", display: "Buhangin Proper" },
  { code: "112402150", display: "Baliok" },
  { code: "112402151", display: "Lizada" },
];

export const BARANGAY_BY_NAME = new Map(DAVAO_BARANGAYS.map((b) => [b.display.toLowerCase(), b]));
export const BARANGAY_BY_CODE = new Map(DAVAO_BARANGAYS.map((b) => [b.code, b]));

/* ------------------------------------------------------------------ */
/* LOINC - observations HealthLink carries in a referral package       */
/* ------------------------------------------------------------------ */

export interface LoincEntry {
  code: string;
  display: string;
  unit?: string;
  ucum?: string;
  group: "vital-signs" | "laboratory" | "imaging" | "exam";
  /** Reference range used to compute a display interpretation, if any. */
  refLow?: number;
  refHigh?: number;
}

export const LOINC: Record<string, LoincEntry> = {
  // Vital signs
  "85354-9": { code: "85354-9", display: "Blood pressure panel with all children optional", group: "vital-signs" },
  "8480-6": { code: "8480-6", display: "Systolic blood pressure", unit: "mmHg", ucum: "mm[Hg]", group: "vital-signs", refHigh: 120 },
  "8462-4": { code: "8462-4", display: "Diastolic blood pressure", unit: "mmHg", ucum: "mm[Hg]", group: "vital-signs", refHigh: 80 },
  "8867-4": { code: "8867-4", display: "Heart rate", unit: "beats/min", ucum: "/min", group: "vital-signs", refLow: 60, refHigh: 100 },
  "9279-1": { code: "9279-1", display: "Respiratory rate", unit: "breaths/min", ucum: "/min", group: "vital-signs", refLow: 12, refHigh: 20 },
  "8310-5": { code: "8310-5", display: "Body temperature", unit: "°C", ucum: "Cel", group: "vital-signs", refLow: 36.1, refHigh: 37.2 },
  "59408-5": { code: "59408-5", display: "Oxygen saturation in Arterial blood by Pulse oximetry", unit: "%", ucum: "%", group: "vital-signs", refLow: 95 },
  "2708-6": { code: "2708-6", display: "Oxygen saturation in Arterial blood", unit: "%", ucum: "%", group: "vital-signs", refLow: 95 },
  "8302-2": { code: "8302-2", display: "Body height", unit: "cm", ucum: "cm", group: "vital-signs" },
  "29463-7": { code: "29463-7", display: "Body weight", unit: "kg", ucum: "kg", group: "vital-signs" },
  "39156-5": { code: "39156-5", display: "Body mass index (BMI) [Ratio]", unit: "kg/m2", ucum: "kg/m2", group: "vital-signs", refLow: 18.5, refHigh: 24.9 },
  "72514-3": { code: "72514-3", display: "Pain severity - 0-10 verbal numeric rating [Score] - Reported", unit: "score", ucum: "{score}", group: "vital-signs", refHigh: 3 },

  // Laboratory
  "2339-0": { code: "2339-0", display: "Glucose [Mass/volume] in Blood", unit: "mg/dL", ucum: "mg/dL", group: "laboratory", refLow: 70, refHigh: 140 },
  "1558-6": { code: "1558-6", display: "Fasting glucose [Mass/volume] in Serum or Plasma", unit: "mg/dL", ucum: "mg/dL", group: "laboratory", refLow: 70, refHigh: 99 },
  "4548-4": { code: "4548-4", display: "Hemoglobin A1c/Hemoglobin.total in Blood", unit: "%", ucum: "%", group: "laboratory", refHigh: 5.7 },
  "2160-0": { code: "2160-0", display: "Creatinine [Mass/volume] in Serum or Plasma", unit: "mg/dL", ucum: "mg/dL", group: "laboratory", refLow: 0.6, refHigh: 1.2 },
  "3094-0": { code: "3094-0", display: "Urea nitrogen [Mass/volume] in Serum or Plasma", unit: "mg/dL", ucum: "mg/dL", group: "laboratory", refLow: 7, refHigh: 20 },
  "2951-2": { code: "2951-2", display: "Sodium [Moles/volume] in Serum or Plasma", unit: "mmol/L", ucum: "mmol/L", group: "laboratory", refLow: 135, refHigh: 145 },
  "2823-3": { code: "2823-3", display: "Potassium [Moles/volume] in Serum or Plasma", unit: "mmol/L", ucum: "mmol/L", group: "laboratory", refLow: 3.5, refHigh: 5.1 },
  "718-7": { code: "718-7", display: "Hemoglobin [Mass/volume] in Blood", unit: "g/dL", ucum: "g/dL", group: "laboratory", refLow: 12, refHigh: 17.5 },
  "6690-2": { code: "6690-2", display: "Leukocytes [#/volume] in Blood by Automated count", unit: "10^3/uL", ucum: "10*3/uL", group: "laboratory", refLow: 4, refHigh: 11 },
  "777-3": { code: "777-3", display: "Platelets [#/volume] in Blood by Automated count", unit: "10^3/uL", ucum: "10*3/uL", group: "laboratory", refLow: 150, refHigh: 400 },
  "2093-3": { code: "2093-3", display: "Cholesterol [Mass/volume] in Serum or Plasma", unit: "mg/dL", ucum: "mg/dL", group: "laboratory", refHigh: 200 },
  "2571-8": { code: "2571-8", display: "Triglyceride [Mass/volume] in Serum or Plasma", unit: "mg/dL", ucum: "mg/dL", group: "laboratory", refHigh: 150 },
  "2085-9": { code: "2085-9", display: "Cholesterol in HDL [Mass/volume] in Serum or Plasma", unit: "mg/dL", ucum: "mg/dL", group: "laboratory", refLow: 40 },
  "13457-7": { code: "13457-7", display: "Cholesterol in LDL [Mass/volume] in Serum or Plasma by calculation", unit: "mg/dL", ucum: "mg/dL", group: "laboratory", refHigh: 100 },
  "10839-9": { code: "10839-9", display: "Troponin I.cardiac [Mass/volume] in Serum or Plasma", unit: "ng/mL", ucum: "ng/mL", group: "laboratory", refHigh: 0.04 },
  "1988-5": { code: "1988-5", display: "C reactive protein [Mass/volume] in Serum or Plasma", unit: "mg/L", ucum: "mg/L", group: "laboratory", refHigh: 5 },
  "24357-6": { code: "24357-6", display: "Urinalysis macro (dipstick) panel", group: "laboratory" },
  "2106-3": { code: "2106-3", display: "Choriogonadotropin [Units/volume] in Urine", unit: "mIU/mL", ucum: "m[IU]/mL", group: "laboratory" },
  "58410-2": { code: "58410-2", display: "CBC panel - Blood by Automated count", group: "laboratory" },
  "34533-7": { code: "34533-7", display: "Dengue virus NS1 antigen [Presence] in Serum", group: "laboratory" },

  // Imaging / examinations
  "11524-6": { code: "11524-6", display: "EKG study", group: "exam" },
  "8601-7": { code: "8601-7", display: "EKG impression", group: "exam" },
  "36643-5": { code: "36643-5", display: "Chest X-ray PA and lateral", group: "imaging" },
  "24558-9": { code: "24558-9", display: "CT Head without contrast", group: "imaging" },
  "24606-6": { code: "24606-6", display: "CT Chest", group: "imaging" },
  "30799-1": { code: "30799-1", display: "MR Brain", group: "imaging" },
  "36801-9": { code: "36801-9", display: "US Abdomen", group: "imaging" },
  "43795-3": { code: "43795-3", display: "US Pelvis", group: "imaging" },
  "24725-4": { code: "24725-4", display: "US Obstetric", group: "imaging" },
  "89000-9": { code: "89000-9", display: "XR Wrist - right", group: "imaging" },

  // Gas exchange
  "2019-8": { code: "2019-8", display: "Carbon dioxide [Partial pressure] in Arterial blood", unit: "mmHg", ucum: "mm[Hg]", group: "laboratory", refLow: 35, refHigh: 45 },
  "2703-7": { code: "2703-7", display: "Oxygen [Partial pressure] in Arterial blood", unit: "mmHg", ucum: "mm[Hg]", group: "laboratory", refLow: 80, refHigh: 100 },
  "1960-4": { code: "1960-4", display: "Bicarbonate [Moles/volume] in Arterial blood", unit: "mmol/L", ucum: "mmol/L", group: "laboratory", refLow: 22, refHigh: 26 },
  "11557-6": { code: "11557-6", display: "Carbon dioxide [Partial pressure] in Blood", unit: "mmHg", ucum: "mm[Hg]", group: "laboratory", refLow: 35, refHigh: 45 },

  // Coagulation and infection markers
  "5902-2": { code: "5902-2", display: "Prothrombin time (PT)", unit: "s", ucum: "s", group: "laboratory", refLow: 11, refHigh: 13.5 },
  "6301-6": { code: "6301-6", display: "INR in Platelet poor plasma by Coagulation assay", unit: "ratio", ucum: "{ratio}", group: "laboratory", refLow: 0.8, refHigh: 1.2 },
  "30341-2": { code: "30341-2", display: "Erythrocyte sedimentation rate", unit: "mm/h", ucum: "mm/h", group: "laboratory", refHigh: 20 },
  "1989-3": { code: "1989-3", display: "Creatine kinase MB [Enzymatic activity/volume] in Serum or Plasma", unit: "U/L", ucum: "U/L", group: "laboratory", refHigh: 25 },
  "30934-4": { code: "30934-4", display: "Natriuretic peptide B [Mass/volume] in Serum or Plasma", unit: "pg/mL", ucum: "pg/mL", group: "laboratory", refHigh: 100 },
  "33863-2": { code: "33863-2", display: "Cystatin C [Mass/volume] in Serum or Plasma", unit: "mg/L", ucum: "mg/L", group: "laboratory" },
  "17861-6": { code: "17861-6", display: "Calcium [Mass/volume] in Serum or Plasma", unit: "mg/dL", ucum: "mg/dL", group: "laboratory", refLow: 8.5, refHigh: 10.5 },
  "2777-1": { code: "2777-1", display: "Phosphate [Mass/volume] in Serum or Plasma", unit: "mg/dL", ucum: "mg/dL", group: "laboratory", refLow: 2.5, refHigh: 4.5 },
  "2885-2": { code: "2885-2", display: "Protein [Mass/volume] in Serum or Plasma", unit: "g/dL", ucum: "g/dL", group: "laboratory", refLow: 6, refHigh: 8.3 },
  "1751-7": { code: "1751-7", display: "Albumin [Mass/volume] in Serum or Plasma", unit: "g/dL", ucum: "g/dL", group: "laboratory", refLow: 3.5, refHigh: 5.5 },
  "1975-2": { code: "1975-2", display: "Bilirubin.total [Mass/volume] in Serum or Plasma", unit: "mg/dL", ucum: "mg/dL", group: "laboratory", refHigh: 1.2 },
  "1742-6": { code: "1742-6", display: "Alanine aminotransferase [Enzymatic activity/volume] in Serum or Plasma", unit: "U/L", ucum: "U/L", group: "laboratory", refHigh: 40 },
  "1920-8": { code: "1920-8", display: "Asparate aminotransferase [Enzymatic activity/volume] in Serum or Plasma", unit: "U/L", ucum: "U/L", group: "laboratory", refHigh: 40 },
  "6768-6": { code: "6768-6", display: "Alkaline phosphatase [Enzymatic activity/volume] in Serum or Plasma", unit: "U/L", ucum: "U/L", group: "laboratory", refLow: 44, refHigh: 147 },
  "2532-0": { code: "2532-0", display: "Lactate dehydrogenase [Enzymatic activity/volume] in Serum or Plasma", unit: "U/L", ucum: "U/L", group: "laboratory" },
  "1798-8": { code: "1798-8", display: "Amylase [Enzymatic activity/volume] in Serum or Plasma", unit: "U/L", ucum: "U/L", group: "laboratory", refHigh: 100 },
  "3040-3": { code: "3040-3", display: "Lipase [Enzymatic activity/volume] in Serum or Plasma", unit: "U/L", ucum: "U/L", group: "laboratory", refHigh: 60 },
  "33747-0": { code: "33747-0", display: "General health status", group: "exam" },
};

export const LOINC_GROUP_VITALS = "vital-signs";
export const OBS_CATEGORY_VITALSIGN = "vital-signs";
export const OBS_CATEGORY_LABORATORY = "laboratory";
export const OBS_CATEGORY_IMAGING = "imaging";
export const OBS_CATEGORY_EXAM = "exam";

/* ------------------------------------------------------------------ */
/* ICD-10 - curated subset for referral diagnoses                      */
/* ------------------------------------------------------------------ */

export interface Icd10Entry {
  code: string;
  display: string;
  chapter: string;
}

export const ICD10: Record<string, Icd10Entry> = {
  A90: { code: "A90", display: "Dengue fever [classical dengue]", chapter: "I" },
  "A91": { code: "A91", display: "Dengue haemorrhagic fever", chapter: "I" },
  "A15.0": { code: "A15.0", display: "Tuberculosis of lung", chapter: "I" },
  "E11.9": { code: "E11.9", display: "Type 2 diabetes mellitus without complications", chapter: "IV" },
  "E11.65": { code: "E11.65", display: "Type 2 diabetes mellitus with hyperglycaemia", chapter: "IV" },
  "E11.40": { code: "E11.40", display: "Type 2 diabetes mellitus with diabetic neuropathy, unspecified", chapter: "IV" },
  "E11.21": { code: "E11.21", display: "Type 2 diabetes mellitus with diabetic nephropathy", chapter: "IV" },
  "E78.5": { code: "E78.5", display: "Hyperlipidaemia, unspecified", chapter: "IV" },
  "E03.9": { code: "E03.9", display: "Hypothyroidism, unspecified", chapter: "IV" },
  "I10": { code: "I10", display: "Essential (primary) hypertension", chapter: "IX" },
  "I20.0": { code: "I20.0", display: "Unstable angina", chapter: "IX" },
  "I20.8": { code: "I20.8", display: "Other forms of angina pectoris", chapter: "IX" },
  "I20.9": { code: "I20.9", display: "Angina pectoris, unspecified", chapter: "IX" },
  "I21.9": { code: "I21.9", display: "Acute myocardial infarction, unspecified", chapter: "IX" },
  "I21.0": { code: "I21.0", display: "Acute transmural myocardial infarction of anterior wall", chapter: "IX" },
  "I25.10": { code: "I25.10", display: "Atherosclerotic heart disease of native coronary artery without angina pectoris", chapter: "IX" },
  "I27.0": { code: "I27.0", display: "Primary pulmonary hypertension", chapter: "IX" },
  "I42.9": { code: "I42.9", display: "Cardiomyopathy, unspecified", chapter: "IX" },
  "I48.91": { code: "I48.91", display: "Unspecified atrial fibrillation", chapter: "IX" },
  "I50.9": { code: "I50.9", display: "Heart failure, unspecified", chapter: "IX" },
  "I63.9": { code: "I63.9", display: "Cerebral infarction, unspecified", chapter: "IX" },
  "I64": { code: "I64", display: "Stroke, not specified as haemorrhage or infarction", chapter: "IX" },
  "I95.9": { code: "I95.9", display: "Hypotension, unspecified", chapter: "IX" },
  "J18.9": { code: "J18.9", display: "Pneumonia, unspecified organism", chapter: "X" },
  "J22": { code: "J22", display: "Unspecified acute lower respiratory infection", chapter: "X" },
  "J44.1": { code: "J44.1", display: "Chronic obstructive pulmonary disease with acute exacerbation", chapter: "X" },
  "J44.9": { code: "J44.9", display: "Chronic obstructive pulmonary disease, unspecified", chapter: "X" },
  "J45.909": { code: "J45.909", display: "Unspecified asthma, uncomplicated", chapter: "X" },
  "J45.901": { code: "J45.901", display: "Unspecified asthma with (acute) exacerbation", chapter: "X" },
  "J90": { code: "J90", display: "Pleural effusion, not elsewhere classified", chapter: "X" },
  "J96.00": { code: "J96.00", display: "Acute respiratory failure, unspecified whether with hypoxia or hypercapnia", chapter: "X" },
  "K21.9": { code: "K21.9", display: "Gastro-oesophageal reflux disease without oesophagitis", chapter: "XI" },
  "K25.9": { code: "K25.9", display: "Gastric ulcer, unspecified as acute or chronic, without haemorrhage or perforation", chapter: "XI" },
  "K29.70": { code: "K29.70", display: "Gastritis, unspecified, without bleeding", chapter: "XI" },
  "K35.80": { code: "K35.80", display: "Unspecified acute appendicitis", chapter: "XI" },
  "K40.90": { code: "K40.90", display: "Unilateral inguinal hernia, without obstruction or gangrene, not specified as recurrent", chapter: "XI" },
  "K80.20": { code: "K80.20", display: "Calculus of gallbladder without cholecystitis, without obstruction", chapter: "XI" },
  "K74.60": { code: "K74.60", display: "Unspecified cirrhosis of liver", chapter: "XI" },
  "N18.9": { code: "N18.9", display: "Chronic kidney disease, unspecified", chapter: "XIV" },
  "N20.0": { code: "N20.0", display: "Calculus of kidney", chapter: "XIV" },
  "N39.0": { code: "N39.0", display: "Urinary tract infection, site not specified", chapter: "XIV" },
  "N40": { code: "N40", display: "Hyperplasia of prostate", chapter: "XIV" },
  "O14.90": { code: "O14.90", display: "Unspecified pre-eclampsia, unspecified trimester", chapter: "XV" },
  "O20.0": { code: "O20.0", display: "Threatened abortion", chapter: "XV" },
  "O24.419": { code: "O24.419", display: "Gestational diabetes mellitus in pregnancy, unspecified control", chapter: "XV" },
  "O47.90": { code: "O47.90", display: "False labour, unspecified", chapter: "XV" },
  "O80": { code: "O80", display: "Encounter for full-term uncomplicated delivery", chapter: "XV" },
  "P07.30": { code: "P07.30", display: "Preterm newborn, unspecified weeks of gestation", chapter: "XVI" },
  "F32.9": { code: "F32.9", display: "Depressive episode, unspecified", chapter: "V" },
  "F41.9": { code: "F41.9", display: "Anxiety disorder, unspecified", chapter: "V" },
  "G40.909": { code: "G40.909", display: "Epilepsy, unspecified, not intractable, without status epilepticus", chapter: "VI" },
  "G43.909": { code: "G43.909", display: "Migraine, unspecified, not intractable, without status migrainosus", chapter: "VI" },
  "G45.9": { code: "G45.9", display: "Transient cerebral ischaemic attack, unspecified", chapter: "VI" },
  "H25.9": { code: "H25.9", display: "Unspecified age-related cataract", chapter: "VII" },
  "H40.9": { code: "H40.9", display: "Unspecified glaucoma", chapter: "VII" },
  "H47.20": { code: "H47.20", display: "Unspecified optic atrophy", chapter: "VII" },
  "H81.10": { code: "H81.10", display: "Benign paroxysmal vertigo, unspecified ear", chapter: "VIII" },
  "H66.90": { code: "H66.90", display: "Otitis media, unspecified, unspecified ear", chapter: "VIII" },
  "D50.9": { code: "D50.9", display: "Iron deficiency anaemia, unspecified", chapter: "III" },
  "D64.9": { code: "D64.9", display: "Anaemia, unspecified", chapter: "III" },
  "C50.919": { code: "C50.919", display: "Malignant neoplasm of unspecified site of unspecified female breast", chapter: "II" },
  "C18.9": { code: "C18.9", display: "Malignant neoplasm of colon, unspecified", chapter: "II" },
  "R07.4": { code: "R07.4", display: "Chest pain, unspecified", chapter: "XVIII" },
  "R05": { code: "R05", display: "Cough", chapter: "XVIII" },
  "R06.02": { code: "R06.02", display: "Shortness of breath", chapter: "XVIII" },
  "R10.4": { code: "R10.4", display: "Other and unspecified abdominal pain", chapter: "XVIII" },
  "R42": { code: "R42", display: "Dizziness and giddiness", chapter: "XVIII" },
  "R50.9": { code: "R50.9", display: "Fever, unspecified", chapter: "XVIII" },
  "R51": { code: "R51", display: "Headache", chapter: "XVIII" },
  "R55": { code: "R55", display: "Syncope and collapse", chapter: "XVIII" },
  "R56.9": { code: "R56.9", display: "Unspecified convulsions", chapter: "XVIII" },
  "R63.4": { code: "R63.4", display: "Abnormal weight loss", chapter: "XVIII" },
  "R73.9": { code: "R73.9", display: "Hyperglycaemia, unspecified", chapter: "XVIII" },
  "A41.9": { code: "A41.9", display: "Sepsis, unspecified organism", chapter: "I" },
  "A46": { code: "A46", display: "Erysipelas", chapter: "I" },
  "A49.9": { code: "A49.9", display: "Bacterial infection, unspecified", chapter: "I" },
  "A09": { code: "A09", display: "Infectious gastroenteritis and colitis, unspecified", chapter: "I" },
  "B19.9": { code: "B19.9", display: "Unspecified viral hepatitis without hepatic coma", chapter: "I" },
  "T81.4XXA": { code: "T81.4XXA", display: "Infection following a procedure, initial encounter", chapter: "XIX" },
  "T78.40": { code: "T78.40", display: "Allergy, unspecified", chapter: "XIX" },
  "L03.90": { code: "L03.90", display: "Cellulitis, unspecified", chapter: "XII" },
  "L02.91": { code: "L02.91", display: "Cutaneous abscess, unspecified", chapter: "XII" },
  "L08.9": { code: "L08.9", display: "Local infection of the skin and subcutaneous tissue, unspecified", chapter: "XII" },
  "M17.9": { code: "M17.9", display: "Osteoarthritis of knee, unspecified", chapter: "XIII" },
  "M54.5": { code: "M54.5", display: "Low back pain", chapter: "XIII" },
  "M75.10": { code: "M75.10", display: "Unspecified rotator cuff tear, not traumatic, unspecified shoulder", chapter: "XIII" },
  "M79.10": { code: "M79.10", display: "Myalgia, unspecified site", chapter: "XIII" },
  "S06.0X0": { code: "S06.0X0", display: "Concussion without loss of consciousness", chapter: "XIX" },
  "S52.501": { code: "S52.501", display: "Unspecified fracture of the lower end of right radius", chapter: "XIX" },
  "S72.001": { code: "S72.001", display: "Fracture of unspecified part of neck of right femur", chapter: "XIX" },
  "S81.801": { code: "S81.801", display: "Unspecified open wound, right lower leg", chapter: "XIX" },
  "E05.90": { code: "E05.90", display: "Thyrotoxicosis, unspecified without thyrotoxic crisis or storm", chapter: "IV" },
  "E10.9": { code: "E10.9", display: "Type 1 diabetes mellitus without complications", chapter: "IV" },
  "E66.9": { code: "E66.9", display: "Obesity, unspecified", chapter: "IV" },
  "Z34.90": { code: "Z34.90", display: "Encounter for supervision of normal pregnancy, unspecified", chapter: "XXI" },
  "Z00.00": { code: "Z00.00", display: "Encounter for general adult medical examination without abnormal findings", chapter: "XXI" },
  "Z51.5": { code: "Z51.5", display: "Encounter for palliative care", chapter: "XXI" },
  "Z09": { code: "Z09", display: "Encounter for follow-up examination after completed treatment for conditions other than malignant neoplasm", chapter: "XXI" },
  "U07.1": { code: "U07.1", display: "COVID-19, virus identified", chapter: "XXII" },
};

/* ------------------------------------------------------------------ */
/* SNOMED CT - curated subset (allergies, findings)                    */
/* ------------------------------------------------------------------ */

export const SNOMED: Record<string, string> = {
  // Allergy substances
  "91936005": "Allergy to penicillin",
  "373270004": "Allergy to substance with penicillin structure",
  "91939003": "Allergy to sulfonamide",
  "294505008": "Allergy to aspirin",
  "293584003": "Allergy to acetylsalicylic acid",
  "293586001": "Allergy to ibuprofen",
  "91935009": "Allergy to cephalosporin",
  "421961002": "Allergy to fluoroquinolone",
  "294610006": "Allergy to seafood",
  "373270002": "Allergy to egg protein",
  "235719002": "Food allergy",
  "609328004": "Allergy to peanut",
  "373270009": "Allergy to cow's milk protein",
  "293585002": "Allergy to shellfish",
  "294715005": "Allergy to latex",
  "294659001": "Allergy to povidone iodine",

  // Clinical findings / symptoms
  "386661006": "Fever",
  "25064002": "Headache",
  "29857009": "Chest pain",
  "21522001": "Abdominal pain",
  "267036007": "Dyspnea",
  "49727002": "Cough",
  "422587007": "Nausea",
  "422400008": "Vomiting",
  "271681002": "Chest tightness",
  "85232009": "Easy fatigability",
  "248584009": "Palpitations",
  "404640003": "Dizziness",
  "271594007": "Seizure",
  "230690007": "Cerebrovascular accident",
  "22298006": "Myocardial infarction",
  "73211009": "Diabetes mellitus",
  "59621000": "Essential hypertension",
  "195967001": "Asthma",
  "13645005": "Chronic obstructive lung disease",
  "38341003": "Hypertensive disorder",
  "271737000": "Anemia",
  "14803004": "Transient ischaemic attack",

  // Social / risk
  "266919005": "Never smoked tobacco",
  "8517006": "Ex-smoker",
  "77176002": "Smoker",
  "160504008": "Alcohol intake",
};

/* ------------------------------------------------------------------ */
/* Consent / lawful basis (Data Privacy Act of 2012, RA 10173)         */
/* ------------------------------------------------------------------ */

export interface LawfulBasis {
  code: string;
  display: string;
  legalRef: string;
  /** Whether the basis requires an explicit patient authorisation record. */
  requiresConsentRecord: boolean;
  note: string;
}

export const LAWFUL_BASIS: Record<string, LawfulBasis> = {
  "patient-consent": {
    code: "patient-consent",
    display: "Patient consent (written or electronic)",
    legalRef: "RA 10173 s.12(a); NPC Advisory Opinion No. 2018-056",
    requiresConsentRecord: true,
    note: "Patient or authorised representative gave documented consent for this referral exchange.",
  },
  "treatment-purpose": {
    code: "treatment-purpose",
    display: "Provision of medical treatment / care coordination",
    legalRef: "RA 10173 s.12(b) - performance of a contract / s.13(b) - medical purposes",
    requiresConsentRecord: false,
    note: "Processing is necessary for the provision of health care and for care coordination between providers.",
  },
  "vital-interest": {
    code: "vital-interest",
    display: "Protection of the data subject's vital interests",
    legalRef: "RA 10173 s.12(c)",
    requiresConsentRecord: false,
    note: "Emergency - processing is necessary to protect the life or health of the data subject.",
  },
  "lawful-obligation": {
    code: "lawful-obligation",
    display: "Compliance with a legal obligation (e.g. notifiable disease reporting)",
    legalRef: "RA 10173 s.12(c) / s.13(c)",
    requiresConsentRecord: false,
    note: "Processing is required by law or regulation.",
  },
  "public-health": {
    code: "public-health",
    display: "Public health and safety functions",
    legalRef: "RA 10173 s.13(d)",
    requiresConsentRecord: false,
    note: "Processing is carried out for public health monitoring and safety.",
  },
};

/* ------------------------------------------------------------------ */
/* HealthLink reason-for-referral categories                           */
/* ------------------------------------------------------------------ */

export const REASON_FOR_REFERRAL: ReadonlyArray<{ code: string; display: string }> = [
  { code: "specialist-consult", display: "Specialist consultation" },
  { code: "diagnostic-workup", display: "Diagnostic work-up" },
  { code: "emergency-transfer", display: "Emergency transfer / higher level of care" },
  { code: "admission", display: "Admission / confinement" },
  { code: "surgical-evaluation", display: "Surgical evaluation" },
  { code: "second-opinion", display: "Second opinion" },
  { code: "continuity-of-care", display: "Continuity of care / follow-up transfer" },
  { code: "maternal-referral", display: "Maternal and newborn referral" },
  { code: "rehabilitation", display: "Rehabilitation" },
  { code: "other", display: "Other (specified in narrative)" },
];

/* ------------------------------------------------------------------ */
/* Lookup helpers                                                      */
/* ------------------------------------------------------------------ */

export function loinc(code: string | undefined): LoincEntry | undefined {
  return code ? LOINC[code] : undefined;
}

export function icd10(code: string | undefined): Icd10Entry | undefined {
  return code ? ICD10[code] : undefined;
}

export function snomed(code: string | undefined): string | undefined {
  return code ? SNOMED[code] : undefined;
}

export function isKnownLoinc(code: string | undefined): boolean {
  return !!code && code in LOINC;
}

export function isKnownIcd10(code: string | undefined): boolean {
  return !!code && code in ICD10;
}

export function isKnownSnomed(code: string | undefined): boolean {
  return !!code && code in SNOMED;
}

/**
 * FHIR R4 administrative-gender ValueSet.
 * https://hl7.org/fhir/ValueSet/administrative-gender
 */
export const ADMINISTRATIVE_GENDER = ["male", "female", "other", "unknown"] as const;

/** FHIR R4 request-priority ValueSet. */
export const REQUEST_PRIORITY = ["routine", "urgent", "asap", "stat"] as const;

/** FHIR R4 encounter-status ValueSet (subset relevant to a referral). */
export const ENCOUNTER_STATUS = [
  "planned",
  "arrived",
  "triaged",
  "in-progress",
  "onleave",
  "finished",
  "cancelled",
  "entered-in-error",
  "unknown",
] as const;

/** FHIR R4 task-status ValueSet. */
/** FHIR R4 task-status ValueSet. */
export const TASK_STATUS = [
  "draft",
  "requested",
  "received",
  "accepted",
  "rejected",
  "ready",
  "cancelled",
  "in-progress",
  "on-hold",
  "failed",
  "completed",
  "entered-in-error",
] as const;

/** FHIR release this prototype targets. */
export const FHIR_VERSION = "4.0.1";

/** FHIR R4 request-status ValueSet (ServiceRequest.status). */
export const REQUEST_STATUS = [
  "draft",
  "active",
  "on-hold",
  "revoked",
  "completed",
  "entered-in-error",
  "unknown",
] as const;

/** FHIR R4 request-intent ValueSet. */
export const REQUEST_INTENT = ["proposal", "plan", "directive", "order", "original-order", "reflex-order", "filler-order", "instance-order", "option"] as const;

/** v3-ActEncounterCode (Encounter.class) subset. */
export const ACT_ENCOUNTER_CODE = ["AMB", "EMER", "FLD", "HH", "IMP", "ACUTE", "NONAC", "OBSENC", "PRENC", "SS", "VR"] as const;

/** v3-ActCode (Encounter.class) display values. */
export const ACT_ENCOUNTER_DISPLAY: Record<string, string> = {
  AMB: "ambulatory",
  EMER: "emergency",
  FLD: "field",
  HH: "home health",
  IMP: "inpatient encounter",
  ACUTE: "inpatient acute",
  NONAC: "inpatient non-acute",
  OBSENC: "observation encounter",
  PRENC: "pre-admission",
  SS: "short stay",
  VR: "virtual",
};

/** v3-ActPriority (Encounter.priority) subset. */
export const ACT_PRIORITY = ["A", "CR", "EL", "EM", "P", "R", "RR", "S", "T", "UD"] as const;

/** Observation category codes used by HealthLink. */
export const OBSERVATION_CATEGORY = [
  { code: "vital-signs", display: "Vital Signs", system: CS.HL7_OBSERVATION_CATEGORY },
  { code: "laboratory", display: "Laboratory", system: CS.HL7_OBSERVATION_CATEGORY },
  { code: "imaging", display: "Imaging", system: CS.HL7_OBSERVATION_CATEGORY },
  { code: "exam", display: "Exam", system: CS.HL7_OBSERVATION_CATEGORY },
] as const;

/** v3-ObservationInterpretation codes HealthLink computes from reference ranges. */
export const INTERPRETATION = {
  NORMAL: { code: "N", display: "Normal", system: CS.HL7_V3_OBSERVATION_INTERPRETATION },
  HIGH: { code: "H", display: "High", system: CS.HL7_V3_OBSERVATION_INTERPRETATION },
  LOW: { code: "L", display: "Low", system: CS.HL7_V3_OBSERVATION_INTERPRETATION },
  CRITICAL_HIGH: { code: "HH", display: "Critical high", system: CS.HL7_V3_OBSERVATION_INTERPRETATION },
  CRITICAL_LOW: { code: "LL", display: "Critical low", system: CS.HL7_V3_OBSERVATION_INTERPRETATION },
} as const;
