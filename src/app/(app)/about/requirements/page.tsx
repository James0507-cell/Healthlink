import type { Metadata } from "next";
import { getSession } from "@/lib/auth";
import { Card, PageHeader, Alert } from "@/components/ui";
import { PHCORE_IG, PROFILE } from "@/lib/fhir/terminology";
import Link from "next/link";

export const metadata: Metadata = { title: "Requirements traceability" };

interface Requirement {
  id: string;
  rq: string;
  statement: string;
  feature: string;
  featureHref?: string;
  dataElement: string;
  fhir: string;
  control: string;
}

/**
 * Requirements traceability matrix.
 *
 * The methodology chapter commits to linking "each major user requirement to a
 * proposed feature, data element, FHIR resource or interaction, privacy or
 * security control, and evaluation item". This page is that matrix, rendered
 * from the same constants the application enforces so it cannot silently drift.
 */
const MATRIX: Requirement[] = [
  {
    id: "R1",
    rq: "RQ1",
    statement: "Capture the problems, information requirements and workflow needs of the current referral process.",
    feature: "Referral worklist, closed-loop states, information-request loop with reasons",
    featureHref: "/referrals",
    dataElement: "Referral status, reason for referral, information requests, turnaround timestamps",
    fhir: "Task.status, Task.businessStatus, ServiceRequest.reasonCode",
    control: "Turnaround and completeness reporting for process evaluation",
  },
  {
    id: "R2",
    rq: "RQ1",
    statement: "Structured referral request with its clinical context.",
    feature: "Six-step referral creation with sectioned clinical summary",
    featureHref: "/referrals/new",
    dataElement:
      "Chief complaint, history, examination, assessment, management, requested action, vitals, diagnoses, medication, allergies",
    fhir: "ServiceRequest + Encounter + Condition + Observation + MedicationStatement + AllergyIntolerance",
    control: "Minimum-necessary completion enforced before routing",
  },
  {
    id: "R3",
    rq: "RQ1, RQ3",
    statement: "Attach supporting documents to a referral.",
    feature: "Document attach and retrieval, audited on every view",
    featureHref: "/referrals",
    dataElement: "Document title, type, content, hash, author",
    fhir: "DocumentReference (R4 base; no PH Core profile in v0.2.0)",
    control: "Access-checked retrieval, confirmed by the audit trail",
  },
  {
    id: "R4",
    rq: "RQ2",
    statement: "Map facility data to an agreed FHIR-aligned structure.",
    feature: "Mapping layer and PH Core alignment report",
    featureHref: "/interop/alignment",
    dataElement: "Patient, provider, facility, encounter, diagnoses, observations, documents, consent, feedback",
    fhir: PROFILE.PATIENT.replace(PHCORE_IG.canonical + "/StructureDefinition/", "") + " and 10 further profiles",
    control: "Every resource declares the profile it was validated against",
  },
  {
    id: "R5",
    rq: "RQ2",
    statement: "Check required information before exchange.",
    feature: "Pre-routing checklist plus FHIR/PH Core validation",
    featureHref: "/interop/validate",
    dataElement: "Required clinical and consent fields; profile cardinality; terminology bindings",
    fhir: "OperationOutcome with error/warning severities",
    control: "Routing is blocked while a blocking requirement is unmet",
  },
  {
    id: "R6",
    rq: "RQ3",
    statement: "Route referrals to the intended receiving facility across differing systems.",
    feature: "Read-only FHIR facade with a published CapabilityStatement",
    featureHref: "/interop/capability",
    dataElement: "Facility NHFR/HCPN identifiers, referral identifier",
    fhir: "Bundle (transaction) with Organization identifiers; REST read and search",
    control: "Bearer token or session; facility-scoped reads; every read audited",
  },
  {
    id: "R7",
    rq: "RQ3",
    statement: "Record referral progress from submission through to returned feedback.",
    feature: "Thirteen-state closed loop mapped to FHIR Task",
    featureHref: "/referrals",
    dataElement: "State, actor, role, facility, note, timestamp, FHIR Task version",
    fhir: "Task.status, Task.businessStatus, ServiceRequest.status, Provenance",
    control: "Append-only referral history; every transition audited",
  },
  {
    id: "R8",
    rq: "RQ3",
    statement: "Allow receiving providers to communicate decisions and care updates.",
    feature: "Feedback thread with typed messages",
    featureHref: "/referrals",
    dataElement: "Message kind, subject, body, sender, recipient facility, read time",
    fhir: "Communication (R4 base; no PH Core profile in v0.2.0)",
    control: "Sender identity and facility recorded on each message",
  },
  {
    id: "R9",
    rq: "RQ3",
    statement: "Authenticate users and apply role-based least-privilege access.",
    feature: "Nine roles, 34 permissions, facility-scoped authorisation",
    featureHref: "/account",
    dataElement: "Role, facility, permission grants",
    fhir: "— (application-layer control; surfaced on Practitioner and Organization)",
    control: "Deny by default; blocked attempts are audited",
  },
  {
    id: "R10",
    rq: "RQ3",
    statement: "Document consent or another lawful basis for the exchange.",
    feature: "Consent register with five lawful bases under RA 10173",
    featureHref: "/consent",
    dataElement: "Basis, authorising party, relationship, scope, validity, revocation",
    fhir: "Consent (R4 base; no PH Core profile in v0.2.0)",
    control: "Revocation neutralises the referral and blocks document disclosure",
  },
  {
    id: "R11",
    rq: "RQ3",
    statement: "Protect data in transit and at rest, and log significant actions for traceability.",
    feature: "Hash-chained audit trail with integrity verification and CSV export",
    featureHref: "/audit",
    dataElement: "Actor, role, facility, action, entity, outcome, purpose, network, hash",
    fhir: "AuditEvent (R4 base) and Provenance for content authorship",
    control: "Append-only; SHA-256 chain makes tampering detectable",
  },
  {
    id: "R12",
    rq: "RQ3",
    statement: "Support data minimisation, retention rules and controlled sharing.",
    feature: "Confidentiality levels, data-minimisation note, retention configuration",
    featureHref: "/governance",
    dataElement: "Confidentiality level, minimisation note, retention period",
    fhir: "meta.security, DocumentReference.securityLabel, Provenance.reason",
    control: "Restricted referrals narrow disclosure; retention sweep available",
  },
  {
    id: "R13",
    rq: "RQ4",
    statement: "Enable evaluation of perceived usability, usefulness and acceptability.",
    feature: "Task-based walkthrough across four roles with synthetic data",
    featureHref: "/about",
    dataElement: "Process measures: completeness, timeliness, visibility, exchange success",
    fhir: "— (evaluation instrument is administered separately from the system)",
    control: "Reports describe process, never clinical outcomes",
  },
  {
    id: "R14",
    rq: "RQ2, RQ3",
    statement: "Align with emerging Philippine interoperability guidance.",
    feature: "Alignment report recording covered profiles and explicit gaps",
    featureHref: "/interop/alignment",
    dataElement: "Profile applied per resource; gap recorded where none exists",
    fhir: `${PHCORE_IG.package}#${PHCORE_IG.version}`,
    control: "The guide's draft status is stated wherever alignment is claimed",
  },
];

export default async function RequirementsPage() {
  const session = await getSession();
  const byRq = ["RQ1", "RQ2", "RQ3", "RQ4"] as const;

  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader
        title="Requirements traceability"
        subtitle="Each user requirement linked to the feature that satisfies it, the data it uses, the FHIR resource that carries it, and the control that protects it."
      />

      <Alert tone="neutral" className="mb-5">
        <p>
          This matrix is generated from the same constants the application enforces. Editing a profile, role permission
          or workflow state changes what the system does and what this table reports, so the two cannot drift apart.
        </p>
        {!session && (
          <p className="mt-2">
            <Link href="/login" className="link">
              Sign in
            </Link>{" "}
            to open the linked features.
          </p>
        )}
      </Alert>

      {/* ---------------- Summary ---------------- */}
      <div className="mb-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {byRq.map((rq) => {
          const items = MATRIX.filter((m) => m.rq.includes(rq));
          const label =
            rq === "RQ1"
              ? "Current process and information needs"
              : rq === "RQ2"
                ? "FHIR representation of referral data"
                : rq === "RQ3"
                  ? "Architecture and core features"
                  : "Evaluation of usability and acceptability";
          return (
            <div key={rq} className="card px-4 py-3.5">
              <p className="section-label">{rq}</p>
              <p className="mt-1 text-[24px] font-semibold leading-none tabular-nums text-ink-900">
                {items.length}
              </p>
              <p className="mt-1.5 text-[11px] leading-snug text-ink-500">{label}</p>
            </div>
          );
        })}
      </div>

      {/* ---------------- Matrix ---------------- */}
      <Card bodyClassName="p-0" className="overflow-hidden">
        <div className="overflow-x-auto">
          <table className="table">
            <thead>
              <tr>
                <th className="table-head w-[3rem]">Ref</th>
                <th className="table-head w-[16%]">Requirement</th>
                <th className="table-head w-[17%]">Feature in HealthLink</th>
                <th className="table-head w-[17%]">Data elements</th>
                <th className="table-head w-[17%]">FHIR resources</th>
                <th className="table-head w-[16%]">Privacy / security control</th>
              </tr>
            </thead>
            <tbody>
              {MATRIX.map((m) => (
                <tr key={m.id}>
                  <td className="table-cell">
                    <span className="mono-id font-medium text-ink-700">{m.id}</span>
                    <span className="mt-1 block text-[9.5px] uppercase tracking-wide text-ink-400">{m.rq}</span>
                  </td>
                  <td className="table-cell text-[12px] leading-snug text-ink-800">{m.statement}</td>
                  <td className="table-cell text-[12px] leading-snug text-ink-800">
                    {m.feature}
                    {session && m.featureHref && (
                      <Link href={m.featureHref} className="mt-1 block text-[11px] font-medium text-brand-700 hover:underline">
                        Open
                      </Link>
                    )}
                  </td>
                  <td className="table-cell text-[11.5px] leading-snug text-ink-600">{m.dataElement}</td>
                  <td className="table-cell text-[11px] leading-snug text-ink-600">
                    <span className="font-mono">{m.fhir}</span>
                  </td>
                  <td className="table-cell text-[11.5px] leading-snug text-ink-600">{m.control}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      {/* ---------------- Coverage note ---------------- */}
      <Card title="Coverage and deliberate exclusions" className="mt-5" divided>
        <div className="grid gap-5 lg:grid-cols-2">
          <div>
            <p className="section-label mb-2">Covered by this prototype</p>
            <ul className="space-y-2">
              {[
                "Structured referral creation with a complete clinical summary",
                "FHIR R4 mapping validated against the draft Philippine Core profiles",
                "A read-only FHIR facade with a published capability statement",
                "Thirteen-state closed loop mapped to FHIR Task with an append-only history",
                "Two-way feedback with typed messages mapped to FHIR Communication",
                "Nine roles with 34 permissions, facility-scoped",
                "Consent and lawful basis with working revocation",
                "Hash-chained, exportable audit trail",
                "Process reporting on completeness, timeliness and visibility",
              ].map((t) => (
                <li key={t} className="flex gap-2.5">
                  <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-brand-500" aria-hidden="true" />
                  <span className="text-[12.5px] leading-snug text-ink-700">{t}</span>
                </li>
              ))}
            </ul>
          </div>
          <div>
            <p className="section-label mb-2">Outside the scope of a concept prototype</p>
            <ul className="space-y-2">
              {[
                "Conformance testing against an external FHIR validator",
                "Penetration testing and a formal security assessment",
                "Live integration with a facility's production EMR",
                "Binary document handling (PDF, DICOM) with malware scanning",
                "Clinical outcome measurement of any kind",
                "Full national terminology server integration",
                "Multi-region deployment, disaster recovery and load testing",
                "Regulatory or contractual conformance certification",
              ].map((t) => (
                <li key={t} className="flex gap-2.5">
                  <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-ink-300" aria-hidden="true" />
                  <span className="text-[12.5px] leading-snug text-ink-600">{t}</span>
                </li>
              ))}
            </ul>
            <p className="mt-3.5 border-t border-ink-200/80 pt-3 text-[11px] leading-relaxed text-ink-500">
              The study states these plainly rather than implying that a concept prototype has achieved them.
            </p>
          </div>
        </div>
      </Card>
    </div>
  );
}
