"use client";

import { useActionState, useState } from "react";
import { revokeConsentAction, type ConsentState } from "@/app/actions/referrals";
import { Alert } from "@/components/ui";
import { IconLock } from "@/components/icons";

export function RevokeConsentForm({ consentId, referralId }: { consentId: string; referralId?: string }) {
  const [state, formAction, pending] = useActionState<ConsentState, FormData>(revokeConsentAction, {});
  const [confirming, setConfirming] = useState(false);

  if (state.success) {
    return (
      <div className="mt-3 border-t border-ink-200/80 pt-3">
        <Alert tone="positive">{state.success}</Alert>
      </div>
    );
  }

  if (!confirming) {
    return (
      <div className="mt-3 border-t border-ink-200/80 pt-3">
        <button
          type="button"
          onClick={() => setConfirming(true)}
          className="flex items-center gap-1.5 text-[11.5px] font-medium text-red-700 transition-colors hover:text-red-800"
        >
          <IconLock className="h-3.5 w-3.5" />
          Revoke consent for this exchange
        </button>
      </div>
    );
  }

  return (
    <form action={formAction} className="mt-3 space-y-2.5 border-t border-ink-200/80 pt-3">
      {referralId && <input type="hidden" name="referralId" value={referralId} />}
      <input type="hidden" name="consentId" value={consentId} />

      {state.error && <Alert tone="critical">{state.error}</Alert>}

      <Alert tone="warn" title="Revoking consent">
        This disables further exchange on any linked referral, marks the record highly restricted, and blocks retrieval
        of attached documents. The revocation is recorded in the audit trail with your reason.
      </Alert>

      <div>
        <label htmlFor={`revoke-reason-${consentId}`} className="label">
          Reason for revoking consent <span className="text-red-600">*</span>
        </label>
        <input
          id={`revoke-reason-${consentId}`}
          name="reason"
          required
          className="input"
          placeholder="e.g. Patient withdrew authorisation by telephone, witnessed by nursing staff."
        />
      </div>

      <div className="flex gap-2">
        <button type="submit" disabled={pending} className="btn-danger btn-sm">
          {pending ? "Revoking…" : "Confirm revocation"}
        </button>
        <button type="button" onClick={() => setConfirming(false)} className="btn-ghost btn-sm">
          Cancel
        </button>
      </div>
    </form>
  );
}
