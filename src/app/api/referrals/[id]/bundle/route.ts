/**
 * Download the FHIR transaction bundle for a referral.
 *
 * `?inline=1` returns it for on-screen viewing; without it the response is
 * offered as a file download, which is how a facility would hand the package to
 * its own system.
 */

import { NextResponse, type NextRequest } from "next/server";
import { getSession, hasPermission, PERMISSIONS, requestMeta } from "@/lib/auth";
import { getReferralDetail, bundleForReferral } from "@/lib/referrals";
import { writeAudit } from "@/lib/db";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const session = await getSession();

  if (!session) {
    return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  }
  if (!hasPermission(session, PERMISSIONS.FHIR_READ)) {
    return NextResponse.json({ error: "Your role cannot read the FHIR representation." }, { status: 403 });
  }

  const detail = await getReferralDetail(id);
  if (!detail) return NextResponse.json({ error: "Referral not found." }, { status: 404 });

  const crossFacility = session.role === "hie_admin" || session.role === "privacy_auditor";
  const isParty =
    session.facilityId === detail.referringFacility.id || session.facilityId === detail.receivingFacility.id;
  if (!crossFacility && !isParty) {
    await writeAudit({
      action: "R",
      eventType: "security",
      eventSubtype: "bundle-export-denied",
      actorUserId: session.id,
      actorName: session.fullName,
      actorRole: session.role,
      actorFacility: session.facilityId,
      referralId: id,
      outcome: "8",
      outcomeDesc: "Facility scope denied",
      description: `Bundle export for ${detail.referral_number} was refused: the caller's facility is not a party to the referral.`,
    });
    return NextResponse.json({ error: "Your facility is not a party to this referral." }, { status: 403 });
  }

  const bundle = await bundleForReferral(detail);

  await writeAudit({
    action: "R",
    eventType: "export",
    eventSubtype: "bundle-download",
    actorUserId: session.id,
    actorName: session.fullName,
    actorRole: session.role,
    actorFacility: session.facilityId,
    patientId: detail.patient_id,
    referralId: id,
    entityType: "Bundle",
    entityId: `bundle-${id}`,
    outcome: "0",
    outcomeDesc: "Success",
    purposeCode: "treatment",
    description: `Exported the FHIR transaction bundle for referral ${detail.referral_number} (${bundle.entry?.length ?? 0} resources).`,
    ipAddress: request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? undefined,
    userAgent: request.headers.get("user-agent") ?? undefined,
  });

  const inline = request.nextUrl.searchParams.get("inline") === "1";
  const body = JSON.stringify(bundle, null, inline ? 2 : 0);

  return new NextResponse(body, {
    status: 200,
    headers: {
      "content-type": "application/fhir+json; charset=utf-8",
      ...(inline
        ? {}
        : { "content-disposition": `attachment; filename="${detail.referral_number}-fhir-bundle.json"` }),
    },
  });
}
