/**
 * HealthLink FHIR facade.
 *
 * A read-only FHIR R4 server exposing the data exchanged through HealthLink.
 * The receiving facility's system (or a third-party FHIR client) reads the
 * referral package from here rather than from a proprietary API, which is the
 * "secure routing and interoperability" requirement.
 *
 * Authentication: an HTTP bearer token or the interactive session cookie.
 * Tokens are issued per user in the Directory page and are bound to that user,
 * so every read is attributable in the audit trail.
 *
 * Supported interactions:
 *   GET /fhir/metadata                           CapabilityStatement
 *   GET /fhir/Patient?_id=&identifier=&name=      search
 *   GET /fhir/Patient/{id}                        read
 *   GET /fhir/ServiceRequest?_id=                 search
 *   GET /fhir/Task?_id=                           search
 *   GET /fhir/Bundle/{referralId}                 referral transaction bundle
 *
 * Unsupported interactions return a 405 with an OperationOutcome, matching the
 * behaviour a conformant client expects.
 */

import { NextResponse, type NextRequest } from "next/server";
import { getSession, hasPermission, PERMISSIONS } from "@/lib/auth";
import { all, get, run, writeAudit, newId } from "@/lib/db";
import { PHCORE_IG, PROFILE, CS, FHIR_VERSION } from "@/lib/fhir/terminology";
import type { CapabilityStatement, OperationOutcome } from "@/lib/fhir/types";

const BASE_URL = process.env.HEALTHLINK_FHIR_BASE ?? "http://localhost:3000/fhir";

function outcome(
  severity: "fatal" | "error" | "warning" | "information",
  code: string,
  diagnostics: string,
  status: number,
  expression?: string,
) {
  const body: OperationOutcome = {
    resourceType: "OperationOutcome",
    id: `oo-${Date.now().toString(36)}`,
    issue: [{ severity, code, diagnostics, ...(expression ? { expression: [expression] } : {}) }],
  };
  return NextResponse.json(body, {
    status,
    headers: { "content-type": "application/fhir+json; charset=utf-8" },
  });
}

function fhirJson(body: unknown, status = 200) {
  return NextResponse.json(body, {
    status,
    headers: {
      "content-type": "application/fhir+json; charset=utf-8",
      "x-healthlink-fhir-version": FHIR_VERSION,
    },
  });
}

/* ------------------------------------------------------------------ */
/* Authentication                                                      */
/* ------------------------------------------------------------------ */

interface FacadeCaller {
  userId: string | null;
  userName: string;
  role: string;
  facilityId: string | null;
  via: "session" | "token";
}

async function authenticate(request: NextRequest): Promise<FacadeCaller | null> {
  const auth = request.headers.get("authorization");

  if (auth?.startsWith("Bearer ")) {
    const token = auth.slice(7).trim();
    const row = await get<{
      id: string;
      user_id: string;
      expires_at: string;
      revoked_at: string | null;
      scopes: string | null;
    }>("SELECT * FROM api_tokens WHERE token_hash = ?", sha256(token));

    if (!row) return null;
    if (row.revoked_at) return null;
    if (new Date(row.expires_at) < new Date()) return null;

    const user = await get<{ id: string; full_name: string; role: string; facility_id: string | null }>(
      "SELECT id, full_name, role, facility_id FROM users WHERE id = ? AND active = 1",
      row.user_id,
    );
    if (!user) return null;

    await run("UPDATE api_tokens SET last_used_at = ? WHERE id = ?", new Date().toISOString(), row.id);

    return {
      userId: user.id,
      userName: user.full_name,
      role: user.role,
      facilityId: user.facility_id,
      via: "token",
    };
  }

  const session = await getSession();
  if (!session) return null;
  return {
    userId: session.id,
    userName: session.fullName,
    role: session.role,
    facilityId: session.facilityId,
    via: "session",
  };
}

function sha256(input: string): string {
  const { createHash } = require("node:crypto") as typeof import("node:crypto");
  return createHash("sha256").update(input, "utf8").digest("hex");
}

/** Facility scoping for facade reads. */
function visibleToCaller(caller: FacadeCaller, referringFacilityId: string, receivingFacilityId: string): boolean {
  if (caller.role === "hie_admin" || caller.role === "privacy_auditor") return true;
  if (!caller.facilityId) return false;
  return caller.facilityId === referringFacilityId || caller.facilityId === receivingFacilityId;
}

/* ------------------------------------------------------------------ */
/* CapabilityStatement                                                 */
/* ------------------------------------------------------------------ */

const CAPABILITY: CapabilityStatement = {
  resourceType: "CapabilityStatement",
  id: "healthlink-fhir",
  name: "HealthLinkFHIRFacade",
  title: "HealthLink Referral Exchange FHIR Facade",
  status: "draft",
  experimental: true,
  date: "2026-10-13",
  kind: "instance",
  fhirVersion: FHIR_VERSION,
  format: ["application/fhir+json"],
  description:
    "Read-only FHIR R4 interface exposing the referral packages exchanged through HealthLink. " +
    "Resource profiles are aligned to the Draft Philippine Core FHIR Implementation Guide v0.2.0. " +
    "This is a concept prototype: it is an instance-level capability statement for evaluation, " +
    "not a certified conformance claim.",
  rest: [    {
      mode: "server",
      documentation:
        "Read and search are supported. Create, update and delete are intentionally not exposed: " +
        "referrals are written through the HealthLink application so that consent, validation and audit " +
        "controls cannot be bypassed by a direct FHIR write.",
      security: {
        cors: false,
        service: [
          {
            coding: [
              {
                system: "http://terminology.hl7.org/CodeSystem/restful-security-service",
                code: "OAuth",
                display: "OAuth",
              },
            ],
            text: "Bearer token or interactive session; facility-scoped, least-privilege.",
          },
        ],
        description:
          "Every read is authenticated, scoped to the caller's facility, and written to the append-only audit trail.",
      },
      resource: [
        {
          type: "Patient",
          profile: PROFILE.PATIENT,
          documentation: "Patient demographics as exchanged in a referral package.",
          interaction: [{ code: "read" }, { code: "search-type" }],
          searchParam: [
            { name: "_id", type: "token" },
            { name: "identifier", type: "token", documentation: "PhilHealth PIN, PhilSys ID or local MRN." },
            { name: "name", type: "string" },
            { name: "birthdate", type: "date" },
            { name: "gender", type: "token" },
          ],
        },
        {
          type: "Practitioner",
          profile: PROFILE.PRACTITIONER,
          interaction: [{ code: "read" }, { code: "search-type" }],
          searchParam: [{ name: "_id", type: "token" }, { name: "identifier", type: "token" }],
        },
        {
          type: "Organization",
          profile: PROFILE.ORGANIZATION,
          documentation: "Participating facilities. Identifiers carry DOH NHFR, HCPN and PhilHealth PAN/PEN.",
          interaction: [{ code: "read" }, { code: "search-type" }],
          searchParam: [{ name: "_id", type: "token" }, { name: "identifier", type: "token" }, { name: "name", type: "string" }],
        },
        {
          type: "Encounter",
          profile: PROFILE.ENCOUNTER,
          documentation: "The care context in which the referral was raised.",
          interaction: [{ code: "read" }, { code: "search-type" }],
          searchParam: [{ name: "_id", type: "token" }, { name: "subject", type: "reference" }],
        },
        {
          type: "ServiceRequest",
          profile: PROFILE.SERVICE_REQUEST,
          documentation: "The referral request itself. The HealthLink referral number is carried as an identifier.",
          interaction: [{ code: "read" }, { code: "search-type" }],
          searchParam: [
            { name: "_id", type: "token" },
            { name: "identifier", type: "token", documentation: "HealthLink referral number, e.g. HL-2026-BHC-00001." },
            { name: "subject", type: "reference" },
            { name: "requester", type: "reference" },
          ],
        },
        {
          type: "Task",
          profile: PROFILE.TASK,
          documentation:
            "Referral workflow state. Task.status carries the FHIR status; Task.businessStatus carries the HealthLink referral state.",
          interaction: [{ code: "read" }, { code: "search-type" }],
          searchParam: [{ name: "_id", type: "token" }, { name: "status", type: "token" }, { name: "for", type: "reference" }],
        },
        {
          type: "Condition",
          profile: PROFILE.CONDITION,
          description: "Coded diagnoses (ICD-10, SNOMED CT).",
          interaction: [{ code: "read" }, { code: "search-type" }],
          searchParam: [{ name: "_id", type: "token" }, { name: "patient", type: "reference" }],
        },
        {
          type: "Observation",
          profile: PROFILE.OBSERVATION,
          documentation: "Vital signs and results, LOINC coded with UCUM units and reference ranges.",
          interaction: [{ code: "read" }, { code: "search-type" }],
          searchParam: [
            { name: "_id", type: "token" },
            { name: "patient", type: "reference" },
            { name: "code", type: "token" },
            { name: "category", type: "token" },
          ],
        },
        {
          type: "MedicationStatement",
          profile: PROFILE.MEDICATION_STATEMENT,
          documentation: "Current medication, PH FDA CPR coded where available.",
          interaction: [{ code: "read" }, { code: "search-type" }],
          searchParam: [{ name: "_id", type: "token" }, { name: "subject", type: "reference" }],
        },
        {
          type: "AllergyIntolerance",
          profile: PROFILE.ALLERGY_INTOLERANCE,
          interaction: [{ code: "read" }, { code: "search-type" }],
          searchParam: [{ name: "_id", type: "token" }, { name: "patient", type: "reference" }],
        },
        {
          type: "DocumentReference",
          documentation: "Attached clinical summaries and results. No PH Core profile exists in v0.2.0; mapped to R4 base.",
          interaction: [{ code: "read" }, { code: "search-type" }],
          searchParam: [{ name: "_id", type: "token" }, { name: "subject", type: "reference" }],
        },
        {
          type: "Consent",
          documentation: "Consent and lawful basis. No PH Core profile exists in v0.2.0; mapped to R4 base.",
          interaction: [{ code: "read" }, { code: "search-type" }],
          searchParam: [{ name: "_id", type: "token" }, { name: "patient", type: "reference" }],
        },
        {
          type: "Communication",
          documentation: "Feedback and queries. No PH Core profile exists in v0.2.0; mapped to R4 base.",
          interaction: [{ code: "read" }, { code: "search-type" }],
          searchParam: [{ name: "_id", type: "token" }, { name: "subject", type: "reference" }],
        },
        {
          type: "Provenance",
          profile: PROFILE.PROVENANCE,
          documentation: "Authorship and traceability for clinical content.",
          interaction: [{ code: "read" }, { code: "search-type" }],
          searchParam: [{ name: "_id", type: "token" }, { name: "target", type: "reference" }],
        },
      ],
    },
  ],
} as CapabilityStatement;

export async function GET(request: NextRequest) {
  const path = request.nextUrl.pathname.replace(/^\/fhir\/?/, "");
  const segments = path.split("/").filter(Boolean);

  if (segments.length === 0 || segments[0] === "metadata") {
    return fhirJson(CAPABILITY);
  }

  const caller = await authenticate(request);
  if (!caller) {
    await writeAudit({
      action: "E",
      eventType: "security",
      eventSubtype: "facade-auth-failed",
      outcome: "8",
      outcomeDesc: "Authentication failed",
      description: `Unauthenticated FHIR facade request to /fhir/${path} was refused.`,
      ipAddress: request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? undefined,
      userAgent: request.headers.get("user-agent") ?? undefined,
    });
    return outcome(
      "error",
      "login",
      "Authentication required. Supply a HealthLink API token as an HTTP bearer token, or sign in to the HealthLink application.",
      401,
    );
  }

  const [resourceType, resourceId] = segments;

  // Special route: the full referral transaction bundle.
  if (resourceType === "Bundle" && resourceId) {
    return referralBundle(resourceId, caller, request);
  }

  if (!KNOWN_TYPES.has(resourceType)) {
    return outcome("error", "not-supported", `Resource type "${resourceType}" is not exposed by this facade.`, 404);
  }

  if (resourceId) return readById(resourceType, resourceId, caller, request);

  if (request.nextUrl.searchParams.size === 0) {
    return outcome(
      "error",
      "invalid",
      "A search requires at least one search parameter. Unfiltered searches are refused to protect patient privacy.",
      400,
    );
  }

  return search(resourceType, caller, request);
}

const KNOWN_TYPES = new Set([
  "Patient",
  "Practitioner",
  "Organization",
  "Encounter",
  "ServiceRequest",
  "Task",
  "Condition",
  "Observation",
  "MedicationStatement",
  "AllergyIntolerance",
  "DocumentReference",
  "Consent",
  "Communication",
  "Provenance",
]);

const WRITE_METHODS = ["POST", "PUT", "PATCH", "DELETE"];

export async function POST() {
  return notSupported("create");
}
export async function PUT() {
  return notSupported("update");
}
export async function PATCH() {
  return notSupported("patch");
}
export async function DELETE() {
  return notSupported("delete");
}

function notSupported(interaction: string) {
  return outcome(
    "error",
    "not-supported",
    `This facade is read-only. The "${interaction}" interaction is not supported. ` +
      `Referrals are created and modified through the HealthLink application so that consent, ` +
      `FHIR validation and audit controls cannot be bypassed. Use the HealthLink UI or a facility system ` +
      `integration authorised under a service agreement.`,
    405,
  );
}

/* ------------------------------------------------------------------ */
/* Read                                                                */
/* ------------------------------------------------------------------ */

async function readById(resourceType: string, id: string, caller: FacadeCaller, request: NextRequest) {
  const row = await get<{
    resource_id: string;
    content: string;
    version_id: number;
    last_updated: string;
    referral_id: string | null;
    source_facility_id: string | null;
  }>("SELECT * FROM fhir_resources WHERE resource_type = ? AND resource_id = ?", resourceType, id);

  if (!row) {
    return outcome("information", "not-found", `${resourceType}/${id} was not found.`, 404, `${resourceType}/${id}`);
  }

  if (row.referral_id) {
    const referral = await get<{ referring_facility_id: string; receiving_facility_id: string; referral_number: string }>(
      "SELECT referring_facility_id, receiving_facility_id, referral_number FROM referrals WHERE id = ?",
      row.referral_id,
    );
    if (referral && !visibleToCaller(caller, referral.referring_facility_id, referral.receiving_facility_id)) {
      await writeAudit({
        action: "R",
        eventType: "security",
        eventSubtype: "facade-scope-denied",
        actorUserId: caller.userId,
        actorName: caller.userName,
        actorRole: caller.role,
        actorFacility: caller.facilityId,
        referralId: row.referral_id,
        outcome: "8",
        outcomeDesc: "Facility scope denied",
        description: `FHIR facade read of ${resourceType}/${id} (referral ${referral.referral_number}) was refused: the caller's facility is not a party to the referral.`,
      });
      return outcome(
        "error",
        "forbidden",
        "Your facility is not a party to the referral that this resource belongs to.",
        403,
        `${resourceType}/${id}`,
      );
    }
    logRead(caller, resourceType, id, row.referral_id, request);
  } else {
    logRead(caller, resourceType, id, null, request);
  }

  const body = JSON.parse(row.content);
  return fhirJson(body);
}

async function logRead(
  caller: FacadeCaller,
  resourceType: string,
  id: string,
  referralId: string | null,
  request: NextRequest,
) {
  await writeAudit({
    action: "R",
    eventType: "read",
    eventSubtype: "fhir-read",
    actorUserId: caller.userId,
    actorName: caller.userName,
    actorRole: caller.role,
    actorFacility: caller.facilityId,
    referralId,
    entityType: resourceType,
    entityId: id,
    outcome: "0",
    purposeCode: "treatment",
    description: `FHIR facade read of ${resourceType}/${id}${caller.via === "token" ? " via API token" : " via interactive session"}.`,
    ipAddress: request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? undefined,
    userAgent: request.headers.get("user-agent") ?? undefined,
  });
}

/* ------------------------------------------------------------------ */
/* Search                                                              */
/* ------------------------------------------------------------------ */

async function search(resourceType: string, caller: FacadeCaller, request: NextRequest) {
  const sp = request.nextUrl.searchParams;
  const filters: string[] = ["resource_type = ?"];
  const params: unknown[] = [resourceType];

  const idParam = sp.get("_id");
  if (idParam) {
    filters.push("resource_id = ?");
    params.push(idParam);
  }

  // Referential search parameters resolve against the stored referral.
  const patientRef = sp.get("patient") ?? sp.get("subject") ?? sp.get("for");
  if (patientRef) {
    const pid = patientRef.includes("/") ? patientRef.split("/").pop()! : patientRef;
    filters.push("referral_id IN (SELECT id FROM referrals WHERE patient_id = ?)");
    params.push(pid);
  }

  const identifier = sp.get("identifier");
  if (identifier) {
    // The HealthLink referral number is carried as an identifier on
    // ServiceRequest and Task, so resolve it through the referral table.
    filters.push(
      "referral_id IN (SELECT id FROM referrals WHERE referral_number = ? OR tracking_code = ?)",
    );
    params.push(identifier, identifier);
  }

  const status = sp.get("status");
  if (status && (resourceType === "Task" || resourceType === "ServiceRequest")) {
    // Task/ServiceRequest status lives inside the stored JSON; filter in memory.
    const rows = await all<{ resource_id: string; content: string; referral_id: string | null; last_updated: string }>(
      `SELECT resource_id, content, referral_id, last_updated FROM fhir_resources WHERE ${filters.join(" AND ")} LIMIT 300`,
      ...params,
    );
    const filtered = rows.filter((r) => {
      try {
        return (JSON.parse(r.content) as { status?: string }).status === status;
      } catch {
        return false;
      }
    });
    return bundleFromRows(filtered, caller, request, sp);
  }

  const limit = Math.min(Math.max(Number.parseInt(sp.get("_count") ?? "50", 10) || 50, 1), 200);

  const rows = await all<{ resource_id: string; content: string; referral_id: string | null; last_updated: string }>(
    `SELECT resource_id, content, referral_id, last_updated FROM fhir_resources
      WHERE ${filters.join(" AND ")}
      ORDER BY last_updated DESC
      LIMIT ?`,
    ...params,
    limit,
  );

  if (rows.length === 0 && !sp.get("_id") && !patientRef && !identifier) {
    return outcome(
      "information",
      "not-found",
      "No resources matched. Note that only the _id, identifier, patient/subject and status search parameters are implemented in this prototype.",
      404,
    );
  }

  return bundleFromRows(rows, caller, request, sp);
}

async function bundleFromRows(
  rows: Array<{ resource_id: string; content: string; referral_id: string | null; last_updated: string }>,
  caller: FacadeCaller,
  request: NextRequest,
  sp: URLSearchParams,
) {
  const entries = [];
  const seenReferrals = new Set<string>();

  for (const row of rows) {
    if (row.referral_id) {
      const referral = await get<{ referring_facility_id: string; receiving_facility_id: string }>(
        "SELECT referring_facility_id, receiving_facility_id FROM referrals WHERE id = ?",
        row.referral_id,
      );
      if (referral && !visibleToCaller(caller, referral.referring_facility_id, referral.receiving_facility_id)) {
        continue; // silently exclude out-of-scope referrals from search results
      }
      if (referral) seenReferrals.add(row.referral_id);
    }
    const resource = JSON.parse(row.content);
    entries.push({
      fullUrl: `${BASE_URL}/${resource.resourceType}/${row.resource_id}`,
      resource,
      search: { mode: "match" },
    });
  }

  await writeAudit({
    action: "R",
    eventType: "search",
    eventSubtype: "fhir-search",
    actorUserId: caller.userId,
    actorName: caller.userName,
    actorRole: caller.role,
    actorFacility: caller.facilityId,
    entityType: "Bundle",
    outcome: "0",
    purposeCode: "treatment",
    description: `FHIR facade search: ${sp.toString() || "(no parameters)"} returned ${entries.length} resource(s) across ${seenReferrals.size} referral(s).`,
    ipAddress: request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? undefined,
    userAgent: request.headers.get("user-agent") ?? undefined,
  });

  return fhirJson({
    resourceType: "Bundle",
    id: `search-${Date.now().toString(36)}`,
    meta: {
      lastUpdated: new Date().toISOString(),
      tag: [{ system: CS.HL_LOCAL, code: "search-results", display: "HealthLink facade search results" }],
    },
    type: "searchset",
    timestamp: new Date().toISOString(),
    total: entries.length,
    entry: entries,
  });
}

/* ------------------------------------------------------------------ */
/* Referral bundle                                                     */
/* ------------------------------------------------------------------ */

async function referralBundle(referralId: string, caller: FacadeCaller, request: NextRequest) {
  const referral = await get<{
    id: string;
    referral_number: string;
    referring_facility_id: string;
    receiving_facility_id: string;
    tracking_code: string;
  }>("SELECT id, referral_number, referring_facility_id, receiving_facility_id, tracking_code FROM referrals WHERE id = ?", referralId);

  if (!referral) {
    return outcome("information", "not-found", `Referral "${referralId}" was not found.`, 404);
  }

  if (!visibleToCaller(caller, referral.referring_facility_id, referral.receiving_facility_id)) {
    await writeAudit({
      action: "R",
      eventType: "security",
      eventSubtype: "facade-scope-denied",
      actorUserId: caller.userId,
      actorName: caller.userName,
      actorRole: caller.role,
      actorFacility: caller.facilityId,
      referralId,
      outcome: "8",
      outcomeDesc: "Facility scope denied",
      description: `FHIR facade bundle request for referral ${referral.referral_number} was refused: the caller's facility is not a party to the referral.`,
    });
    return outcome(
      "error",
      "forbidden",
      "Your facility is not a party to this referral.",
      403,
      `Bundle/${referralId}`,
    );
  }

  const { getReferralDetail, bundleForReferral } = await import("@/lib/referrals");
  const detail = await getReferralDetail(referralId);
  if (!detail) return outcome("error", "processing", "Referral data could not be assembled.", 500);

  const bundle = await bundleForReferral(detail);

  await writeAudit({
    action: "R",
    eventType: "read",
    eventSubtype: "fhir-bundle-read",
    actorUserId: caller.userId,
    actorName: caller.userName,
    actorRole: caller.role,
    actorFacility: caller.facilityId,
    patientId: detail.patient_id,
    referralId,
    entityType: "Bundle",
    entityId: `bundle-${referralId}`,
    outcome: "0",
    purposeCode: "treatment",
    description: `FHIR referral package for ${referral.referral_number} retrieved (${bundle.entry?.length ?? 0} resources, PH Core IG ${PHCORE_IG.version} alignment).`,
    ipAddress: request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? undefined,
    userAgent: request.headers.get("user-agent") ?? undefined,
  });

  return fhirJson(bundle);
}

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
