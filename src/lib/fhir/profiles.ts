/**
 * PH Core profile registry.
 *
 * Each entry encodes the *constrained* elements of the corresponding profile
 * in Draft PH Core IG v0.2.0, transcribed from the published snapshot
 * (`StructureDefinition-ph-core-*.json`, package fhir.ph.core#0.2.0).
 *
 * Only elements the IG constrains (cardinality tightened, mustSupport added,
 * or terminology bound) are listed. Elements omitted here are unconstrained by
 * PH Core and therefore inherit FHIR R4 base rules.
 *
 * `MS` marks mustSupport, `BIND` records the binding strength and value set.
 */

import { CS, ID_SYS, LOINC, ICD10, SNOMED, ADMINISTRATIVE_GENDER, PROFILE } from "./terminology";

export interface ElementConstraint {
  /** Element path relative to the resource root, e.g. "identifier", "name.family". */
  path: string;
  min?: number;
  max?: string;
  mustSupport?: boolean;
  /** Allowed FHIR types when the element is polymorphic or constrained. */
  types?: string[];
  /** Target profiles for Reference elements (canonical URL or bare resource type). */
  targetProfiles?: string[];
  binding?: {
    strength: "required" | "extensible" | "preferred" | "example";
    system?: string;
    valueSet?: string;
    /** Explicit allowed codes, for small required bindings. */
    codes?: readonly string[];
    /** Local validator path for a curated terminology subset. */
    lookup?: "loinc" | "icd10" | "snomed";
  };
}

export interface ProfileDefinition {
  /** Canonical URL. */
  url: string;
  name: string;
  resourceType: string;
  /** FHIR R4 base definition. */
  baseDefinition: string;
  description?: string;
  constraints: ElementConstraint[];
  /** PH Core invariants that apply to this profile. */
  invariants?: Array<{ key: string; severity: "error" | "warning"; human: string; path: string }>;
}

const MS = true;

export const PH_CORE_PROFILES: ProfileDefinition[] = [
  {
    url: PROFILE.PATIENT,
    name: "PHCorePatient",
    resourceType: "Patient",
    baseDefinition: "http://hl7.org/fhir/StructureDefinition/Patient",
    description:
      "Captures key demographic and administrative information about individuals receiving care or other health-related services.",
    constraints: [
      { path: "identifier", max: "*", mustSupport: MS, types: ["Identifier"] },
      { path: "name", max: "*", mustSupport: MS, types: ["HumanName(ph-core-name)"] },
      { path: "telecom", max: "*", mustSupport: MS, types: ["ContactPoint"] },
      {
        path: "gender",
        max: "1",
        mustSupport: MS,
        types: ["code"],
        binding: { strength: "required", valueSet: "http://hl7.org/fhir/ValueSet/administrative-gender|4.0.1", codes: ADMINISTRATIVE_GENDER },
      },
      { path: "birthDate", max: "1", mustSupport: MS, types: ["date"] },
      { path: "address", max: "*", mustSupport: MS, types: ["Address(ph-core-address)"] },
      {
        path: "maritalStatus",
        max: "1",
        mustSupport: MS,
        types: ["CodeableConcept"],
        binding: { strength: "required", valueSet: "http://hl7.org/fhir/ValueSet/marital-status" },
      },
      { path: "maritalStatus.coding", max: "*", mustSupport: MS },
      { path: "maritalStatus.text", max: "1", mustSupport: MS },
      {
        path: "contact.relationship",
        max: "*",
        mustSupport: MS,
        binding: { strength: "required", valueSet: "http://hl7.org/fhir/ValueSet/relatedperson-relationshiptype" },
      },
      { path: "contact.relationship.coding", max: "*", mustSupport: MS },
      { path: "contact.relationship.text", max: "1", mustSupport: MS },
      { path: "contact.address", max: "1", mustSupport: MS, types: ["Address(ph-core-address)"] },
      { path: "contact.organization", max: "1", types: ["Reference"], targetProfiles: [PROFILE.ORGANIZATION] },
      { path: "communication.language", min: 1, max: "1", mustSupport: MS, types: ["CodeableConcept"], binding: { strength: "preferred", valueSet: "http://hl7.org/fhir/ValueSet/languages|4.0.1" } },
      { path: "communication.language.coding", max: "*", mustSupport: MS },
      { path: "communication.language.text", max: "1", mustSupport: MS },
      { path: "generalPractitioner", max: "*", types: ["Reference"], targetProfiles: [PROFILE.PRACTITIONER, PROFILE.PRACTITIONER_ROLE, PROFILE.ORGANIZATION] },
      { path: "managingOrganization", max: "1", types: ["Reference"], targetProfiles: [PROFILE.ORGANIZATION] },
    ],
  },

  {
    url: PROFILE.PRACTITIONER,
    name: "PHCorePractitioner",
    resourceType: "Practitioner",
    baseDefinition: "http://hl7.org/fhir/StructureDefinition/Practitioner",
    description:
      "Minimum expectations for Practitioner resource demographics in a Philippine context.",
    constraints: [
      { path: "name", max: "*", mustSupport: MS, types: ["HumanName(ph-core-name)"] },
      { path: "name.family", max: "1", mustSupport: MS },
      { path: "name.given", max: "*", mustSupport: MS },
      { path: "telecom", max: "*", mustSupport: MS, types: ["ContactPoint"] },
      { path: "address", max: "*", mustSupport: MS, types: ["Address(ph-core-address)"] },
      {
        path: "gender",
        max: "1",
        mustSupport: MS,
        types: ["code"],
        binding: { strength: "required", valueSet: "http://hl7.org/fhir/ValueSet/administrative-gender|4.0.1", codes: ADMINISTRATIVE_GENDER },
      },
      { path: "birthDate", max: "1", mustSupport: MS, types: ["date"] },
      {
        path: "qualification.code",
        min: 1,
        max: "1",
        mustSupport: MS,
        types: ["CodeableConcept"],
        binding: { strength: "example", valueSet: "http://terminology.hl7.org/ValueSet/v2-2.7-0360" },
      },
      { path: "qualification.code.coding", max: "*", mustSupport: MS },
      { path: "qualification.code.text", max: "1", mustSupport: MS },
      { path: "communication", max: "*", mustSupport: MS, types: ["CodeableConcept"], binding: { strength: "preferred", valueSet: "http://hl7.org/fhir/ValueSet/languages|4.0.1" } },
      { path: "communication.coding", max: "*", mustSupport: MS },
      { path: "communication.text", max: "1", mustSupport: MS },
    ],
  },

  {
    url: PROFILE.ORGANIZATION,
    name: "PHCoreOrganization",
    resourceType: "Organization",
    baseDefinition: "http://hl7.org/fhir/StructureDefinition/Organization",
    description: "Localises the FHIR R4 Organization resource to the Philippine context.",
    constraints: [
      { path: "identifier", max: "*", mustSupport: MS, types: ["Identifier"] },
      { path: "active", max: "1", mustSupport: MS },
      { path: "type", max: "*", mustSupport: MS, types: ["CodeableConcept"], binding: { strength: "example", valueSet: "http://hl7.org/fhir/ValueSet/organization-type|4.0.1" } },
      { path: "type.coding", max: "*", mustSupport: MS },
      { path: "type.text", max: "1", mustSupport: MS },
      { path: "name", max: "1", mustSupport: MS, types: ["string"] },
      { path: "telecom", max: "*", mustSupport: MS, types: ["ContactPoint"] },
      { path: "address", max: "*", mustSupport: MS, types: ["Address(ph-core-address)"] },
      { path: "partOf", max: "1", types: ["Reference"], targetProfiles: [PROFILE.ORGANIZATION] },
      { path: "contact.purpose", max: "1", mustSupport: MS, binding: { strength: "extensible", valueSet: "http://hl7.org/fhir/ValueSet/contactentity-type|4.0.1" } },
      { path: "contact.purpose.coding", max: "*", mustSupport: MS },
      { path: "contact.purpose.text", max: "1", mustSupport: MS },
      { path: "contact.address", max: "1", mustSupport: MS, types: ["Address(ph-core-address)"] },
    ],
  },

  {
    url: PROFILE.ENCOUNTER,
    name: "PHCoreEncounter",
    resourceType: "Encounter",
    baseDefinition: "http://hl7.org/fhir/StructureDefinition/Encounter",
    description: "Minimum expectations for an Encounter resource in a Philippine context.",
    constraints: [
      { path: "identifier", max: "*", mustSupport: MS },
      {
        path: "status",
        min: 1,
        max: "1",
        mustSupport: MS,
        types: ["code"],
        binding: {
          strength: "required",
          valueSet: "http://hl7.org/fhir/ValueSet/encounter-status|4.0.1",
          codes: ["planned", "arrived", "triaged", "in-progress", "onleave", "finished", "cancelled", "entered-in-error", "unknown"],
        },
      },
      {
        path: "class",
        min: 1,
        max: "1",
        mustSupport: MS,
        types: ["Coding"],
        binding: { strength: "extensible", valueSet: "http://terminology.hl7.org/ValueSet/v3-ActEncounterCode" },
      },
      { path: "type", max: "*", mustSupport: MS, types: ["CodeableConcept"], binding: { strength: "example", valueSet: "http://hl7.org/fhir/ValueSet/encounter-type|4.0.1" } },
      { path: "serviceType", max: "1", mustSupport: MS, binding: { strength: "example", valueSet: "http://hl7.org/fhir/ValueSet/service-type|4.0.1" } },
      { path: "serviceType.coding", max: "*", mustSupport: MS },
      { path: "serviceType.text", max: "1", mustSupport: MS },
      { path: "priority", max: "1", mustSupport: MS, binding: { strength: "example", valueSet: "http://terminology.hl7.org/ValueSet/v3-ActPriority" } },
      { path: "priority.coding", max: "*", mustSupport: MS },
      { path: "priority.text", max: "1", mustSupport: MS },
      { path: "subject", min: 1, max: "1", mustSupport: MS, types: ["Reference"], targetProfiles: [PROFILE.PATIENT, "Group"] },
      { path: "participant", max: "*", mustSupport: MS },
      { path: "participant.type", max: "*", mustSupport: MS, binding: { strength: "extensible", valueSet: "http://hl7.org/fhir/ValueSet/encounter-participant-type|4.0.1" } },
      { path: "participant.individual", max: "1", types: ["Reference"], targetProfiles: [PROFILE.PRACTITIONER, "RelatedPerson", PROFILE.PRACTITIONER_ROLE] },
      { path: "period", max: "1", mustSupport: MS },
      { path: "period.start", max: "1", mustSupport: MS },
      { path: "reasonCode", max: "*", mustSupport: MS, binding: { strength: "preferred", valueSet: "http://hl7.org/fhir/ValueSet/encounter-reason|4.0.1" } },
      { path: "reasonReference", max: "*", mustSupport: MS, types: ["Reference"], targetProfiles: ["Condition", PROFILE.OBSERVATION, PROFILE.PROCEDURE, "ImmunizationRecommendation"] },
      { path: "diagnosis.use", max: "1", mustSupport: MS, binding: { strength: "preferred", valueSet: "http://hl7.org/fhir/ValueSet/diagnosis-role|4.0.1" } },
      { path: "diagnosis.use.coding", max: "*", mustSupport: MS },
      { path: "diagnosis.use.text", max: "1", mustSupport: MS },
      { path: "hospitalization", max: "1", mustSupport: MS },
      { path: "hospitalization.origin", max: "1", mustSupport: MS, types: ["Reference"], targetProfiles: [PROFILE.LOCATION, PROFILE.ORGANIZATION] },
      { path: "hospitalization.admitSource", max: "1", mustSupport: MS, binding: { strength: "preferred", valueSet: "http://hl7.org/fhir/ValueSet/encounter-admit-source|4.0.1" } },
      { path: "hospitalization.admitSource.coding", max: "*", mustSupport: MS },
      { path: "hospitalization.admitSource.text", max: "1", mustSupport: MS },
      { path: "hospitalization.reAdmission", max: "1", mustSupport: MS, binding: { strength: "example", valueSet: "http://terminology.hl7.org/ValueSet/v2-0092" } },
      { path: "hospitalization.reAdmission.coding", max: "*", mustSupport: MS },
      { path: "hospitalization.reAdmission.text", max: "1", mustSupport: MS },
      { path: "hospitalization.dietPreference", max: "*", mustSupport: MS, binding: { strength: "example", valueSet: "http://hl7.org/fhir/ValueSet/encounter-diet|4.0.1" } },
      { path: "hospitalization.dietPreference.coding", max: "*", mustSupport: MS },
      { path: "hospitalization.dietPreference.text", max: "1", mustSupport: MS },
      { path: "hospitalization.specialCourtesy", max: "*", mustSupport: MS, binding: { strength: "preferred", valueSet: "http://hl7.org/fhir/ValueSet/encounter-special-courtesy|4.0.1" } },
      { path: "hospitalization.specialCourtesy.coding", max: "*", mustSupport: MS },
      { path: "hospitalization.specialCourtesy.text", max: "1", mustSupport: MS },
      { path: "hospitalization.specialArrangement", max: "*", mustSupport: MS, binding: { strength: "preferred", valueSet: "http://hl7.org/fhir/ValueSet/encounter-special-arrangements|4.0.1" } },
      { path: "hospitalization.specialArrangement.coding", max: "*", mustSupport: MS },
      { path: "hospitalization.specialArrangement.text", max: "1", mustSupport: MS },
      { path: "hospitalization.dischargeDisposition", max: "1", mustSupport: MS, binding: { strength: "example", valueSet: "http://hl7.org/fhir/ValueSet/encounter-discharge-disposition|4.0.1" } },
      { path: "location", max: "*", mustSupport: MS },
      { path: "location.location", min: 1, max: "1", mustSupport: MS, types: ["Reference"], targetProfiles: [PROFILE.LOCATION] },
      { path: "location.status", max: "1", binding: { strength: "required", valueSet: "http://hl7.org/fhir/ValueSet/encounter-location-status|4.0.1" } },
      { path: "location.physicalType", max: "1", mustSupport: MS, binding: { strength: "example", valueSet: "http://hl7.org/fhir/ValueSet/location-physical-type|4.0.1" } },
      { path: "location.physicalType.coding", max: "*", mustSupport: MS },
      { path: "location.physicalType.text", max: "1", mustSupport: MS },
      { path: "serviceProvider", max: "1", mustSupport: MS, types: ["Reference"], targetProfiles: [PROFILE.ORGANIZATION] },
    ],
  },

  {
    url: PROFILE.OBSERVATION,
    name: "PHCoreObservation",
    resourceType: "Observation",
    baseDefinition: "http://hl7.org/fhir/StructureDefinition/Observation",
    description: "Measurements and simple assertions made about a patient, device or other subject.",
    constraints: [
      {
        path: "status",
        min: 1,
        max: "1",
        types: ["code"],
        binding: {
          strength: "required",
          valueSet: "http://hl7.org/fhir/ValueSet/observation-status|4.0.1",
          codes: ["registered", "preliminary", "final", "amended", "corrected", "cancelled", "entered-in-error", "unknown"],
        },
      },
      { path: "category", max: "*", mustSupport: MS, types: ["CodeableConcept"], binding: { strength: "preferred", valueSet: "http://hl7.org/fhir/ValueSet/observation-category|4.0.1" } },
      { path: "category.coding", max: "*", mustSupport: MS },
      { path: "category.text", max: "1", mustSupport: MS },
      {
        path: "code",
        min: 1,
        max: "1",
        mustSupport: MS,
        types: ["CodeableConcept"],
        binding: { strength: "example", valueSet: "http://hl7.org/fhir/ValueSet/observation-codes|4.0.1" },
      },
      { path: "code.coding", max: "*", mustSupport: MS },
      { path: "code.text", max: "1", mustSupport: MS },
      { path: "basedOn", max: "*", types: ["Reference"], targetProfiles: ["CarePlan", "DeviceRequest", "ImmunizationRecommendation", "MedicationRequest", "NutritionOrder", PROFILE.SERVICE_REQUEST] },
      { path: "partOf", max: "*", types: ["Reference"], targetProfiles: ["MedicationAdministration", "MedicationDispense", "MedicationStatement", PROFILE.PROCEDURE, PROFILE.IMMUNIZATION, "ImagingStudy"] },
      { path: "subject", max: "1", types: ["Reference"], targetProfiles: [PROFILE.PATIENT, "Group", "Device", "Location"] },
      { path: "encounter", max: "1", types: ["Reference"], targetProfiles: [PROFILE.ENCOUNTER] },
      { path: "performer", max: "*", types: ["Reference"], targetProfiles: [PROFILE.PRACTITIONER, PROFILE.PRACTITIONER_ROLE, PROFILE.ORGANIZATION, PROFILE.PATIENT, "RelatedPerson", "CareTeam"] },
      { path: "value[x]", max: "1", mustSupport: MS, types: ["CodeableConcept"] },
      { path: "value[x].coding", max: "*", mustSupport: MS },
      { path: "value[x].text", max: "1", mustSupport: MS },
      { path: "dataAbsentReason", max: "1", mustSupport: MS, binding: { strength: "extensible", valueSet: "http://hl7.org/fhir/ValueSet/data-absent-reason|4.0.1" } },
      { path: "dataAbsentReason.coding", max: "*", mustSupport: MS },
      { path: "dataAbsentReason.text", max: "1", mustSupport: MS },
      { path: "interpretation", max: "*", mustSupport: MS, binding: { strength: "extensible", valueSet: "http://hl7.org/fhir/ValueSet/observation-interpretation|4.0.1" } },
      { path: "interpretation.coding", max: "*", mustSupport: MS },
      { path: "interpretation.text", max: "1", mustSupport: MS },
      { path: "bodySite", max: "1", mustSupport: MS, binding: { strength: "example", valueSet: "http://hl7.org/fhir/ValueSet/body-site|4.0.1" } },
      { path: "bodySite.coding", max: "*", mustSupport: MS },
      { path: "bodySite.text", max: "1", mustSupport: MS },
      { path: "referenceRange", max: "*", mustSupport: MS },
      { path: "referenceRange.low", max: "1", mustSupport: MS },
      { path: "referenceRange.high", max: "1", mustSupport: MS },
      { path: "referenceRange.type", max: "1", mustSupport: MS, binding: { strength: "preferred", valueSet: "http://hl7.org/fhir/ValueSet/referencerange-meaning" } },
      { path: "referenceRange.appliesTo", max: "*", mustSupport: MS },
      { path: "referenceRange.age", max: "1", mustSupport: MS },
      { path: "component", max: "*", mustSupport: MS },
      { path: "component.code", min: 1, max: "1", mustSupport: MS },
      { path: "component.value[x]", max: "1", mustSupport: MS },
      { path: "component.dataAbsentReason", max: "1", mustSupport: MS },
      { path: "component.interpretation", max: "*", mustSupport: MS },
      { path: "hasMember", max: "*", mustSupport: MS },
      { path: "component.referenceRange", max: "*", mustSupport: MS },
    ],
  },

  {
    url: PROFILE.CONDITION,
    name: "PHCoreCondition",
    resourceType: "Condition",
    baseDefinition: "http://hl7.org/fhir/StructureDefinition/Condition",
    description: "Captures Condition.",
    constraints: [
      { path: "clinicalStatus", max: "1", mustSupport: MS, binding: { strength: "required", valueSet: "http://hl7.org/fhir/ValueSet/condition-clinical|4.0.1", codes: ["active", "recurrence", "relapse", "inactive", "remission", "resolved"] } },
      { path: "clinicalStatus.coding", max: "*", mustSupport: MS },
      { path: "clinicalStatus.text", max: "1", mustSupport: MS },
      { path: "verificationStatus", max: "1", mustSupport: MS, binding: { strength: "required", valueSet: "http://hl7.org/fhir/ValueSet/condition-ver-status|4.0.1", codes: ["unconfirmed", "provisional", "differential", "confirmed", "refuted", "entered-in-error"] } },
      { path: "verificationStatus.coding", max: "*", mustSupport: MS },
      { path: "verificationStatus.text", max: "1", mustSupport: MS },
      { path: "category", max: "*", mustSupport: MS, binding: { strength: "extensible", valueSet: "http://hl7.org/fhir/ValueSet/condition-category|4.0.1" } },
      { path: "severity", max: "1", mustSupport: MS, binding: { strength: "preferred", valueSet: "http://hl7.org/fhir/ValueSet/condition-severity|4.0.1" } },
      { path: "code", max: "1", mustSupport: MS, types: ["CodeableConcept"], binding: { strength: "example", valueSet: "http://hl7.org/fhir/ValueSet/condition-code|4.0.1" } },
      { path: "code.coding", max: "*", mustSupport: MS },
      { path: "code.text", max: "1", mustSupport: MS },
      { path: "bodySite", max: "*", mustSupport: MS, binding: { strength: "example", valueSet: "http://hl7.org/fhir/ValueSet/body-site|4.0.1" } },
      { path: "bodySite.coding", max: "*", mustSupport: MS },
      { path: "bodySite.text", max: "1", mustSupport: MS },
      { path: "subject", min: 1, max: "1", mustSupport: MS, types: ["Reference"], targetProfiles: [PROFILE.PATIENT] },
      { path: "encounter", max: "1", mustSupport: MS, types: ["Reference"], targetProfiles: [PROFILE.ENCOUNTER] },
      { path: "recorder", max: "1", types: ["Reference"], targetProfiles: [PROFILE.PRACTITIONER, PROFILE.PRACTITIONER_ROLE, PROFILE.PATIENT, "RelatedPerson"] },
      { path: "asserter", max: "1", types: ["Reference"], targetProfiles: [PROFILE.PRACTITIONER, PROFILE.PRACTITIONER_ROLE, PROFILE.PATIENT, "RelatedPerson"] },
      { path: "stage.summary", max: "1", mustSupport: MS, binding: { strength: "example", valueSet: "http://hl7.org/fhir/ValueSet/condition-stage|4.0.1" } },
      { path: "stage.summary.coding", max: "*", mustSupport: MS },
      { path: "stage.summary.text", max: "1", mustSupport: MS },
      { path: "stage.type", max: "1", mustSupport: MS, binding: { strength: "example", valueSet: "http://hl7.org/fhir/ValueSet/condition-stage-type|4.0.1" } },
      { path: "stage.type.coding", max: "*", mustSupport: MS },
      { path: "stage.type.text", max: "1", mustSupport: MS },
      { path: "evidence.code", max: "*", mustSupport: MS, binding: { strength: "example", valueSet: "http://hl7.org/fhir/ValueSet/manifestation-or-symptom|4.0.1" } },
      { path: "evidence.code.coding", max: "*", mustSupport: MS },
      { path: "evidence.code.text", max: "1", mustSupport: MS },
      { path: "note", max: "*", mustSupport: MS },
    ],
  },

  {
    url: PROFILE.SERVICE_REQUEST,
    name: "PHCoreServiceRequest",
    resourceType: "ServiceRequest",
    baseDefinition: "http://hl7.org/fhir/StructureDefinition/ServiceRequest",
    description:
      "Record of a request for services such as diagnostic investigations, treatments, or operations within the Philippine health system.",
    constraints: [
      {
        path: "status",
        min: 1,
        max: "1",
        mustSupport: MS,
        types: ["code"],
        binding: { strength: "required", valueSet: "http://hl7.org/fhir/ValueSet/request-status|4.0.1", codes: ["draft", "active", "on-hold", "revoked", "completed", "entered-in-error", "unknown"] },
      },
      {
        path: "intent",
        min: 1,
        max: "1",
        types: ["code"],
        binding: { strength: "required", valueSet: "http://hl7.org/fhir/ValueSet/request-intent|4.0.1" },
      },
      { path: "category", max: "*", mustSupport: MS, binding: { strength: "example", valueSet: "http://hl7.org/fhir/ValueSet/servicerequest-category|4.0.1" } },
      { path: "priority", max: "1", binding: { strength: "required", valueSet: "http://hl7.org/fhir/ValueSet/request-priority|4.0.1", codes: ["routine", "urgent", "asap", "stat"] } },
      { path: "code", max: "1", mustSupport: MS, types: ["CodeableConcept"], binding: { strength: "example", valueSet: "http://hl7.org/fhir/ValueSet/procedure-code|4.0.1" } },
      { path: "code.coding", max: "*", mustSupport: MS },
      { path: "code.text", max: "1", mustSupport: MS },
      { path: "orderDetail", max: "*", mustSupport: MS, binding: { strength: "example", valueSet: "http://hl7.org/fhir/ValueSet/servicerequest-orderdetail|4.0.1" } },
      { path: "orderDetail.coding", max: "*", mustSupport: MS },
      { path: "orderDetail.text", max: "1", mustSupport: MS },
      { path: "subject", min: 1, max: "1", mustSupport: MS, types: ["Reference"], targetProfiles: [PROFILE.PATIENT, "Group", PROFILE.LOCATION, "Device"] },
      { path: "encounter", max: "1", mustSupport: MS, types: ["Reference"], targetProfiles: [PROFILE.ENCOUNTER] },
      { path: "occurrence[x]", max: "1", mustSupport: MS, types: ["dateTime"] },
      { path: "asNeeded[x]", max: "1", mustSupport: MS, types: ["CodeableConcept"], binding: { strength: "example", valueSet: "http://hl7.org/fhir/ValueSet/medication-as-needed-reason|4.0.1" } },
      { path: "asNeeded[x].coding", max: "*", mustSupport: MS },
      { path: "asNeeded[x].text", max: "1", mustSupport: MS },
      { path: "authoredOn", max: "1", mustSupport: MS },
      { path: "requester", max: "1", mustSupport: MS, types: ["Reference"], targetProfiles: [PROFILE.PRACTITIONER, PROFILE.PRACTITIONER_ROLE, PROFILE.ORGANIZATION, PROFILE.PATIENT, "RelatedPerson", "Device"] },
      { path: "performerType", max: "1", mustSupport: MS, binding: { strength: "example", valueSet: "http://hl7.org/fhir/ValueSet/participant-role|4.0.1" } },
      { path: "performerType.coding", max: "*", mustSupport: MS },
      { path: "performerType.text", max: "1", mustSupport: MS },
      { path: "locationCode", max: "*", mustSupport: MS, binding: { strength: "example", valueSet: "http://terminology.hl7.org/ValueSet/v3-ServiceDeliveryLocationRoleType" } },
      { path: "locationCode.coding", max: "*", mustSupport: MS },
      { path: "locationCode.text", max: "1", mustSupport: MS },
      { path: "reasonCode", max: "*", mustSupport: MS, binding: { strength: "example", valueSet: "http://hl7.org/fhir/ValueSet/procedure-reason|4.0.1" } },
      { path: "reasonCode.coding", max: "*", mustSupport: MS },
      { path: "reasonCode.text", max: "1", mustSupport: MS },
      { path: "supportingInfo", max: "*", mustSupport: MS, types: ["Reference"] },
      { path: "bodySite", max: "*", mustSupport: MS, binding: { strength: "example", valueSet: "http://hl7.org/fhir/ValueSet/body-site|4.0.1" } },
      { path: "bodySite.coding", max: "*", mustSupport: MS },
      { path: "bodySite.text", max: "1", mustSupport: MS },
    ],
  },

  {
    url: PROFILE.TASK,
    name: "PHCoreTask",
    resourceType: "Task",
    baseDefinition: "http://hl7.org/fhir/StructureDefinition/Task",
    description: "Localises the FHIR R4 Task resource to the Philippine context - used by HealthLink for referral workflow.",
    constraints: [
      {
        path: "status",
        min: 1,
        max: "1",
        mustSupport: MS,
        types: ["code"],
        binding: {
          strength: "required",
          valueSet: "http://hl7.org/fhir/ValueSet/task-status|4.0.1",
          codes: ["draft", "requested", "received", "accepted", "rejected", "ready", "cancelled", "in-progress", "on-hold", "failed", "completed", "entered-in-error"],
        },
      },
      { path: "statusReason", max: "1", mustSupport: MS, binding: { strength: "example" } },
      { path: "statusReason.coding", max: "*", mustSupport: MS },
      { path: "statusReason.text", max: "1", mustSupport: MS },
      { path: "businessStatus", max: "1", mustSupport: MS, binding: { strength: "example" } },
      { path: "businessStatus.coding", max: "*", mustSupport: MS },
      { path: "businessStatus.text", max: "1", mustSupport: MS },
      { path: "intent", min: 1, max: "1", types: ["code"], binding: { strength: "required", valueSet: "http://hl7.org/fhir/ValueSet/task-intent|4.0.1" } },
      { path: "priority", max: "1", binding: { strength: "required", valueSet: "http://hl7.org/fhir/ValueSet/request-priority|4.0.1" } },
      { path: "code", max: "1", mustSupport: MS, binding: { strength: "example", valueSet: "http://hl7.org/fhir/ValueSet/task-code|4.0.1" } },
      { path: "code.coding", max: "*", mustSupport: MS },
      { path: "code.text", max: "1", mustSupport: MS },
      { path: "for", max: "1", mustSupport: MS, types: ["Reference"], targetProfiles: [PROFILE.PATIENT] },
      { path: "executionPeriod", max: "1", mustSupport: MS },
      { path: "performerType", max: "*", mustSupport: MS, binding: { strength: "preferred", valueSet: "http://hl7.org/fhir/ValueSet/performer-role|4.0.1" } },
      { path: "performerType.coding", max: "*", mustSupport: MS },
      { path: "performerType.text", max: "1", mustSupport: MS },
      { path: "owner", max: "1", types: ["Reference"], targetProfiles: [PROFILE.PRACTITIONER, PROFILE.PRACTITIONER_ROLE, PROFILE.ORGANIZATION, "CareTeam", "HealthcareService", PROFILE.PATIENT, "Device", "RelatedPerson"] },
      { path: "reasonCode", max: "1", mustSupport: MS, binding: { strength: "example" } },
      { path: "reasonCode.coding", max: "*", mustSupport: MS },
      { path: "reasonCode.text", max: "1", mustSupport: MS },
      { path: "note", max: "*", mustSupport: MS },
    ],
  },

  {
    url: PROFILE.PROVENANCE,
    name: "PHCoreProvenance",
    resourceType: "Provenance",
    baseDefinition: "http://hl7.org/fhir/StructureDefinition/Provenance",
    description:
      "Localises the FHIR R4 Provenance resource to the Philippine context - who, what, when, and where for a set of resources.",
    constraints: [
      { path: "target", min: 1, max: "*", mustSupport: MS, types: ["Reference"] },
      { path: "target.reference", max: "1", mustSupport: MS },
      { path: "recorded", min: 1, max: "1", mustSupport: MS, types: ["instant"] },
      { path: "location", max: "1", types: ["Reference"], targetProfiles: [PROFILE.LOCATION] },
      { path: "reason", max: "*", mustSupport: MS, binding: { strength: "extensible", valueSet: "http://terminology.hl7.org/ValueSet/v3-PurposeOfUse" } },
      { path: "reason.coding", max: "*", mustSupport: MS },
      { path: "reason.text", max: "1", mustSupport: MS },
      { path: "activity", max: "1", mustSupport: MS, binding: { strength: "extensible", valueSet: "http://hl7.org/fhir/ValueSet/provenance-activity-type|4.0.1" } },
      { path: "activity.coding", max: "*", mustSupport: MS },
      { path: "activity.text", max: "1", mustSupport: MS },
      {
        path: "agent",
        min: 1,
        max: "*",
        mustSupport: MS,
        // PH Core tightens agent.type to 1..1 and agent.who to 1..1 on each agent.
      },
      { path: "agent.type", min: 1, max: "1", mustSupport: MS, binding: { strength: "extensible", valueSet: "http://hl7.org/fhir/ValueSet/provenance-agent-type" } },
      { path: "agent.role", max: "*", mustSupport: MS, binding: { strength: "example", valueSet: "http://hl7.org/fhir/ValueSet/security-role-type|4.0.1" } },
      { path: "agent.role.coding", max: "*", mustSupport: MS },
      { path: "agent.role.text", max: "1", mustSupport: MS },
      { path: "agent.who", min: 1, max: "1", mustSupport: MS, types: ["Reference"], targetProfiles: [PROFILE.PRACTITIONER, PROFILE.PRACTITIONER_ROLE, PROFILE.ORGANIZATION, PROFILE.PATIENT, "RelatedPerson", "Device"] },
      { path: "agent.onBehalfOf", max: "1", mustSupport: MS, types: ["Reference"], targetProfiles: [PROFILE.ORGANIZATION] },
    ],
    invariants: [
      {
        key: "provenance-1",
        severity: "error",
        human: "onBehalfOf SHALL be present when Provenance.agent.who is a Practitioner or Device",
        path: "agent",
      },
    ],
  },

  {
    url: PROFILE.ALLERGY_INTOLERANCE,
    name: "PHCoreAllergyIntolerance",
    resourceType: "AllergyIntolerance",
    baseDefinition: "http://hl7.org/fhir/StructureDefinition/AllergyIntolerance",
    description: "Minimum expectations for recording allergy and intolerance information in a Philippine context.",
    constraints: [
      { path: "clinicalStatus", max: "1", mustSupport: MS, binding: { strength: "required", valueSet: "http://hl7.org/fhir/ValueSet/allergyintolerance-clinical|4.0.1", codes: ["active", "inactive", "resolved"] } },
      { path: "clinicalStatus.coding", max: "*", mustSupport: MS },
      { path: "clinicalStatus.text", max: "1", mustSupport: MS },
      { path: "verificationStatus", max: "1", mustSupport: MS, binding: { strength: "required", valueSet: "http://hl7.org/fhir/ValueSet/allergyintolerance-verification|4.0.1", codes: ["unconfirmed", "confirmed", "refuted", "entered-in-error"] } },
      { path: "verificationStatus.coding", max: "*", mustSupport: MS },
      { path: "verificationStatus.text", max: "1", mustSupport: MS },
      { path: "type", max: "1", binding: { strength: "required", valueSet: "http://hl7.org/fhir/ValueSet/allergy-intolerance-type|4.0.1", codes: ["allergy", "intolerance"] } },
      { path: "category", max: "*", binding: { strength: "required", valueSet: "http://hl7.org/fhir/ValueSet/allergy-intolerance-category|4.0.1", codes: ["food", "medication", "environment", "biologic"] } },
      { path: "criticality", max: "1", binding: { strength: "required", valueSet: "http://hl7.org/fhir/ValueSet/allergy-intolerance-criticality|4.0.1", codes: ["low", "high", "unable-to-assess"] } },
      { path: "code", max: "1", mustSupport: MS, types: ["CodeableConcept"], binding: { strength: "example", valueSet: "http://hl7.org/fhir/ValueSet/allergyintolerance-code|4.0.1" } },
      { path: "code.coding", max: "*", mustSupport: MS },
      { path: "code.text", max: "1", mustSupport: MS },
      { path: "patient", min: 1, max: "1", mustSupport: MS, types: ["Reference"], targetProfiles: [PROFILE.PATIENT] },
      { path: "onset[x]", max: "1", mustSupport: MS },
      { path: "note", max: "*", mustSupport: MS },
      { path: "reaction", max: "*", mustSupport: MS },
      { path: "reaction.manifestation", min: 1, max: "*", mustSupport: MS, binding: { strength: "example", valueSet: "http://hl7.org/fhir/ValueSet/clinical-findings|4.0.1" } },
      { path: "reaction.manifestation.coding", max: "*", mustSupport: MS },
      { path: "reaction.manifestation.text", max: "1", mustSupport: MS },
      { path: "reaction.severity", max: "1", mustSupport: MS, binding: { strength: "required", valueSet: "http://hl7.org/fhir/ValueSet/reaction-event-severity|4.0.1", codes: ["mild", "moderate", "severe"] } },
    ],
  },

  {
    url: PROFILE.MEDICATION_STATEMENT,
    name: "PHCoreMedicationStatement",
    resourceType: "MedicationStatement",
    baseDefinition: "http://hl7.org/fhir/StructureDefinition/MedicationStatement",
    description: "Captures key medication statement data for the Philippine context, including PH FDA registered products.",
    constraints: [
      { path: "status", min: 1, max: "1", types: ["code"], binding: { strength: "required", valueSet: "http://hl7.org/fhir/ValueSet/medication-statement-status|4.0.1", codes: ["active", "completed", "entered-in-error", "intended", "stopped", "on-hold", "unknown", "not-taken"] } },
      { path: "statusReason", max: "*", mustSupport: MS, binding: { strength: "example", valueSet: "http://hl7.org/fhir/ValueSet/reason-medication-status-codes|4.0.1" } },
      { path: "statusReason.coding", max: "*", mustSupport: MS },
      { path: "statusReason.text", max: "1", mustSupport: MS },
      { path: "category", max: "1", mustSupport: MS, binding: { strength: "preferred", valueSet: "http://hl7.org/fhir/ValueSet/medication-statement-category|4.0.1" } },
      { path: "category.coding", max: "*", mustSupport: MS },
      { path: "category.text", max: "1", mustSupport: MS },
      { path: "medication[x]", max: "1", mustSupport: MS, types: ["CodeableConcept"], binding: { strength: "preferred", valueSet: "https://fhir.doh.gov.ph/phcore/ValueSet/drugs-vs" } },
      { path: "medication[x].coding", max: "*", mustSupport: MS },
      { path: "medication[x].text", max: "1", mustSupport: MS },
      { path: "subject", min: 1, max: "1", types: ["Reference"], targetProfiles: [PROFILE.PATIENT, "Group"] },
      { path: "context", max: "1", types: ["Reference"], targetProfiles: [PROFILE.ENCOUNTER, "EpisodeOfCare"] },
      { path: "reasonCode", max: "*", mustSupport: MS, binding: { strength: "example", valueSet: "http://hl7.org/fhir/ValueSet/condition-code|4.0.1" } },
    ],
  },

  {
    url: PROFILE.NAME,
    name: "PHCoreName",
    resourceType: "HumanName",
    baseDefinition: "http://hl7.org/fhir/StructureDefinition/HumanName",
    description: "A name of a person in the Philippine context.",
    constraints: [
      { path: "use", max: "1", binding: { strength: "required", valueSet: "http://hl7.org/fhir/ValueSet/name-use|4.0.1", codes: ["usual", "official", "temp", "nickname", "anonymous", "old", "maiden"] } },
    ],
  },

  {
    url: PROFILE.ADDRESS,
    name: "PHCoreAddress",
    resourceType: "Address",
    baseDefinition: "http://hl7.org/fhir/StructureDefinition/Address",
    description:
      "An address for the individual. Carries PH Core PSGC extensions for region, province, city/municipality and barangay.",
    constraints: [
      { path: "use", max: "1", binding: { strength: "required", valueSet: "http://hl7.org/fhir/ValueSet/address-use|4.0.1", codes: ["home", "work", "temp", "old", "billing"] } },
      { path: "type", max: "1", binding: { strength: "required", valueSet: "http://hl7.org/fhir/ValueSet/address-type|4.0.1", codes: ["postal", "physical", "both"] } },
    ],
  },
];

export const PROFILE_BY_URL = new Map(PH_CORE_PROFILES.map((p) => [p.url, p]));

export const PROFILE_BY_RESOURCE_TYPE = new Map<string, ProfileDefinition[]>();
for (const p of PH_CORE_PROFILES) {
  const list = PROFILE_BY_RESOURCE_TYPE.get(p.resourceType) ?? [];
  list.push(p);
  PROFILE_BY_RESOURCE_TYPE.set(p.resourceType, list);
}

/** Complete set of code systems HealthLink validates against. */
export const KNOWN_CODE_SYSTEMS: Record<string, string> = {
  ...CS,
  ...ID_SYS,
};

/**
 * Terminology subsets bundled with the prototype. Codes outside these subsets
 * produce a WARNING, not an error: the national ValueSets are still in draft
 * and HealthLink must not reject valid real-world codes.
 */
export const LOCAL_TERMINOLOGY: Record<string, Record<string, string>> = {
  [CS.LOINC]: Object.fromEntries(Object.entries(LOINC).map(([k, v]) => [k, v.display])),
  [CS.ICD10]: Object.fromEntries(Object.entries(ICD10).map(([k, v]) => [k, v.display])),
  [CS.SNOMED]: SNOMED,
};
