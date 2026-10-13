import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import {
  getSession,
  PERMISSIONS,
  hasPermission,
  requirePageAccess,
} from "@/lib/auth";
import { listConsents } from "@/lib/referrals";
import { LAWFUL_BASIS } from "@/lib/fhir/terminology";
import { Card, EmptyState, PageHeader, formatDateTime, formatDate, Alert } from "@/components/ui";
import { RevokeConsentForm } from "@/components/referral/revoke-consent-form";
import { IconShield, IconLock, IconCheck, IconArrowRight } from "@/components/icons";

export const metadata: Metadata = { title: "Consent" };
export const dynamic = "force-dynamic";

/**
 * Consent register.
 *
 * Chapter 2 commits to documenting "consent or another lawful basis". This page
 * makes that commitment inspectable: every exchange shows the basis relied on,
 * who authorised it, its scope, and its status.
 */
export default async function ConsentPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  const session = await requirePageAccess(PERMISSIONS.CONSENT_READ);

  const sp = await searchParams;
  const consents = await listConsents(session, { limit: 200 });
  const filtered = sp.status ? consents.filter((c) => c.status === sp.status) : consents;

  const counts = {
    all: consents.length,
    active: consents.filter((c) => c.status === "active").length,
    revoked: consents.filter((c) => c.status === "revoked").length,
    otherBasis: consents.filter((c) => c.granted_by_relation === "not-required").length,
  };

  const canRevoke = hasPermission(session, PERMISSIONS.CONSENT_REVOKE) && session.role !== "privacy_auditor";

  return (
    <>
      <PageHeader
        title="Consent and lawful basis"
        subtitle="The basis on which health information may be shared for each exchange, in line with the Data Privacy Act of 2012 (RA 10173)."
      />

      {/* ---------------- Filters ---------------- */}
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <div className="segmented" role="tablist">
          {[
            { id: "", label: "All", count: counts.all },
            { id: "active", label: "Active", count: counts.active },
            { id: "revoked", label: "Revoked", count: counts.revoked },
          ].map((t) => {
            const isActive = (sp.status ?? "") === t.id;
            return (
              <Link
                key={t.id || "all"}
                href={t.id ? `/consent?status=${t.id}` : "/consent"}
                role="tab"
                aria-selected={isActive}
                className={isActive ? "segmented-item segmented-item-active" : "segmented-item"}
              >
                {t.label}
                <span className="ml-1.5 tabular-nums text-ink-400">{t.count}</span>
              </Link>
            );
          })}
        </div>
        <p className="text-[12px] text-ink-500">
          {counts.otherBasis} exchange{counts.otherBasis === 1 ? "" : "s"} relied on a basis that does not require
          patient authorisation
        </p>
      </div>

      {filtered.length === 0 ? (
        <EmptyState
          icon={<IconShield className="h-5 w-5" />}
          title="No consent record in this view"
          description="Consent records are created when a referral is prepared on the basis of patient authorisation."
        />
      ) : (
        <ul className="space-y-3">
          {filtered.map((c) => {
            const basis = LAWFUL_BASIS[c.purpose_code];
            const needsRecord = basis?.requiresConsentRecord;
            const revoked = c.status === "revoked";
            const expired = c.period_end ? new Date(c.period_end) < new Date() : false;

            return (
              <li key={c.id} className="card overflow-hidden">
                {/* Header row */}
                <div className="flex flex-wrap items-start justify-between gap-4 border-b border-ink-200/80 px-4 py-3.5">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span
                        className={
                          revoked
                            ? "chip-critical"
                            : expired
                              ? "chip-warn"
                              : c.status === "active"
                                ? "chip-positive"
                                : "chip-neutral"
                        }
                      >
                        {revoked ? (
                          <IconLock className="h-3 w-3" />
                        ) : c.status === "active" && !expired ? (
                          <IconCheck className="h-3 w-3" />
                        ) : null}
                        {expired && c.status === "active" ? "expired" : c.status}
                      </span>
                      {!needsRecord && <span className="chip-neutral">Other lawful basis</span>}
                      {c.referral_id && c.referral_number && (
                        <Link
                          href={`/referrals/${c.referral_id}`}
                          className="mono-id font-medium text-brand-700 hover:underline"
                        >
                          {c.referral_number}
                        </Link>
                      )}
                    </div>
                    <p className="mt-2 text-[14px] font-medium text-ink-900">{c.patient_name ?? "Patient"}</p>
                    <p className="mt-0.5 text-[12.5px] text-ink-600">{c.purpose_display}</p>
                    {c.legal_reference && <p className="mono-id mt-1">{c.legal_reference}</p>}
                  </div>

                  <div className="shrink-0 text-right">
                    <p className="section-label">Valid until</p>
                    <p className="mt-0.5 text-[12.5px] text-ink-800">{formatDate(c.period_end)}</p>
                    {c.granted_at && (
                      <>
                        <p className="section-label mt-2">Granted</p>
                        <p className="mt-0.5 text-[11px] text-ink-600">{formatDateTime(c.granted_at)}</p>
                      </>
                    )}
                  </div>
                </div>

                {/* Scope row */}
                <div className="grid gap-4 px-4 py-3 sm:grid-cols-3">
                  <div>
                    <p className="section-label">Authorised by</p>
                    <p className="mt-1 text-[12.5px] text-ink-800">
                      {c.granted_by_name ?? "—"}
                      {c.granted_by_relation && c.granted_by_relation !== "not-required"
                        ? ` (${c.granted_by_relation})`
                        : ""}
                    </p>
                  </div>
                  <div>
                    <p className="section-label">Data classes in scope</p>
                    <p className="mt-1 text-[12.5px] leading-snug text-ink-800">
                      {parseDataClasses(c.scope_data_classes).join(", ") || "Not restricted by class"}
                    </p>
                  </div>
                  <div>
                    <p className="section-label">Facilities in scope</p>
                    <p className="mt-1 text-[12.5px] text-ink-800">{describeFacilities(c.scope_facilities)}</p>
                  </div>
                </div>

                {/* Revoked notice */}
                {revoked && (
                  <div className="border-t border-red-200/70 bg-red-50/70 px-4 py-3">
                    <p className="text-[12px] font-medium text-red-800">
                      Revoked {formatDateTime(c.revoked_at)}
                      {c.revoke_reason ? ` — ${c.revoke_reason}` : ""}
                    </p>
                    <p className="mt-0.5 text-[11px] leading-relaxed text-red-700">
                      The linked referral is marked highly restricted, attachment retrieval is blocked, and further
                      exchange is refused at the API.
                    </p>
                  </div>
                )}

                {canRevoke && c.status === "active" && needsRecord && (
                  <div className="px-4 pb-3.5">
                    <RevokeConsentForm consentId={c.id} referralId={c.referral_id ?? undefined} />
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}

      {/* ---------------- Reference ---------------- */}
      <Card
        title="The bases HealthLink recognises"
        description="HealthLink does not assume consent is always the right basis. It offers the bases that actually apply to referral coordination in the Philippines and records which one was used."
        className="mt-6"
        divided
      >
        <div className="grid gap-5 lg:grid-cols-2">
          <ul className="space-y-2.5">
            {Object.values(LAWFUL_BASIS).map((b) => (
              <li key={b.code} className="rounded-lg border border-ink-200 bg-white px-3.5 py-3">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-[12.5px] font-medium text-ink-900">{b.display}</span>
                  {b.requiresConsentRecord ? (
                    <span className="chip-warn">Needs authorisation</span>
                  ) : (
                    <span className="chip-neutral">No authorisation required</span>
                  )}
                </div>
                <p className="mono-id mt-1">{b.legalRef}</p>
                <p className="mt-1 text-[11.5px] leading-relaxed text-ink-600">{b.note}</p>
              </li>
            ))}
          </ul>

          <div className="space-y-3">
            <Alert tone="neutral" title="What revocation actually does">
              <p>
                Revoking consent is not a cosmetic status change. It sets the record to revoked, marks any linked
                referral highly restricted, and causes attachment retrieval and further exchange to be refused with an
                explanation. The revocation itself is audit-logged with the reason and the acting user.
              </p>
            </Alert>

            <div className="rounded-xl border border-ink-200 bg-ink-50/70 px-3.5 py-3">
              <p className="section-label">Limits of this prototype</p>
              <p className="mt-1.5 text-[11.5px] leading-relaxed text-ink-600">
                The prototype records the basis and enforces access at the application boundary. A production deployment
                would additionally require: a signed authorisation retained as a document, a verification workflow for
                guardianship and attorney-in-fact claims, and integration with the facility&rsquo;s existing privacy
                office process.
              </p>
            </div>

            <div className="rounded-xl border border-ink-200 bg-ink-50/70 px-3.5 py-3">
              <p className="section-label">Emergency access</p>
              <p className="mt-1.5 text-[11.5px] leading-relaxed text-ink-600">
                An emergency transfer relies on the patient&rsquo;s vital interests under RA 10173 s.12(c) and does not
                require a prior authorisation step. The basis is recorded on the referral and visible to the receiving
                facility, so urgency never becomes an unrecorded exception.
              </p>
            </div>
          </div>
        </div>
      </Card>

      <p className="mt-5 text-[11px] leading-relaxed text-ink-400">
        Consent is one of six data-governance controls in HealthLink.{" "}
        <Link href="/audit" className="link">
          The audit trail
        </Link>{" "}
        records every access decision, including the ones that were refused.
      </p>
    </>
  );
}

function parseDataClasses(json: string | null): string[] {
  if (!json) return [];
  try {
    const v = JSON.parse(json);
    return Array.isArray(v) ? v.map(String) : [];
  } catch {
    return [];
  }
}

function describeFacilities(json: string | null): string {
  if (!json) return "Not restricted by facility";
  try {
    const v = JSON.parse(json);
    if (!Array.isArray(v) || v.length === 0) return "Not restricted by facility";
    return v.length === 1
      ? "A single facility record"
      : `Limited to ${v.length} facility record${v.length === 1 ? "" : "s"}`;
  } catch {
    return "Not restricted by facility";
  }
}

void IconArrowRight;
