import type { Metadata } from "next";
import { redirect } from "next/navigation";
import {
  getSession,
  PERMISSIONS,
  hasPermission,
  requirePageAccess,
} from "@/lib/auth";
import { dashboardStats, referralCounts } from "@/lib/referrals";
import { all } from "@/lib/db";
import { hoursBetween } from "@/lib/dialect";
import { STATES, type ReferralState } from "@/lib/workflow";
import { Card, PageHeader, StatusPill, Bar, MetricCell, MetricRow } from "@/components/ui";
import { PHCORE_IG } from "@/lib/fhir/terminology";
import { IconPrint, IconAlert } from "@/components/icons";

export const metadata: Metadata = { title: "Reports" };
export const dynamic = "force-dynamic";

/**
 * Process measures only.
 *
 * Chapter 1 is explicit that this study evaluates process outcomes -
 * completeness, timeliness, visibility, perceived coordination - and does not
 * claim clinical outcome improvement. Every metric here is therefore a
 * referral-process measure, and the page says so plainly.
 */
export default async function ReportsPage() {
  const session = await requirePageAccess(PERMISSIONS.REPORT_VIEW);

  const stats = await dashboardStats(session);
  const counts = await referralCounts(session);

  const crossFacility = session.role === "hie_admin" || session.role === "privacy_auditor";
  const facilityFilter = crossFacility ? "1 = 1" : "(r.referring_facility_id = ? OR r.receiving_facility_id = ?)";
  const facilityParams = crossFacility || !session.facilityId ? [] : [session.facilityId, session.facilityId];

  const completeness = (await all<{
    total: number;
    with_hpi: number;
    with_pe: number;
    with_obs: number;
    with_meds: number;
    with_allergies: number;
    with_attachments: number;
    with_consent: number;
  }>(
    `SELECT
       COUNT(*) AS total,
       SUM(CASE WHEN r.history_of_present IS NOT NULL AND TRIM(r.history_of_present) <> '' THEN 1 ELSE 0 END) AS with_hpi,
       SUM(CASE WHEN r.physical_examination IS NOT NULL AND TRIM(r.physical_examination) <> '' THEN 1 ELSE 0 END) AS with_pe,
       SUM(CASE WHEN (SELECT COUNT(*) FROM referral_observations o WHERE o.referral_id = r.id) > 0 THEN 1 ELSE 0 END) AS with_obs,
       SUM(CASE WHEN (SELECT COUNT(*) FROM referral_medications m WHERE m.referral_id = r.id) > 0 THEN 1 ELSE 0 END) AS with_meds,
       SUM(CASE WHEN (SELECT COUNT(*) FROM referral_allergies a WHERE a.referral_id = r.id) > 0 THEN 1 ELSE 0 END) AS with_allergies,
       SUM(CASE WHEN (SELECT COUNT(*) FROM referral_attachments t WHERE t.referral_id = r.id) > 0 THEN 1 ELSE 0 END) AS with_attachments,
       SUM(CASE WHEN c.status = 'active' THEN 1 ELSE 0 END) AS with_consent
     FROM referrals r
     LEFT JOIN consents c ON c.id = r.consent_id
     WHERE ${facilityFilter} AND r.deleted_at IS NULL AND r.status <> 'draft'`,
    ...facilityParams,
  ))[0];

  const byPriority = await all<{ priority: string; n: number }>(
    `SELECT r.priority, COUNT(*) AS n FROM referrals r
      WHERE ${facilityFilter} AND r.deleted_at IS NULL AND r.status <> 'draft'
      GROUP BY r.priority ORDER BY n DESC`,
    ...facilityParams,
  );

  const infoRequests = (await all<{ n: number }>(
    `SELECT COUNT(DISTINCT r.id) AS n FROM referrals r
       JOIN referral_events e ON e.referral_id = r.id
      WHERE ${facilityFilter} AND e.to_status = 'info-requested'`,
    ...facilityParams,
  ))[0]?.n ?? 0;

  const nonDraft =
    (await all<{ n: number }>(
      `SELECT COUNT(*) AS n FROM referrals r WHERE ${facilityFilter} AND r.deleted_at IS NULL AND r.status <> 'draft'`,
      ...facilityParams,
    ))[0]?.n ?? 0;

  const turnaroundRows = await all<{ hours: number }>(
    `SELECT ${hoursBetween("r.routed_at", "r.closed_at")} AS hours
       FROM referrals r
      WHERE ${facilityFilter} AND r.closed_at IS NOT NULL AND r.routed_at IS NOT NULL`,
    ...facilityParams,
  );

  const turnaround = turnaroundRows
    .map((x) => x.hours)
    .filter((h) => Number.isFinite(h) && h >= 0)
    .sort((a, b) => a - b);

  const pct = (n: number, d: number) => (d ? Math.round((n / d) * 100) : 0);

  const completenessRows = [
    { label: "History of present illness", n: completeness?.with_hpi ?? 0 },
    { label: "Physical examination", n: completeness?.with_pe ?? 0 },
    { label: "Objective findings", n: completeness?.with_obs ?? 0, sub: "Vitals or results" },
    { label: "Medication history", n: completeness?.with_meds ?? 0 },
    { label: "Allergy history", n: completeness?.with_allergies ?? 0 },
    { label: "Supporting document", n: completeness?.with_attachments ?? 0 },
    { label: "Active consent on file", n: completeness?.with_consent ?? 0 },
  ];

  const validation = (await all<{ errors: number; warnings: number; n: number }>(
    `SELECT SUM(r.fhir_validation_errors) AS errors, SUM(r.fhir_validation_warnings) AS warnings, COUNT(*) AS n
       FROM referrals r WHERE ${facilityFilter} AND r.deleted_at IS NULL AND r.status <> 'draft'`,
    ...facilityParams,
  ))[0];

  const infoRate = pct(infoRequests, nonDraft);

  return (
    <>
      <PageHeader
        title="Referral process report"
        subtitle="How referrals move: completeness, timeliness and visibility. Clinical outcomes are outside the scope of this concept study."
        actions={
          <a href="/print/report" className="btn-secondary btn-sm" target="_blank" rel="noreferrer">
            <IconPrint className="h-3.5 w-3.5" />
            Printable version
          </a>
        }
      />

      <MetricRow>
        <MetricCell label="Referrals routed" value={nonDraft} hint="Excludes drafts" />
        <MetricCell
          label="Loop closed"
          value={`${stats.closedLoopRate}%`}
          hint="Of referrals that reached completion"
          tone={stats.closedLoopRate >= 80 ? "positive" : stats.closedLoopRate >= 50 ? "warn" : "default"}
        />
        <MetricCell
          label="Median time to close"
          value={stats.medianTurnaroundHours != null ? `${stats.medianTurnaroundHours}h` : "—"}
          hint="Routing to feedback returned"
        />
        <MetricCell
          label="Returned for information"
          value={`${infoRate}%`}
          hint={`${infoRequests} referral${infoRequests === 1 ? "" : "s"}`}
          tone={infoRate > 25 ? "warn" : "default"}
        />
      </MetricRow>

      <div className="mt-5 grid gap-5 lg:grid-cols-2">
        {/* ---------------- Completeness ---------------- */}
        <Card
          title="Clinical summary completeness"
          description="How often each element was present when the referral was routed. Low completeness is the root cause of the information-request loop, so this is the measure most directly tied to the study problem."
          divided
        >
          <ul className="space-y-3.5">
            {completenessRows.map((r) => {
              const value = pct(r.n, completeness?.total ?? 0);
              const tone = value >= 80 ? "brand" : value >= 50 ? "amber" : "red";
              return (
                <li key={r.label}>
                  <div className="flex items-baseline justify-between gap-3">
                    <span className="text-[12.5px] text-ink-700">
                      {r.label}
                      {r.sub && <span className="ml-1.5 text-[11px] text-ink-400">{r.sub}</span>}
                    </span>
                    <span className="shrink-0 text-[12.5px] font-semibold tabular-nums text-ink-800">
                      {value}%
                      <span className="ml-1.5 font-normal text-ink-400">({r.n})</span>
                    </span>
                  </div>
                  <div className="mt-1.5">
                    <Bar value={value} tone={tone} />
                  </div>
                </li>
              );
            })}
          </ul>
          <p className="mt-4 border-t border-ink-200/80 pt-3 text-[10.5px] text-ink-400">
            Denominator: {completeness?.total ?? 0} routed referral{completeness?.total === 1 ? "" : "s"} in scope.
          </p>
        </Card>

        {/* ---------------- Workflow ---------------- */}
        <Card title="Workflow distribution" description="Where referrals currently sit." divided>
          <ul className="space-y-3">
            {counts
              .slice()
              .sort(
                (a, b) =>
                  (STATES[a.status as ReferralState]?.phase ?? 9) - (STATES[b.status as ReferralState]?.phase ?? 9),
              )
              .map((c) => {
                const def = STATES[c.status as ReferralState];
                const max = Math.max(...counts.map((x) => x.n), 1);
                const tone =
                  def?.tone === "critical" ? "red" : def?.tone === "warn" ? "amber" : def?.tone === "positive" ? "brand" : "ink";
                return (
                  <li key={c.status}>
                    <div className="flex items-center justify-between gap-3">
                      <StatusPill status={c.status} />
                      <span className="shrink-0 text-[12.5px] font-semibold tabular-nums text-ink-800">{c.n}</span>
                    </div>
                    <div className="mt-1.5">
                      <Bar value={(c.n / max) * 100} tone={tone} />
                    </div>
                  </li>
                );
              })}
            {counts.length === 0 && <li className="text-[12.5px] text-ink-500">No referrals in scope.</li>}
          </ul>
        </Card>

        {/* ---------------- Timeliness ---------------- */}
        <Card title="Timeliness" divided>
          <dl className="space-y-4">
            <div className="flex items-baseline justify-between gap-3">
              <dt className="text-[12.5px] text-ink-500">Average time to accept</dt>
              <dd className="text-[17px] font-semibold tabular-nums text-ink-900">
                {stats.avgTimeToAcceptHours != null ? `${stats.avgTimeToAcceptHours}h` : "—"}
              </dd>
            </div>
            <div className="flex items-baseline justify-between gap-3">
              <dt className="text-[12.5px] text-ink-500">Median time to close the loop</dt>
              <dd className="text-[17px] font-semibold tabular-nums text-ink-900">
                {stats.medianTurnaroundHours != null ? `${stats.medianTurnaroundHours}h` : "—"}
              </dd>
            </div>
            {turnaround.length > 1 && (
              <div className="grid grid-cols-3 gap-3 border-t border-ink-200/80 pt-4">
                {(
                  [
                    ["Fastest", turnaround[0]],
                    ["Median", turnaround[Math.floor(turnaround.length / 2)]],
                    ["Slowest", turnaround[turnaround.length - 1]],
                  ] as const
                ).map(([label, v]) => (
                  <div key={label}>
                    <dt className="section-label">{label}</dt>
                    <dd className="mt-0.5 text-[14px] font-medium tabular-nums text-ink-800">
                      {Math.round(v)}h
                    </dd>
                  </div>
                ))}
              </div>
            )}
            <div className="flex items-baseline justify-between gap-3 border-t border-ink-200/80 pt-4">
              <dt className="text-[12.5px] text-ink-500">
                Overdue now
                <span className="mt-0.5 block text-[10.5px] text-ink-400">
                  Past the expected window for their current state
                </span>
              </dt>
              <dd
                className={`text-[17px] font-semibold tabular-nums ${
                  stats.overdueCount ? "text-red-600" : "text-brand-600"
                }`}
              >
                {stats.overdueCount}
              </dd>
            </div>
          </dl>
        </Card>

        {/* ---------------- Urgency and reasons ---------------- */}
        <Card title="Urgency and reasons" divided>
          <div className="mb-5">
            <p className="section-label mb-2.5">By priority</p>
            <ul className="space-y-2">
              {byPriority.map((p) => (
                <li key={p.priority} className="flex items-center justify-between gap-3">
                  <span className="text-[12.5px] capitalize text-ink-700">{p.priority}</span>
                  <span className="text-[12.5px] font-semibold tabular-nums text-ink-800">
                    {p.n} <span className="font-normal text-ink-400">({pct(p.n, nonDraft)}%)</span>
                  </span>
                </li>
              ))}
              {byPriority.length === 0 && <li className="text-[12.5px] text-ink-500">No data.</li>}
            </ul>
          </div>
          <div className="border-t border-ink-200/80 pt-4">
            <p className="section-label mb-2.5">Most common reasons</p>
            <ul className="space-y-2">
              {stats.topReasonCodes.map((r, i) => (
                <li key={r.reason} className="flex items-start gap-2.5">
                  <span className="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded bg-ink-100 text-[9.5px] font-semibold text-ink-500">
                    {i + 1}
                  </span>
                  <span className="min-w-0 flex-1 text-[12px] leading-snug text-ink-700">{r.reason}</span>
                  <span className="shrink-0 text-[12px] font-semibold tabular-nums text-ink-800">{r.count}</span>
                </li>
              ))}
              {stats.topReasonCodes.length === 0 && <li className="text-[12.5px] text-ink-500">No data.</li>}
            </ul>
          </div>
        </Card>

        {/* ---------------- Interoperability ---------------- */}
        <Card title="Interoperability" description="Validation outcomes and the alignment target." divided>
          <dl className="space-y-3.5">
            <div className="flex items-center justify-between gap-3">
              <dt className="text-[12.5px] text-ink-500">Referrals validated</dt>
              <dd className="text-[13px] font-semibold tabular-nums text-ink-800">{validation?.n ?? 0}</dd>
            </div>
            <div className="flex items-center justify-between gap-3">
              <dt className="text-[12.5px] text-ink-500">Validation errors</dt>
              <dd
                className={`text-[13px] font-semibold tabular-nums ${
                  (validation?.errors ?? 0) > 0 ? "text-red-600" : "text-brand-600"
                }`}
              >
                {validation?.errors ?? 0}
              </dd>
            </div>
            <div className="flex items-center justify-between gap-3">
              <dt className="text-[12.5px] text-ink-500">Advisory warnings</dt>
              <dd
                className={`text-[13px] font-semibold tabular-nums ${
                  (validation?.warnings ?? 0) > 0 ? "text-amber-600" : "text-ink-800"
                }`}
              >
                {validation?.warnings ?? 0}
              </dd>
            </div>
            <div className="flex items-center justify-between gap-3 border-t border-ink-200/80 pt-3.5">
              <dt className="text-[12.5px] text-ink-500">Alignment target</dt>
              <dd className="mono-id">
                {PHCORE_IG.package}#{PHCORE_IG.version}
              </dd>
            </div>
          </dl>
          <p className="mt-4 border-t border-ink-200/80 pt-3 text-[10.5px] leading-relaxed text-ink-400">
            Warnings are expected where a code falls outside the bundled terminology subset. The national value sets are
            still in draft, so these are reported for review rather than treated as failures.
          </p>
        </Card>

        {/* ---------------- Destinations ---------------- */}
        <Card title="Referral destinations" description="Where referrals are being sent." divided>
          <ul className="space-y-3">
            {stats.topReceivingFacilities.map((f) => (
              <li key={f.name}>
                <div className="flex items-start justify-between gap-3">
                  <span className="min-w-0 text-[12px] leading-snug text-ink-700">{f.name}</span>
                  <span className="shrink-0 text-[12px] font-semibold tabular-nums text-ink-800">
                    {f.count} <span className="font-normal text-ink-400">({pct(f.count, nonDraft)}%)</span>
                  </span>
                </div>
                <div className="mt-1.5">
                  <Bar value={(f.count / Math.max(stats.topReceivingFacilities[0].count, 1)) * 100} tone="brand" />
                </div>
              </li>
            ))}
            {stats.topReceivingFacilities.length === 0 && (
              <li className="text-[12.5px] text-ink-500">No data.</li>
            )}
          </ul>
        </Card>
      </div>

      {/* ---------------- Limitations ---------------- */}
      <Card
        title={
          <span className="flex items-center gap-1.5">
            <IconAlert className="h-3.5 w-3.5 text-amber-500" />
            <span className="card-title">Limitations of these measures</span>
          </span>
        }
        className="mt-5"
        divided
      >
        <ul className="space-y-3">
          {[
            {
              label: "These are process measures",
              text:
                "They describe how referrals move, not whether patients fared better. Chapter 1 states that clinical outcome claims require a separate implementation study.",
            },
            {
              label: "The figures come from synthetic data",
              text:
                "They illustrate the reporting capability. They are not findings about Davao City referral practice.",
            },
            {
              label: "Turnaround assumes consistent timestamps",
              text:
                "It is measured from routing to loop closure. A real deployment would need to validate timestamp discipline with each facility before relying on it.",
            },
            {
              label: "Completeness measures presence, not quality",
              text:
                "It records whether an element was entered, not whether what was entered was clinically adequate. Judging adequacy requires clinician review.",
            },
          ].map((l) => (
            <li key={l.label} className="flex gap-3">
              <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-amber-400" aria-hidden="true" />
              <div>
                <p className="text-[12.5px] font-medium text-ink-900">{l.label}</p>
                <p className="mt-0.5 text-[11.5px] leading-relaxed text-ink-600">{l.text}</p>
              </div>
            </li>
          ))}
        </ul>
      </Card>
    </>
  );
}
