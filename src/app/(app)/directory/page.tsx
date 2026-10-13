import type { Metadata } from "next";
import { redirect } from "next/navigation";
import {
  getSession,
  PERMISSIONS,
  hasPermission,
  ROLE_LABELS,
  ROLE_PERMISSIONS,
  type Role,
  requirePageSession,
} from "@/lib/auth";
import { all } from "@/lib/db";
import { Card, PageHeader, Alert, formatDateTime, relativeTime, initials } from "@/components/ui";
import { IconBuilding, IconKey, IconShield } from "@/components/icons";

export const metadata: Metadata = { title: "Directory" };
export const dynamic = "force-dynamic";

/**
 * Facility and user directory.
 *
 * The facility table is the network's addressing layer: it is what makes a
 * referral routable to a named organisation, and it is the source of the FHIR
 * Organization resources exchanged in every bundle.
 */
export default async function DirectoryPage() {
  const session = await requirePageSession();
  // The narrower of the two permissions is sufficient to view this page.
  if (!hasPermission(session, PERMISSIONS.DIRECTORY_MANAGE) && !hasPermission(session, PERMISSIONS.USER_MANAGE)) redirect("/dashboard");

  const facilities = all<{
    id: string;
    name: string;
    short_name: string | null;
    level: string | null;
    ownership: string | null;
    city_display: string | null;
    nhfr_code: string | null;
    hcpn_code: string | null;
    philhealth_pan: string | null;
    is_referring: number;
    is_receiving: number;
    active: number;
    service_capabilities: string | null;
  }>("SELECT * FROM facilities ORDER BY name");

  const users = all<{
    id: string;
    full_name: string;
    email: string;
    role: string;
    facility_name: string | null;
    specialization: string | null;
    last_login_at: string | null;
    active: number;
  }>(
    `SELECT u.id, u.full_name, u.email, u.role, u.specialization, u.last_login_at, u.active,
            f.name AS facility_name
       FROM users u LEFT JOIN facilities f ON f.id = u.facility_id
      ORDER BY f.name, u.role, u.full_name`,
  );

  // Group users by facility for readability.
  const byFacility = new Map<string, typeof users>();
  for (const u of users) {
    const key = u.facility_name ?? "HealthLink network administration";
    const list = byFacility.get(key) ?? [];
    list.push(u);
    byFacility.set(key, list);
  }

  const apiTokens = all<{
    id: string;
    label: string;
    token_prefix: string;
    created_at: string;
    last_used_at: string | null;
    revoked_at: string | null;
    user_name: string;
    facility_name: string | null;
  }>(
    `SELECT t.id, t.label, t.token_prefix, t.created_at, t.last_used_at, t.revoked_at,
            u.full_name AS user_name, f.name AS facility_name
       FROM api_tokens t
       JOIN users u ON u.id = t.user_id
       LEFT JOIN facilities f ON f.id = t.facility_id
      ORDER BY t.created_at DESC`,
  );

  return (
    <>
      <PageHeader
        title="Directory"
        subtitle="The participating facilities, their registry identifiers, the people with access, and any system API credentials."
      />

      {/* ---------------- Facilities ---------------- */}
      <Card
        title="Facilities"
        description={`${facilities.length} organisations in the referral network`}
        divided
        bodyClassName="p-0"
        className="mb-5"
      >
        <div className="overflow-x-auto">
          <table className="table">
            <thead>
              <tr>
                <th className="table-head">Facility</th>
                <th className="table-head">Level</th>
                <th className="table-head">Registry identifiers</th>
                <th className="table-head">Referral role</th>
                <th className="table-head">Status</th>
              </tr>
            </thead>
            <tbody>
              {facilities.map((f) => {
                let services: string[] = [];
                try {
                  services = JSON.parse(f.service_capabilities ?? "[]");
                } catch {
                  services = [];
                }
                return (
                  <tr key={f.id}>
                    <td className="table-cell">
                      <span className="flex items-start gap-2.5">
                        <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-ink-100 text-ink-500">
                          <IconBuilding className="h-3.5 w-3.5" />
                        </span>
                        <span className="min-w-0">
                          <span className="block text-[13px] font-medium text-ink-900">{f.name}</span>
                          {f.short_name && <span className="block text-[11px] text-ink-500">{f.short_name}</span>}
                          {f.city_display && <span className="block text-[11px] text-ink-500">{f.city_display}</span>}
                          {services.length > 0 && (
                            <span className="mt-1 block max-w-[20rem] text-[10.5px] leading-snug text-ink-400">
                              {services.join(" · ")}
                            </span>
                          )}
                        </span>
                      </span>
                    </td>
                    <td className="table-cell">
                      <span className="chip-neutral capitalize">{f.level ?? "—"}</span>
                      {f.ownership && <span className="mt-1 block text-[11px] capitalize text-ink-500">{f.ownership}</span>}
                    </td>
                    <td className="table-cell">
                      <span className="mono-id block">{f.nhfr_code ? `NHFR ${f.nhfr_code}` : "no NHFR"}</span>
                      {f.hcpn_code && <span className="mono-id block">HCPN {f.hcpn_code}</span>}
                      {f.philhealth_pan && <span className="mono-id block">PAN {f.philhealth_pan}</span>}
                    </td>
                    <td className="table-cell">
                      <div className="flex flex-wrap gap-1.5">
                        {f.is_referring ? <span className="chip-info">Refers</span> : null}
                        {f.is_receiving ? <span className="chip-positive">Receives</span> : null}
                      </div>
                    </td>
                    <td className="table-cell">
                      <span className={f.active ? "chip-positive" : "chip-neutral"}>
                        {f.active ? "Active" : "Inactive"}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <p className="border-t border-ink-200/80 px-4 py-2.5 text-[10.5px] leading-relaxed text-ink-400">
          Identifiers use the NamingSystems defined by the draft Philippine Core guide, so a receiving facility can
          address another unambiguously. Facility names in this demonstration are fictional composites.
        </p>
      </Card>

      <div className="grid gap-5 lg:grid-cols-[1.4fr_1fr]">
        {/* ---------------- Users ---------------- */}
        <Card
          title="People with access"
          description={`${users.length} accounts`}
          divided
          bodyClassName="p-0"
        >
          <div className="divide-y divide-ink-100">
            {[...byFacility.entries()].map(([facilityName, list]) => (
              <div key={facilityName}>
                <p className="section-label bg-ink-50/60 px-4 py-2">{facilityName}</p>
                <ul className="divide-y divide-ink-100">
                  {list.map((u) => (
                    <li key={u.id} className="flex items-center gap-3 px-4 py-2.5">
                      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-ink-900 text-[10px] font-semibold text-white">
                        {initials(u.full_name)}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block text-[12.5px] font-medium text-ink-900">{u.full_name}</span>
                        <span className="block truncate text-[10.5px] text-ink-500">{u.email}</span>
                      </span>
                      <span className="hidden shrink-0 text-right sm:block">
                        <span className="block text-[11px] text-ink-700">
                          {ROLE_LABELS[u.role as Role] ?? u.role}
                        </span>
                        <span className="block text-[10px] text-ink-400">
                          {u.last_login_at ? `last in ${relativeTime(u.last_login_at)}` : "never signed in"}
                        </span>
                      </span>
                      {!u.active && <span className="chip-neutral shrink-0">Inactive</span>}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </Card>

        <div className="space-y-5">
          {/* ---------------- Roles ---------------- */}
          <Card title="Roles and their reach" divided>
            <ul className="space-y-3">
              {(Object.keys(ROLE_PERMISSIONS) as Role[]).map((role) => {
                const perms = ROLE_PERMISSIONS[role];
                const cross = role === "hie_admin" || role === "privacy_auditor";
                return (
                  <li key={role}>
                    <div className="flex items-center justify-between gap-3">
                      <span className="text-[12.5px] font-medium text-ink-900">{ROLE_LABELS[role]}</span>
                      <span className="shrink-0 text-[11px] tabular-nums text-ink-500">{perms.length} permissions</span>
                    </div>
                    <p className="mt-0.5 text-[10.5px] text-ink-500">
                      {cross ? "Cross-facility" : "Scoped to own facility"}
                    </p>
                  </li>
                );
              })}
            </ul>
          </Card>

          {/* ---------------- API tokens ---------------- */}
          <Card
            title={
              <span className="flex items-center gap-1.5">
                <IconKey className="h-3.5 w-3.5 text-ink-400" />
                <span className="card-title">System API credentials</span>
              </span>
            }
            description="Used by a facility's own system to read referrals through the FHIR facade."
            divided
          >
            {apiTokens.length === 0 ? (
              <div className="rounded-lg border border-dashed border-ink-200 bg-ink-50/50 px-3 py-5 text-center">
                <IconShield className="mx-auto h-5 w-5 text-ink-300" />
                <p className="mt-2 text-[12px] font-medium text-ink-700">No API credentials issued</p>
                <p className="mx-auto mt-1 max-w-xs text-[11px] leading-relaxed text-ink-500">
                  The interactive session covers the evaluation walkthrough. Issuing a token is how a facility would
                  connect its own system.
                </p>
              </div>
            ) : (
              <ul className="divide-y divide-ink-100">
                {apiTokens.map((t) => (
                  <li key={t.id} className="py-2.5">
                    <p className="text-[12.5px] font-medium text-ink-900">{t.label}</p>
                    <p className="mono-id mt-0.5">
                      {t.token_prefix}••••••••
                    </p>
                    <p className="mt-0.5 text-[10.5px] text-ink-500">
                      {t.user_name}
                      {t.facility_name ? ` · ${t.facility_name}` : ""} · issued {formatDateTime(t.created_at)}
                      {t.last_used_at ? ` · last used ${relativeTime(t.last_used_at)}` : " · never used"}
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>
      </div>

      <Alert tone="neutral" className="mt-5" title="Directory management">
        In a production deployment this directory would be reconciled against the DOH National Health Facility Registry
        and each facility&rsquo;s HR system, and it would be the place where a facility&rsquo;s FHIR endpoint and
        certificate are registered. Those integrations are outside the scope of this concept study.
      </Alert>
    </>
  );
}
