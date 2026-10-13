import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import {
  getSession,
  PERMISSIONS,
  hasPermission,
  type Permission,
  requirePageSession,
} from "@/lib/auth";
import {
  getReferralDetail,
  viewerSide,
  assertCanView,
  readinessFor,
  bundleForReferral,
} from "@/lib/referrals";
import { PROFILE_BY_URL } from "@/lib/fhir/profiles";
import { STATES, transitionsFrom, type ReferralState } from "@/lib/workflow";
import type { FhirResourceSummary } from "@/components/referral/fhir-panel";
import { AttachmentFormClient } from "@/components/referral/attachment-form";
import {
  Alert,
  Card,
  PageHeader,
  StatusPill,
  PriorityPill,
  Fact,
  formatDateTime,
  formatDateLong,
  relativeTime,
  computeAge,
  maskId,
  BreadcrumbLink,
} from "@/components/ui";
import { ReferralTimeline } from "@/components/referral/timeline";
import { ClinicalSummary } from "@/components/referral/clinical-summary";
import { WorkflowActions } from "@/components/referral/workflow-actions";
import { FeedbackThread } from "@/components/referral/feedback-thread";
import { FhirPanel } from "@/components/referral/fhir-panel";
import { ConsentPanel } from "@/components/referral/consent-panel";
import { DetailTabsClient } from "@/components/referral/detail-tabs";
import {
  IconDownload,
  IconPrint,
  IconLock,
  IconAlert,
  IconPhone,
  IconPin,
  IconFile,
  IconCheck,
} from "@/components/icons";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  const detail = await getReferralDetail(id);
  return {
    title: detail ? `${detail.patient?.given_name ?? ""} ${detail.patient?.family_name ?? ""}`.trim() || detail.referral_number : "Referral",
  };
}

export default async function ReferralDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await requirePageSession();

  const detail = await getReferralDetail(id);
  if (!detail) notFound();

  if (!hasPermission(session, PERMISSIONS.REFERRAL_READ_OWN_FACILITY)) redirect("/dashboard");

  const access = await assertCanView(session, detail);
  if (!access.ok) {
    return (
      <>
        <PageHeader title="Referral" breadcrumb={<BreadcrumbLink href="/referrals">Referrals</BreadcrumbLink>} />
        <Alert tone="critical" title="Access denied">
          {access.message}
        </Alert>
        <div className="mt-4">
          <Link href="/referrals" className="btn-secondary">
            Back to referrals
          </Link>
        </div>
      </>
    );
  }

  const side = viewerSide(session, detail);
  const state = STATES[detail.status as ReferralState];
  const readiness = await readinessFor(detail);
  const privacyAuditor = session.role === "privacy_auditor";
  const consentActive = detail.consent?.status === "active";

  const availableTransitions = transitionsFrom(detail.status as ReferralState).filter((t) => {
    if (privacyAuditor) return false;
    const permitted = t.requiresAny.some((p) => session.permissions.includes(p as Permission));
    if (!permitted) return false;
    if (side === "cross") return true;
    if (t.side === "either") return side !== "observer";
    return t.side === side || side === "both";
  });

  const canAttach =
    hasPermission(session, PERMISSIONS.ATTACHMENT_ADD) && side !== "observer" && !state?.isTerminal;
  const canRevokeConsent = hasPermission(session, PERMISSIONS.CONSENT_REVOKE);
  const patientName = `${detail.patient.given_name} ${detail.patient.middle_name ?? ""} ${detail.patient.family_name}`.replace(/\s+/g, " ");

  return (
    <>
      <PageHeader
        breadcrumb={
          <>
            <BreadcrumbLink href="/referrals">Referrals</BreadcrumbLink>
            <span className="mono-id text-ink-600">{detail.referral_number}</span>
          </>
        }
        title={patientName}
        subtitle={
          <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <span>
              {detail.patient.sex === "male" ? "Male" : detail.patient.sex === "female" ? "Female" : detail.patient.sex}
              , {computeAge(detail.patient.birth_date)}
            </span>
            {detail.patient.local_mrn && (
              <>
                <span className="text-ink-300">·</span>
                <span>MRN {detail.patient.local_mrn}</span>
              </>
            )}
            <span className="text-ink-300">·</span>
            <span>{detail.reason_display}</span>
          </span>
        }
        meta={
          <>
            <StatusPill status={detail.status} />
            <PriorityPill priority={detail.priority} />
            {detail.confidentiality_level !== "normal" && (
              <span className="chip-critical">
                <IconLock className="h-3 w-3" />
                {detail.confidentiality_level === "highly-restricted" ? "Highly restricted" : "Restricted"}
              </span>
            )}
            {side !== "observer" && side !== "cross" && (
              <span className="chip-neutral">
                Your facility is {side === "referring" ? "the referrer" : side === "receiving" ? "the receiver" : "both parties"}
              </span>
            )}
            {side === "cross" && <span className="chip-neutral">Oversight view</span>}
          </>
        }
        actions={
          <>
            <a href={`/api/referrals/${detail.id}/bundle`} className="btn-secondary btn-sm" download>
              <IconDownload className="h-3.5 w-3.5" />
              FHIR bundle
            </a>
            <a
              href={`/print/referral/${detail.id}`}
              className="btn-secondary btn-sm"
              target="_blank"
              rel="noreferrer"
            >
              <IconPrint className="h-3.5 w-3.5" />
              Print
            </a>
          </>
        }
      />

      {/* ---------------- Conditional notices ---------------- */}
      <div className="mb-5 space-y-2.5">
        {state?.awaiting === "referring" && (side === "referring" || side === "both") && !state.isTerminal && (
          <Alert tone="warn" title="This referral needs an action from your facility">
            {state.description}
          </Alert>
        )}
        {state?.awaiting === "receiving" && side === "receiving" && (
          <Alert tone="info" title="This referral is with your facility">
            {state.description}
          </Alert>
        )}
        {detail.status === "draft" && !readiness.ready && (
          <Alert
            tone="warn"
            title={`Cannot be routed yet — ${readiness.blocking.length} requirement${readiness.blocking.length === 1 ? "" : "s"} unmet`}
          >
            <ul className="mt-1 space-y-0.5">
              {readiness.blocking.map((b) => (
                <li key={b.key} className="flex gap-2">
                  <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-amber-500" aria-hidden="true" />
                  <span>
                    <span className="font-medium">{b.label}</span>
                    {b.detail ? `: ${b.detail}` : ""}
                  </span>
                </li>
              ))}
            </ul>
          </Alert>
        )}
        {readiness.fhir.errorCount > 0 && (
          <Alert tone="critical" title={`FHIR validation reports ${readiness.fhir.errorCount} error(s)`}>
            <ul className="mt-1 space-y-0.5">
              {readiness.fhir.outcome.issue
                .filter((i) => i.severity === "error")
                .slice(0, 5)
                .map((i, idx) => (
                  <li key={idx}>
                    <span className="mono-id">{i.expression?.[0]}</span> — {i.diagnostics}
                  </li>
                ))}
            </ul>
          </Alert>
        )}
        {detail.consent && !consentActive && (
          <Alert tone="critical" title="Consent is no longer active">
            This referral relies on <span className="font-medium">{detail.lawful_basis_display}</span>, and the consent
            record is <span className="font-medium">{detail.consent.status}</span>
            {detail.consent.revoke_reason ? ` (${detail.consent.revoke_reason})` : ""}. Further exchange is disabled.
          </Alert>
        )}
        {readiness.advisory.length > 0 && detail.status !== "closed-feedback" && !state?.isTerminal && (
          <Alert tone="neutral" title="Advisory findings — these do not block the referral">
            <ul className="mt-1 space-y-0.5">
              {readiness.advisory.map((b) => (
                <li key={b.key} className="flex gap-2">
                  <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-ink-400" aria-hidden="true" />
                  <span>
                    <span className="font-medium">{b.label}</span>
                    {b.detail ? `: ${b.detail}` : ""}
                  </span>
                </li>
              ))}
            </ul>
          </Alert>
        )}
      </div>

      {/* ---------------- Main layout ---------------- */}
      <div className="grid gap-5 xl:grid-cols-[1fr_19.5rem]">
        <div className="min-w-0 space-y-5">
          <DetailTabsClient
            defaultTab="summary"
            tabs={[
              { id: "summary", label: "Clinical summary" },
              { id: "timeline", label: "History", count: detail.events.length },
              { id: "feedback", label: "Feedback", count: detail.messages.length },
              { id: "fhir", label: "FHIR exchange" },
            ]}
            panels={{
              summary: <ClinicalSummary detail={detail} />,
              timeline: <ReferralTimeline events={detail.events} />,
              feedback: (
                <FeedbackThread
                  detail={detail}
                  canPost={
                    !privacyAuditor &&
                    side !== "observer" &&
                    hasPermission(session, PERMISSIONS.REFERRAL_FEEDBACK) &&
                    !state?.isTerminal
                  }
                  currentUserId={session.id}
                />
              ),
              fhir: (
                <FhirPanel
                  referralId={detail.id}
                  bundleValid={readiness.fhir.valid}
                  errorCount={readiness.fhir.errorCount}
                  warningCount={readiness.fhir.warningCount}
                  infoCount={readiness.fhir.infoCount}
                  resources={await fhirResourceSummary(detail.id)}
                  bundleUrl={`/api/referrals/${detail.id}/bundle`}
                  jsonUrl={`/api/referrals/${detail.id}/bundle?inline=1`}
                />
              ),
            }}
          />
        </div>

        {/* ---------------- Side rail ---------------- */}
        <div className="space-y-4">
          <WorkflowActions
            referralId={detail.id}
            status={detail.status}
            transitions={availableTransitions.map((t) => ({
              action: t.action,
              label: t.label,
              description: t.description,
              requiresNote: !!t.requiresNote,
              allowsFeedback: !!t.allowsFeedback,
              allowsOutcome: !!t.allowsOutcome,
              allowsAppointment: !!t.allowsAppointment,
              confirm: t.confirm,
              tone: t.tone ?? "primary",
            }))}
            ready={readiness.ready}
            side={side}
            currentStateLabel={state?.label ?? detail.status}
          />

          {/* Routing */}
          <Card title="Routing" divided>
            <ol className="space-y-3">
              <RouteStep
                label="Referred by"
                name={detail.referringFacility.name}
                detail={detail.referringUser?.full_name}
                time={detail.created_at}
                done
              />
              <RouteStep
                label="Routed"
                name={detail.route_channel === "shared-fhir-api" ? "Shared FHIR API" : "Not yet routed"}
                detail={detail.route_attempts > 0 ? `${detail.route_attempts} attempt(s)` : undefined}
                time={detail.routed_at}
                done={!!detail.routed_at}
              />
              <RouteStep
                label="Referred to"
                name={detail.receivingFacility.name}
                detail={detail.receivingUser?.full_name}
                time={detail.accepted_at}
                done={!!detail.receivingUser}
              />
            </ol>
          </Card>

          {/* Patient */}
          <Card
            title="Patient"
            divided
            actions={
              <Link href={`/patients?q=${encodeURIComponent(detail.patient.family_name)}`} className="btn-ghost btn-sm">
                Registry
              </Link>
            }
          >
            <dl className="space-y-3">
              <Fact label="Identifiers" mono>
                {detail.patient.local_mrn ? `MRN ${detail.patient.local_mrn}` : "No local MRN"}
                <span className="mt-0.5 block text-ink-500">
                  PhilHealth {maskId(detail.patient.philhealth_id)}
                </span>
                {detail.patient.philsys_id && (
                  <span className="mt-0.5 block text-ink-500">PhilSys {maskId(detail.patient.philsys_id)}</span>
                )}
              </Fact>
              {(detail.patient.phone || detail.patient.email) && (
                <Fact label="Contact">
                  {detail.patient.phone && (
                    <span className="flex items-center gap-1.5">
                      <IconPhone className="h-3 w-3 text-ink-400" />
                      {detail.patient.phone}
                    </span>
                  )}
                  {detail.patient.email && <span className="mt-0.5 block">{detail.patient.email}</span>}
                </Fact>
              )}
              <Fact label="Address">
                <span className="flex items-start gap-1.5">
                  <IconPin className="mt-0.5 h-3 w-3 shrink-0 text-ink-400" />
                  <span>
                    {[
                      detail.patient.address_line,
                      detail.patient.barangay_display,
                      detail.patient.city_display,
                      detail.patient.province_display,
                    ]
                      .filter(Boolean)
                      .join(", ") || "Not recorded"}
                  </span>
                </span>
              </Fact>
              {detail.patient.blood_type && <Fact label="Blood type">{detail.patient.blood_type}</Fact>}
              {detail.patient.occupation && <Fact label="Occupation">{detail.patient.occupation}</Fact>}
            </dl>
            <p className="mt-3 border-t border-ink-200/80 pt-2.5 text-[10.5px] leading-relaxed text-ink-400">
              Patient tracking code{" "}
              <span className="font-mono text-ink-600">{detail.tracking_code}</span> — give this to the patient for
              status enquiries.
            </p>
          </Card>

          {/* Attachments */}
          <Card
            title="Documents"
            description={detail.attachments.length ? `${detail.attachments.length} attached` : undefined}
            divided
            bodyClassName={detail.attachments.length ? "p-0" : ""}
          >
            {detail.attachments.length === 0 && !canAttach && (
              <p className="text-[12px] text-ink-500">No documents attached.</p>
            )}

            {detail.attachments.length > 0 && (
              <ul className="divide-y divide-ink-100">
                {detail.attachments.map((a) => (
                  <li key={a.id}>
                    <a
                      href={`/api/attachments/${a.id}`}
                      target="_blank"
                      rel="noreferrer"
                      className="flex items-start gap-2.5 px-4 py-2.5 transition-colors hover:bg-ink-50"
                    >
                      <IconFile className="mt-0.5 h-4 w-4 shrink-0 text-ink-400" />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[12.5px] font-medium text-ink-900">{a.title}</span>
                        <span className="block text-[10.5px] text-ink-500">
                          {a.doc_type_display} · {(a.size_bytes / 1024).toFixed(1)} KB
                        </span>
                      </span>
                    </a>
                  </li>
                ))}
              </ul>
            )}

            {canAttach && (
              <div className="border-t border-ink-200/80 px-4 py-3">
                <AttachmentFormClient referralId={detail.id} />
              </div>
            )}
          </Card>

          <ConsentPanel
            detail={detail}
            canRevoke={canRevokeConsent && !privacyAuditor && side !== "observer" && consentActive}
          />

          {/* Timing */}
          <Card title="Timeline" divided>
            <dl className="space-y-2.5 text-[12px]">
              <TimeRow label="Created" value={formatDateTime(detail.created_at)} />
              {detail.routed_at && <TimeRow label="Routed" value={formatDateTime(detail.routed_at)} />}
              {detail.accepted_at && <TimeRow label="Accepted" value={formatDateTime(detail.accepted_at)} />}
              {detail.appointment_at && (
                <TimeRow label="Appointment" value={formatDateLong(detail.appointment_at)} />
              )}
              {detail.completed_at && <TimeRow label="Completed" value={formatDateTime(detail.completed_at)} />}
              {detail.closed_at && <TimeRow label="Loop closed" value={formatDateTime(detail.closed_at)} />}
            </dl>
            <p className="mt-3 border-t border-ink-200/80 pt-2.5 text-[10.5px] text-ink-400">
              Last change {relativeTime(detail.updated_at)}
            </p>
          </Card>

          {/* Governance */}
          <Card title="Privacy record" divided>
            <dl className="space-y-3">
              <Fact label="Lawful basis">
                {detail.lawful_basis_display}
                <span className="mono-id mt-0.5 block">
                  {detail.lawful_basis_code === "patient-consent"
                    ? "RA 10173 s.12(a)"
                    : detail.lawful_basis_code === "treatment-purpose"
                      ? "RA 10173 s.12(b) / s.13(b)"
                      : detail.lawful_basis_code === "vital-interest"
                        ? "RA 10173 s.12(c)"
                        : detail.lawful_basis_code === "public-health"
                          ? "RA 10173 s.13(d)"
                          : "RA 10173 s.12(c) / s.13(c)"}
                </span>
              </Fact>
              <Fact label="Confidentiality">{detail.confidentiality_level}</Fact>
              <Fact label="Retention until">{formatDateLong(detail.retention_until)}</Fact>
              <Fact label="FHIR version">
                <span className="mono-id">v{detail.fhir_bundle_version}</span>
                {readiness.fhir.errorCount === 0 ? (
                  <span className="chip-positive ml-2">
                    <IconCheck className="h-2.5 w-2.5" />
                    validated
                  </span>
                ) : (
                  <span className="chip-critical ml-2">
                    {readiness.fhir.errorCount} error{readiness.fhir.errorCount === 1 ? "" : "s"}
                  </span>
                )}
              </Fact>
            </dl>
          </Card>
        </div>
      </div>
    </>
  );
}

function RouteStep({
  label,
  name,
  detail,
  time,
  done,
}: {
  label: string;
  name: string;
  detail?: string | null;
  time?: string | null;
  done?: boolean;
}) {
  return (
    <li className="flex gap-3">
      <span className="relative flex flex-col items-center">
        <span
          className={`mt-0.5 h-2 w-2 shrink-0 rounded-full ring-2 ring-white ${done ? "bg-brand-500" : "bg-ink-300"}`}
          aria-hidden="true"
        />
        <span className="absolute top-3 h-full w-px bg-ink-200" aria-hidden="true" />
      </span>
      <span className="min-w-0 pb-1">
        <span className="section-label block">{label}</span>
        <span className="mt-0.5 block text-[12.5px] font-medium leading-snug text-ink-900">{name}</span>
        {detail && <span className="block text-[11px] text-ink-500">{detail}</span>}
        {time && <span className="mt-0.5 block text-[10.5px] text-ink-400">{formatDateTime(time)}</span>}
      </span>
    </li>
  );
}

function TimeRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt className="text-[11px] text-ink-500">{label}</dt>
      <dd className="text-right text-[11.5px] text-ink-800">{value}</dd>
    </div>
  );
}

/**
 * Summarise the resources in this referral's bundle, annotating each with the
 * PH Core profile it was matched against (or the recorded gap).
 */
async function fhirResourceSummary(referralId: string): Promise<FhirResourceSummary[]> {
  const detail = await getReferralDetail(referralId);
  if (!detail) return [];
  const bundle = await bundleForReferral(detail);
  return (bundle.entry ?? []).map((entry, index) => {
    const res = entry.resource;
    const url = res?.meta?.profile?.[0];
    const profile = url ? PROFILE_BY_URL.get(url.split("|")[0]) : undefined;
    return {
      resourceType: res?.resourceType ?? "Unknown",
      id: res?.id,
      profile: url,
      profileName: profile?.name,
      aligned: !!profile && !!url?.startsWith("https://fhir.doh.gov.ph/phcore/"),
      entryIndex: index,
    };
  });
}

void IconAlert;
