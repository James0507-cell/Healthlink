import { Card, Fact, StatusPill, formatDate } from "@/components/ui";
import { RevokeConsentForm } from "./revoke-consent-form";
import { LAWFUL_BASIS } from "@/lib/fhir/terminology";
import { IconShield, IconLock } from "@/components/icons";
import type { ReferralDetail } from "@/lib/referrals";

/** Consent and lawful-basis panel for a referral. */
export function ConsentPanel({ detail, canRevoke }: { detail: ReferralDetail; canRevoke: boolean }) {
  const c = detail.consent;
  const basis = LAWFUL_BASIS[detail.lawful_basis_code];
  const active = c?.status === "active";

  return (
    <Card
      title={
        <span className="flex items-center gap-1.5">
          <IconShield className="h-3.5 w-3.5 text-ink-400" />
          <span className="card-title">Consent</span>
        </span>
      }
      actions={c ? <StatusPill status={active ? "received" : "cancelled"} /> : undefined}
      divided
    >
      <dl className="space-y-3.5">
        <Fact label="Basis for processing">
          {detail.lawful_basis_display}
          {basis && (
            <>
              <span className="mt-1 block text-[11px] leading-relaxed text-ink-500">{basis.note}</span>
              <span className="mono-id mt-1 block">{basis.legalRef}</span>
            </>
          )}
        </Fact>

        {!c && (
          <div className="rounded-lg border border-ink-200 bg-ink-50 px-3 py-2.5 text-[11.5px] leading-relaxed text-ink-600">
            No separate authorisation is required for this basis. The basis is recorded on the referral and carried in
            the FHIR Consent resource for traceability.
          </div>
        )}

        {c && (
          <>
            <Fact label="Authorised by">
              {c.granted_by_name ?? "Not recorded"}
              {c.granted_by_relation && c.granted_by_relation !== "not-required" ? ` (${c.granted_by_relation})` : ""}
            </Fact>
            <Fact label="Valid until">{formatDate(c.period_end)}</Fact>
            {c.revoked_at && (
              <Fact label="Revoked">
                <span className="text-red-700">
                  {formatDate(c.revoked_at)}
                  {c.revoke_reason ? ` — ${c.revoke_reason}` : ""}
                </span>
              </Fact>
            )}
            <Fact label="Data classes in scope">
              {parseList(c.scope_data_classes).join(", ") || "Not restricted by class"}
            </Fact>
          </>
        )}
      </dl>

      {canRevoke && c && <RevokeConsentForm consentId={c.id} referralId={detail.id} />}

      {!canRevoke && c && active && (
        <p className="mt-3 flex items-start gap-1.5 border-t border-ink-200/80 pt-2.5 text-[10.5px] leading-relaxed text-ink-400">
          <IconLock className="mt-px h-3 w-3 shrink-0" />
          Revoking consent requires the patient-facing role at the facility that obtained it.
        </p>
      )}
    </Card>
  );
}

function parseList(json: string | null | undefined): string[] {
  if (!json) return [];
  try {
    const v = JSON.parse(json);
    return Array.isArray(v) ? v.map(String) : [];
  } catch {
    return [];
  }
}
