import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import {
  getSession,
  PERMISSIONS,
  hasPermission,
  requirePageAccess,
} from "@/lib/auth";
import { PH_CORE_PROFILES, phCoreAlignment, PHCORE_IG } from "@/lib/fhir";
import { REFERRAL_PACKAGE_RESOURCES } from "@/lib/fhir/mapper";
import { Card, PageHeader, Alert, MetricCell, MetricRow, Bar } from "@/components/ui";
import { IconCheck, IconAlert, IconExternal, IconLink } from "@/components/icons";

export const metadata: Metadata = { title: "PH Core alignment" };
export const dynamic = "force-dynamic";

/**
 * Alignment report: which parts of HealthLink's referral exchange are covered by
 * the draft Philippine Core Implementation Guide, and which are not.
 *
 * The gap table is the point of this page. Chapter 2 commits to treating the
 * national guide as a moving alignment reference; recording the gaps explicitly
 * is what makes that measurable rather than merely asserted.
 */
export default async function AlignmentPage() {
  const session = await requirePageAccess(PERMISSIONS.FHIR_READ);

  const rows = phCoreAlignment([...REFERRAL_PACKAGE_RESOURCES]);
  const covered = rows.filter((r) => r.status === "applied");
  const gaps = rows.filter((r) => r.status !== "applied");
  const coverage = Math.round((covered.length / rows.length) * 100);

  const totalRequired = covered.reduce((a, r) => a + r.requiredElements, 0);
  const totalMustSupport = covered.reduce((a, r) => a + r.mustSupportElements, 0);
  const totalBound = covered.reduce((a, r) => a + r.boundElements, 0);

  return (
    <>
      <PageHeader
        title="Draft Philippine Core FHIR IG alignment"
        subtitle={
          <>
            How the HealthLink referral exchange maps onto{" "}
            <span className="font-medium text-ink-700">{PHCORE_IG.name}</span>{" "}
            <span className="mono-id">
              {PHCORE_IG.package}#{PHCORE_IG.version}
            </span>
          </>
        }
        actions={
          <a
            href={PHCORE_IG.canonical}
            target="_blank"
            rel="noreferrer"
            className="btn-secondary btn-sm"
          >
            <IconExternal className="h-3.5 w-3.5" />
            Published guide
          </a>
        }
      />

      <MetricRow>
        <MetricCell label="Resource types exchanged" value={rows.length} hint="In one referral bundle" />
        <MetricCell
          label="Profile coverage"
          value={`${coverage}%`}
          hint={`${covered.length} of ${rows.length} mapped to a published profile`}
          tone={coverage >= 70 ? "positive" : "warn"}
        />
        <MetricCell label="Required elements enforced" value={totalRequired} hint="Minimum cardinality > 0" />
        <MetricCell
          label="Must-support elements"
          value={totalMustSupport}
          hint={`${totalBound} terminology bindings checked`}
        />
      </MetricRow>

      {/* ---------------- Draft caveat ---------------- */}
      <Alert tone="warn" title="The national guide is a draft" className="mt-5">
        <p>
          {PHCORE_IG.name} v{PHCORE_IG.version} is published by {PHCORE_IG.publisher}. Its own documentation states that
          it is <span className="font-medium">not yet available for public or production use</span> and that content and
          data models are subject to change.
        </p>
        <p className="mt-2">
          HealthLink therefore treats it as an <span className="font-medium">alignment reference</span>, not a finalized
          regulatory requirement. Where a profile exists, HealthLink validates against it. Where none exists, the
          resource is mapped to the FHIR R4 base and the gap is recorded below rather than hidden.
        </p>
      </Alert>

      {/* ---------------- Coverage ---------------- */}
      <Card
        title="Referral package, resource by resource"
        description="Every resource exchanged in a referral bundle, the profile it is validated against, and how much of that profile the validator enforces."
        className="mt-5"
        divided
        bodyClassName="p-0"
      >
        <div className="overflow-x-auto">
          <table className="table">
            <thead>
              <tr>
                <th className="table-head w-[15%]">FHIR resource</th>
                <th className="table-head w-[30%]">Role in the referral</th>
                <th className="table-head w-[22%]">PH Core profile</th>
                <th className="table-head w-[8%] text-center" title="Elements with minimum cardinality greater than zero">
                  Required
                </th>
                <th className="table-head w-[9%] text-center" title="Elements flagged must-support by the guide">
                  Must support
                </th>
                <th className="table-head w-[8%] text-center" title="Elements bound to a terminology value set">
                  Bound
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const profile = PH_CORE_PROFILES.find((p) => p.name === r.profile);
                const aligned = r.status === "applied";
                return (
                  <tr key={r.resource} className="transition-colors hover:bg-ink-50/60">
                    <td className="table-cell">
                      <span className="flex items-center gap-1.5">
                        {aligned ? (
                          <IconCheck className="h-3.5 w-3.5 shrink-0 text-brand-600" />
                        ) : (
                          <IconAlert className="h-3.5 w-3.5 shrink-0 text-amber-500" />
                        )}
                        <span className="text-[13px] font-medium text-ink-900">{r.resource}</span>
                      </span>
                    </td>
                    <td className="table-cell text-[11.5px] leading-snug text-ink-600">
                      {ROLE[r.resource] ?? "—"}
                    </td>
                    <td className="table-cell">
                      {aligned ? (
                        <span className="mono-id break-all text-brand-700">{r.profile}</span>
                      ) : (
                        <span className="text-[11.5px] italic text-amber-700">
                          none published in v{PHCORE_IG.version}
                        </span>
                      )}
                    </td>
                    <td className="table-cell text-center tabular-nums text-[12px] text-ink-700">
                      {profile?.constraints.filter((c) => (c.min ?? 0) >= 1).length ?? "—"}
                    </td>
                    <td className="table-cell text-center tabular-nums text-[12px] text-ink-700">
                      {profile?.constraints.filter((c) => c.mustSupport).length ?? "—"}
                    </td>
                    <td className="table-cell text-center tabular-nums text-[12px] text-ink-700">
                      {profile?.constraints.filter((c) => c.binding).length ?? "—"}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <p className="border-t border-ink-200/80 px-4 py-3 text-[10.5px] leading-relaxed text-ink-400">
          <span className="font-medium">Required</span> elements must be present or routing is blocked.{" "}
          <span className="font-medium">Must support</span> elements must be populated when the data exists.{" "}
          <span className="font-medium">Bound</span> elements are checked against a terminology value set, with unknown
          codes raising a warning rather than a failure while the national value sets remain in draft.
        </p>
      </Card>

      {/* ---------------- Gaps ---------------- */}
      {gaps.length > 0 && (
        <Card
          title={`Recorded alignment gaps (${gaps.length})`}
          description="Resources exchanged on the FHIR R4 base because the draft guide defines no profile for them yet."
          className="mt-5"
          divided
          bodyClassName="p-0"
        >
          <ul className="divide-y divide-ink-100">
            {gaps.map((g) => (
              <li key={g.resource} className="px-4 py-3.5">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-[13px] font-medium text-ink-900">{g.resource}</span>
                  <span className="chip-warn">No profile in v{PHCORE_IG.version}</span>
                </div>
                <p className="mt-1.5 text-[11.5px] leading-relaxed text-ink-600">
                  {GAP_NOTE[g.resource] ?? "Mapped to the FHIR R4 base resource."}
                </p>
              </li>
            ))}
          </ul>
          <div className="border-t border-ink-200/80 bg-ink-50/60 px-4 py-3.5">
            <p className="text-[11px] leading-relaxed text-ink-600">
              These gaps are expected for a draft guide that currently focuses on core clinical and administrative
              resources. They are not defects in HealthLink: the same resources would be profiled by a downstream
              referral or HIE implementation guide that inherits from PH Core. HealthLink is built so that adding such a
              profile means registering its constraints, not restructuring the mapping.
            </p>
          </div>
        </Card>
      )}

      {/* ---------------- Terminology & identifiers ---------------- */}
      <div className="mt-5 grid gap-5 lg:grid-cols-2">
        <Card
          title="Terminology in use"
          description="Curated subsets, deliberately not the complete vocabularies."
          divided
        >
          <ul className="space-y-3.5">
            <TermRow
              code="LOINC"
              system="http://loinc.org"
              purpose="Vital signs, laboratory and examination codes — the observations a Davao referral typically carries."
              count="48 concepts"
            />
            <TermRow
              code="ICD-10"
              system="http://hl7.org/fhir/sid/icd-10"
              purpose="Diagnosis coding, spanning the chapters relevant to primary-to-tertiary referral."
              count="50 codes"
            />
            <TermRow
              code="SNOMED CT"
              system="http://snomed.info/sct"
              purpose="Allergies, intolerances and clinical findings."
              count="42 concepts"
            />
            <TermRow code="UCUM" system="http://unitsofmeasure.org" purpose="Machine-readable units on every numeric observation." />
            <TermRow
              code="PSGC"
              system="https://psa.gov.ph/classification/psgc"
              purpose="Geographic codes carried on PH Core address extensions."
            />
          </ul>
          <p className="mt-4 border-t border-ink-200/80 pt-3 text-[10.5px] leading-relaxed text-ink-400">
            A code outside a bundled subset produces a <span className="font-medium">warning</span>, never a hard
            failure. Rejecting a genuinely valid code would block patient care, so the finding is surfaced for review
            instead.
          </p>
        </Card>

        <Card
          title="Identifier systems"
          description="Taken verbatim from the guide's NamingSystems."
          divided
        >
          <ul className="space-y-3.5">
            <IdRow name="PhilHealth PIN" system="http://philhealth.gov.ph/fhir/Identifier/philhealth-id" purpose="Patient identification and matching across facilities." />
            <IdRow name="PhilSys ID" system="http://philsys.gov.ph/fhir/Identifier/philsys-id" purpose="National identity, where the patient has enrolled." />
            <IdRow name="DOH NHFR code" system="https://fhir.doh.gov.ph/phcore/Identifier/doh-nhfr-code" purpose="Health Facility Code identifying each facility." />
            <IdRow name="HCPN code" system="https://fhir.doh.gov.ph/phcore/Identifier/hcpn-code" purpose="Health Care Provider Network membership." />
            <IdRow name="PhilHealth PAN" system="http://nhdr.gov.ph/fhir/Identifier/philhealthaccreditationnumber" purpose="Facility accreditation number." />
            <IdRow name="HealthLink referral" system="https://healthlink.davao.gov.ph/identifier/referral" purpose="Correlates the ServiceRequest, Task, Encounter and Consent that form one referral." local />
          </ul>
          <p className="mt-4 border-t border-ink-200/80 pt-3 text-[10.5px] leading-relaxed text-ink-400">
            HealthLink-local systems are namespaced under{" "}
            <span className="font-mono text-ink-600">healthlink.davao.gov.ph</span> so they cannot be mistaken for
            national standards. They are candidates for harmonisation once national systems are assigned.
          </p>
        </Card>
      </div>

      {/* ---------------- Method ---------------- */}
      <Card
        title="How this alignment was established"
        description="Reproducible from the published guide, so a reviewer can check it."
        className="mt-5"
        divided
      >
        <ol className="space-y-4">
          {[
            {
              step: "1",
              label: "Retrieval",
              text: `The published package ${PHCORE_IG.package}#${PHCORE_IG.version} was downloaded from ${PHCORE_IG.canonical} on ${PHCORE_IG.retrievedOn}, together with its stated dependencies.`,
            },
            {
              step: "2",
              label: "Transcription",
              text:
                "The constrained elements of each profile were transcribed from the published snapshot: tightened cardinality, must-support flags and terminology bindings. Elements the guide does not constrain inherit FHIR R4 base rules and are not re-implemented.",
            },
            {
              step: "3",
              label: "Enforcement",
              text:
                "Every referral is validated twice — when it is created or edited, and again immediately before routing. Routing is blocked while any required element is missing or any profile error remains.",
            },
            {
              step: "4",
              label: "Reporting",
              text:
                "Findings are returned as a FHIR OperationOutcome, using error for conformance failures and warning for advisory terminology findings, so a client can distinguish a blocker from a review item.",
            },
          ].map((s) => (
            <li key={s.step} className="flex gap-3.5">
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-ink-900 text-[11px] font-semibold text-white">
                {s.step}
              </span>
              <div className="min-w-0">
                <p className="text-[12.5px] font-medium text-ink-900">{s.label}</p>
                <p className="mt-0.5 text-[12px] leading-relaxed text-ink-600">{s.text}</p>
              </div>
            </li>
          ))}
        </ol>
        <div className="mt-4 flex flex-wrap gap-2 border-t border-ink-200/80 pt-3.5">
          <Link href="/interop/validate" className="btn-secondary btn-sm">
            Try the validator
          </Link>
          <Link href="/interop/explorer" className="btn-secondary btn-sm">
            Browse exchanged resources
          </Link>
          <Link href="/interop/capability" className="btn-secondary btn-sm">
            Capability statement
          </Link>
        </div>
      </Card>
    </>
  );
}

/** What each resource does in the referral, for a reader who does not know FHIR. */
const ROLE: Record<string, string> = {
  Patient: "Demographics and identifiers of the person referred.",
  Practitioner: "The referring and receiving clinicians.",
  Organization: "Participating facilities, with NHFR, HCPN and PhilHealth identifiers.",
  Encounter: "The care context in which the referral was raised.",
  ServiceRequest: "The referral request itself, carrying the reason and clinical narrative.",
  Task: "The closed-loop workflow state, through to feedback.",
  Condition: "Coded diagnoses supporting the referral.",
  Observation: "Vital signs, laboratory results and examination findings.",
  MedicationStatement: "Current medication at the time of referral.",
  AllergyIntolerance: "Allergies and intolerances, with criticality.",
  DocumentReference: "Attached summaries, results and reports.",
  Consent: "Consent or other lawful basis, with scope and validity.",
  Communication: "Feedback, queries and care updates.",
  Provenance: "Who authored or changed which resource, and when.",
  AuditEvent: "Security-relevant activity, with the outcome.",
};

/** Gap explanation per resource type. */
const GAP_NOTE: Record<string, string> = {
  DocumentReference:
    "Attachments map to the R4 DocumentReference with a restricted security label, base64 content and a SHA-256 hash, so a receiving system can verify the document it received. Profiling for Philippine clinical documents belongs in a downstream document IG.",
  Consent:
    "Consent carries the lawful basis under RA 10173, the authorising party, the scope of facilities and data classes, and the validity period. A national Consent profile would need to align with the NPC's guidance on health information.",
  Communication:
    "Feedback and queries map to Communication with subject, about and payload — how the closed referral loop is expressed in FHIR.",
  AuditEvent:
    "The audit trail maps to AuditEvent using the DICOM audit-event type code system that FHIR R4 specifies, recording agent, source and entity for each action.",
};

function TermRow({
  code,
  system,
  purpose,
  count,
}: {
  code: string;
  system: string;
  purpose: string;
  count?: string;
}) {
  return (
    <li>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <span className="text-[12.5px] font-medium text-ink-900">{code}</span>
        {count && <span className="text-[10.5px] text-ink-400">{count}</span>}
      </div>
      <span className="mono-id mt-0.5 block break-all">{system}</span>
      <p className="mt-0.5 text-[11.5px] leading-relaxed text-ink-600">{purpose}</p>
    </li>
  );
}

function IdRow({
  name,
  system,
  purpose,
  local,
}: {
  name: string;
  system: string;
  purpose: string;
  local?: boolean;
}) {
  return (
    <li>
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-[12.5px] font-medium text-ink-900">{name}</span>
        {local && (
          <span className="chip-neutral">
            <IconLink className="h-2.5 w-2.5" />
            local
          </span>
        )}
      </div>
      <span className="mono-id mt-0.5 block break-all">{system}</span>
      <p className="mt-0.5 text-[11.5px] leading-relaxed text-ink-600">{purpose}</p>
    </li>
  );
}

void Bar;
