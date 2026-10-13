import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import {
  getSession,
  PERMISSIONS,
  hasPermission,
  requirePageAccess,
} from "@/lib/auth";
import { listReferrals, referralCounts } from "@/lib/referrals";
import { STATES, REFERRAL_STATES, slaStatus, PRIORITY_LABELS, type ReferralState } from "@/lib/workflow";
import {
  Card,
  EmptyState,
  PageHeader,
  StatusPill,
  PriorityPill,
  relativeTime,
  formatDateTime,
  computeAge,
} from "@/components/ui";
import {
  IconArrowRight,
  IconPlus,
  IconSearch,
  IconInbox,
  IconClock,
} from "@/components/icons";

export const metadata: Metadata = { title: "Referrals" };
export const dynamic = "force-dynamic";

interface SearchParams {
  status?: string;
  side?: string;
  q?: string;
  priority?: string;
  page?: string;
}

const PAGE_SIZE = 25;

export default async function ReferralsPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const session = await requirePageAccess(PERMISSIONS.REFERRAL_READ_OWN_FACILITY);

  const sp = await searchParams;
  const tab = sp.status ?? "active";
  const status = REFERRAL_STATES.includes(tab as ReferralState) ? tab : undefined;
  const side = sp.side === "referring" || sp.side === "receiving" ? sp.side : "all";
  const page = Math.max(Number.parseInt(sp.page ?? "1", 10) || 1, 1);

  // "Active" is a view, not a single state: everything still moving between
  // facilities. Terminal states are excluded unless a tab names them.
  const ACTIVE_VIEW_EXCLUDED = ["draft", "completed", "closed-feedback", "rejected", "cancelled"];
  const useActiveView = tab === "active";

  const { rows: rawRows, total: rawTotal } = await listReferrals(session, {
    status,
    side,
    search: sp.q,
    priority: sp.priority,
    includeDrafts: false,
    limit: useActiveView ? 200 : PAGE_SIZE,
    offset: useActiveView ? 0 : (page - 1) * PAGE_SIZE,
  });

  const rows = useActiveView
    ? rawRows.filter((r) => !ACTIVE_VIEW_EXCLUDED.includes(r.status))
    : rawRows;
  const total = useActiveView ? rows.length : rawTotal;

  const counts = await referralCounts(session);
  const countFor = (s: string) => counts.find((c) => c.status === s)?.n ?? 0;
  const activeCount = counts
    .filter((c) => !["closed-feedback", "cancelled", "rejected", "draft", "completed"].includes(c.status))
    .reduce((a, b) => a + b.n, 0);

  const totalPages = Math.max(Math.ceil(total / PAGE_SIZE), 1);

  const qs = (over: Record<string, string | undefined>) => {
    const params = new URLSearchParams();
    const merged = { status, side: side === "all" ? undefined : side, q: sp.q, priority: sp.priority, ...over };
    for (const [k, v] of Object.entries(merged)) if (v) params.set(k, v);
    const s = params.toString();
    return `/referrals${s ? `?${s}` : ""}`;
  };

  const hint =
    tab === "info-requested"
      ? "Referrals the receiving facility has sent back for more information."
      : tab === "completed"
        ? "Care delivered. Awaiting acknowledgment of the returned feedback to close the loop."
        : tab === "closed-feedback"
          ? "Feedback returned and acknowledged. These loops are complete."
          : tab === "rejected"
            ? "Referrals the receiving facility declined, with the reason recorded."
            : "Referrals still moving between facilities: awaiting receipt, review, a decision, or care delivery.";

  return (
    <>
      <PageHeader
        title="Referrals"
        subtitle={`${total} referral${total === 1 ? "" : "s"} ${
          tab === "active"
            ? "still in progress"
            : `in ${STATES[tab as ReferralState]?.label.toLowerCase() ?? tab}`
        }${session.role === "hie_admin" || session.role === "privacy_auditor" ? " across all facilities" : ""}`}
      />

      {/* ---------------- View switcher ---------------- */}
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="segmented" role="tablist">
          {[
            { id: "active", label: "Active", count: activeCount },
            { id: "info-requested", label: "Returned to me", count: countFor("info-requested") },
            { id: "completed", label: "Completed", count: countFor("completed") },
            { id: "closed-feedback", label: "Closed loop", count: countFor("closed-feedback") },
            { id: "rejected", label: "Declined", count: countFor("rejected") },
          ].map((t) => {
            const isActive = tab === t.id;
            return (
              <Link
                key={t.id}
                href={`/referrals?status=${t.id}`}
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

        <p className="hidden text-[12px] text-ink-500 lg:block">{hint}</p>
      </div>

      {/* ---------------- Filters ---------------- */}
      <form method="get" action="/referrals" className="mb-4 flex flex-wrap items-center gap-2">
        <input type="hidden" name="status" value={tab} />

        <div className="relative min-w-[15rem] flex-1">
          <IconSearch className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-ink-400" />
          <input
            name="q"
            defaultValue={sp.q ?? ""}
            placeholder="Referral number, patient, MRN or PhilHealth PIN"
            aria-label="Search referrals"
            className="input h-9 pl-9 text-[13px]"
          />
        </div>

        <select
          name="side"
          defaultValue={side}
          aria-label="Filter by your facility's role"
          className="select h-9 w-auto text-[13px]"
        >
          <option value="all">Referring or receiving</option>
          <option value="referring">We referred</option>
          <option value="receiving">Referred to us</option>
        </select>

        <select
          name="priority"
          defaultValue={sp.priority ?? ""}
          aria-label="Filter by priority"
          className="select h-9 w-auto text-[13px]"
        >
          <option value="">Any priority</option>
          {Object.entries(PRIORITY_LABELS).map(([code, label]) => (
            <option key={code} value={code}>
              {label}
            </option>
          ))}
        </select>

        <button type="submit" className="btn-secondary h-9">
          Apply
        </button>
        {(sp.q || sp.priority || side !== "all") && (
          <Link href={`/referrals?status=${tab}`} className="btn-ghost h-9">
            Clear
          </Link>
        )}
      </form>

      {/* ---------------- Results ---------------- */}
      {rows.length === 0 ? (
        <EmptyState
          icon={<IconInbox className="h-5 w-5" />}
          title="No referrals match"
          description={
            status
              ? `There are no referrals currently in ${STATES[status as ReferralState]?.label.toLowerCase()}.`
              : "Try clearing the filters, or create a new referral."
          }
          action={
            hasPermission(session, PERMISSIONS.REFERRAL_CREATE) ? (
              <Link href="/referrals/new" className="btn-secondary">
                New referral
              </Link>
            ) : null
          }
        />
      ) : (
        <>
          <Card bodyClassName="p-0" className="overflow-hidden">
            {/* Desktop table */}
            <div className="hidden lg:block">
              <table className="table table-fixed">
                <thead>
                  <tr>
                    <th className="table-head w-[27%]">Patient</th>
                    <th className="table-head w-[26%]">Reason</th>
                    <th className="table-head w-[22%]">Route</th>
                    <th className="table-head w-[15%]">Status</th>
                    <th className="table-head w-[10%] text-right">Updated</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => {
                    const sla = slaStatus(r.status as ReferralState, r.status_updated_at);
                    const isInbound = r.receiving_facility_id === session.facilityId;
                    return (
                      <tr key={r.id} className="group transition-colors hover:bg-ink-50/60">
                        <td className="table-cell">
                          <Link href={`/referrals/${r.id}`} className="flex items-start gap-2">
                            <span
                              className={`mt-1 h-7 w-1 shrink-0 rounded-full ${
                                r.priority === "stat"
                                  ? "bg-red-500"
                                  : r.priority === "urgent" || r.priority === "asap"
                                    ? "bg-amber-400"
                                    : "bg-ink-200"
                              }`}
                              aria-hidden="true"
                            />
                            <span className="min-w-0">
                              <span className="block truncate text-[13px] font-medium text-ink-900">
                                {r.patient_name}
                              </span>
                              <span className="mono-id mt-0.5 block truncate">{r.referral_number}</span>
                              <span className="mt-0.5 block truncate text-[10.5px] text-ink-500">
                                {r.patient_sex === "male" ? "M" : r.patient_sex === "female" ? "F" : "?"}{" "}
                                {computeAge(r.patient_birth_date)}
                              </span>
                            </span>
                          </Link>
                        </td>

                        <td className="table-cell">
                          <span className="block truncate text-[12.5px] text-ink-800" title={r.reason_display}>
                            {r.reason_display}
                          </span>
                          <span className="mt-1 block">
                            <PriorityPill priority={r.priority} />
                          </span>
                        </td>

                        <td className="table-cell">
                          {/* Direction is stated in words rather than by an arrow alone, so the
                              column stays narrow and the meaning is unambiguous at a glance. */}
                          <span className="block truncate text-[11.5px] text-ink-600" title={isInbound ? r.referring_facility_name : r.receiving_facility_name}>
                            <span className={isInbound ? "text-brand-700" : "text-ink-400"}>
                              {isInbound ? "from" : "to"}
                            </span>{" "}
                            {isInbound ? r.referring_facility_name : r.receiving_facility_name}
                          </span>
                          <span className="mt-1 block text-[10.5px] text-ink-400">
                            {isInbound ? "inbound" : "outbound"}
                          </span>
                        </td>

                        <td className="table-cell">
                          <StatusPill status={r.status} />
                          {sla.overdue && (
                            <span className="mt-1 flex items-center gap-1 text-[10.5px] font-medium text-red-600">
                              <IconClock className="h-3 w-3" />
                              {Math.round(sla.hoursElapsed)}h
                            </span>
                          )}
                        </td>

                        <td className="table-cell text-right">
                          <span
                            className="whitespace-nowrap text-[11.5px] text-ink-600"
                            title={formatDateTime(r.updated_at)}
                          >
                            {relativeTime(r.updated_at)}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Compact list */}
            <ul className="divide-y divide-ink-100 lg:hidden">
              {rows.map((r) => (
                <li key={r.id}>
                  <Link href={`/referrals/${r.id}`} className="flex items-start gap-3 px-4 py-3 hover:bg-ink-50">
                    <span
                      className={`mt-1 h-8 w-1 shrink-0 rounded-full ${
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
                        <span className="text-[13px] font-medium text-ink-900">{r.patient_name}</span>
                        <StatusPill status={r.status} />
                      </span>
                      <span className="mono-id mt-0.5 block">{r.referral_number}</span>
                      <span className="mt-0.5 block truncate text-[11.5px] text-ink-500">{r.reason_display}</span>
                    </span>
                    <span className="shrink-0 text-[10.5px] text-ink-400">{relativeTime(r.updated_at)}</span>
                  </Link>
                </li>
              ))}
            </ul>
          </Card>

          {/* ---------------- Pagination ---------------- */}
          {totalPages > 1 && (
            <nav className="mt-4 flex items-center justify-between gap-3" aria-label="Pagination">
              <p className="text-[12px] text-ink-500">
                Page {page} of {totalPages} · {total} referral{total === 1 ? "" : "s"}
              </p>
              <div className="flex gap-2">
                {page > 1 && (
                  <Link href={qs({ page: String(page - 1) })} className="btn-secondary btn-sm">
                    Previous
                  </Link>
                )}
                {page < totalPages && (
                  <Link href={qs({ page: String(page + 1) })} className="btn-secondary btn-sm">
                    Next
                  </Link>
                )}
              </div>
            </nav>
          )}
        </>
      )}

      {/* ---------------- Workflow legend ---------------- */}
      <Card
        title="How a referral moves"
        description="Every referral follows the same closed loop. Each state records which facility is expected to act next."
        className="mt-6"
        divided
      >
        <div className="grid gap-x-6 gap-y-4 sm:grid-cols-2 lg:grid-cols-4">
          {([1, 2, 3, 4] as const).map((phase) => (
            <div key={phase}>
              <p className="section-label mb-2.5">
                {phase === 1
                  ? "1. Create and route"
                  : phase === 2
                    ? "2. Receive and review"
                    : phase === 3
                      ? "3. Decide and deliver"
                      : "4. Close the loop"}
              </p>
              <ul className="space-y-1.5">
                {REFERRAL_STATES.filter((s) => STATES[s].phase === phase).map((s) => (
                  <li key={s} className="flex items-center gap-2">
                    <StatusPill status={s} />
                    <span className="shrink-0 text-[9.5px] uppercase tracking-[0.06em] text-ink-400">
                      {STATES[s].awaiting === "receiving"
                        ? "recv"
                        : STATES[s].awaiting === "referring"
                          ? "ref"
                          : "done"}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
        <p className="mt-4 border-t border-ink-200/80 pt-3 text-[11px] text-ink-500">
          <span className="font-medium">recv</span> — waiting on the receiving facility ·{" "}
          <span className="font-medium">ref</span> — waiting on the referring facility
        </p>
      </Card>
    </>
  );
}
