/**
 * Public surface of the FHIR layer.
 *
 * Importing from `@/lib/fhir` keeps consumers decoupled from the internal file
 * layout, and makes it obvious that the mapper, validator and profile registry
 * are one cohesive component rather than three unrelated utilities.
 */

export * from "./types";
export {
  CS,
  ID_SYS,
  EXT,
  PROFILE,
  PHCORE_IG,
  PSGC,
  DAVAO_BARANGAYS,
  LOINC,
  ICD10,
  SNOMED,
  LAWFUL_BASIS,
  REASON_FOR_REFERRAL,
  ADMINISTRATIVE_GENDER,
  REQUEST_PRIORITY,
  REQUEST_STATUS,
  REQUEST_INTENT,
  TASK_STATUS,
  ENCOUNTER_STATUS,
  ACT_ENCOUNTER_CODE,
  ACT_ENCOUNTER_DISPLAY,
  ACT_PRIORITY,
  OBSERVATION_CATEGORY,
  INTERPRETATION,
  FHIR_VERSION,
  loinc,
  icd10,
  snomed,
  isKnownLoinc,
  isKnownIcd10,
  isKnownSnomed,
} from "./terminology";
export * from "./profiles";
export {
  validateResource,
  validateBundle,
  profileFor,
  phCoreAlignment,
  OutcomeBuilder,
  type ValidationResult,
  type BundleValidationResult,
  type ValidateOptions,
  type AlignmentRow,
} from "./validator";
export {
  mapPatient,
  mapPractitioner,
  mapOrganization,
  mapEncounter,
  mapCondition,
  mapObservation,
  mapMedication,
  mapAllergy,
  mapServiceRequest,
  mapTask,
  mapConsent,
  mapDocumentReference,
  mapCommunication,
  mapProvenance,
  buildReferralBundle,
  buildClinicalNarrative,
  observationsFor,
  vitalsToObservations,
  splitName,
  REFERRAL_PACKAGE_RESOURCES,
  HEALTHLINK_FHIR_BASE_URL,
  type MappingInput,
  type ReferralRow,
  type PatientRow,
  type FacilityRow,
  type UserRow,
  type DiagnosisRow,
  type ObservationRow,
  type MedicationRow,
  type AllergyRow,
  type AttachmentRow,
  type ConsentRow,
  type BuildBundleOptions,
} from "./mapper";
export { mapAuditEvent, auditOutcomeLabel, auditActionLabel, type AuditRow } from "./audit-mapper";
