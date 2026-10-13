import type { Metadata } from "next";
import Link from "next/link";
import {
  getSession,
  ROLE_LABELS,
  PERMISSIONS,
  hasPermission,
  requirePageSession,
} from "@/lib/auth";
import { dashboardStats, listReferrals, referralCounts } from "@/lib/referrals";
import { STATES, slaStatus, PRIORITY_RANK, type ReferralState } from "@/lib/workflow";
import {
  Card,
  EmptyState,
  PageHeader,
  StatusPill,
  PriorityPill,
  MetricCell,
  MetricRow,
  relativeTime,
  formatDateTime,
  firstName,
  computeAge,
  Alert,
} from "@/components/ui";
import {
  IconArrowRight,
  IconClock,
  IconRoute,
  IconPulse,
  IconCheck,
  IconAlert,
  IconInbox,
  IconPlus,
} from "@/components/icons";

export const metadata: Metadata = { title: "Dashboard" };
export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const session = await requirePageSession();
  const stats = await dashboardStats(session);
  const counts = await referralCounts(session);
  const isAuditor = session.role === "privacy_auditor";

  // Work that is genuinely waiting on this user's facility, most urgent first.
  const awaiting = (await listReferrals(session, { side: "all", limit: 30, includeDrafts: false })).rows
    .filter((r) => {
      const def = STATES[r.status as ReferralState];
      if (!def || def.isTerminal || def.awaiting === "none") return false;
      if (isAuditor) return true;
      if (session.role === "hie_admin") return true;
      return def.awaiting === "referring"
        ? r.referring_facility_id === session.facilityId
        : r.receiving_facility_id === session.facilityId;
    })
    .sort((a, b) => {
      const pa = PRIORITY_RANK[a.priority] ?? 9;
      const pb = PRIORITY_RANK[b.priority] ?? 9;
      if (pa !== pb) return pa - pb;
      return new Date(a.status_updated_at).getTime() - new Date(b.status_updated_at).getTime();
    });

  const recent = (await listReferrals(session, { side: "all", limit: 6, includeDrafts: false })).rows;
  const overdue = awaiting.filter((r) => slaStatus(r.status as ReferralState, r.status_updated_at).overdue);

  // Referrals received vs sent, for the at-a-glance split.
  const receivedCount = session.facilityId
    ? (await listReferrals(session, { side: "receiving", limit: 1, includeDrafts: false })).total
    : 0;
  const sentCount = session.facilityId
    ? (await listReferrals(session, { side: "referring", limit: 1, includeDrafts: false })).total
    : 0;

  return (
    <>
      <PageHeader
        title={`Good day, ${firstName(session.fullName)}`}
        subtitle={
          <span className="flex flex-wrap items-center gap-1.5">
            <span className="font-medium text-ink-700">{ROLE_LABELS[session.role]}</span>
            {session.facilityName && (
              <>
                <span className="text-ink-300">·</span>
                <span>{session.facilityName}</span>
              </>
            )}
          </span>
        }
      />

      {/* ---------------- Overdue banner ---------------- */}
      {overdue.length > 0 && (
        <Alert
          tone="warn"
          title={`${overdue.length} referral${overdue.length === 1 ? "" : "s"} past the expected response window`}
          className="mb-5"
          action={
            <Link href="/referrals" className="btn-secondary btn-sm">
              Review
            </Link>
          }
        >
          <p>
            The oldest is <span className="font-medium">{overdue[0].referral_number}</span> (
            {overdue[0].patient_name}), last updated {relativeTime(overdue[0].status_updated_at)}.
          </p>
        </Alert>
      )}

      {/* ---------------- Metrics ---------------- */}
      <MetricRow>
        <MetricCell
          label="Waiting on your facility"
          value={awaiting.length}
          hint={awaiting.length ? "Oldest first in the queue below" : "Nothing outstanding"}
          tone={awaiting.length > 0 ? "warn" : "positive"}
        />
        <MetricCell
          label="Active referrals"
          value={stats.activeReferrals}
          hint="In the workflow right now"
        />
        <MetricCell
          label="Loop closed"
          value={`${stats.closedLoopRate}%`}
          hint={`${stats.completedThisMonth} completed this month`}
          tone={stats.closedLoopRate >= 80 ? "positive" : stats.closedLoopRate >= 50 ? "warn" : "default"}
        />
        <MetricCell
          label="Median time to close"
          value={stats.medianTurnaroundHours != null ? `${stats.medianTurnaroundHours}h` : "—"}
          hint="From routing to feedback returned"
        />
      </MetricRow>

      <div className="mt-5 grid gap-5 xl:grid-cols-[1.65fr_1fr]">
        {/* ================= Left column ================= */}
        <div className="min-w-0 space-y-5">
          {/* ---------------- Worklist ---------------- */}
          <Card
            title="Waiting on your facility"
            description={
              awaiting.length > 0
                ? "Ordered by clinical urgency, then by how long each has been waiting."
                : undefined
            }
            actions={
              <Link href="/referrals" className="btn-ghost btn-sm">
                All referrals
                <IconArrowRight className="h-3.5 w-3.5" />
              </Link>
            }
            bodyClassName=""
            divided
          >
            {awaiting.length === 0 ? (
              <div className="px-4 pb-4 pt-1">
                <EmptyState
                  icon={<IconCheck className="h-5 w-5 text-brand-600" />}
                  title="Nothing is waiting on you"
                  description="Referrals needing an action from your facility will appear here."
                />
              </div>
            ) : (
              <ul className="divide-y divide-ink-100">
                {awaiting.slice(0, 7).map((r) => {
                  const sla = slaStatus(r.status as ReferralState, r.status_updated_at);
                  const def = STATES[r.status as ReferralState];
                  return (
                    <li key={r.id}>
                      <Link
                        href={`/referrals/${r.id}`}
                        className="group flex items-center gap-4 px-4 py-3 transition-colors hover:bg-ink-50/70"
                      >
                        {/* Urgency rail */}
                        <span
                          className={`h-9 w-1 shrink-0 rounded-full ${
                            r.priority === "stat"
                              ? "bg-red-500"
                              : r.priority === "urgent" || r.priority === "asap"
                                ? "bg-amber-400"
                                : "bg-ink-200"
                          }`}
                          aria-hidden="true"
                        />

                        <span className="min-w-0 flex-1">
                          <span className="flex flex-wrap items-center gap-2">
                            <span className="text-[13.5px] font-medium text-ink-900">{r.patient_name}</span>
                            <span className="mono-id">{r.referral_number}</span>
                          </span>
                          <span className="mt-0.5 block truncate text-[12px] text-ink-500">
                            {r.reason_display} · {def?.awaiting === "referring" ? "needs the referring provider" : "needs the receiving facility"}
                          </span>
                        </span>

                        <span className="hidden shrink-0 flex-col items-end gap-1 sm:flex">
                          <StatusPill status={r.status} />
                          <span
                            className={`text-[10.5px] ${sla.overdue ? "font-medium text-red-600" : "text-ink-400"}`}
                          >
                            {sla.overdue && sla.target
                              ? `${Math.round(sla.hoursElapsed)}h · overdue`
                              : `${relativeTime(r.status_updated_at)}`}
                          </span>
                        </span>

                        <IconArrowRight className="h-4 w-4 shrink-0 text-ink-300 transition-transform group-hover:translate-x-0.5 group-hover:text-ink-500" />
                      </Link>
                    </li>
                  );
                })}
              </ul>
            )}

            {awaiting.length > 7 && (
              <div className="border-t border-ink-200/80 px-4 py-2.5">
                <Link href="/referrals" className="text-[12px] font-medium text-brand-700 hover:underline">
                  {awaiting.length - 7} more waiting
                </Link>
              </div>
            )}
          </Card>

          {/* ---------------- Recently updated ---------------- */}
          <Card
            title="Recently updated"
            actions={
              <Link href="/referrals" className="btn-ghost btn-sm">
                View all
              </Link>
            }
            bodyClassName=""
            divided
          >
            {recent.length === 0 ? (
              <div className="px-4 pb-4 pt-1">
                <EmptyState title="No referrals yet" description="Referrals your facility creates or receives will appear here." />
              </div>
            ) : (
              <ul className="divide-y divide-ink-100">
                {recent.map((r) => (
                  <li key={r.id}>
                    <Link
                      href={`/referrals/${r.id}`}
                      className="flex items-center gap-4 px-4 py-3 transition-colors hover:bg-ink-50/70"
                    >
                      <span className="min-w-0 flex-1">
                        <span className="flex items-center gap-2">
                          <span className="text-[13px] font-medium text-ink-900">{r.patient_name}</span>
                          <PriorityPill priority={r.priority} />
                        </span>
                        <span className="mono-id mt-0.5 block">{r.referral_number}</span>
                      </span>

                      {/* Routing, rendered as an explicit direction */}
                      <span className="hidden min-w-0 items-center gap-1.5 text-[11px] text-ink-500 lg:flex">
                        <span className="max-w-[8rem] truncate">{r.referring_facility_name}</span>
                        <IconArrowRight className="h-3 w-3 shrink-0 text-ink-300" />
                        <span className="max-w-[8rem] truncate">{r.receiving_facility_name}</span>
                      </span>

                      <span className="shrink-0">
                        <StatusPill status={r.status} />
                      </span>
                      <span className="hidden w-16 shrink-0 text-right text-[10.5px] text-ink-400 sm:block">
                        {relativeTime(r.updated_at)}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>

        {/* ================= Right rail ================= */}
        <div className="space-y-5">
          {/* ---------------- Pipeline ---------------- */}
          <Card title="Referral pipeline" description="Where referrals are in the workflow right now." divided>
            {counts.length === 0 ? (
              <p className="text-[13px] text-ink-500">No referrals in scope.</p>
            ) : (
              <ul className="space-y-2.5">
                {counts
                  .slice()
                  .sort(
                    (a, b) =>
                      (STATES[a.status as ReferralState]?.phase ?? 9) -
                      (STATES[b.status as ReferralState]?.phase ?? 9),
                  )
                  .map((c) => {
                    const def = STATES[c.status as ReferralState];
                    const max = Math.max(...counts.map((x) => x.n), 1);
                    const pct = Math.max((c.n / max) * 100, 3);
                    const barTone =
                      def?.tone === "critical"
                        ? "bg-red-400"
                        : def?.tone === "warn"
                          ? "bg-amber-400"
                          : def?.tone === "positive"
                            ? "bg-brand-500"
                            : "bg-ink-300";
                    return (
                      <li key={c.status}>
                        <Link
                          href={`/referrals?status=${c.status}`}
                          className="group block rounded-lg px-1.5 py-1 transition-colors hover:bg-ink-50"
                        >
                          <div className="flex items-center justify-between gap-2">
                            <span className="text-[12px] text-ink-600 group-hover:text-ink-900">
                              {def?.label ?? c.status}
                            </span>
                            <span className="text-[12.5px] font-semibold tabular-nums text-ink-800">{c.n}</span>
                          </div>
                          <div className="mt-1.5 h-1 overflow-hidden rounded-full bg-ink-100">
                            <div className={`h-full rounded-full ${barTone}`} style={{ width: `${pct}%` }} />
                          </div>
                        </Link>
                      </li>
                    );
                  })}
              </ul>
            )}
          </Card>

          {/* ---------------- Throughput ---------------- */}
          <Card title="Throughput" divided>
            <dl className="space-y-3.5">
              <Row
                icon={<IconClock className="h-3.5 w-3.5" />}
                label="Average time to accept"
                value={stats.avgTimeToAcceptHours != null ? `${stats.avgTimeToAcceptHours}h` : "—"}
              />
              <Row
                icon={<IconPulse className="h-3.5 w-3.5" />}
                label="Median time to close"
                value={stats.medianTurnaroundHours != null ? `${stats.medianTurnaroundHours}h` : "—"}
              />
              <Row
                icon={<IconAlert className="h-3.5 w-3.5" />}
                label="Overdue now"
                value={String(stats.overdueCount)}
                tone={stats.overdueCount > 0 ? "critical" : "positive"}
              />
              <Row
                icon={<IconRoute className="h-3.5 w-3.5" />}
                label="Total referrals"
                value={String(stats.totalReferrals)}
              />
              {session.facilityId && (
                <>
                  <Row label="Received" value={String(receivedCount)} muted />
                  <Row label="Sent" value={String(sentCount)} muted />
                </>
              )}
            </dl>
            <p className="mt-4 border-t border-ink-200/80 pt-3 text-[10.5px] leading-relaxed text-ink-400">
              Process measures only. This study does not claim clinical outcome improvement.
            </p>
          </Card>

          {/* ---------------- Referral reasons ---------------- */}
          {stats.topReasonCodes.length > 0 && (
            <Card title="Most common reasons" divided>
              <ul className="space-y-2.5">
                {stats.topReasonCodes.map((r, i) => (
                  <li key={r.reason} className="flex items-start gap-2.5">
                    <span className="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded bg-ink-100 text-[9.5px] font-semibold text-ink-500">
                      {i + 1}
                    </span>
                    <span className="min-w-0 flex-1 text-[12px] leading-snug text-ink-700">{r.reason}</span>
                    <span className="shrink-0 text-[12px] font-semibold tabular-nums text-ink-800">{r.count}</span>
                  </li>
                ))}
              </ul>
            </Card>
          )}

          {/* ---------------- Destination mix ---------------- */}
          {stats.topReceivingFacilities.length > 0 && (
            <Card title="Referral destinations" divided>
              <ul className="space-y-3">
                {stats.topReceivingFacilities.map((f) => {
                  const pct = Math.round(
                    (f.count / Math.max(stats.topReceivingFacilities[0].count, 1)) * 100,
                  );
                  return (
                    <li key={f.name}>
                      <div className="flex items-start justify-between gap-3">
                        <span className="min-w-0 text-[12px] leading-snug text-ink-700">{f.name}</span>
                        <span className="shrink-0 text-[12px] font-semibold tabular-nums text-ink-800">
                          {f.count}
                        </span>
                      </div>
                      <div className="mt-1.5 h-1 overflow-hidden rounded-full bg-ink-100">
                        <div className="h-full rounded-full bg-brand-500/70" style={{ width: `${pct}%` }} />
                      </div>
                    </li>
                  );
                })}
              </ul>
            </Card>
          )}

          {/* ---------------- FHIR exchange health ---------------- */}
          {hasPermission(session, PERMISSIONS.FHIR_READ) && (
            <Card title="Exchange health" divided>
              <ul className="space-y-2 text-[12px]">
                <li className="flex items-center justify-between gap-3">
                  <span className="text-ink-500">Validation target</span>
                  <span className="mono-id">fhir.ph.core#0.2.0</span>
                </li>
                <li className="flex items-center justify-between gap-3">
                  <span className="text-ink-500">Facade</span>
                  <span className="inline-flex items-center gap-1.5 text-brand-700">
                    <span className="h-1.5 w-1.5 rounded-full bg-brand-500" aria-hidden="true" />
                    Read-only, online
                  </span>
                </li>
              </ul>
              <Link
                href="/interop/alignment"
                className="mt-3 inline-flex items-center gap-1 text-[12px] font-medium text-brand-700 hover:underline"
              >
                PH Core alignment
                <IconArrowRight className="h-3 w-3" />
              </Link>
            </Card>
          )}
        </div>
      </div>
    </>
  );
}

function Row({
  icon,
  label,
  value,
  tone = "default",
  muted = false,
}: {
  icon?: React.ReactNode;
  label: string;
  value: string;
  tone?: "default" | "critical" | "positive";
  muted?: boolean;
}) {
  const valueTone =
    tone === "critical" ? "text-red-600" : tone === "positive" ? "text-brand-600" : "text-ink-900";
  return (
    <div className="flex items-center justify-between gap-3">
      <dt className={`flex items-center gap-1.5 ${muted ? "text-[11.5px] text-ink-400" : "text-[12px] text-ink-500"}`}>
        {icon && <span className="text-ink-300">{icon}</span>}
        {label}
      </dt>
      <dd className={`text-[15px] font-semibold tabular-nums ${muted ? "text-ink-500 text-[13px]" : valueTone}`}>
        {value}
      </dd>
    </div>
  );
}

void formatDateTime;
void computeAge;
void IconInbox;
