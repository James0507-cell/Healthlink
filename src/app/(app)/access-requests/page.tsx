import type { Metadata } from "next";
import { redirect } from "next/navigation";
import {
  getSession,
  PERMISSIONS,
  hasPermission,
  requirePageSession,
} from "@/lib/auth";
import { all } from "@/lib/db";
import { Card, PageHeader, Alert, formatDateTime } from "@/components/ui";
import { IconShield, IconLock } from "@/components/icons";

export const metadata: Metadata = { title: "Access requests" };
export const dynamic = "force-dynamic";

/**
 * Break-glass / access-request queue.
 *
 * The scenario this covers is real in a referral network: a clinician at a
 * facility that is not a party to a referral has a legitimate need to see it —
 * the patient has walked in, or a result has been duplicated. The correct answer
 * is not to widen everyone's access. It is a recorded, reviewed, time-limited
 * grant.
 */
export default async function AccessRequestsPage() {
  const session = await requirePageSession();
  // The narrower of the two permissions is sufficient to view this page.
  if (!hasPermission(session, PERMISSIONS.ACCESS_REQUEST_DECIDE) && !hasPermission(session, PERMISSIONS.ACCESS_REQUEST_CREATE)) redirect("/dashboard");

  const requests = all<{
    id: string;
    referral_id: string | null;
    referral_number: string | null;
    requester_name: string | null;
    requester_facility_name: string | null;
    requested_scope: string | null;
    reason: string;
    status: string;
    decided_at: string | null;
    decision_note: string | null;
    created_at: string;
    expires_at: string | null;
    patient_name: string | null;
  }>(
    `SELECT a.*, r.referral_number, u.full_name AS requester_name, f.name AS requester_facility_name,
            (p.given_name || ' ' || p.family_name) AS patient_name
       FROM access_requests a
       LEFT JOIN referrals r ON r.id = a.referral_id
       LEFT JOIN patients p ON p.id = a.patient_id
       LEFT JOIN users u ON u.id = a.requestor_user
       LEFT JOIN facilities f ON f.id = a.requestor_facility
      ORDER BY CASE a.status WHEN 'pending' THEN 0 ELSE 1 END, a.created_at DESC`,
  );

  const pending = requests.filter((r) => r.status === "pending");

  return (
    <>
      <PageHeader
        title="Access requests"
        subtitle="Requests from a facility that is not a party to a referral but has a legitimate clinical need to see it."
      />

      <Alert tone="neutral" className="mb-5">
        <p>
          Cross-facility access is not granted by widening a role. A request names the referral, the requester, the
          scope asked for, and the clinical reason, and is decided by an administrator with an expiry attached. Both
          the request and the decision are audited.
        </p>
      </Alert>

      <div className="mb-5 grid gap-3 sm:grid-cols-3">
        <Tile label="Awaiting decision" value={pending.length} tone={pending.length > 0 ? "warn" : "neutral"} />
        <Tile label="Approved" value={requests.filter((r) => r.status === "approved").length} tone="positive" />
        <Tile label="Declined" value={requests.filter((r) => r.status === "declined").length} tone="neutral" />
      </div>

      {requests.length === 0 ? (
        <Card bodyClassName="px-6 py-12">
          <div className="mx-auto max-w-md text-center">
            <div className="mx-auto mb-3 flex h-10 w-10 items-center justify-center rounded-full bg-ink-100 text-ink-400">
              <IconShield className="h-5 w-5" />
            </div>
            <p className="text-[13px] font-medium text-ink-800">No access requests</p>
            <p className="mt-1.5 text-[12px] leading-relaxed text-ink-500">
              In normal operation there should be none. A queue that stays empty is the healthy state: it means every
              referral in the network involves facilities that are entitled to see it.
            </p>
            <p className="mt-3 text-[11px] leading-relaxed text-ink-400">
              Requests appear here when a clinician needs access to a referral their facility is not party to, for
              example because the patient presented at their emergency department.
            </p>
          </div>
        </Card>
      ) : (
        <ul className="space-y-3">
          {requests.map((r) => (
            <li key={r.id} className="card p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span
                      className={
                        r.status === "pending" ? "chip-warn" : r.status === "approved" ? "chip-positive" : "chip-neutral"
                      }
                    >
                      {r.status}
                    </span>
                    {r.referral_number && <span className="mono-id">{r.referral_number}</span>}
                    {r.patient_name && <span className="text-[12.5px] text-ink-700">{r.patient_name}</span>}
                  </div>
                  <p className="mt-1.5 text-[13px] leading-relaxed text-ink-800">{r.reason}</p>
                  <p className="mt-1 text-[11px] text-ink-500">
                    Requested by {r.requester_name ?? "unknown"} · {r.requester_facility_name ?? "unknown facility"} ·{" "}
                    {formatDateTime(r.created_at)}
                  </p>
                  {r.requested_scope && (
                    <p className="mono-id mt-1">scope: {r.requested_scope}</p>
                  )}
                </div>
                <div className="shrink-0 text-right text-[11px] text-ink-500">
                  {r.decided_at && (
                    <>
                      <p className="font-medium text-ink-700">Decided</p>
                      <p>{formatDateTime(r.decided_at)}</p>
                    </>
                  )}
                  {r.expires_at && (
                    <>
                      <p className="mt-1.5 font-medium text-ink-700">Expires</p>
                      <p>{formatDateTime(r.expires_at)}</p>
                    </>
                  )}
                </div>
              </div>
              {r.decision_note && (
                <p className="mt-2.5 border-t border-ink-200/80 pt-2.5 text-[11.5px] text-ink-600">{r.decision_note}</p>
              )}
            </li>
          ))}
        </ul>
      )}

      <Card title="How a grant would behave" className="mt-5" divided>
        <div className="grid gap-5 lg:grid-cols-2">
          <div>
            <p className="section-label mb-2">If approved</p>
            <ul className="space-y-2">
              {[
                "Scoped to the named referral or patient, not to the whole facility",
                "Time-limited, with the expiry visible in the referring and receiving facilities' audit trails",
                "Every read under the grant is audited and attributable to the named requester",
                "The grant does not confer any write or workflow permission",
              ].map((t) => (
                <li key={t} className="flex gap-2.5">
                  <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-brand-500" aria-hidden="true" />
                  <span className="text-[12.5px] leading-snug text-ink-700">{t}</span>
                </li>
              ))}
            </ul>
          </div>
          <div>
            <p className="section-label mb-2">Why an emergency exception is not automatic</p>
            <p className="text-[12.5px] leading-relaxed text-ink-600">
              In a genuine emergency the lawful basis is usually the patient&rsquo;s{" "}
              <span className="font-medium">vital interests</span> under RA 10173, which the referral itself can record
              without an approval step. That is how an emergency transfer is handled here. A separate decision queue
              exists for the non-emergency case, so that urgency is never used as a routine justification for bypassing
              facility scoping.
            </p>
            <p className="mt-3 flex items-start gap-1.5 text-[11px] leading-relaxed text-ink-400">
              <IconLock className="mt-px h-3 w-3 shrink-0" />
              The decision queue is deliberately a review step with a named human approver, because a system that grants
              itself access on request is not a control.
            </p>
          </div>
        </div>
      </Card>
    </>
  );
}

function Tile({
  label,
  value,
  tone = "neutral",
}: {
  label: string;
  value: number;
  tone?: "positive" | "warn" | "neutral";
}) {
  const toneClass =
    tone === "positive" ? "text-brand-600" : tone === "warn" ? "text-amber-600" : "text-ink-900";
  return (
    <div className="card px-4 py-3.5">
      <p className="text-[11px] font-medium text-ink-500">{label}</p>
      <p className={`mt-1 text-[24px] font-semibold leading-none tabular-nums ${toneClass}`}>{value}</p>
    </div>
  );
}
