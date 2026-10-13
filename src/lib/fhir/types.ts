/**
 * FHIR R4 (4.0.1) subset data types used by HealthLink.
 *
 * Only the elements HealthLink maps, validates, or exchanges are modelled.
 * Deliberately permissive (`[key: string]: unknown` on resources) so that
 * round-tripping a resource read back from the facade never loses data.
 *
 * Reference: https://hl7.org/fhir/R4/
 */

export type FhirId = string;

export interface Extension {
  url: string;
  valueString?: string;
  valueCode?: string;
  valueCoding?: Coding;
  valueCodeableConcept?: CodeableConcept;
  valueBoolean?: boolean;
  valueInteger?: number;
  valueDecimal?: number;
  valueDateTime?: string;
  valueDate?: string;
  valueReference?: Reference;
  valueUri?: string;
  extension?: Extension[];
}

export interface Coding {
  system?: string;
  version?: string;
  code?: string;
  display?: string;
  userSelected?: boolean;
}

export interface CodeableConcept {
  coding?: Coding[];
  text?: string;
}

export interface Identifier {
  use?: string;
  type?: CodeableConcept;
  system?: string;
  value?: string;
  period?: Period;
  assigner?: Reference;
}

export interface Reference {
  reference?: string;
  type?: string;
  identifier?: Identifier;
  display?: string;
}

export interface Period {
  start?: string;
  end?: string;
}

export interface HumanName {
  use?: string;
  text?: string;
  family?: string;
  given?: string[];
  prefix?: string[];
  suffix?: string[];
  period?: Period;
}

export interface ContactPoint {
  system?: "phone" | "fax" | "email" | "pager" | "url" | "sms" | "other";
  value?: string;
  use?: string;
  rank?: number;
  period?: Period;
}

export interface Address {
  use?: string;
  type?: string;
  text?: string;
  line?: string[];
  city?: string;
  district?: string;
  state?: string;
  postalCode?: string;
  country?: string;
  period?: Period;
  extension?: Extension[];
}

export interface Quantity {
  value?: number;
  comparator?: string;
  unit?: string;
  system?: string;
  code?: string;
}

export interface Annotation {
  authorString?: string;
  time?: string;
  text: string;
}

export interface Attachment {
  contentType?: string;
  language?: string;
  data?: string;
  url?: string;
  size?: number;
  hash?: string;
  title?: string;
  creation?: string;
}

export interface Narrative {
  status: "generated" | "extensions" | "additional" | "empty";
  div: string;
}

export interface Meta {
  versionId?: string;
  lastUpdated?: string;
  profile?: string[];
  tag?: Coding[];
  security?: Coding[];
}

export interface Resource {
  resourceType: string;
  id?: string;
  meta?: Meta;
  implicitRules?: string;
  language?: string;
  text?: Narrative;
  contained?: Resource[];
  extension?: Extension[];
  modifierExtension?: Extension[];
  [key: string]: unknown;
}

/* ------------------------------------------------------------------ */
/* Resources used by HealthLink                                       */
/* ------------------------------------------------------------------ */

export interface Patient extends Resource {
  resourceType: "Patient";
  identifier?: Identifier[];
  active?: boolean;
  name?: HumanName[];
  telecom?: ContactPoint[];
  gender?: "male" | "female" | "other" | "unknown";
  birthDate?: string;
  deceasedBoolean?: boolean;
  deceasedDateTime?: string;
  address?: Address[];
  maritalStatus?: CodeableConcept;
  multipleBirthBoolean?: boolean;
  multipleBirthInteger?: number;
  contact?: Array<{
    relationship?: CodeableConcept[];
    name?: HumanName;
    telecom?: ContactPoint[];
    address?: Address;
    gender?: string;
    organization?: Reference;
    period?: Period;
  }>;
  communication?: Array<{ language: CodeableConcept; preferred?: boolean }>;
  generalPractitioner?: Reference[];
  managingOrganization?: Reference;
}

export interface Practitioner extends Resource {
  resourceType: "Practitioner";
  identifier?: Identifier[];
  active?: boolean;
  name?: HumanName[];
  telecom?: ContactPoint[];
  address?: Address[];
  gender?: string;
  birthDate?: string;
  qualification?: Array<{
    identifier?: Identifier[];
    code: CodeableConcept;
    period?: Period;
    issuer?: Reference;
  }>;
  communication?: CodeableConcept[];
}

export interface Organization extends Resource {
  resourceType: "Organization";
  identifier?: Identifier[];
  active?: boolean;
  type?: CodeableConcept[];
  name?: string;
  alias?: string[];
  telecom?: ContactPoint[];
  address?: Address[];
  partOf?: Reference;
  contact?: Array<{
    purpose?: CodeableConcept;
    name?: HumanName;
    telecom?: ContactPoint[];
    address?: Address;
  }>;
}

export interface Encounter extends Resource {
  resourceType: "Encounter";
  identifier?: Identifier[];
  status: string;
  statusHistory?: Array<{ status: string; period: Period }>;
  class: Coding;
  classHistory?: Array<{ class: Coding; period: Period }>;
  type?: CodeableConcept[];
  serviceType?: CodeableConcept;
  priority?: CodeableConcept;
  subject: Reference;
  episodeOfCare?: Reference[];
  basedOn?: Reference[];
  participant?: Array<{
    type?: CodeableConcept[];
    period?: Period;
    individual?: Reference;
  }>;
  period?: Period;
  reasonCode?: CodeableConcept[];
  reasonReference?: Reference[];
  diagnosis?: Array<{ condition: Reference; use?: CodeableConcept; rank?: number }>;
  hospitalization?: {
    origin?: Reference;
    admitSource?: CodeableConcept;
    dischargeDisposition?: CodeableConcept;
  };
  location?: Array<{ location: Reference; status?: string; physicalType?: CodeableConcept; period?: Period }>;
  serviceProvider?: Reference;
}

export interface Observation extends Resource {
  resourceType: "Observation";
  identifier?: Identifier[];
  basedOn?: Reference[];
  partOf?: Reference[];
  status: string;
  category?: CodeableConcept[];
  code: CodeableConcept;
  subject?: Reference;
  encounter?: Reference;
  effectiveDateTime?: string;
  effectivePeriod?: Period;
  issued?: string;
  performer?: Reference[];
  valueQuantity?: Quantity;
  valueCodeableConcept?: CodeableConcept;
  valueString?: string;
  valueBoolean?: boolean;
  valueInteger?: number;
  dataAbsentReason?: CodeableConcept;
  interpretation?: CodeableConcept[];
  note?: Annotation[];
  bodySite?: CodeableConcept;
  referenceRange?: Array<{
    low?: Quantity;
    high?: Quantity;
    type?: CodeableConcept;
    text?: string;
  }>;
  component?: Array<{
    code: CodeableConcept;
    valueQuantity?: Quantity;
    valueCodeableConcept?: CodeableConcept;
    interpretation?: CodeableConcept[];
  }>;
}

export interface Condition extends Resource {
  resourceType: "Condition";
  identifier?: Identifier[];
  clinicalStatus?: CodeableConcept;
  verificationStatus?: CodeableConcept;
  category?: CodeableConcept[];
  severity?: CodeableConcept;
  code?: CodeableConcept;
  bodySite?: CodeableConcept[];
  subject: Reference;
  encounter?: Reference;
  onsetDateTime?: string;
  onsetPeriod?: Period;
  recordedDate?: string;
  recorder?: Reference;
  asserter?: Reference;
  note?: Annotation[];
}

export interface AllergyIntolerance extends Resource {
  resourceType: "AllergyIntolerance";
  identifier?: Identifier[];
  clinicalStatus?: CodeableConcept;
  verificationStatus?: CodeableConcept;
  type?: string;
  category?: string[];
  criticality?: string;
  code?: CodeableConcept;
  patient: Reference;
  encounter?: Reference;
  onsetDateTime?: string;
  recordedDate?: string;
  recorder?: Reference;
  note?: Annotation[];
  reaction?: Array<{
    substance?: CodeableConcept;
    manifestation: CodeableConcept[];
    description?: string;
    onset?: string;
    severity?: string;
  }>;
}

export interface MedicationStatement extends Resource {
  resourceType: "MedicationStatement";
  identifier?: Identifier[];
  basedOn?: Reference[];
  status: string;
  medicationCodeableConcept?: CodeableConcept;
  subject: Reference;
  context?: Reference;
  effectiveDateTime?: string;
  effectivePeriod?: Period;
  dateAsserted?: string;
  informationSource?: Reference;
  reasonCode?: CodeableConcept[];
  note?: Annotation[];
  dosage?: Array<{
    text?: string;
    timing?: unknown;
    route?: CodeableConcept;
    doseAndRate?: Array<{ doseQuantity?: Quantity }>;
  }>;
}

export interface ServiceRequest extends Resource {
  resourceType: "ServiceRequest";
  identifier?: Identifier[];
  basedOn?: Reference[];
  requisition?: Identifier;
  status: string;
  intent: string;
  category?: CodeableConcept[];
  priority?: string;
  code?: CodeableConcept;
  orderDetail?: CodeableConcept[];
  subject: Reference;
  encounter?: Reference;
  occurrenceDateTime?: string;
  occurrencePeriod?: Period;
  authoredOn?: string;
  requester?: Reference;
  performerType?: CodeableConcept;
  performer?: Reference[];
  locationCode?: CodeableConcept[];
  reasonCode?: CodeableConcept[];
  reasonReference?: Reference[];
  supportingInfo?: Reference[];
  bodySite?: CodeableConcept[];
  note?: Annotation[];
  patientInstruction?: string;
}

export interface Task extends Resource {
  resourceType: "Task";
  identifier?: Identifier[];
  basedOn?: Reference[];
  groupIdentifier?: Identifier;
  partOf?: Reference[];
  status: string;
  statusReason?: CodeableConcept;
  businessStatus?: CodeableConcept;
  intent: string;
  priority?: string;
  code?: CodeableConcept;
  description?: string;
  focus?: Reference;
  for?: Reference;
  encounter?: Reference;
  executionPeriod?: Period;
  authoredOn?: string;
  lastModified?: string;
  requester?: Reference;
  performerType?: CodeableConcept[];
  owner?: Reference;
  location?: Reference;
  reasonCode?: CodeableConcept;
  reasonReference?: Reference;
  note?: Annotation[];
  restriction?: { repetitions?: number; period?: Period };
}

export interface Provenance extends Resource {
  resourceType: "Provenance";
  target: Reference[];
  occurredPeriod?: Period;
  occurredDateTime?: string;
  recorded: string;
  policy?: string[];
  location?: Reference;
  reason?: CodeableConcept[];
  activity?: CodeableConcept;
  agent: Array<{
    type: CodeableConcept;
    role?: CodeableConcept[];
    who: Reference;
    onBehalfOf?: Reference;
  }>;
  entity?: Array<{ role: string; what: Reference; agent?: unknown[] }>;
  signature?: Array<{
    type?: Coding[];
    when?: string;
    who?: Reference;
    data?: string;
  }>;
}

export interface Consent extends Resource {
  resourceType: "Consent";
  identifier?: Identifier[];
  status: string;
  scope: CodeableConcept;
  category: CodeableConcept[];
  patient?: Reference;
  dateTime?: string;
  performer?: Reference[];
  organization?: Reference[];
  policyRule?: CodeableConcept;
  verification?: Array<{ verified: boolean; verificationType?: CodeableConcept }>;
  provision?: {
    type?: string;
    period?: Period;
    actor?: Array<{ role: CodeableConcept; reference: Reference }>;
    action?: CodeableConcept[];
    purpose?: Coding[];
    data?: Array<{ meaning: string; reference: Reference }>;
    provision?: unknown[];
  };
}

export interface Communication extends Resource {
  resourceType: "Communication";
  identifier?: Identifier[];
  basedOn?: Reference[];
  partOf?: Reference[];
  inResponseTo?: Reference[];
  status: string;
  category?: CodeableConcept[];
  priority?: string;
  subject?: Reference;
  about?: Reference[];
  encounter?: Reference;
  sent?: string;
  received?: string;
  recipient?: Reference[];
  sender?: Reference;
  reasonCode?: CodeableConcept[];
  payload?: Array<{ contentString?: string; contentAttachment?: Attachment; contentReference?: Reference }>;
  note?: Annotation[];
}

export interface DiagnosticReport extends Resource {
  resourceType: "DiagnosticReport";
  identifier?: Identifier[];
  basedOn?: Reference[];
  status: string;
  category?: CodeableConcept[];
  code: CodeableConcept;
  subject?: Reference;
  encounter?: Reference;
  effectiveDateTime?: string;
  issued?: string;
  performer?: Reference[];
  result?: Reference[];
  conclusion?: string;
  presentedForm?: Attachment[];
}

export interface DocumentReference extends Resource {
  resourceType: "DocumentReference";
  identifier?: Identifier[];
  status: string;
  docStatus?: string;
  type?: CodeableConcept;
  category?: CodeableConcept[];
  subject?: Reference;
  date?: string;
  author?: Reference[];
  custodian?: Reference;
  description?: string;
  securityLabel?: CodeableConcept[];
  content: Array<{
    attachment: Attachment;
    format?: Coding;
  }>;
  context?: {
    encounter?: Reference[];
    period?: Period;
  };
}

export interface AuditEvent extends Resource {
  resourceType: "AuditEvent";
  type: Coding;
  subtype?: Coding[];
  action?: "C" | "R" | "U" | "D" | "E";
  period?: Period;
  recorded: string;
  outcome?: "0" | "4" | "8" | "12";
  outcomeDesc?: string;
  purposeOfEvent?: CodeableConcept[];
  agent: Array<{
    type?: CodeableConcept;
    role?: CodeableConcept[];
    who?: Reference;
    altId?: string;
    name?: string;
    requestor: boolean;
    location?: Reference;
    policy?: string[];
    network?: { address?: string; type?: string };
    purposeOfUse?: CodeableConcept[];
  }>;
  source: { site?: string; identifier?: Identifier; type?: Coding[] };
  entity?: Array<{
    what?: Reference;
    type?: Coding;
    role?: Coding;
    lifecycle?: Coding;
    securityLabel?: Coding[];
    name?: string;
    description?: string;
    query?: string;
  }>;
}

export interface BundleEntry {
  fullUrl?: string;
  resource?: Resource;
  search?: { mode?: string; score?: number };
  request?: { method: string; url: string; ifMatch?: string };
  response?: { status: string; location?: string; etag?: string; outcome?: Resource };
}

export interface Bundle extends Resource {
  resourceType: "Bundle";
  type: string;
  timestamp?: string;
  total?: number;
  link?: Array<{ relation: string; url: string }>;
  entry?: BundleEntry[];
}

export interface OperationOutcomeIssue {
  severity: "fatal" | "error" | "warning" | "information";
  code: string;
  details?: CodeableConcept;
  diagnostics?: string;
  location?: string[];
  expression?: string[];
}

export interface OperationOutcome extends Resource {
  resourceType: "OperationOutcome";
  issue: OperationOutcomeIssue[];
}

export interface CapabilityStatement extends Resource {
  resourceType: "CapabilityStatement";
  status: string;
  date: string;
  kind: string;
  fhirVersion: string;
  format: string[];
  rest: Array<{
    mode: string;
    documentation?: string;
    security?: unknown;
    resource: Array<{
      type: string;
      profile?: string;
      documentation?: string;
      interaction?: Array<{ code: string }>;
      searchParam?: Array<{ name: string; type: string; documentation?: string }>;
    }>;
  }>;
}

export type AnyResource =
  | Patient
  | Practitioner
  | Organization
  | Encounter
  | Observation
  | Condition
  | AllergyIntolerance
  | MedicationStatement
  | ServiceRequest
  | Task
  | Provenance
  | Consent
  | Communication
  | DiagnosticReport
  | DocumentReference
  | AuditEvent
  | Bundle
  | OperationOutcome;


