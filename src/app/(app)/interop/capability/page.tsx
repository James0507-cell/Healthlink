import type { Metadata } from "next";
import { redirect } from "next/navigation";
import {
  getSession,
  PERMISSIONS,
  hasPermission,
  CROSS_FACILITY_ROLES,
  ROLE_LABELS,
  requirePageAccess,
} from "@/lib/auth";
import { CapabilityView } from "@/components/interop/capability-view";
import { Card, PageHeader, Alert, MetricCell, MetricRow } from "@/components/ui";
import { PHCORE_IG } from "@/lib/fhir/terminology";
import { IconLock, IconShield, IconServer } from "@/components/icons";

export const metadata: Metadata = { title: "Capability statement" };
export const dynamic = "force-dynamic";

export default async function CapabilityPage() {
  const session = await requirePageAccess(PERMISSIONS.FHIR_READ);

  // Fetch our own capability statement through the real endpoint, so what is
  // displayed is exactly what a client receives rather than a copy.
  const base = process.env.HEALTHLINK_FHIR_BASE ?? "http://localhost:3000/fhir";
  let capability: unknown = null;
  let fetchError: string | null = null;
  try {
    const res = await fetch(`${base}/metadata`, { cache: "no-store" });
    if (res.ok) capability = await res.json();
    else fetchError = `The facade returned HTTP ${res.status}.`;
  } catch (e) {
    fetchError = `Could not reach the facade at ${base}: ${(e as Error).message}`;
  }

  const cs = capability as { rest?: Array<{ resource?: Array<{ type: string; profile?: string }> }> } | null;
  const resources = cs?.rest?.flatMap((r) => r.resource ?? []) ?? [];
  const profiled = resources.filter((r) => r.profile).length;

  return (
    <>
      <PageHeader
        title="FHIR facade capability statement"
        subtitle={
          <>
            What HealthLink exposes to a facility system at <span className="mono-id">{base}</span>
          </>
        }
        actions={
          <a href={`${base}/metadata`} className="btn-secondary btn-sm" target="_blank" rel="noreferrer">
            Raw metadata
          </a>
        }
      />

      <MetricRow>
        <MetricCell label="Protocol" value="FHIR R4" hint="4.0.1, application/fhir+json" />
        <MetricCell label="Interactions" value="read, search" hint="Write deliberately not exposed" />
        <MetricCell label="Resource types" value={resources.length} hint={`${profiled} validated against a PH Core profile`} />
        <MetricCell label="Authentication" value="Bearer" hint="Token or interactive session" />
      </MetricRow>

      <Alert tone="info" className="mt-5" title="Prototype capability statement">
        <p>
          This is an <span className="font-medium">instance-level</span> CapabilityStatement for a concept prototype. It
          is not a conformance certification and no claim of certified interoperability is made.
        </p>
        <p className="mt-1.5">
          Resource profiles reference {PHCORE_IG.name} v{PHCORE_IG.version}, which is itself a draft. HealthLink is
          therefore interoperable <span className="font-medium">by design and by validated mapping</span>, not by
          certification.
        </p>
      </Alert>

      <div className="mt-5">
        {fetchError ? (
          <Alert tone="warn" title="Capability statement unavailable">
            {fetchError} Start the application and reload this page.
          </Alert>
        ) : (
          <CapabilityView capability={capability} fhirBase={base} />
        )}
      </div>

      {/* ---------------- Read-only rationale ---------------- */}
      <Card
        title={
          <span className="flex items-center gap-1.5">
            <IconServer className="h-3.5 w-3.5 text-ink-400" />
            <span className="card-title">Why the facade is read-only</span>
          </span>
        }
        description="HealthLink does not accept POST, PUT or DELETE on its FHIR endpoint."
        className="mt-5"
        divided
      >
        <p className="mb-4 text-[13px] leading-relaxed text-ink-700">
          A referral is written through the HealthLink application so that three controls cannot be bypassed:
        </p>
        <div className="grid gap-4 lg:grid-cols-3">
          {[
            {
              title: "Consent and lawful basis",
              text:
                "A direct FHIR write could create a record with no documented basis for processing under RA 10173.",
            },
            {
              title: "Validation before exchange",
              text:
                "Routing is blocked while the package fails validation. A raw FHIR write would skip that gate entirely.",
            },
            {
              title: "Attribution and audit",
              text:
                "Every change is attributed to an authenticated identity and facility, and appended to the audit trail.",
            },
          ].map((c) => (
            <div key={c.title} className="rounded-xl border border-ink-200 bg-ink-50/60 px-3.5 py-3">
              <p className="text-[12.5px] font-medium text-ink-900">{c.title}</p>
              <p className="mt-1 text-[11.5px] leading-relaxed text-ink-600">{c.text}</p>
            </div>
          ))}
        </div>
        <p className="mt-4 border-t border-ink-200/80 pt-3 text-[11px] leading-relaxed text-ink-400">
          A client that attempts a write receives HTTP 405 with an OperationOutcome explaining this, rather than a
          generic error. The intent is that a facility integrating with HealthLink understands the constraint from the
          API itself.
        </p>
      </Card>

      {/* ---------------- Access model ---------------- */}
      <Card
        title={
          <span className="flex items-center gap-1.5">
            <IconShield className="h-3.5 w-3.5 text-ink-400" />
            <span className="card-title">Who can read what</span>
          </span>
        }
        description="Facility scoping applies identically to the facade and the application."
        className="mt-5"
        divided
        bodyClassName="p-0"
      >
        <div className="overflow-x-auto">
          <table className="table">
            <thead>
              <tr>
                <th className="table-head">Role</th>
                <th className="table-head">Referrals</th>
                <th className="table-head">Attachments</th>
                <th className="table-head">Audit trail</th>
                <th className="table-head">FHIR facade</th>
              </tr>
            </thead>
            <tbody>
              {[
                ["Physician, Specialist, Nurse", "Own facility", "Own facility", "No", "Own facility"],
                ["Referral coordinator", "Own facility", "Own facility", "No", "Own facility"],
                ["Medical records officer", "Own facility", "Own facility", "No", "Own facility"],
                ["Facility administrator", "Own facility", "Own facility", "Own facility", "Own facility"],
                [ROLE_LABELS.hie_admin, "All facilities", "All facilities", "Yes", "All facilities"],
                [ROLE_LABELS.privacy_auditor, "All facilities, read-only", "No", "Yes", "All facilities"],
              ].map(([role, ref, att, aud, fhir]) => (
                <tr key={role} className="transition-colors hover:bg-ink-50/60">
                  <td className="table-cell text-[12.5px] font-medium text-ink-900">{role}</td>
                  <td className="table-cell text-[11.5px] text-ink-700">{ref}</td>
                  <td className="table-cell text-[11.5px] text-ink-700">{att}</td>
                  <td className="table-cell text-[11.5px] text-ink-700">{aud}</td>
                  <td className="table-cell text-[11.5px] text-ink-700">{fhir}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="flex items-start gap-2 border-t border-ink-200/80 px-4 py-3">
          <IconLock className="mt-0.5 h-3.5 w-3.5 shrink-0 text-ink-400" />
          <p className="text-[10.5px] leading-relaxed text-ink-500">
            The auditor role is deliberately read-only and cannot retrieve attachment content, so oversight never
            becomes a route to clinical data. Cross-facility roles are{" "}
            {CROSS_FACILITY_ROLES.map((r) => ROLE_LABELS[r]).join(" and ")}.
          </p>
        </div>
      </Card>
    </>
  );
}
