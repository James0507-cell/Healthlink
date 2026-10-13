import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import {
  getSession,
  PERMISSIONS,
  hasPermission,
  requirePageAccess,
} from "@/lib/auth";
import { listPatients } from "@/lib/referrals";
import { all } from "@/lib/db";
import { Card, EmptyState, PageHeader, computeAge, maskId, formatDate } from "@/components/ui";
import { IconSearch, IconClipboard, IconUsers, IconArrowRight } from "@/components/icons";

export const metadata: Metadata = { title: "Patients" };
export const dynamic = "force-dynamic";

export default async function PatientsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const session = await requirePageAccess(PERMISSIONS.PATIENT_READ);

  const sp = await searchParams;
  const patients = await listPatients({ search: sp.q, limit: 200 });

  const counts = new Map<string, { total: number; active: number }>();
  for (const p of patients) {
    const rows = await all<{ status: string }>(
      "SELECT status FROM referrals WHERE patient_id = ? AND deleted_at IS NULL",
      p.id,
    );
    counts.set(p.id, {
      total: rows.length,
      active: rows.filter((r) => !["closed-feedback", "cancelled", "rejected", "draft"].includes(r.status)).length,
    });
  }

  const totalActive = [...counts.values()].reduce((a, c) => a + c.active, 0);

  return (
    <>
      <PageHeader
        title="Patients"
        subtitle="The registry HealthLink draws from. In deployment this would be reconciled against facility systems on the PhilHealth PIN and PhilSys ID."
      />

      {/* ---------------- Summary ---------------- */}
      <div className="mb-5 grid gap-3 sm:grid-cols-3">
        <Card divided>
          <div className="flex items-center gap-3">
            <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-ink-100 text-ink-500">
              <IconUsers className="h-4 w-4" />
            </span>
            <div>
              <p className="text-[11px] text-ink-500">Patients in registry</p>
              <p className="text-[20px] font-semibold leading-none tabular-nums text-ink-900">{patients.length}</p>
            </div>
          </div>
        </Card>
        <Card divided>
          <div className="flex items-center gap-3">
            <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-brand-50 text-brand-600">
              <IconClipboard className="h-4 w-4" />
            </span>
            <div>
              <p className="text-[11px] text-ink-500">With an active referral</p>
              <p className="text-[20px] font-semibold leading-none tabular-nums text-ink-900">{totalActive}</p>
            </div>
          </div>
        </Card>
        <Card divided>
          <p className="text-[11px] text-ink-500">Identifiers carried</p>
          <p className="mt-1 text-[12px] leading-relaxed text-ink-700">
            PhilHealth PIN, PhilSys ID, and a facility-local MRN, exactly as the draft PH Core guide defines them.
          </p>
        </Card>
      </div>

      {/* ---------------- Search ---------------- */}
      <form method="get" action="/patients" className="mb-4 flex flex-wrap items-center gap-2">
        <div className="relative min-w-[16rem] flex-1">
          <IconSearch className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-ink-400" />
          <input
            name="q"
            defaultValue={sp.q ?? ""}
            placeholder="Search by name, medical record number or PhilHealth PIN"
            aria-label="Search patients"
            className="input h-9 pl-9 text-[13px]"
          />
        </div>
        <button type="submit" className="btn-secondary h-9">
          Search
        </button>
        {sp.q && (
          <Link href="/patients" className="btn-ghost h-9">
            Clear
          </Link>
        )}
      </form>

      {/* ---------------- Results ---------------- */}
      {patients.length === 0 ? (
        <EmptyState
          icon={<IconSearch className="h-5 w-5" />}
          title="No patient matched"
          description={sp.q ? `Nothing in the registry matched “${sp.q}”.` : "The registry is empty."}
        />
      ) : (
        <Card bodyClassName="p-0" className="overflow-hidden">
          <div className="overflow-x-auto">
            <table className="table">
              <thead>
                <tr>
                  <th className="table-head">Patient</th>
                  <th className="table-head">Identifiers</th>
                  <th className="table-head w-[8rem]">Sex / age</th>
                  <th className="table-head">Address</th>
                  <th className="table-head w-[7rem]">Referrals</th>
                  <th className="table-head w-[6rem]"></th>
                </tr>
              </thead>
              <tbody>
                {patients.map((p) => {
                  const c = counts.get(p.id);
                  return (
                    <tr key={p.id} className="transition-colors hover:bg-ink-50/60">
                      <td className="table-cell">
                        <span className="block text-[13px] font-medium text-ink-900">
                          {p.given_name} {p.middle_name ?? ""} {p.family_name}
                          {p.suffix ? ` ${p.suffix}` : ""}
                        </span>
                        <span className="mt-0.5 block text-[11px] text-ink-500">
                          {p.civil_status ?? "—"}
                          {p.blood_type ? ` · ${p.blood_type}` : ""}
                          {p.occupation ? ` · ${p.occupation}` : ""}
                        </span>
                      </td>
                      <td className="table-cell">
                        <span className="mono-id block">{p.local_mrn ? `MRN ${p.local_mrn}` : "no MRN"}</span>
                        {p.philhealth_id && <span className="mono-id block">PIN {maskId(p.philhealth_id)}</span>}
                        {p.philsys_id && <span className="mono-id block">PhilSys {maskId(p.philsys_id)}</span>}
                      </td>
                      <td className="table-cell">
                        <span className="text-[12.5px] capitalize text-ink-700">{p.sex}</span>
                        <span className="mt-0.5 block text-[11px] text-ink-500">{computeAge(p.birth_date)}</span>
                      </td>
                      <td className="table-cell text-[11.5px] leading-snug text-ink-600">
                        {[p.barangay_display, p.city_display].filter(Boolean).join(", ") || "—"}
                      </td>
                      <td className="table-cell">
                        <span className="text-[13px] font-semibold tabular-nums text-ink-900">{c?.total ?? 0}</span>
                        {c && c.active > 0 && (
                          <span className="mt-0.5 block text-[10.5px] text-brand-700">{c.active} active</span>
                        )}
                      </td>
                      <td className="table-cell">
                        <Link
                          href={`/referrals?q=${encodeURIComponent(p.family_name)}`}
                          className="btn-ghost btn-sm"
                        >
                          Referrals
                          <IconArrowRight className="h-3 w-3" />
                        </Link>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <p className="border-t border-ink-200/80 px-4 py-2.5 text-[10.5px] leading-relaxed text-ink-400">
            Identifiers are masked in list views. The full value is exchanged in the FHIR bundle and is visible within
            the referral itself, where it is clinically necessary.
          </p>
        </Card>
      )}

      <Card title="Why shared identifiers matter" className="mt-5" divided>
        <div className="grid gap-5 lg:grid-cols-2">
          <p className="text-[13px] leading-relaxed text-ink-700">
            A referral network cannot match a patient safely without identifiers that survive the trip between
            facilities. A name and birth date are not enough: two patients in the same barangay can share both.
            HealthLink carries the PhilHealth Identification Number and the PhilSys ID so that the receiving facility
            can be confident it is looking at the right person, while a facility-local MRN keeps each site working with
            its own records.
          </p>
          <div className="space-y-2.5">
            {[
              ["PhilHealth PIN", "philhealth.gov.ph/fhir/Identifier/philhealth-id", "Membership and dependent identification"],
              ["PhilSys ID", "philsys.gov.ph/fhir/Identifier/philsys-id", "National identity, where enrolled"],
              ["Local MRN", "healthlink.davao.gov.ph/identifier/local-mrn", "The originating facility's own number"],
            ].map(([name, system, purpose]) => (
              <div key={String(name)} className="rounded-lg border border-ink-200 bg-white px-3 py-2.5">
                <p className="text-[12px] font-medium text-ink-900">{name}</p>
                <p className="mono-id mt-0.5 break-all">{system}</p>
                <p className="mt-1 text-[11px] text-ink-600">{purpose}</p>
              </div>
            ))}
          </div>
        </div>
        <p className="mt-4 border-t border-ink-200/80 pt-3 text-[11px] leading-relaxed text-ink-500">
          The first two identifier systems are taken verbatim from the draft Philippine Core guide. The local MRN
          system is namespaced under <span className="font-mono">healthlink.davao.gov.ph</span> so it cannot be mistaken
          for a national standard.
        </p>
      </Card>
    </>
  );
}

void formatDate;
