import { redirect } from "next/navigation";
import { getSession, PERMISSIONS, hasPermission, ROLE_LABELS } from "@/lib/auth";
import { dashboardStats, referralCounts } from "@/lib/referrals";
import { all } from "@/lib/db";
import { STATES, type ReferralState } from "@/lib/workflow";
import { PHCORE_IG } from "@/lib/fhir/terminology";
import { formatDateLong } from "@/components/ui";

export const dynamic = "force-dynamic";

/** Printable process report, for inclusion as an appendix. */
export default async function PrintReportPage() {
  const session = (await getSession())!;
  if (!hasPermission(session, PERMISSIONS.REPORT_VIEW)) redirect("/dashboard");

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
  }>(
    `SELECT
       COUNT(*) AS total,
       SUM(CASE WHEN r.history_of_present IS NOT NULL AND TRIM(r.history_of_present) <> '' THEN 1 ELSE 0 END) AS with_hpi,
       SUM(CASE WHEN r.physical_examination IS NOT NULL AND TRIM(r.physical_examination) <> '' THEN 1 ELSE 0 END) AS with_pe,
       SUM(CASE WHEN (SELECT COUNT(*) FROM referral_observations o WHERE o.referral_id = r.id) > 0 THEN 1 ELSE 0 END) AS with_obs,
       SUM(CASE WHEN (SELECT COUNT(*) FROM referral_medications m WHERE m.referral_id = r.id) > 0 THEN 1 ELSE 0 END) AS with_meds,
       SUM(CASE WHEN (SELECT COUNT(*) FROM referral_allergies a WHERE a.referral_id = r.id) > 0 THEN 1 ELSE 0 END) AS with_allergies,
       SUM(CASE WHEN (SELECT COUNT(*) FROM referral_attachments t WHERE t.referral_id = r.id) > 0 THEN 1 ELSE 0 END) AS with_attachments
     FROM referrals r
     WHERE ${facilityFilter} AND r.deleted_at IS NULL AND r.status <> 'draft'`,
    ...facilityParams,
  ))[0];

  const nonDraft =
    (await all<{ n: number }>(
      `SELECT COUNT(*) AS n FROM referrals r WHERE ${facilityFilter} AND r.deleted_at IS NULL AND r.status <> 'draft'`,
      ...facilityParams,
    ))[0]?.n ?? 0;

  const infoRequests = (await all<{ n: number }>(
    `SELECT COUNT(DISTINCT r.id) AS n FROM referrals r
       JOIN referral_events e ON e.referral_id = r.id
      WHERE ${facilityFilter} AND e.to_status = 'info-requested'`,
    ...facilityParams,
  ))[0]?.n ?? 0;

  const pct = (n: number, d: number) => (d ? `${Math.round((n / d) * 100)}%` : "—");

  const rows: Array<[string, string | number, string]> = [
    ["Referrals routed", nonDraft, "Excludes drafts"],
    ["Closed with feedback", `${stats.closedLoopRate}%`, "Of referrals reaching completion"],
    ["Median time to close", stats.medianTurnaroundHours != null ? `${stats.medianTurnaroundHours} h` : "—", "Routing to feedback returned"],
    ["Average time to accept", stats.avgTimeToAcceptHours != null ? `${stats.avgTimeToAcceptHours} h` : "—", "Routing to acceptance"],
    ["Overdue now", stats.overdueCount, "Past the expected response window"],
    ["Returned for information", `${infoRequests} (${pct(infoRequests, nonDraft)})`, "Additional detail requested by the receiver"],
  ];

  const completenessRows: Array<[string, number]> = [
    ["History of present illness", completeness?.with_hpi ?? 0],
    ["Physical examination", completeness?.with_pe ?? 0],
    ["Objective findings (vitals or results)", completeness?.with_obs ?? 0],
    ["Medication history", completeness?.with_meds ?? 0],
    ["Allergy history", completeness?.with_allergies ?? 0],
    ["Supporting document attached", completeness?.with_attachments ?? 0],
  ];

  return (
    <div className="mx-auto max-w-[46rem] bg-white px-8 py-8 text-ink-900 print:px-0 print:py-0">
      <header className="mb-7 flex items-start justify-between gap-6 border-b-2 border-ink-900 pb-4">
        <div>
          <p className="text-lg font-semibold tracking-tight">HealthLink</p>
          <p className="text-[11px] text-ink-600">Referral process report</p>
        </div>
        <div className="text-right text-[11px] leading-relaxed text-ink-600">
          <p className="font-medium text-ink-900">Generated</p>
          <p>{formatDateLong(new Date().toISOString())}</p>
          <p className="mt-1.5 font-medium text-ink-900">Scope</p>
          <p>{crossFacility ? "All facilities in the network" : (session.facilityName ?? "Your facility")}</p>
        </div>
      </header>

      <section className="mb-7">
        <h2 className="mb-3 text-[11px] font-semibold uppercase tracking-[0.07em] text-ink-500">
          Summary measures
        </h2>
        <table className="w-full text-[12px]">
          <thead>
            <tr className="border-b border-ink-300 text-left">
              <th className="py-1.5 font-semibold">Measure</th>
              <th className="py-1.5 font-semibold">Value</th>
              <th className="py-1.5 font-semibold">Note</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(([label, value, note]) => (
              <tr key={String(label)} className="border-b border-ink-100">
                <td className="py-1.5 pr-3">{label}</td>
                <td className="py-1.5 pr-3 font-medium tabular-nums">{value}</td>
                <td className="py-1.5 text-[11px] text-ink-600">{note}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section className="mb-7">
        <h2 className="mb-3 text-[11px] font-semibold uppercase tracking-[0.07em] text-ink-500">
          Clinical summary completeness
        </h2>
        <table className="w-full text-[12px]">
          <thead>
            <tr className="border-b border-ink-300 text-left">
              <th className="py-1.5 font-semibold">Element</th>
              <th className="py-1.5 font-semibold">Present</th>
              <th className="py-1.5 font-semibold">Rate</th>
            </tr>
          </thead>
          <tbody>
            {completenessRows.map(([label, n]) => (
              <tr key={label} className="border-b border-ink-100">
                <td className="py-1.5 pr-3">{label}</td>
                <td className="py-1.5 pr-3 tabular-nums">{n}</td>
                <td className="py-1.5 font-medium tabular-nums">{pct(n, completeness?.total ?? 0)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="mt-2 text-[10px] text-ink-500">
          Denominator: {completeness?.total ?? 0} routed referral{completeness?.total === 1 ? "" : "s"}.
        </p>
      </section>

      <section className="mb-7">
        <h2 className="mb-3 text-[11px] font-semibold uppercase tracking-[0.07em] text-ink-500">
          Workflow distribution
        </h2>
        <table className="w-full text-[12px]">
          <thead>
            <tr className="border-b border-ink-300 text-left">
              <th className="py-1.5 font-semibold">Referral state</th>
              <th className="py-1.5 font-semibold">Awaiting</th>
              <th className="py-1.5 font-semibold">Count</th>
            </tr>
          </thead>
          <tbody>
            {counts.map((c) => {
              const def = STATES[c.status as ReferralState];
              return (
                <tr key={c.status} className="border-b border-ink-100">
                  <td className="py-1.5 pr-3">{def?.label ?? c.status}</td>
                  <td className="py-1.5 pr-3 text-[11px] text-ink-600">{def?.awaiting ?? "—"}</td>
                  <td className="py-1.5 font-medium tabular-nums">{c.n}</td>
                </tr>
              );
            })}
            {counts.length === 0 && (
              <tr>
                <td colSpan={3} className="py-2 text-ink-500">
                  No referrals in scope.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </section>

      <section className="mb-7">
        <h2 className="mb-3 text-[11px] font-semibold uppercase tracking-[0.07em] text-ink-500">
          Interpretation
        </h2>
        <p className="text-[12px] leading-relaxed">
          These are <span className="font-medium">process</span> measures. They describe how referrals move through the
          network: whether the clinical summary carried the information a receiving provider needs, how long each stage
          took, and how often a referral had to be returned for additional detail. They do not measure mortality,
          morbidity, cost or patient experience, and no claim of clinical outcome improvement is made.
        </p>
        <p className="mt-3 text-[12px] leading-relaxed">
          The figures derive from synthetic demonstration data generated for a concept evaluation. They demonstrate the
          reporting capability of the platform and are not findings about referral practice in Davao City.
        </p>
      </section>

      <footer className="mt-8 border-t border-ink-300 pt-4 text-[10px] leading-relaxed text-ink-600">
        <p>
          <span className="font-medium">Prepared by:</span> {session.fullName} ({ROLE_LABELS[session.role]}) ·{" "}
          {session.facilityName ?? "HealthLink network"}
        </p>
        <p className="mt-1">
          <span className="font-medium">Alignment target:</span> <span className="font-mono">
            {PHCORE_IG.package}#{PHCORE_IG.version}
          </span>{" "}
          — a draft guide treated as an alignment reference, not a finalized regulatory requirement.
        </p>
        <p className="mt-2">
          HealthLink is a concept prototype. This report contains synthetic data only and must not be treated as a
          clinical or operational record.
        </p>
      </footer>

      <p className="mt-4 text-center text-[10px] text-ink-400 no-print">
        Use your browser&rsquo;s print function (Ctrl/Cmd + P) to produce a paper or PDF copy.
      </p>
    </div>
  );
}
