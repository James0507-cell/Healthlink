import type { Metadata } from "next";
import { redirect } from "next/navigation";
import {
  getSession,
  PERMISSIONS,
  hasPermission,
  requirePageSession,
} from "@/lib/auth";
import { all, get, getSetting } from "@/lib/db";
import { verifyAuditChain } from "@/lib/db";
import { Card, PageHeader, Alert, Fact, formatDateTime, formatBytes } from "@/components/ui";
import { PHCORE_IG } from "@/lib/fhir/terminology";
import { IconShield, IconClock, IconServer, IconAlert } from "@/components/icons";

export const metadata: Metadata = { title: "Settings" };
export const dynamic = "force-dynamic";

/**
 * Data governance and configuration.
 *
 * Kept as one page rather than a governance section in the sidebar. Everything
 * here is something an administrator sets once and revisits rarely, which is
 * precisely why it should not occupy primary navigation.
 */
export default async function GovernancePage() {
  const session = await requirePageSession();
  // The narrower of the two permissions is sufficient to view this page.
  if (!hasPermission(session, PERMISSIONS.CONFIG_MANAGE) && !hasPermission(session, PERMISSIONS.RETENTION_MANAGE)) redirect("/dashboard");

  const chain = verifyAuditChain();

  const attachmentStats = get<{ n: number; bytes: number; oldest: string | null }>(
    "SELECT COUNT(*) AS n, COALESCE(SUM(size_bytes),0) AS bytes, MIN(created_at) AS oldest FROM referral_attachments",
  );

  const recordStats = {
    patients: get<{ n: number }>("SELECT COUNT(*) AS n FROM patients WHERE merged_into IS NULL")?.n ?? 0,
    referrals: get<{ n: number }>("SELECT COUNT(*) AS n FROM referrals WHERE deleted_at IS NULL")?.n ?? 0,
    consents: get<{ n: number }>("SELECT COUNT(*) AS n FROM consents")?.n ?? 0,
    auditEvents: get<{ n: number }>("SELECT COUNT(*) AS n FROM audit_events")?.n ?? 0,
    fhirResources: get<{ n: number }>("SELECT COUNT(*) AS n FROM fhir_resources")?.n ?? 0,
    sessions: get<{ n: number }>("SELECT COUNT(*) AS n FROM sessions WHERE revoked_at IS NULL AND expires_at > ?", new Date().toISOString())?.n ?? 0,
  };

  const retentionYears = getSetting("retention.default_years", "7");
  const attachmentMonths = getSetting("retention.attachments_months", "84");
  const accessTtl = getSetting("access.default_ttl_hours", "24");
  const seededAt = getSetting("system.seeded_at", "");

  // Records approaching or past their retention date.
  const dueForReview = all<{ id: string; referral_number: string; retention_until: string }>(
    `SELECT id, referral_number, retention_until FROM referrals
      WHERE deleted_at IS NULL AND retention_until IS NOT NULL
      ORDER BY retention_until ASC LIMIT 5`,
  );

  const securityEvents = all<{ event_type: string; n: number }>(
    `SELECT event_type, COUNT(*) AS n FROM audit_events
      WHERE outcome <> '0' GROUP BY event_type ORDER BY n DESC LIMIT 6`,
  );

  const failedLogins = all<{ n: number }>(
    "SELECT COUNT(*) AS n FROM audit_events WHERE event_type = 'login' AND outcome <> '0' AND occurred_at > ?",
    new Date(Date.now() - 30 * 86_400_000).toISOString(),
  )[0]?.n ?? 0;

  const deniedAccess = all<{ n: number }>(
    `SELECT COUNT(*) AS n FROM audit_events
      WHERE event_subtype IN ('facade-scope-denied','authorisation-denied','attachment-denied','bundle-export-denied')
        AND occurred_at > ?`,
    new Date(Date.now() - 30 * 86_400_000).toISOString(),
  )[0]?.n ?? 0;

  return (
    <>
      <PageHeader
        title="Data governance and settings"
        subtitle="Retention, data volumes, audit integrity and security signals for this HealthLink environment."
      />

      {/* ---------------- Attention ---------------- */}
      {(!chain.intact || failedLogins > 0 || deniedAccess > 0) && (
        <div className="mb-5 space-y-2.5">
          {!chain.intact && (
            <Alert tone="critical" title={`Audit integrity check failed at record ${chain.brokenAt}`}>
              {chain.reason}. The audit log has been modified outside the application or corrupted. In a production
              deployment this would trigger a privacy incident process.
            </Alert>
          )}
          {failedLogins > 0 && (
            <Alert tone="warn" title={`${failedLogins} failed sign-in attempt(s) in the last 30 days`}>
              Accounts lock for 15 minutes after five consecutive failures. Review the audit trail for patterns.
            </Alert>
          )}
          {deniedAccess > 0 && (
            <Alert tone="info" title={`${deniedAccess} blocked access attempt(s) in the last 30 days`}>
              These were refused by facility scoping, role permissions or the consent gate. Blocked attempts are
              recorded rather than discarded, because a repeated pattern matters for accountability.
            </Alert>
          )}
        </div>
      )}

      {/* ---------------- Data volumes ---------------- */}
      <div className="mb-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <Card title="Data held" divided>
          <dl className="space-y-2.5">
            <Row label="Patients" value={recordStats.patients} />
            <Row label="Referrals" value={recordStats.referrals} />
            <Row label="Consent records" value={recordStats.consents} />
            <Row label="FHIR resources" value={recordStats.fhirResources} />
            <Row label="Audit events" value={recordStats.auditEvents} />
            <Row label="Active sessions" value={recordStats.sessions} />
          </dl>
        </Card>

        <Card title="Audit integrity" divided>
          <div className="mb-3.5 flex items-center gap-2.5">
            <span
              className={`flex h-8 w-8 items-center justify-center rounded-lg ${
                chain.intact ? "bg-brand-50 text-brand-600" : "bg-red-50 text-red-600"
              }`}
            >
              <IconShield className="h-4 w-4" />
            </span>
            <div>
              <p className="text-[13px] font-medium text-ink-900">
                {chain.intact ? "Chain intact" : "Chain broken"}
              </p>
              <p className="text-[11px] text-ink-500">{chain.checked} record(s) verified</p>
            </div>
          </div>
          <p className="text-[11.5px] leading-relaxed text-ink-600">
            Each record stores a SHA-256 hash over its own content plus the previous record&rsquo;s hash. Altering or
            deleting any record breaks the chain, making tampering detectable rather than merely prohibited.
          </p>
          <p className="mt-3 border-t border-ink-200/80 pt-3 text-[11px] leading-relaxed text-ink-500">
            This makes modification <span className="font-medium">detectable</span>. It does not prevent someone with
            database access from rewriting the whole chain. A production deployment would append to write-once storage
            or an external log service.
          </p>
        </Card>

        <Card title="Retention policy" divided>
          <dl className="space-y-3.5">
            <Fact label="Clinical records">{retentionYears} years from creation</Fact>
            <Fact label="Attachments">{attachmentMonths} months</Fact>
            <Fact label="Access grants">Expire after {accessTtl} hours by default</Fact>
            <Fact label="Documents held">
              {attachmentStats?.n ?? 0} file{attachmentStats?.n === 1 ? "" : "s"} ·{" "}
              {formatBytes(attachmentStats?.bytes ?? 0)}
              {attachmentStats?.oldest && (
                <span className="mt-0.5 block text-ink-500">oldest attached {formatDateTime(attachmentStats.oldest)}</span>
              )}
            </Fact>
          </dl>
        </Card>
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        {/* ---------------- Retention schedule ---------------- */}
        <Card
          title="Retention schedule"
          description="The five referrals due for disposition soonest."
          divided
        >
          <ul className="divide-y divide-ink-100">
            {dueForReview.map((r) => {
              const overdue = r.retention_until && new Date(r.retention_until) < new Date();
              return (
                <li key={r.id} className="flex items-center justify-between gap-3 py-2.5">
                  <span className="mono-id">{r.referral_number}</span>
                  <span className={`text-[11.5px] ${overdue ? "font-medium text-amber-700" : "text-ink-600"}`}>
                    {formatDateTime(r.retention_until)}
                  </span>
                </li>
              );
            })}
            {dueForReview.length === 0 && (
              <li className="py-4 text-[12px] text-ink-500">No referrals carry a retention date.</li>
            )}
          </ul>
          <p className="mt-3 border-t border-ink-200/80 pt-3 text-[11px] leading-relaxed text-ink-500">
            A retention sweep would purge attachments and anonymise clinical content past its period while preserving
            the referral skeleton and the audit trail. In this demonstration environment the dates sit in the future so
            nothing is swept.
          </p>
        </Card>

        {/* ---------------- Security signals ---------------- */}
        <Card title="Security signals" description="Non-success outcomes in the last 30 days." divided>
          {securityEvents.length === 0 ? (
            <div className="rounded-lg border border-dashed border-ink-200 bg-ink-50/50 px-3 py-6 text-center">
              <p className="text-[12px] text-ink-500">No non-success events recorded.</p>
            </div>
          ) : (
            <ul className="space-y-2.5">
              {securityEvents.map((e) => (
                <li key={e.event_type} className="flex items-center justify-between gap-3">
                  <span className="text-[12px] capitalize text-ink-700">{e.event_type.replace(/_/g, " ")}</span>
                  <span className="text-[12px] font-semibold tabular-nums text-ink-800">{e.n}</span>
                </li>
              ))}
            </ul>
          )}
        </Card>

        {/* ---------------- Environment ---------------- */}
        <Card title="Environment" divided>
          <dl className="space-y-3.5">
            <Fact label="Build">Demonstration / concept evaluation</Fact>
            <Fact label="Data">Synthetic only — no real patient or provider records</Fact>
            <Fact label="Initialised">{seededAt ? formatDateTime(seededAt) : "unknown"}</Fact>
            <Fact label="FHIR release">
              {PHCORE_IG.fhirVersion}
              <span className="mono-id mt-0.5 block">
                {PHCORE_IG.package}#{PHCORE_IG.version}
              </span>
            </Fact>
            <Fact label="FHIR facade">Read and search only; writes refused with an OperationOutcome</Fact>
          </dl>
        </Card>

        {/* ---------------- Cost of controls ---------------- */}
        <Card title="Trade-offs we accepted" divided>
          <ul className="space-y-3">
            {[
              {
                icon: <IconServer className="h-3.5 w-3.5" />,
                label: "The FHIR facade is read-only",
                text:
                  "Referrals are written through the application so consent, validation and attribution cannot be bypassed by a direct FHIR write. The cost is that a facility cannot push a referral in with a single POST.",
              },
              {
                icon: <IconClock className="h-3.5 w-3.5" />,
                label: "Blocked access is logged, not silently dropped",
                text:
                  "Refusals produce audit records, which grows the log. The alternative is losing the pattern that matters most to a privacy officer.",
              },
              {
                icon: <IconAlert className="h-3.5 w-3.5" />,
                label: "Unknown terminology warns rather than fails",
                text:
                  "Rejecting a valid code would block patient care. A warning keeps the referral moving while making the gap visible for review.",
              },
              {
                icon: <IconShield className="h-3.5 w-3.5" />,
                label: "Auditors cannot read attachments",
                text:
                  "Oversight is read-only and excludes document content, so an oversight role never becomes a route to clinical detail.",
              },
            ].map((t) => (
              <li key={t.label} className="flex gap-3">
                <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-ink-100 text-ink-500">
                  {t.icon}
                </span>
                <div>
                  <p className="text-[12.5px] font-medium text-ink-900">{t.label}</p>
                  <p className="mt-0.5 text-[11.5px] leading-relaxed text-ink-600">{t.text}</p>
                </div>
              </li>
            ))}
          </ul>
        </Card>
      </div>
    </>
  );
}

function Row({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <dt className="text-[12px] text-ink-500">{label}</dt>
      <dd className="text-[13.5px] font-semibold tabular-nums text-ink-900">{value}</dd>
    </div>
  );
}
