/**
 * Global search over patients and referrals.
 *
 * Scoping is applied server-side using the same facility rules as every other
 * read, so the type-ahead cannot be used to enumerate another facility's
 * patients or referrals.
 */

import { NextResponse, type NextRequest } from "next/server";
import { getSession, hasPermission, PERMISSIONS } from "@/lib/auth";
import { all } from "@/lib/db";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ results: [] }, { status: 401 });

  const q = (request.nextUrl.searchParams.get("q") ?? "").trim();
  if (q.length < 2) return NextResponse.json({ results: [] });

  const canReferrals = hasPermission(session, PERMISSIONS.REFERRAL_READ_OWN_FACILITY);
  const canPatients = hasPermission(session, PERMISSIONS.PATIENT_READ);
  if (!canReferrals && !canPatients) return NextResponse.json({ results: [] });

  const crossFacility = session.role === "hie_admin" || session.role === "privacy_auditor";
  const like = `%${q}%`;
  const results: Array<Record<string, unknown>> = [];

  /* --- Referrals --- */
  if (canReferrals) {
    const scope = crossFacility
      ? "1 = 1"
      : session.facilityId
        ? "(r.referring_facility_id = ? OR r.receiving_facility_id = ?)"
        : "1 = 0";
    const scopeParams: unknown[] = crossFacility || !session.facilityId ? [] : [session.facilityId, session.facilityId];

    const rows = await all<{
      id: string;
      referral_number: string;
      status: string;
      updated_at: string;
      reason_display: string;
      patient_name: string;
      patient_mrn: string | null;
      referring_name: string;
      receiving_name: string;
    }>(
      `SELECT r.id, r.referral_number, r.status, r.updated_at, r.reason_display,
              (p.given_name || ' ' || p.family_name) AS patient_name, p.local_mrn AS patient_mrn,
              rf.name AS referring_name, rc.name AS receiving_name
         FROM referrals r
         JOIN patients p ON p.id = r.patient_id
         JOIN facilities rf ON rf.id = r.referring_facility_id
         JOIN facilities rc ON rc.id = r.receiving_facility_id
        WHERE r.deleted_at IS NULL AND r.status <> 'draft' AND (${scope})
          AND (r.referral_number LIKE ? OR r.tracking_code LIKE ?
               OR p.family_name LIKE ? OR p.given_name LIKE ?
               OR p.local_mrn LIKE ? OR p.philhealth_id LIKE ?)
        ORDER BY r.updated_at DESC
        LIMIT 6`,
      ...scopeParams,
      like,
      like,
      like,
      like,
      like,
      like,
    );

    for (const r of rows) {
      results.push({
        kind: "referral",
        id: r.id,
        title: r.referral_number,
        subtitle: `${r.patient_name} · ${r.reason_display} · ${r.referring_name} → ${r.receiving_name}`,
        href: `/referrals/${r.id}`,
        status: r.status,
        updatedAt: r.updated_at,
      });
    }
  }

  /* --- Patients --- */
  if (canPatients) {
    const rows = await all<{
      id: string;
      given_name: string;
      family_name: string;
      local_mrn: string | null;
      birth_date: string;
      sex: string;
      barangay_display: string | null;
    }>(
      `SELECT id, given_name, family_name, local_mrn, birth_date, sex, barangay_display
         FROM patients
        WHERE merged_into IS NULL
          AND (family_name LIKE ? OR given_name LIKE ? OR local_mrn LIKE ? OR philhealth_id LIKE ?)
        ORDER BY family_name, given_name
        LIMIT 6`,
      like,
      like,
      like,
      like,
    );

    for (const p of rows) {
      results.push({
        kind: "patient",
        id: p.id,
        title: `${p.given_name} ${p.family_name}`,
        subtitle: `${p.sex} · born ${p.birth_date}${p.barangay_display ? ` · ${p.barangay_display}` : ""}${p.local_mrn ? ` · MRN ${p.local_mrn}` : ""}`,
        href: `/patients?q=${encodeURIComponent(p.family_name)}`,
      });
    }
  }

  return NextResponse.json({ results });
}
