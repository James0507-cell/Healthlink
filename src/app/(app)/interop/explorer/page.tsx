import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import {
  getSession,
  PERMISSIONS,
  hasPermission,
  requirePageAccess,
} from "@/lib/auth";
import { all } from "@/lib/db";
import { storeSummary } from "@/lib/fhir-store";
import { Card, PageHeader, Alert, MetricCell, MetricRow } from "@/components/ui";
import { ResourceBrowser } from "@/components/interop/resource-browser";
import { PHCORE_IG } from "@/lib/fhir/terminology";
import { IconSearch, IconCode } from "@/components/icons";

export const metadata: Metadata = { title: "FHIR resources" };
export const dynamic = "force-dynamic";

/**
 * Browses the FHIR resource store: what HealthLink actually holds, in the
 * standardised representation that facility systems read.
 *
 * This is what makes "interoperability" inspectable rather than aspirational — a
 * reviewer can open any resource and confirm that the referral data really is
 * represented as FHIR, not merely described as FHIR.
 */
export default async function ExplorerPage({
  searchParams,
}: {
  searchParams: Promise<{ type?: string; id?: string }>;
}) {
  const session = await requirePageAccess(PERMISSIONS.FHIR_READ);

  const sp = await searchParams;
  const summary = await storeSummary();
  const totalResources = summary.reduce((a, b) => a + b.count, 0);

  const crossFacility = session.role === "hie_admin" || session.role === "privacy_auditor";
  const scopeSql = crossFacility
    ? "1 = 1"
    : session.facilityId
      ? "(r.referring_facility_id = ? OR r.receiving_facility_id = ?)"
      : "1 = 0";
  const scopeParams: unknown[] = crossFacility || !session.facilityId ? [] : [session.facilityId, session.facilityId];

  const visibleCount =
    (await all<{ n: number }>(
      `SELECT COUNT(*) AS n FROM fhir_resources f
         LEFT JOIN referrals r ON r.id = f.referral_id
        WHERE (${scopeSql}) OR f.referral_id IS NULL`,
      ...scopeParams,
    ))[0]?.n ?? 0;

  // Visible count per resource type. The per-type count needs its own query, so
  // the mapping is awaited as a group: `map(async ...)` alone would yield an
  // array of Promises, and the subsequent filter would receive Promises rather
  // than the resolved objects.
  const typesWithCounts = await Promise.all(
    summary.map(async (s) => {
      const visible =
        (
          await all<{ n: number }>(
            `SELECT COUNT(*) AS n FROM fhir_resources f
               LEFT JOIN referrals r ON r.id = f.referral_id
              WHERE f.resource_type = ? AND ((${scopeSql}) OR f.referral_id IS NULL)`,
            s.resourceType,
            ...scopeParams,
          )
        )[0]?.n ?? 0;
      return { ...s, visible };
    }),
  );

  const types = typesWithCounts.filter((s) => s.visible > 0);

  const activeType = sp.type;

  const resources = activeType
    ? await all<{
        resource_id: string;
        resource_type: string;
        version_id: number;
        last_updated: string;
        referral_id: string | null;
        referral_number: string | null;
        content: string;
      }>(
        `SELECT f.resource_id, f.resource_type, f.version_id, f.last_updated, f.referral_id,
                f.content, r.referral_number
           FROM fhir_resources f
           LEFT JOIN referrals r ON r.id = f.referral_id
          WHERE f.resource_type = ? AND ((${scopeSql}) OR f.referral_id IS NULL)
          ORDER BY f.last_updated DESC
          LIMIT 200`,
        activeType,
        ...scopeParams,
      )
    : [];

  const selected = sp.id && activeType ? resources.find((r) => r.resource_id === sp.id) : undefined;

  let selectedJson = "";
  if (selected) {
    try {
      selectedJson = JSON.stringify(JSON.parse(selected.content), null, 2);
    } catch {
      selectedJson = selected.content;
    }
  }

  const profiled = types.filter((t) => t.resourceType !== "DocumentReference" && t.resourceType !== "Consent" && t.resourceType !== "Communication" && t.resourceType !== "AuditEvent").length;

  return (
    <>
      <PageHeader
        title="FHIR resources"
        subtitle={
          <>
            The standardised representation HealthLink exchanges, as a receiving facility&rsquo;s system would read it
            {crossFacility ? " — across all facilities" : " — within your facility's scope"}
          </>
        }
        actions={
          <a href="/fhir/metadata" className="btn-secondary btn-sm" target="_blank" rel="noreferrer">
            <IconCode className="h-3.5 w-3.5" />
            CapabilityStatement
          </a>
        }
      />

      <MetricRow>
        <MetricCell label="Resources in scope" value={visibleCount} hint={`${totalResources} across the network`} />
        <MetricCell label="Resource types" value={types.length} hint="Present in the store" />
        <MetricCell label="Profiled resources" value={`${profiled}/${types.filter((t) => t.resourceType !== "AuditEvent").length}`} hint="Validated against a PH Core profile" />
        <MetricCell label="Alignment target" value={PHCORE_IG.version} hint={PHCORE_IG.package} />
      </MetricRow>

      <div className="mt-5 grid gap-5 lg:grid-cols-[15rem_1fr]">
        {/* ---------------- Type list ---------------- */}
        <Card title="Resource types" bodyClassName="p-0" className="self-start">
          <ul className="divide-y divide-ink-100">
            {types.map((t) => {
              const isActive = t.resourceType === activeType;
              return (
                <li key={t.resourceType}>
                  <Link
                    href={`/interop/explorer?type=${encodeURIComponent(t.resourceType)}`}
                    className={`flex items-center justify-between gap-2 px-3.5 py-2.5 transition-colors ${
                      isActive ? "bg-ink-100" : "hover:bg-ink-50"
                    }`}
                    aria-current={isActive ? "true" : undefined}
                  >
                    <span className={`text-[12.5px] ${isActive ? "font-medium text-ink-900" : "text-ink-700"}`}>
                      {t.resourceType}
                    </span>
                    <span
                      className={`shrink-0 rounded-full px-1.5 py-0.5 text-[10.5px] font-semibold tabular-nums ${
                        isActive ? "bg-ink-900 text-white" : "bg-ink-200/70 text-ink-600"
                      }`}
                    >
                      {t.visible}
                    </span>
                  </Link>
                </li>
              );
            })}
            {types.length === 0 && (
              <li className="px-3.5 py-4 text-[12.5px] text-ink-500">
                No resources in scope. Create and route a referral to populate the store.
              </li>
            )}
          </ul>
        </Card>

        {/* ---------------- Resource viewer ---------------- */}
        <div className="min-w-0">
          {!activeType ? (
            <Card
              title="Select a resource type"
              description="Choose a type on the left to see the individual resources HealthLink holds."
              divided
            >
              <p className="text-[13px] leading-relaxed text-ink-600">
                Open any resource to inspect its full FHIR JSON, including the profiles it declares and the identifiers
                it carries.
              </p>
              <Alert tone="info" className="mt-4">
                <p>
                  These resources are written to the store only after validation passes against FHIR R4 and the draft
                  Philippine Core profiles. Nothing is stored that did not validate.
                </p>
                <p className="mt-1.5">
                  Each resource records the profile it was validated against, where one exists in{" "}
                  <span className="font-mono text-[11.5px]">
                    {PHCORE_IG.package}#{PHCORE_IG.version}
                  </span>
                  .
                </p>
              </Alert>
              <div className="mt-4 flex items-center gap-2 text-[11.5px] text-ink-400">
                <IconSearch className="h-3.5 w-3.5" />
                Resources are also readable through the FHIR facade at{" "}
                <span className="font-mono">/fhir/&#123;type&#125;/&#123;id&#125;</span> by any authorised client.
              </div>
            </Card>
          ) : (
            <ResourceBrowser
              resourceType={activeType}
              resources={resources.map((r) => ({
                id: r.resource_id,
                versionId: r.version_id,
                lastUpdated: r.last_updated,
                referralNumber: r.referral_number,
                summary: summarise(r.content),
                profile: extractProfile(r.content),
              }))}
              selectedId={selected?.resource_id}
              selectedJson={selectedJson}
            />
          )}
        </div>
      </div>
    </>
  );
}

/** A one-line human summary of a resource, so the list is scannable. */
function summarise(content: string): string {
  try {
    const r = JSON.parse(content) as Record<string, unknown>;
    const rt = r.resourceType as string;
    const cc = (v: unknown): string => {
      if (!v) return "";
      const o = v as { text?: string; coding?: Array<{ display?: string; code?: string }> };
      return o.text ?? o.coding?.[0]?.display ?? o.coding?.[0]?.code ?? "";
    };
    const name = (v: unknown): string => {
      const n = Array.isArray(v) ? v[0] : v;
      const o = n as { text?: string; family?: string; given?: string[] } | undefined;
      if (!o) return "";
      return o.text ?? [o.given?.join(" "), o.family].filter(Boolean).join(" ");
    };

    switch (rt) {
      case "Patient":
        return `${name(r.name)} · ${r.gender ?? "?"} · born ${r.birthDate ?? "?"}`;
      case "Practitioner":
        return name(r.name);
      case "Organization":
        return String(r.name ?? "");
      case "Encounter":
        return `${cc(r.type)} · ${(r.class as { code?: string } | undefined)?.code ?? "?"} · ${r.status}`;
      case "ServiceRequest":
        return `${cc(r.code)} · ${r.priority ?? "routine"} · ${r.status}`;
      case "Task":
        return `${r.status} · ${cc(r.businessStatus)}`;
      case "Condition":
        return cc(r.code);
      case "Observation": {
        const q = r.valueQuantity as { value?: number; unit?: string } | undefined;
        const value = q?.value ?? r.valueString ?? cc(r.valueCodeableConcept) ?? "—";
        return `${cc(r.code)} · ${value}${q?.unit ? ` ${q.unit}` : ""}`;
      }
      case "MedicationStatement":
        return `${cc(r.medicationCodeableConcept)} · ${r.status}`;
      case "AllergyIntolerance":
        return `${cc(r.code)} · ${r.criticality ?? "criticality unknown"}`;
      case "DocumentReference":
        return String(r.description ?? cc(r.type));
      case "Consent":
        return `${cc(r.scope)} · ${r.status}`;
      case "Communication": {
        const text = (r.payload as Array<{ contentString?: string }> | undefined)?.[0]?.contentString ?? "";
        return text.length > 70 ? `${text.slice(0, 70)}…` : text;
      }
      case "Provenance":
        return `${cc(r.activity)} · ${(r.target as unknown[] | undefined)?.length ?? 0} target(s)`;
      default:
        return "";
    }
  } catch {
    return "";
  }
}

function extractProfile(content: string): string | undefined {
  try {
    const r = JSON.parse(content) as { meta?: { profile?: string[] } };
    return r.meta?.profile?.[0];
  } catch {
    return undefined;
  }
}
