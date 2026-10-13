/**
 * Retrieve an attached clinical document.
 *
 * Access is checked against the parent referral's facility scope, and every
 * retrieval is audited, because attachments are the most likely place for a
 * privacy incident in an HIE.
 */

import { NextResponse, type NextRequest } from "next/server";
import { getSession, hasPermission, PERMISSIONS } from "@/lib/auth";
import { get, writeAudit } from "@/lib/db";
import { getReferralDetail } from "@/lib/referrals";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const session = await getSession();

  if (!session) {
    return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  }
  if (!hasPermission(session, PERMISSIONS.ATTACHMENT_READ)) {
    writeAudit({
      action: "R",
      eventType: "security",
      eventSubtype: "attachment-denied",
      actorUserId: session.id,
      actorName: session.fullName,
      actorRole: session.role,
      actorFacility: session.facilityId,
      entityType: "DocumentReference",
      entityId: id,
      outcome: "8",
      outcomeDesc: "Role lacks attachment read permission",
      description: `Attempt to retrieve attachment ${id} was refused: the role "${session.role}" does not include attachment access.`,
    });
    return NextResponse.json({ error: "Your role cannot view clinical attachments." }, { status: 403 });
  }

  const row = get<{
    id: string;
    referral_id: string;
    title: string;
    content_type: string;
    content_text: string | null;
    content_b64: string | null;
    doc_type_display: string;
    created_at: string;
  }>("SELECT id, referral_id, title, content_type, content_text, content_b64, doc_type_display, created_at FROM referral_attachments WHERE id = ?", id);

  if (!row) return NextResponse.json({ error: "Attachment not found." }, { status: 404 });

  const detail = getReferralDetail(row.referral_id);
  if (!detail) return NextResponse.json({ error: "Referral not found." }, { status: 404 });

  const crossFacility = session.role === "hie_admin" || session.role === "privacy_auditor";
  const isParty =
    session.facilityId === detail.referringFacility.id || session.facilityId === detail.receivingFacility.id;

  if (!crossFacility && !isParty) {
    writeAudit({
      action: "R",
      eventType: "security",
      eventSubtype: "attachment-denied",
      actorUserId: session.id,
      actorName: session.fullName,
      actorRole: session.role,
      actorFacility: session.facilityId,
      patientId: detail.patient_id,
      referralId: detail.id,
      entityType: "DocumentReference",
      entityId: id,
      outcome: "8",
      outcomeDesc: "Facility scope denied",
      description: `Attempt to retrieve attachment "${row.title}" on referral ${detail.referral_number} was refused: the caller's facility is not a party to the referral.`,
    });
    return NextResponse.json({ error: "Your facility is not a party to this referral." }, { status: 403 });
  }

  // A withdrawn consent blocks further disclosure of the attached documents.
  if (detail.consent?.status === "revoked") {
    writeAudit({
      action: "R",
      eventType: "consent",
      eventSubtype: "attachment-blocked",
      actorUserId: session.id,
      actorName: session.fullName,
      actorRole: session.role,
      actorFacility: session.facilityId,
      patientId: detail.patient_id,
      referralId: detail.id,
      entityType: "DocumentReference",
      entityId: id,
      outcome: "8",
      outcomeDesc: "Consent revoked",
      description: `Retrieval of attachment "${row.title}" was blocked because consent for referral ${detail.referral_number} has been revoked.`,
    });
    return NextResponse.json(
      { error: "Consent for this referral has been revoked, so the attached documents are no longer disclosed." },
      { status: 403 },
    );
  }

  writeAudit({
    action: "R",
    eventType: "read",
    eventSubtype: "attachment-view",
    actorUserId: session.id,
    actorName: session.fullName,
    actorRole: session.role,
    actorFacility: session.facilityId,
    patientId: detail.patient_id,
    referralId: detail.id,
    entityType: "DocumentReference",
    entityId: id,
    outcome: "0",
    outcomeDesc: "Success",
    purposeCode: "treatment",
    description: `Viewed attached document "${row.title}" (${row.doc_type_display}) on referral ${detail.referral_number}.`,
    ipAddress: request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? undefined,
    userAgent: request.headers.get("user-agent") ?? undefined,
  });

  const body = row.content_text ?? (row.content_b64 ? Buffer.from(row.content_b64, "base64").toString("utf8") : "");

  return new NextResponse(body, {
    status: 200,
    headers: {
      "content-type": row.content_text ? "text/plain; charset=utf-8" : row.content_type,
      "content-disposition": `inline; filename="${row.title.replace(/[^A-Za-z0-9-_ ]/g, "")}.txt"`,
      "cache-control": "no-store",
    },
  });
}
