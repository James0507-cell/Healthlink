/**
 * Interoperability server actions: on-demand FHIR validation of arbitrary JSON.
 *
 * This exists so the RQ2 evaluation can be performed interactively: a reviewer
 * can paste a resource and see exactly which rule it violates, rather than
 * taking the prototype's word that validation happens.
 */

"use server";

import { guard, PERMISSIONS, requestMeta } from "@/lib/auth";
import { validateResource } from "@/lib/fhir/validator";
import { writeAudit } from "@/lib/db";
import type { Resource } from "@/lib/fhir/types";

export interface ValidateJsonState {
  error?: string;
  result?: {
    valid: boolean;
    profilesApplied: string[];
    issues: Array<{ severity: string; code: string; expression?: string; diagnostics?: string }>;
    outcomeJson: string;
  };
}

export async function validateJsonAction(
  _prev: ValidateJsonState,
  formData: FormData,
): Promise<ValidateJsonState> {
  let session;
  try {
    session = await guard(PERMISSIONS.FHIR_VALIDATE);
  } catch {
    return { error: "Your role cannot run validation." };
  }

  const raw = String(formData.get("json") ?? "").trim();
  if (!raw) return { error: "Enter a FHIR resource as JSON." };
  if (raw.length > 500_000) return { error: "The resource is too large for the interactive validator (500 KB limit)." };

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (e) {
    return { error: `That is not valid JSON: ${(e as Error).message}` };
  }

  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    return { error: "A FHIR resource must be a JSON object." };
  }

  const resource = parsed as Resource;
  if (!resource.resourceType) {
    return { error: "The object has no resourceType, so it is not a FHIR resource." };
  }

  const result = validateResource(resource, { phCore: true });
  const meta = await requestMeta();

  writeAudit({
    action: "E",
    eventType: "validate",
    eventSubtype: `${resource.resourceType} (interactive)`,
    actorUserId: session.id,
    actorName: session.fullName,
    actorRole: session.role,
    actorFacility: session.facilityId,
    entityType: resource.resourceType,
    entityId: resource.id ?? "(no id)",
    outcome: result.valid ? "0" : "4",
    outcomeDesc: result.valid ? "Validation passed" : "Validation errors present",
    purposeCode: "treatment",
    description: `Interactive validation of a ${resource.resourceType}${resource.id ? `/${resource.id}` : ""} against FHIR R4 and PH Core: ${result.errorCount} error(s), ${result.warningCount} warning(s).`,
    ipAddress: meta.ip,
    userAgent: meta.userAgent,
  });

  return {
    result: {
      valid: result.valid,
      profilesApplied: result.profilesApplied,
      issues: result.outcome.issue.map((i) => ({
        severity: i.severity,
        code: i.code,
        expression: i.expression?.[0],
        diagnostics: i.diagnostics,
      })),
      outcomeJson: JSON.stringify(result.outcome, null, 2),
    },
  };
}
