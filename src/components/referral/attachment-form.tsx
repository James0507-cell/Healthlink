"use client";

import { useActionState } from "react";
import { addAttachmentAction, type AttachmentState } from "@/app/actions/referrals";
import { Alert } from "@/components/ui";
import { IconPlus } from "@/components/icons";

const DOC_TYPES = [
  { code: "lab-result", label: "Laboratory result" },
  { code: "diagnostic-report", label: "Diagnostic report" },
  { code: "referral-summary", label: "Referral summary" },
  { code: "clinical-note", label: "Clinical note" },
  { code: "discharge-summary", label: "Discharge summary" },
  { code: "consent-form", label: "Consent form" },
  { code: "other", label: "Other document" },
];

/**
 * Attach a supporting document.
 *
 * Accepts pasted or typed document text rather than file uploads. The concept
 * evaluation runs on synthetic documents, and binary handling (malware
 * scanning, encrypted object storage, DICOM) is a production concern outside
 * this study's scope. The resulting DocumentReference is identical either way.
 */
export function AttachmentFormClient({ referralId }: { referralId: string }) {
  const [state, formAction, pending] = useActionState<AttachmentState, FormData>(addAttachmentAction, {});

  return (
    <form action={formAction} className="space-y-2.5">
      <input type="hidden" name="referralId" value={referralId} />

      {state.error && <Alert tone="critical">{state.error}</Alert>}
      {state.success && <Alert tone="positive">{state.success}</Alert>}

      <div className="grid gap-2.5 sm:grid-cols-[1fr_9.5rem]">
        <div>
          <label htmlFor={`title-${referralId}`} className="label">
            Document title
          </label>
          <input
            id={`title-${referralId}`}
            name="title"
            required
            className="input"
            placeholder="e.g. Chest X-ray report"
          />
        </div>
        <div>
          <label htmlFor={`docType-${referralId}`} className="label">
            Type
          </label>
          <select id={`docType-${referralId}`} name="docTypeCode" className="select" defaultValue="lab-result">
            {DOC_TYPES.map((t) => (
              <option key={t.code} value={t.code}>
                {t.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div>
        <label htmlFor={`content-${referralId}`} className="label">
          Document content
        </label>
        <textarea
          id={`content-${referralId}`}
          name="contentText"
          rows={5}
          required
          className="textarea font-mono text-[11px]"
          placeholder={"Paste or type the document text.\n\nThis becomes the DocumentReference content in the FHIR bundle."}
        />
        <p className="field-hint">
          Text documents only in this prototype (400 KB limit). A production deployment would accept PDF and DICOM
          files, which requires malware scanning and encrypted object storage.
        </p>
      </div>

      <button type="submit" disabled={pending} className="btn-secondary btn-sm">
        <IconPlus className="h-3.5 w-3.5" />
        {pending ? "Attaching…" : "Attach document"}
      </button>
    </form>
  );
}
