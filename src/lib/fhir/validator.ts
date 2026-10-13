/**
 * HealthLink FHIR R4 / PH Core validator.
 *
 * Checks, in order:
 *   1. Structural conformance  - resourceType, id format, datatype shapes
 *   2. Cardinality             - FHIR R4 base + PH Core tightened cardinality
 *   3. Required terminology    - required/extensible bindings
 *   4. Terminology membership  - LOINC / ICD-10 / SNOMED subsets (warning only)
 *   5. Reference targets       - PH Core targetProfile restrictions
 *   6. PH Core invariants      - e.g. provenance-1
 *   7. Cross-resource rules    - referential integrity within a Bundle
 *
 * Output is always an OperationOutcome, with `severity` distinguishing
 * hard failures (`error`, `fatal`) from advisory findings (`warning`,
 * `information`). PH Core's draft status is why terminology-subset and
 * advisory checks never produce `error`.
 */

import type {
  Bundle,
  Coding,
  CodeableConcept,
  OperationOutcome,
  OperationOutcomeIssue,
  Resource,
  Reference,
} from "./types";
import {
  PH_CORE_PROFILES,
  PROFILE_BY_URL,
  LOCAL_TERMINOLOGY,
  type ProfileDefinition,
  type ElementConstraint,
} from "./profiles";
import { PROFILE, PHCORE_IG, CS } from "./terminology";

/* ------------------------------------------------------------------ */
/* OperationOutcome helpers                                            */
/* ------------------------------------------------------------------ */

export class OutcomeBuilder {
  issues: OperationOutcomeIssue[] = [];

  add(
    severity: OperationOutcomeIssue["severity"],
    code: string,
    diagnostics: string,
    opts: { expression?: string; location?: string[]; details?: string } = {},
  ) {
    this.issues.push({
      severity,
      code,
      diagnostics,
      ...(opts.expression ? { expression: [opts.expression] } : {}),
      ...(opts.location ? { location: opts.location } : {}),
      ...(opts.details ? { details: { text: opts.details } } : {}),
    });
  }

  error(expression: string, diagnostics: string, code = "invalid") {
    this.add("error", code, diagnostics, { expression });
  }
  warning(expression: string, diagnostics: string, code = "informational") {
    this.add("warning", code, diagnostics, { expression });
  }
  info(expression: string, diagnostics: string, code = "informational") {
    this.add("information", code, diagnostics, { expression });
  }

  get hasErrors() {
    return this.issues.some((i) => i.severity === "error" || i.severity === "fatal");
  }
  get errorCount() {
    return this.issues.filter((i) => i.severity === "error" || i.severity === "fatal").length;
  }
  get warningCount() {
    return this.issues.filter((i) => i.severity === "warning").length;
  }
  get infoCount() {
    return this.issues.filter((i) => i.severity === "information").length;
  }

  toOperationOutcome(): OperationOutcome {
    return {
      resourceType: "OperationOutcome",
      id: `oo-${Date.now().toString(36)}`,
      meta: {
        lastUpdated: new Date().toISOString(),
        tag: [{ system: CS.HL_LOCAL, code: "validation", display: "HealthLink validation result" }],
      },
      issue: this.issues.length
        ? this.issues
        : [
            {
              severity: "information",
              code: "informational",
              diagnostics: "Validation passed with no issues.",
            },
          ],
    };
  }
}

/* ------------------------------------------------------------------ */
/* Primitive format assertions                                         */
/* ------------------------------------------------------------------ */

const RE = {
  id: /^[A-Za-z0-9\-.]{1,64}$/,
  oid: /^urn:oid:[0-2](\.[0-9]+)+$/,
  uuid: /^urn:uuid:[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/,
  uri: /^[A-Za-z][A-Za-z0-9+.-]*:/,
  code: /^[^\s]+(\s[^\s]+)*$/,
  date: /^\d{4}(-\d{2}(-\d{2})?)?$/,
  dateTime:
    /^\d{4}(-\d{2}(-\d{2}(T\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:\d{2})?)?)?)?$/,
  instant: /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:\d{2})$/,
  time: /^\d{2}:\d{2}(:\d{2}(\.\d+)?)?$/,
  markdown: /^[\s\S]*$/,
};

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

/** Resolve `path` against a resource using FHIR's dotted path notation. */
function resolvePath(resource: Resource, path: string): unknown[] {
  const segments = path.split(".");
  let current: unknown[] = [resource];

  for (const seg of segments) {
    const next: unknown[] = [];
    // Strip a [x] suffix (polymorphic elements).
    const base = seg.replace(/\[x\]$/, "");
    const isChoice = seg.endsWith("[x]");

    for (const node of current) {
      if (Array.isArray(node)) {
        for (const item of node) collect(item, base, isChoice, next);
      } else {
        collect(node, base, isChoice, next);
      }
    }
    current = next;
  }
  return current;
}

/**
 * Resolve the *parents* of a path: every node that could carry the final
 * segment. Arrays encountered along the way are expanded into individual
 * parent instances, which is what FHIR cardinality actually means.
 *
 * Example: for `Encounter.diagnosis.use`, `diagnosis` expands to each
 * diagnosis element, so `use` is checked with max 1 **per diagnosis** rather
 * than max 1 across the whole array.
 */
function resolveParents(resource: Resource, path: string): unknown[] {
  const segments = path.split(".");
  if (segments.length <= 1) return [resource];
  const parentPath = segments.slice(0, -1).join(".");
  return resolvePath(resource, parentPath).flatMap((n) => (Array.isArray(n) ? n : [n]));
}

/** Read the final path segment from a single node, honouring [x] choice types. */
function segmentValues(node: unknown, lastSegment: string): unknown[] {
  if (!isPlainObject(node)) return [];
  const base = lastSegment.replace(/\[x\]$/, "");
  const isChoice = lastSegment.endsWith("[x]");

  if (isChoice) {
    const out: unknown[] = [];
    for (const [k, v] of Object.entries(node)) {
      if (k === base || !k.startsWith(base)) continue;
      const suffix = k.slice(base.length);
      if (!suffix || !/^[A-Z]/.test(suffix)) continue;
      if (Array.isArray(v)) out.push(...v);
      else out.push(v);
    }
    return out;
  }

  const v = node[base];
  if (v === undefined) return [];
  return Array.isArray(v) ? v : [v];
}

function maxToNumber(max: string | undefined): number {
  if (max === undefined) return Infinity;
  if (max === "*") return Infinity;
  const n = Number.parseInt(max, 10);
  return Number.isFinite(n) ? n : Infinity;
}

/**
 * Cardinality is evaluated per parent instance. A nested required element is
 * only required when its parent exists, which is why an absent `communication`
 * array does not violate `communication.language 1..1`.
 */
function checkConstraint(resource: Resource, profile: ProfileDefinition, c: ElementConstraint, oo: OutcomeBuilder) {
  const expr = `${profile.resourceType}.${c.path}`;
  const lastSegment = c.path.split(".").pop()!;
  const parentNodes = resolveParents(resource, c.path);
  const max = maxToNumber(c.max);

  // Cardinality, per parent instance
  let totalFound = 0;
  for (const parent of parentNodes) {
    const found = segmentValues(parent, lastSegment);
    totalFound += found.length;

    if (c.min !== undefined && c.min > 0 && found.length < c.min) {
      oo.error(
        `${profile.resourceType}.${c.path}`,
        `PH Core requires at least ${c.min} value(s) for ${c.path} (found ${found.length}).`,
        "required",
      );
    }
    if (found.length > max && max !== Infinity) {
      oo.error(
        `${profile.resourceType}.${c.path}`,
        `PH Core allows at most ${c.max} value(s) for ${c.path} (found ${found.length}).`,
        "structure",
      );
    }
  }

  const values = resolvePath(resource, c.path);
  if (!values.length) return;

  // Binding checks
  if (c.binding) {
    const { strength, codes, system: bindSystem, valueSet } = c.binding;

    // Required binding on a primitive code element
    if (c.binding.codes && strength === "required") {
      const allowed = c.binding.codes;
      for (const v of values) {
        if (typeof v === "string" && !allowed.includes(v)) {
          oo.error(expr, `Code "${v}" is not in the required value set (${valueSet ?? bindSystem}).`, "code-invalid");
        }
      }
    }

    // CodeableConcept / Coding value-set membership
    for (const v of values) {
      const codings = extractCodings(v);
      for (const coding of codings) {
        if (!coding.system || !coding.code) continue;

        // Terminology subset membership -> warning only (national ValueSets are drafts)
        const subset = LOCAL_TERMINOLOGY[coding.system];
        if (subset && !(coding.code in subset)) {
          oo.warning(
            expr,
            `Code ${coding.system}#${coding.code} is outside the terminology subset bundled with this prototype. ` +
              `National value sets are still in draft, so this is advisory only.`,
            "code-invalid",
          );
        }

        // Required binding with an explicit local code list
        if (strength === "required" && codes && !codes.includes(coding.code)) {
          oo.error(
            expr,
            `Code "${coding.code}" from ${coding.system} is not in the required value set (${valueSet ?? bindSystem}).`,
            "code-invalid",
          );
        }
      }
    }
  }

  // Reference target profile checks
  if (c.targetProfiles && values.length) {
    for (const v of values) {
      const ref = v as Reference;
      if (!isPlainObject(ref) || typeof ref.reference !== "string") continue;
      const targetType = ref.reference.includes("/") ? ref.reference.split("/").slice(-2)[0] : undefined;
      if (!targetType) continue;
      const allowed = c.targetProfiles.some((tp) => {
        const bare = tp.split("/").pop() ?? tp;
        return bare === targetType || bare.toLowerCase() === targetType.toLowerCase();
      });
      if (!allowed) {
        oo.warning(
          expr,
          `Reference target "${targetType}" is outside the PH Core targetProfile list for ${expr}: ${c.targetProfiles.join(", ")}.`,
          "code-invalid",
        );
      }
    }
  }
}

function extractCodings(v: unknown): Coding[] {
  if (!isPlainObject(v)) return [];
  // Coding
  if (typeof v.code === "string" || typeof v.system === "string") {
    if (!("coding" in v) && !("text" in v)) {
      return [v as unknown as Coding];
    }
  }
  // CodeableConcept
  if (Array.isArray(v.coding)) return v.coding as Coding[];
  return [];
}

function collect(node: unknown, base: string, isChoice: boolean, out: unknown[]) {
  if (!isPlainObject(node)) return;
  if (isChoice) {
    const prefix = base;
    for (const [k, v] of Object.entries(node)) {
      if (k !== prefix && !k.startsWith(prefix)) continue;
      const suffix = k.slice(prefix.length);
      if (!suffix || !/^[A-Z]/.test(suffix)) continue;
      if (Array.isArray(v)) out.push(...v);
      else out.push(v);
    }
    return;
  }
  const v = node[base];
  if (v === undefined) return;
  if (Array.isArray(v)) out.push(...v);
  else out.push(v);
}

/* ------------------------------------------------------------------ */
/* Structural checks                                                   */
/* ------------------------------------------------------------------ */

const VALID_RESOURCE_TYPE = /^[A-Z][A-Za-z0-9]{0,63}$/;

function checkStructure(resource: Resource, template: string, oo: OutcomeBuilder, expectType = false) {
  if (!isPlainObject(resource)) {
    oo.error(template, "Resource must be a JSON object.");
    return false;
  }
  if (typeof resource.resourceType !== "string" || !VALID_RESOURCE_TYPE.test(resource.resourceType)) {
    oo.error(`${template}.resourceType`, "Missing or invalid resourceType.");
    return false;
  }
  // `template` is only a type name to check against when the caller passes a
  // concrete expected type (e.g. a create request with an explicit type).
  if (expectType && template !== resource.resourceType) {
    oo.error(
      `${template}.resourceType`,
      `Explicit resourceType "${resource.resourceType}" does not match the expected template "${template}".`,
    );
  }
  if (resource.id !== undefined) {
    if (typeof resource.id !== "string" || !RE.id.test(resource.id)) {
      oo.error(`${template}.id`, "Resource.id must match [A-Za-z0-9-]{1,64}.");
    }
  }
  if (resource.meta?.profile) {
    for (const p of resource.meta.profile) {
      if (!RE.uri.test(p)) oo.error(`${template}.meta.profile`, `Invalid profile URI "${p}".`);
    }
  }
  return true;
}

/**
 * FHIR R4 temporal element types, keyed by `ResourceType.fieldName`.
 *
 * Getting this right matters: `DocumentReference.date` is a dateTime while
 * `Patient.birthDate` is a date, even though both are "dates" colloquially.
 * Anything not listed here is not validity-checked as a temporal value, so an
 * unmodelled element is silently accepted rather than wrongly rejected.
 */
const DATE_ONLY_FIELDS = new Set([
  "Patient.birthDate",
  "Practitioner.birthDate",
  "RelatedPerson.birthDate",
  "Person.birthDate",
]);

const DATE_TIME_FIELDS = new Set([
  "DocumentReference.date",
  "Condition.recordedDate",
  "Condition.onsetDateTime",
  "Condition.abatementDateTime",
  "AllergyIntolerance.onsetDateTime",
  "AllergyIntolerance.recordedDate",
  "AllergyIntolerance.lastOccurrence",
  "Observation.effectiveDateTime",
  "Observation.issued",
  "MedicationStatement.effectiveDateTime",
  "MedicationStatement.dateAsserted",
  "ServiceRequest.authoredOn",
  "ServiceRequest.occurrenceDateTime",
  "Task.authoredOn",
  "Task.lastModified",
  "Communication.sent",
  "Communication.received",
  "Encounter.period",
  "Provenance.recorded",
  "Provenance.occurredDateTime",
  "Consent.dateTime",
  "Attachment.creation",
  "DiagnosticReport.effectiveDateTime",
  "DiagnosticReport.issued",
  "AuditEvent.recorded",
  "Meta.lastUpdated",
]);

const INSTANT_FIELDS = new Set([
  "Observation.issued",
  "AuditEvent.recorded",
  "Provenance.recorded",
  "Meta.lastUpdated",
]);

/** Recursively assert that declared FHIR datatypes have the right JSON shape. */
function checkDatatypes(node: unknown, path: string, oo: OutcomeBuilder, resourceType: string, depth = 0) {
  if (depth > 12 || node === null || node === undefined) return;

  if (Array.isArray(node)) {
    node.forEach((item, i) => checkDatatypes(item, `${path}[${i}]`, oo, resourceType, depth + 1));
    return;
  }
  if (!isPlainObject(node)) return;

  for (const [key, value] of Object.entries(node)) {
    const childPath = `${path}.${key}`;

    // Core identifiers
    if (key === "id" && typeof value !== "string" && path.includes(".")) {
      oo.error(childPath, `${childPath} must be a string.`);
      continue;
    }
    if (key === "resourceType") continue;

    // Coding / CodeableConcept hygiene
    if (key === "coding" && Array.isArray(value)) {
      value.forEach((c, i) => {
        checkDatatypes(c, `${childPath}[${i}]`, oo, resourceType, depth + 1);
        if (isPlainObject(c)) {
          if (c.code !== undefined && typeof c.code !== "string") {
            oo.error(`${childPath}[${i}].code`, "Coding.code must be a string.");
          }
          if (c.system !== undefined && (typeof c.system !== "string" || !RE.uri.test(c.system))) {
            oo.error(`${childPath}[${i}].system`, `Coding.system "${c.system}" is not a valid URI.`);
          }
          if (typeof c.code === "string" && c.code.includes(" ") && c.code.trim() !== "") {
            oo.warning(
              `${childPath}[${i}].code`,
              `Coding.code "${c.code}" contains whitespace. FHIR codes should not contain spaces.`,
            );
          }
        }
      });
      continue;
    }

    // Temporal values, resolved against the owning resource type
    if (typeof value === "string") {
      const qualified = `${resourceType}.${key}`;
      if (DATE_ONLY_FIELDS.has(qualified)) {
        if (!RE.date.test(value)) {
          oo.error(childPath, `"${value}" is not a valid FHIR date (YYYY-MM-DD).`);
        }
      } else if (INSTANT_FIELDS.has(qualified)) {
        if (!RE.instant.test(value)) {
          oo.error(childPath, `"${value}" is not a valid FHIR instant (requires a timezone).`);
        }
      } else if (DATE_TIME_FIELDS.has(qualified)) {
        if (!RE.dateTime.test(value)) {
          oo.error(childPath, `"${value}" is not a valid FHIR dateTime.`);
        }
      }
      continue;
    }

    checkDatatypes(value, childPath, oo, resourceType, depth + 1);
  }
}

/* ------------------------------------------------------------------ */
/* Cardinality + terminology against a profile                         */
/* ------------------------------------------------------------------ */

function checkInvariants(resource: Resource, profile: ProfileDefinition, oo: OutcomeBuilder) {
  if (!profile.invariants?.length) return;

  for (const inv of profile.invariants) {
    if (inv.key === "provenance-1") {
      const agents = (resource.agent as Array<Record<string, unknown>> | undefined) ?? [];
      agents.forEach((agent, i) => {
        const who = agent.who as Reference | undefined;
        if (!who?.reference) return;
        const refType = who.reference.split("/").slice(-2)[0];
        if ((refType === "Practitioner" || refType === "Device") && !agent.onBehalfOf) {
          oo.error(
            `Provenance.agent[${i}]`,
            "provenance-1: onBehalfOf SHALL be present when Provenance.agent.who is a Practitioner or Device.",
            "invariant",
          );
        }
      });
    }
  }
}

/* ------------------------------------------------------------------ */
/* Profile selection                                                   */
/* ------------------------------------------------------------------ */

/** Choose the PH Core profile that applies to a resource, if any. */
export function profileFor(resourceType: string, profileUrls?: string[]): ProfileDefinition | undefined {
  if (profileUrls?.length) {
    for (const u of profileUrls) {
      const p = PROFILE_BY_URL.get(u.split("|")[0]);
      if (p) return p;
    }
  }
  const candidates = PH_CORE_PROFILES.filter(
    (p) => p.resourceType === resourceType && p.baseDefinition.includes("/StructureDefinition/"),
  );
  return candidates[0];
}

/* ------------------------------------------------------------------ */
/* Public API                                                          */
/* ------------------------------------------------------------------ */

export interface ValidationResult {
  valid: boolean;
  outcome: OperationOutcome;
  errorCount: number;
  warningCount: number;
  infoCount: number;
  /** Profiles that were actually applied. */
  profilesApplied: string[];
}

export interface ValidateOptions {
  /** Apply PH Core constraints in addition to FHIR R4 base rules. */
  phCore?: boolean;
  /** Treat terminology-subset misses as errors instead of warnings (not used in the prototype UI). */
  strictTerminology?: boolean;
}

export function validateResource(
  resource: Resource,
  opts: ValidateOptions = {},
): ValidationResult {
  const { phCore = true } = opts;
  const oo = new OutcomeBuilder();
  const template = resource?.resourceType ?? "Resource";

  if (!checkStructure(resource, template, oo)) {
    return finish(oo, []);
  }

  checkDatatypes(resource, resource.resourceType, oo, resource.resourceType);

  const applied: string[] = [];
  if (phCore) {
    const profile = profileFor(resource.resourceType, resource.meta?.profile);
    if (profile) {
      applied.push(profile.url);
      for (const c of profile.constraints) checkConstraint(resource, profile, c, oo);
      checkInvariants(resource, profile, oo);

      // Advise only when the resource is not explicitly declared as PH Core.
      if (!resource.meta?.profile?.includes(profile.url)) {
        oo.info(
          `${resource.resourceType}.meta.profile`,
          `Validated against ${profile.name} (${profile.url}). Set meta.profile to declare conformance explicitly.`,
        );
      }
    }
  }

  return finish(oo, applied);
}

function finish(oo: OutcomeBuilder, profilesApplied: string[]): ValidationResult {
  return {
    valid: !oo.hasErrors,
    outcome: oo.toOperationOutcome(),
    errorCount: oo.errorCount,
    warningCount: oo.warningCount,
    infoCount: oo.infoCount,
    profilesApplied,
  };
}

/* ------------------------------------------------------------------ */
/* Bundle validation                                                   */
/* ------------------------------------------------------------------ */

export interface BundleValidationResult extends ValidationResult {
  entries: Array<{ index: number; resourceType: string; id?: string; valid: boolean; errorCount: number; warningCount: number }>;
  duplicateIds: string[];
  unresolvedReferences: string[];
}

/**
 * Validate a Bundle: each entry against its profile, plus referential
 * integrity of internal references (`Patient/abc` style) and `urn:uuid:` refs.
 */
export function validateBundle(bundle: Bundle, opts: ValidateOptions = {}): BundleValidationResult {
  const oo = new OutcomeBuilder();
  const applied: string[] = [];
  const entries: BundleValidationResult["entries"] = [];

  if (!isPlainObject(bundle) || bundle.resourceType !== "Bundle") {
    oo.error("Bundle", "Expected a Bundle resource.");
    return { ...finish(oo, applied), entries, duplicateIds: [], unresolvedReferences: [] };
  }
  if (typeof bundle.type !== "string") {
    oo.error("Bundle.type", "Bundle.type is required (e.g. transaction, collection, document, message).");
  }

  const VALID_BUNDLE_TYPES = ["document", "message", "transaction", "transaction-response", "batch", "batch-response", "history", "searchset", "collection"];
  if (bundle.type && !VALID_BUNDLE_TYPES.includes(bundle.type)) {
    oo.error("Bundle.type", `"${bundle.type}" is not a valid Bundle.type.`, "code-invalid");
  }

  const entryList = Array.isArray(bundle.entry) ? bundle.entry : [];
  if (!entryList.length) {
    oo.warning("Bundle.entry", "Bundle contains no entries.");
  }

  const seenFullUrls = new Map<string, number>();
  const duplicateIds: string[] = [];
  const availableRefs = new Set<string>();

  // Pass 1: per-entry validation + collect identities
  entryList.forEach((entry, i) => {
    const res = entry?.resource;
    if (!res) {
      oo.error(`Bundle.entry[${i}].resource`, `Bundle.entry[${i}] has no resource.`);
      entries.push({ index: i, resourceType: "(missing)", valid: false, errorCount: 1, warningCount: 0 });
      return;
    }
    const result = validateResource(res, opts);
    applied.push(...result.profilesApplied);

    if (result.errorCount) {
      for (const issue of result.outcome.issue) {
        if (issue.severity === "error" || issue.severity === "fatal") {
          oo.error(
            `Bundle.entry[${i}].resource.${issue.expression?.[0] ?? res.resourceType}`,
            issue.diagnostics ?? "Validation error.",
            issue.code,
          );
        }
      }
    }
    if (result.warningCount) {
      oo.warning(
        `Bundle.entry[${i}]`,
        `${result.warningCount} advisory finding(s) in ${res.resourceType}/${res.id ?? "(no id)"}.`,
      );
    }

    entries.push({
      index: i,
      resourceType: res.resourceType,
      id: res.id,
      valid: result.valid,
      errorCount: result.errorCount,
      warningCount: result.warningCount,
    });

    if (res.id) availableRefs.add(`${res.resourceType}/${res.id}`);
    if (entry.fullUrl) {
      availableRefs.add(entry.fullUrl);
      availableRefs.add(entry.fullUrl.replace(/^urn:uuid:/, "urn:uuid:"));
      const prev = seenFullUrls.get(entry.fullUrl);
      if (prev !== undefined) {
        duplicateIds.push(entry.fullUrl);
        oo.warning(`Bundle.entry[${i}].fullUrl`, `Duplicate fullUrl "${entry.fullUrl}" (also at entry[${prev}]).`);
      } else {
        seenFullUrls.set(entry.fullUrl, i);
      }
    }
  });

  // Pass 2: internal reference integrity
  const unresolvedReferences: string[] = [];
  entryList.forEach((entry, i) => {
    const res = entry?.resource;
    if (!res) return;

    const refs = collectReferences(res);
    for (const ref of refs) {
      const value = ref.reference;
      if (!value) continue;
      // Ignore absolute external URLs - they point to another facility's server.
      if (/^https?:\/\//i.test(value)) continue;
      if (value.startsWith("urn:uuid:")) {
        if (!availableRefs.has(value)) {
          unresolvedReferences.push(value);
          oo.warning(
            `Bundle.entry[${i}].resource`,
            `urn:uuid reference "${value}" does not resolve to any entry fullUrl in this Bundle.`,
          );
        }
        continue;
      }
      const [rt, rid] = value.split("/");
      if (rt && rid) {
        const key = `${rt}/${rid}`;
        if (!availableRefs.has(key)) {
          // A `#`-prefixed or contained reference
          if (!value.startsWith("#")) {
            unresolvedReferences.push(key);
            oo.warning(
              `Bundle.entry[${i}].resource`,
              `Reference "${key}" does not resolve to any entry in this Bundle (may reside on a remote facility server).`,
            );
          }
        }
      }
    }
  });

  const base = finish(oo, Array.from(new Set(applied)));
  return { ...base, entries, duplicateIds, unresolvedReferences };
}

function collectReferences(node: unknown, out: Reference[] = [], depth = 0): Reference[] {
  if (depth > 10 || !isPlainObject(node)) return out;
  for (const [key, value] of Object.entries(node)) {
    if (key === "reference" && typeof value === "string") {
      out.push(node as unknown as Reference);
      continue;
    }
    if (Array.isArray(value)) {
      value.forEach((v) => collectReferences(v, out, depth + 1));
    } else if (isPlainObject(value)) {
      collectReferences(value, out, depth + 1);
    }
  }
  return out;
}

/* ------------------------------------------------------------------ */
/* PH Core alignment report                                            */
/* ------------------------------------------------------------------ */

export interface AlignmentRow {
  resource: string;
  profile: string;
  requiredElements: number;
  mustSupportElements: number;
  boundElements: number;
  status: "applied" | "not-applicable" | "not-aligned";
}

export function phCoreAlignment(resourceTypes: string[]): AlignmentRow[] {
  return resourceTypes.map((rt) => {
    const profile = PH_CORE_PROFILES.find(
      (p) => p.resourceType === rt && p.url.startsWith(PHCORE_IG.canonical),
    );
    if (!profile) {
      return {
        resource: rt,
        profile: "(no PH Core profile in v0.2.0)",
        requiredElements: 0,
        mustSupportElements: 0,
        boundElements: 0,
        status: "not-aligned" as const,
      };
    }
    const req = profile.constraints.filter((c) => (c.min ?? 0) >= 1).length;
    const ms = profile.constraints.filter((c) => c.mustSupport).length;
    const bound = profile.constraints.filter((c) => c.binding).length;
    return {
      resource: rt,
      profile: profile.name,
      requiredElements: req,
      mustSupportElements: ms,
      boundElements: bound,
      status: "applied" as const,
    };
  });
}

export { PHCORE_IG, PROFILE };
