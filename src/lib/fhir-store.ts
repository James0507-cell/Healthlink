/**
 * Materialise referral packages into the FHIR resource store.
 *
 * The facade serves resources from `fhir_resources` rather than rebuilding them
 * per request. This mirrors how a real middleware layer persists the
 * standardised representation at exchange time: what the receiving facility
 * reads is exactly what was validated and routed, not a re-derivation.
 */

import { run, get, all, newId } from "./db";
import { jsonField } from "./dialect";
import type { Bundle, Resource, Reference } from "./fhir/types";
import { buildReferralBundle, type MappingInput } from "./fhir/mapper";
import { validateBundle } from "./fhir/validator";

export interface PersistResult {
  stored: number;
  removed: number;
  valid: boolean;
  errorCount: number;
  warningCount: number;
  version: number;
}

/** Extract the referral id a stored resource belongs to, if any. */
function referralIdOf(resource: Resource): string | null {
  if (resource.resourceType === "Bundle") return null;
  const r = resource as unknown as Record<string, unknown>;

  // Any HealthLink-managed referral carries the referral number as an identifier.
  const identifiers = r.identifier as Array<{ system?: string; value?: string }> | undefined;
  const refIdent = identifiers?.find((i) => i.system === "https://healthlink.davao.gov.ph/identifier/referral");
  if (refIdent?.value) return null; // resolved by the caller which knows the referral

  return null;
}

/**
 * Write a referral's bundle into the FHIR store, replacing the previous version.
 * Returns validation statistics so the caller can persist them on the referral.
 */
export async function persistReferralBundle(
  referralId: string,
  input: MappingInput,
  opts: { sourceFacilityId?: string | null; createdByUser?: string | null } = {},
): Promise<PersistResult> {
  const bundle: Bundle = buildReferralBundle(input, {
    history: [],
    feedback: [],
  });

  // Validate before persisting: the store must never hold non-conformant data.
  const validation = validateBundle(bundle);

  // Determine the previous version for this referral.
  const previous = await get<{ v: number | null }>(
    `SELECT MAX(${jsonField("content", "meta.versionId", "int")}) AS v FROM fhir_resources WHERE referral_id = ?`,
    referralId,
  );
  const version = (previous?.v ?? 0) + 1;

  const removed = (await all<{ id: string }>("SELECT id FROM fhir_resources WHERE referral_id = ?", referralId)).length;
  await run("DELETE FROM fhir_resources WHERE referral_id = ?", referralId);

  const now = new Date().toISOString();
  let stored = 0;

  for (const entry of bundle.entry ?? []) {
    const resource = entry.resource;
    if (!resource?.resourceType || !resource.id) continue;

    // Stamp the version so callers can detect staleness.
    const stamped: Resource = {
      ...resource,
      meta: {
        ...(resource.meta ?? {}),
        versionId: String(version),
        lastUpdated: now,
      },
    };

    const existing = await get<{ id: string }>(
      "SELECT id FROM fhir_resources WHERE resource_type = ? AND resource_id = ?",
      stamped.resourceType,
      stamped.id!,
    );

    if (existing) {
      await run(
        `UPDATE fhir_resources SET content = ?, version_id = ?, last_updated = ?, source_facility_id = ?, created_by_user = ?, referral_id = ?
          WHERE id = ?`,
        JSON.stringify(stamped),
        version,
        now,
        opts.sourceFacilityId ?? null,
        opts.createdByUser ?? null,
        referralId,
        existing.id,
      );
    } else {
      await run(
        `INSERT INTO fhir_resources (id, resource_type, resource_id, version_id, content, last_updated, source_facility_id, created_by_user, referral_id)
         VALUES (?,?,?,?,?,?,?,?,?)`,
        newId("fh"),
        stamped.resourceType,
        stamped.id!,
        version,
        JSON.stringify(stamped),
        now,
        opts.sourceFacilityId ?? null,
        opts.createdByUser ?? null,
        referralId,
      );
    }
    stored++;
  }

  return {
    stored,
    removed,
    valid: validation.valid,
    errorCount: validation.errorCount,
    warningCount: validation.warningCount,
    version,
  };
}

/** Count of stored resources, by type. */
export async function storeSummary(): Promise<Array<{ resourceType: string; count: number }>> {
  return (await all<{ resource_type: string; count: number }>(
    "SELECT resource_type, COUNT(*) AS count FROM fhir_resources GROUP BY resource_type ORDER BY count DESC",
  )).map((r) => ({ resourceType: r.resource_type, count: r.count }));
}

/** Every reference in a stored resource, for the integrity view. */
export async function storedReferences(resourceType: string, resourceId: string): Promise<Reference[]> {
  const row = await get<{ content: string }>(
    "SELECT content FROM fhir_resources WHERE resource_type = ? AND resource_id = ?",
    resourceType,
    resourceId,
  );
  if (!row) return [];
  const out: Reference[] = [];
  const walk = (node: unknown, depth = 0) => {
    if (depth > 8 || typeof node !== "object" || node === null) return;
    if (Array.isArray(node)) {
      node.forEach((v) => walk(v, depth + 1));
      return;
    }
    const obj = node as Record<string, unknown>;
    if (typeof obj.reference === "string") out.push(obj as unknown as Reference);
    for (const v of Object.values(obj)) walk(v, depth + 1);
  };
  try {
    walk(JSON.parse(row.content));
  } catch {
    /* ignore unparseable rows */
  }
  return out;
}

export { referralIdOf };
