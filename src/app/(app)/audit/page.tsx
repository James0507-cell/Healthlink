import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import {
  getSession,
  PERMISSIONS,
  hasPermission,
  requirePageAccess,
} from "@/lib/auth";
import { all, get, verifyAuditChain } from "@/lib/db";
import { auditOutcomeLabel } from "@/lib/fhir/audit-mapper";
import { Card, EmptyState, PageHeader, Alert, formatDateTime, relativeTime } from "@/components/ui";
import { IconDownload, IconSearch, IconShield, IconAlert, IconCheck } from "@/components/icons";

export const metadata: Metadata = { title: "Audit trail" };
export const dynamic = "force-dynamic";

const PAGE_SIZE = 100;

const ACTION_LABEL: Record<string, string> = {
  C: "Create",
  R: "Read",
  U: "Update",
  D: "Delete",
  E: "Execute",
};

export default async function AuditPage({
  searchParams,
}: {
  searchParams: Promise<{ action?: string; event?: string; q?: string; page?: string }>;
}) {
  const session = await requirePageAccess(PERMISSIONS.AUDIT_READ);

  const sp = await searchParams;
  const page = Math.max(Number.parseInt(sp.page ?? "1", 10) || 1, 1);

  const where: string[] = [];
  const params: unknown[] = [];

  const crossFacility = session.role === "hie_admin" || session.role === "privacy_auditor";
  if (!crossFacility && session.facilityId) {
    where.push("a.actor_facility = ?");
    params.push(session.facilityId);
  }
  if (sp.action) {
    where.push("a.action = ?");
    params.push(sp.action);
  }
  if (sp.event) {
    where.push("a.event_type = ?");
    params.push(sp.event);
  }
  if (sp.q?.trim()) {
    const q = `%${sp.q.trim()}%`;
    where.push("(a.description LIKE ? OR a.actor_name LIKE ? OR a.entity_id LIKE ? OR r.referral_number LIKE ?)");
    params.push(q, q, q, q);
  }

  const whereSql = where.length ? `WHERE ${where.join(" AND ")}` : "";

  const total =
    get<{ n: number }>(
      `SELECT COUNT(*) AS n FROM audit_events a
         LEFT JOIN referrals r ON r.id = a.referral_id
       ${whereSql}`,
      ...params,
    )?.n ?? 0;

  const rows = all<{
    id: string;
    occurred_at: string;
    action: string;
    event_type: string;
    event_subtype: string | null;
    actor_name: string | null;
    actor_role: string | null;
    actor_facility: string | null;
    referral_id: string | null;
    referral_number: string | null;
    entity_type: string | null;
    entity_id: string | null;
    outcome: string;
    description: string;
    ip_address: string | null;
  }>(
    `SELECT a.*, r.referral_number
       FROM audit_events a
       LEFT JOIN referrals r ON r.id = a.referral_id
     ${whereSql}
     ORDER BY a.occurred_at DESC, a.rowid DESC
     LIMIT ? OFFSET ?`,
    ...params,
    PAGE_SIZE,
    (page - 1) * PAGE_SIZE,
  );

  const chain = verifyAuditChain();
  const totalPages = Math.max(Math.ceil(total / PAGE_SIZE), 1);

  const eventTypes = all<{ event_type: string; n: number }>(
    "SELECT event_type, COUNT(*) AS n FROM audit_events GROUP BY event_type ORDER BY n DESC",
  );

  const facilityNames = new Map(
    all<{ id: string; name: string }>("SELECT id, name FROM facilities").map((f) => [f.id, f.name]),
  );

  const exportQs = () => {
    const p = new URLSearchParams();
    if (sp.action) p.set("action", sp.action);
    if (sp.event) p.set("event", sp.event);
    if (sp.q) p.set("q", sp.q);
    const s = p.toString();
    return `/api/audit/export${s ? `?${s}` : ""}`;
  };

  const qs = (over: Record<string, string | undefined>) => {
    const p = new URLSearchParams();
    const merged = { action: sp.action, event: sp.event, q: sp.q, ...over };
    for (const [k, v] of Object.entries(merged)) if (v) p.set(k, v);
    const s = p.toString();
    return `/audit${s ? `?${s}` : ""}`;
  };

  return (
    <>
      <PageHeader
        title="Audit trail"
        subtitle={`${total} recorded event${total === 1 ? "" : "s"} ${
          crossFacility ? "across the network" : "for your facility"
        }, newest first`}
        actions={
          hasPermission(session, PERMISSIONS.AUDIT_EXPORT) ? (
            <a href={exportQs()} className="btn-secondary btn-sm" download>
              <IconDownload className="h-3.5 w-3.5" />
              Export CSV
            </a>
          ) : null
        }
      />

      {/* ---------------- Integrity banner ---------------- */}
      <div
        className={`mb-5 flex items-start gap-3 rounded-xl border px-4 py-3.5 ${
          chain.intact ? "border-brand-200/80 bg-brand-50/60" : "border-red-200/80 bg-red-50/70"
        }`}
      >
        <span
          className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${
            chain.intact ? "bg-brand-100 text-brand-700" : "bg-red-100 text-red-700"
          }`}
        >
          {chain.intact ? <IconShield className="h-4 w-4" /> : <IconAlert className="h-4 w-4" />}
        </span>
        <div className="min-w-0">
          <p className={`text-[13px] font-medium ${chain.intact ? "text-brand-900" : "text-red-900"}`}>
            {chain.intact
              ? `Audit integrity verified — ${chain.checked} record${chain.checked === 1 ? "" : "s"}, hash chain intact`
              : `Audit integrity check failed at record ${chain.brokenAt}`}
          </p>
          <p className={`mt-0.5 text-[11.5px] leading-relaxed ${chain.intact ? "text-brand-800" : "text-red-800"}`}>
            {chain.intact
              ? "Each record stores a SHA-256 hash over its own content together with the previous record's hash. Altering or removing any record breaks the chain, so tampering is detectable rather than merely discouraged."
              : `${chain.reason}. The audit log has been modified outside the application or corrupted.`}
          </p>
        </div>
      </div>

      {/* ---------------- Filters ---------------- */}
      <form method="get" action="/audit" className="mb-4 flex flex-wrap items-center gap-2">
        <div className="relative min-w-[15rem] flex-1">
          <IconSearch className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-ink-400" />
          <input
            name="q"
            defaultValue={sp.q ?? ""}
            placeholder="Description, person, entity or referral"
            aria-label="Search the audit trail"
            className="input h-9 pl-9 text-[13px]"
          />
        </div>

        <select name="action" defaultValue={sp.action ?? ""} aria-label="Filter by action" className="select h-9 w-auto text-[13px]">
          <option value="">Any action</option>
          <option value="C">Create</option>
          <option value="R">Read</option>
          <option value="U">Update</option>
          <option value="D">Delete</option>
          <option value="E">Execute</option>
        </select>

        <select name="event" defaultValue={sp.event ?? ""} aria-label="Filter by event type" className="select h-9 w-auto text-[13px]">
          <option value="">Any event type</option>
          {eventTypes.map((e) => (
            <option key={e.event_type} value={e.event_type}>
              {e.event_type} ({e.n})
            </option>
          ))}
        </select>

        <button type="submit" className="btn-secondary h-9">
          Apply
        </button>
        {(sp.q || sp.action || sp.event) && (
          <Link href="/audit" className="btn-ghost h-9">
            Clear
          </Link>
        )}
      </form>

      {/* ---------------- Log ---------------- */}
      {rows.length === 0 ? (
        <EmptyState
          icon={<IconSearch className="h-5 w-5" />}
          title="No audit event matched"
          description="Adjust the filters to widen the search."
        />
      ) : (
        <>
          <Card bodyClassName="p-0" className="overflow-hidden">
            <div className="overflow-x-auto">
              <table className="table">
                <thead>
                  <tr>
                    <th className="table-head w-[9rem]">When</th>
                    <th className="table-head w-[7rem]">Event</th>
                    <th className="table-head w-[15%]">Who</th>
                    <th className="table-head">What happened</th>
                    <th className="table-head w-[8rem]">Outcome</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.id} className="transition-colors hover:bg-ink-50/60">
                      <td className="table-cell">
                        <span className="block text-[11.5px] text-ink-800">
                          {formatDateTime(r.occurred_at)}
                        </span>
                        <span className="block text-[10.5px] text-ink-400">{relativeTime(r.occurred_at)}</span>
                      </td>
                      <td className="table-cell">
                        <span className="block text-[12px] font-medium text-ink-800">{r.event_type}</span>
                        <span className="block text-[10.5px] text-ink-500">
                          {r.action} · {ACTION_LABEL[r.action] ?? r.action}
                        </span>
                        {r.event_subtype && (
                          <span className="mt-0.5 block text-[10px] italic text-ink-400">{r.event_subtype}</span>
                        )}
                      </td>
                      <td className="table-cell">
                        <span className="block text-[12px] text-ink-800">{r.actor_name ?? "system"}</span>
                        {r.actor_role && (
                          <span className="block text-[10.5px] capitalize text-ink-500">
                            {r.actor_role.replace(/_/g, " ")}
                          </span>
                        )}
                        {r.actor_facility && (
                          <span className="block text-[10.5px] text-ink-500">
                            {facilityNames.get(r.actor_facility) ?? "—"}
                          </span>
                        )}
                        {r.ip_address && <span className="mono-id mt-0.5 block">{r.ip_address}</span>}
                      </td>
                      <td className="table-cell">
                        <p className="text-[11.5px] leading-relaxed text-ink-600">{r.description}</p>
                        <span className="mt-1 flex flex-wrap items-center gap-2">
                          {r.referral_id && r.referral_number && (
                            <Link
                              href={`/referrals/${r.referral_id}`}
                              className="mono-id font-medium text-brand-700 hover:underline"
                            >
                              {r.referral_number}
                            </Link>
                          )}
                          {r.entity_type && (
                            <span className="mono-id">
                              {r.entity_type}
                              {r.entity_id ? `/${r.entity_id.length > 18 ? `${r.entity_id.slice(0, 18)}…` : r.entity_id}` : ""}
                            </span>
                          )}
                        </span>
                      </td>
                      <td className="table-cell">
                        <span
                          className={
                            r.outcome === "0" ? "chip-positive" : r.outcome === "4" ? "chip-warn" : "chip-critical"
                          }
                        >
                          {r.outcome === "0" && <IconCheck className="h-3 w-3" />}
                          {auditOutcomeLabel(r.outcome)}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>

          {totalPages > 1 && (
            <nav className="mt-4 flex items-center justify-between gap-3" aria-label="Pagination">
              <p className="text-[12px] text-ink-500">
                Page {page} of {totalPages}
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

      {/* ---------------- Reference ---------------- */}
      <Card title="What is recorded, and why" className="mt-6" divided>
        <div className="grid gap-6 lg:grid-cols-2">
          <div>
            <p className="mb-3 text-[12.5px] leading-relaxed text-ink-600">
              The manuscript requires that creation, viewing, transmission, acceptance, modification and closure be
              traceable. HealthLink records each of those, plus the security-relevant events a privacy office needs:
            </p>
            <ul className="space-y-1.5">
              {[
                "Sign-in success, failure, and lockout after repeated failures",
                "Consent recorded, and revoked with the reason given",
                "Referral created, updated, routed, and every workflow transition",
                "Document attachment and each retrieval of an attached document",
                "FHIR validation runs, with error and warning counts",
                "Facade reads and searches, including the reference scope",
                "Blocked attempts: wrong facility, insufficient role, revoked consent",
                "Retention sweeps and configuration changes",
              ].map((t) => (
                <li key={t} className="flex gap-2.5">
                  <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-brand-500" aria-hidden="true" />
                  <span className="text-[12px] leading-snug text-ink-700">{t}</span>
                </li>
              ))}
            </ul>
          </div>

          <div className="space-y-3">
            <div className="rounded-xl border border-ink-200 bg-ink-50/70 px-3.5 py-3">
              <p className="section-label">Why blocked attempts are logged</p>
              <p className="mt-1.5 text-[11.5px] leading-relaxed text-ink-600">
                A refusal is as significant as a success for accountability. If a user repeatedly tries to open a
                referral belonging to another facility, that pattern should be visible to a privacy officer rather than
                silently discarded by the access-control layer.
              </p>
            </div>
            <div className="rounded-xl border border-ink-200 bg-ink-50/70 px-3.5 py-3">
              <p className="section-label">Tamper-evidence, not tamper-proofing</p>
              <p className="mt-1.5 text-[11.5px] leading-relaxed text-ink-600">
                A hash chain makes modification detectable. It does not prevent someone with database access from
                rewriting the entire chain. A production deployment would append to write-once storage or an external
                log service, which is why this is stated as a limitation rather than claimed as a guarantee.
              </p>
            </div>
            <div className="rounded-xl border border-ink-200 bg-ink-50/70 px-3.5 py-3">
              <p className="section-label">Patient identifiers in exports</p>
              <p className="mt-1.5 text-[11.5px] leading-relaxed text-ink-600">
                The CSV export pseudonymises patient identifiers and never includes patient names, so an exported audit
                file can be shared for review without carrying identifiable health information.
              </p>
            </div>
          </div>
        </div>
      </Card>
    </>
  );
}

void Alert;
