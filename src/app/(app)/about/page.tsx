import type { Metadata } from "next";
import Link from "next/link";
import { getSession } from "@/lib/auth";
import { Card, PageHeader, Fact, Alert } from "@/components/ui";
import { PHCORE_IG } from "@/lib/fhir/terminology";
import { Logo } from "@/components/logo";
import {
  IconArrowRight,
  IconRoute,
  IconShield,
  IconLink,
  IconClipboard,
  IconMessage,
  IconChart,
} from "@/components/icons";

export const metadata: Metadata = { title: "About HealthLink" };

/**
 * Orientation page.
 *
 * Written for an evaluator who has just been handed access: what the system is
 * for, what each part of it does, the honest limits of the prototype, and how to
 * get around it. Linked from the sidebar as the single Help entry so it does not
 * cost a navigation section.
 */
export default async function AboutPage() {
  const session = await getSession();

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader
        title="About HealthLink"
        subtitle="An interoperable patient referral and health information exchange system for selected healthcare facilities in Davao City."
      />

      <Card className="mb-5" divided>
        <div className="flex items-start gap-4">
          <Logo size={44} />
          <div>
            <p className="text-[14px] leading-relaxed text-ink-700">
              HealthLink is a <span className="font-medium">middleware and coordination layer</span>. It connects to
              the systems a facility already runs rather than replacing them. It standardises the information a
              referral needs, validates that information, routes it to the receiving facility, tracks the referral to
              completion, and returns clinical feedback to the referring provider &mdash; a closed loop.
            </p>
            <p className="mt-3 text-[13px] leading-relaxed text-ink-500">
              It exists because a provider often refers a patient not because a referral is clearly the right clinical
              decision, but because the patient&rsquo;s history is not visible across facilities. The referral is driven
              by uncertainty about prior diagnoses, medication, allergies, laboratory results and imaging.
            </p>
          </div>
        </div>
      </Card>

      {/* ---------------- Capabilities ---------------- */}
      <Card title="What the system does" divided className="mb-5">
        <ul className="space-y-4">
          {[
            {
              icon: <IconClipboard className="h-4 w-4" />,
              title: "Referral creation and clinical summaries",
              body:
                "A structured referral capturing the clinical context, with supporting documents attached. Safety-critical information such as allergies is surfaced first.",
              href: "/referrals/new",
            },
            {
              icon: <IconLink className="h-4 w-4" />,
              title: "FHIR mapping and validation",
              body:
                "Facility data is mapped to HL7 FHIR R4 resources and checked against the draft Philippine Core profiles before anything is exchanged. Routing is blocked while a required element is missing.",
              href: "/interop/alignment",
            },
            {
              icon: <IconRoute className="h-4 w-4" />,
              title: "Secure routing and interoperability",
              body:
                "Referrals are routed through a shared FHIR API exposed by a read-only facade, so a receiving facility's own system can read the package in a standard form.",
              href: "/interop/capability",
            },
            {
              icon: <IconMessage className="h-4 w-4" />,
              title: "Closed-loop status tracking",
              body:
                "From submission and receipt through review, acceptance, request for information, redirection, completion and returned feedback. Each state records which facility acts next.",
              href: session ? "/referrals" : "/track",
            },
            {
              icon: <IconShield className="h-4 w-4" />,
              title: "Consent, access and audit",
              body:
                "Authenticated users, least-privilege role-based access scoped to the facility, a documented lawful basis, and a tamper-evident audit trail of significant actions.",
              href: session ? "/consent" : "/about",
            },
            {
              icon: <IconChart className="h-4 w-4" />,
              title: "Privacy and data governance",
              body:
                "Data minimisation, retention rules, controlled sharing of sensitive information, and reporting on process measures rather than clinical outcomes.",
              href: session ? "/reports" : "/about",
            },
          ].map((c) => (
            <li key={c.title} className="flex gap-3.5">
              <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-ink-100 text-ink-500">
                {c.icon}
              </span>
              <div className="min-w-0">
                <p className="text-[13.5px] font-medium text-ink-900">{c.title}</p>
                <p className="mt-1 text-[12.5px] leading-relaxed text-ink-600">{c.body}</p>
                {session && (
                  <Link
                    href={c.href}
                    className="mt-1.5 inline-flex items-center gap-1 text-[11.5px] font-medium text-brand-700 hover:underline"
                  >
                    Open
                    <IconArrowRight className="h-3 w-3" />
                  </Link>
                )}
              </div>
            </li>
          ))}
        </ul>
      </Card>

      {/* ---------------- Interoperability basis ---------------- */}
      <Card title="How interoperability is achieved" divided className="mb-5">
        <p className="text-[13px] leading-relaxed text-ink-700">
          A referral is exchanged as a single FHIR R4 <span className="font-mono text-[12px]">transaction</span> Bundle
          containing linked resources: the patient and their identifiers, the participating practitioners and
          facilities, the care context, the referral request itself, the workflow state, coded diagnoses, observations,
          medication, allergies, attached documents, consent, feedback and provenance.
        </p>
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <div className="rounded-lg border border-ink-200 bg-ink-50/60 px-3.5 py-3">
            <p className="section-label">Alignment target</p>
            <p className="mt-1 text-[13px] font-medium text-ink-900">{PHCORE_IG.name}</p>
            <p className="mono-id mt-0.5">
              {PHCORE_IG.package}#{PHCORE_IG.version}
            </p>
            <p className="mt-2 text-[11px] leading-relaxed text-ink-500">
              Published by {PHCORE_IG.publisher}. This guide is a draft and its own documentation states it is not yet
              available for production use.
            </p>
          </div>
          <div className="rounded-lg border border-ink-200 bg-ink-50/60 px-3.5 py-3">
            <p className="section-label">Terminology</p>
            <ul className="mt-1.5 space-y-1 text-[12px] text-ink-700">
              <li>
                <span className="font-medium">LOINC</span> for observations
              </li>
              <li>
                <span className="font-medium">ICD-10</span> and <span className="font-medium">SNOMED CT</span> for
                diagnoses, allergies and findings
              </li>
              <li>
                <span className="font-medium">UCUM</span> for units
              </li>
              <li>
                <span className="font-medium">PSGC</span> for geography
              </li>
            </ul>
          </div>
        </div>
        <p className="mt-3.5 text-[11.5px] leading-relaxed text-ink-500">
          The draft guide is treated as an <span className="font-medium">alignment reference</span>, not a finalized
          regulatory requirement. Where it publishes a profile, HealthLink validates against it. Where it does not, the
          resource is mapped to the FHIR R4 base and the gap is recorded rather than hidden.
        </p>
      </Card>

      {/* ---------------- Limits ---------------- */}
      <Card title="What this prototype is not" divided className="mb-5">
        <Alert tone="warn" title="Concept prototype, not a deployed system" className="mb-4">
          This environment exists to evaluate a design. It is not a production system and makes no claim of certified
          interoperability or demonstrated clinical benefit.
        </Alert>
        <ul className="space-y-3">
          {[
            {
              label: "The data is synthetic",
              text:
                "Every patient, provider and facility record here is fabricated for demonstration. No real health information is present, in line with the study's ethics commitments.",
            },
            {
              label: "The facilities are fictional composites",
              text:
                "Facility names are invented. The Davao City geographic codes (PSGC) are real public codes so that address mapping can be exercised correctly.",
            },
            {
              label: "Terminology is a bundled subset",
              text:
                "LOINC, ICD-10 and SNOMED CT coverage is a curated subset, not the complete vocabularies. A code outside the subset raises a warning for review, never a hard failure, because the national value sets are still in draft.",
            },
            {
              label: "Technical conformance testing is out of scope",
              text:
                "Conformance testing against an external FHIR validator, penetration testing, and live integration with facility systems belong to a future pilot, as stated in the study's methodology.",
            },
            {
              label: "Process measures only",
              text:
                "Reports describe how referrals move: completeness, timeliness, visibility. They do not measure mortality, morbidity, cost, or patient outcomes.",
            },
            {
              label: "Documents are text, not binaries",
              text:
                "Attachments are typed or pasted text. Accepting PDF and DICOM files requires malware scanning, encrypted object storage and DICOM handling that a concept prototype does not attempt.",
            },
          ].map((l) => (
            <li key={l.label} className="flex gap-3">
              <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-amber-400" aria-hidden="true" />
              <div>
                <p className="text-[12.5px] font-medium text-ink-900">{l.label}</p>
                <p className="mt-0.5 text-[12px] leading-relaxed text-ink-600">{l.text}</p>
              </div>
            </li>
          ))}
        </ul>
      </Card>

      {/* ---------------- Walkthrough ---------------- */}
      <Card title="Try the closed loop" divided className="mb-5">
        <p className="mb-3.5 text-[13px] leading-relaxed text-ink-600">
          Each account below uses the same password,{" "}
          <span className="kbd font-mono">HealthLink!2026</span>. Signing in as one, then the other, walks a referral
          from creation to a closed loop with returned feedback.
        </p>
        <ol className="space-y-3">
          {[
            { step: "1", role: "Referring", who: "physician@buhangin.example.ph", what: "Open a referral, review the clinical summary and its FHIR validation, then route it." },
            { step: "2", role: "Receiving", who: "specialist@dmgmc.example.ph", what: "Acknowledge receipt, begin review, then accept — recording the outcome and feedback." },
            { step: "3", role: "Referring", who: "nurse@buhangin.example.ph", what: "Read the returned feedback, then acknowledge it to close the loop." },
            { step: "4", role: "Oversight", who: "auditor@healthlink.example.ph", what: "Verify the audit trail and its hash-chain integrity, and export it." },
          ].map((s) => (
            <li key={s.step} className="flex gap-3.5">
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-ink-900 text-[11px] font-semibold text-white">
                {s.step}
              </span>
              <div className="min-w-0">
                <p className="text-[12.5px] font-medium text-ink-900">
                  {s.role}
                  {session && (
                    <span className="ml-2 font-mono text-[11px] font-normal text-ink-500">{s.who}</span>
                  )}
                </p>
                <p className="mt-0.5 text-[12px] leading-relaxed text-ink-600">{s.what}</p>
              </div>
            </li>
          ))}
        </ol>
      </Card>

      {/* ---------------- Data governance ---------------- */}
      <Card title="Data governance" divided>
        <dl className="space-y-3.5">
          <Fact label="Legal basis">
            Health information is sensitive personal information under the Data Privacy Act of 2012 (RA 10173).
            HealthLink records the specific basis for each exchange and enforces it.
          </Fact>
          <Fact label="Access model">
            Role-based and least-privilege. A user can act on a referral only where their facility is the referrer or
            the receiver. Cross-facility oversight roles are read-only.
          </Fact>
          <Fact label="Auditability">
            Every significant action is appended to a hash-chained audit log. Altering or removing a record breaks the
            chain and is detectable.
          </Fact>
          <Fact label="Retention">
            Retention periods are configurable. In this demonstration environment they are set to seven years, matching
            the point of the study rather than a regulatory requirement.
          </Fact>
        </dl>
      </Card>

      {!session && (
        <p className="mt-6 text-center text-[11.5px] text-ink-500">
          <Link href="/login" className="link">
            Facility staff sign in
          </Link>{" "}
          &middot;{" "}
          <Link href="/track" className="link">
            Check a referral status
          </Link>
        </p>
      )}
    </div>
  );
}
