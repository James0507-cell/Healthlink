"use client";

import { useActionState, useState } from "react";
import { transitionAction, type TransitionState } from "@/app/actions/referrals";
import { Card, Alert } from "@/components/ui";
import { IconArrowRight, IconClose, IconCheck, IconAlert } from "@/components/icons";

export interface TransitionSpec {
  action: string;
  label: string;
  description: string;
  requiresNote: boolean;
  allowsFeedback: boolean;
  allowsOutcome: boolean;
  allowsAppointment: boolean;
  confirm?: string;
  tone: "primary" | "danger" | "neutral";
}

const OUTCOMES: Array<{ code: string; display: string }> = [
  { code: "accepted-for-management", display: "Accepted for management" },
  { code: "admitted", display: "Admitted" },
  { code: "for-outpatient-followup", display: "For outpatient follow-up" },
  { code: "for-procedure", display: "For procedure / surgery" },
  { code: "for-diagnostics", display: "For further diagnostics" },
  { code: "managed-conservatively", display: "Managed conservatively" },
  { code: "redirected-to-tertiary", display: "Redirected to tertiary care" },
  { code: "redirected-to-specialist", display: "Redirected to a specialist service" },
  { code: "resolved", display: "Resolved" },
  { code: "declined-clinical", display: "Declined on clinical grounds" },
  { code: "declined-capacity", display: "Declined — no capacity" },
  { code: "patient-did-not-attend", display: "Patient did not attend" },
  { code: "patient-declined", display: "Patient declined" },
  { code: "deceased", display: "Patient deceased" },
  { code: "other", display: "Other (specify in the note)" },
];

/**
 * The action panel.
 *
 * Renders only the transitions the server determined are both permitted for this
 * user's role and side, and valid from the current state, so the interface can
 * never offer an action the server would refuse.
 */
export function WorkflowActions({
  referralId,
  transitions,
  ready,
  side,
  currentStateLabel,
}: {
  referralId: string;
  status: string;
  transitions: TransitionSpec[];
  ready: boolean;
  side: string;
  currentStateLabel: string;
}) {
  const [state, formAction, pending] = useActionState<TransitionState, FormData>(transitionAction, {});
  const [open, setOpen] = useState<TransitionSpec | null>(null);

  // Lead with the affirmative action; keep destructive ones last and quieter.
  const ordered = [...transitions].sort((a, b) => rank(a) - rank(b));

  if (transitions.length === 0) {
    return (
      <Card title="Actions">
        <p className="text-[12.5px] leading-relaxed text-ink-500">
          {side === "observer"
            ? "Your facility is not a party to this referral, so no actions are available."
            : `No action is available to your role while this referral is ${currentStateLabel.toLowerCase()}.`}
        </p>
      </Card>
    );
  }

  return (
    <>
      <Card title="Actions" description={`${transitions.length} available at ${currentStateLabel.toLowerCase()}`} divided>
        <div className="space-y-3">
          {state.error && (
            <Alert tone="critical" title="Action not completed">
              <p className="whitespace-pre-line">{state.error}</p>
            </Alert>
          )}
          {state.success && (
            <Alert tone="positive">
              {state.success}
            </Alert>
          )}

          <div className="space-y-2">
            {ordered.map((t) => {
              const blocked = t.action === "submit" && !ready;
              return (
                <button
                  key={t.action}
                  type="button"
                  onClick={() => setOpen(t)}
                  disabled={blocked}
                  title={blocked ? "Resolve the outstanding requirements before routing." : t.description}
                  className={`w-full ${
                    t.tone === "danger"
                      ? "btn-secondary text-red-700 hover:border-red-200 hover:bg-red-50"
                      : t.tone === "primary"
                        ? "btn-primary"
                        : "btn-secondary"
                  } justify-between`}
                >
                  <span className="text-left">{t.label}</span>
                  <IconArrowRight className="h-3.5 w-3.5 shrink-0 opacity-60" />
                </button>
              );
            })}
          </div>

          {transitions.some((t) => t.action === "submit") && !ready && (
            <p className="text-[11px] leading-relaxed text-amber-700">
              Routing is locked until the outstanding requirements above are resolved. The referral is saved as a draft.
            </p>
          )}

          <p className="border-t border-ink-200/80 pt-3 text-[10.5px] leading-relaxed text-ink-400">
            Every action is recorded in the referral history and the append-only audit trail with your name, role,
            facility and timestamp.
          </p>
        </div>
      </Card>

      {open && (
        <ActionDialog
          referralId={referralId}
          spec={open}
          pending={pending}
          formAction={formAction}
          onClose={() => setOpen(null)}
        />
      )}
    </>
  );
}

function rank(t: TransitionSpec): number {
  if (t.action === "submit" || t.action === "accept" || t.action === "complete") return 0;
  if (t.action === "receive" || t.action === "schedule" || t.action === "mark-seen") return 1;
  if (t.action === "close-loop") return 2;
  if (t.action === "request-info" || t.action === "supply-info" || t.action === "redirect") return 3;
  if (t.action === "decline" || t.action === "cancel") return 4;
  return 5;
}

function ActionDialog({
  referralId,
  spec,
  pending,
  formAction,
  onClose,
}: {
  referralId: string;
  spec: TransitionSpec;
  pending: boolean;
  formAction: (fd: FormData) => void;
  onClose: () => void;
}) {
  const destructive = spec.action === "decline" || spec.action === "cancel";

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-ink-950/40 p-4 pt-10 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-labelledby="action-dialog-title"
    >
      <div className="w-full max-w-xl overflow-hidden rounded-2xl border border-ink-200 bg-white shadow-pop">
        <header className="flex items-start justify-between gap-4 border-b border-ink-200/80 px-5 py-4">
          <div className="min-w-0">
            <h3 id="action-dialog-title" className="text-[15px] font-semibold tracking-[-0.01em] text-ink-900">
              {spec.label}
            </h3>
            <p className="mt-1 text-[12.5px] leading-relaxed text-ink-500">{spec.description}</p>
          </div>
          <button type="button" onClick={onClose} className="btn-icon shrink-0" aria-label="Close">
            <IconClose className="h-4 w-4" />
          </button>
        </header>

        <form
          action={formAction}
          onSubmit={(e) => {
            if (spec.confirm && !window.confirm(spec.confirm)) e.preventDefault();
          }}
        >
          <div className="max-h-[65vh] space-y-4 overflow-y-auto px-5 py-4">
            <input type="hidden" name="referralId" value={referralId} />
            <input type="hidden" name="action" value={spec.action} />

            {spec.allowsAppointment && (
              <div>
                <label htmlFor="appointmentAt" className="label">
                  Appointment or admission date and time <span className="text-red-600">*</span>
                </label>
                <input id="appointmentAt" name="appointmentAt" type="datetime-local" required className="input" />
                <p className="field-hint">
                  Both the referring provider and the patient see that a slot has been arranged.
                </p>
              </div>
            )}

            {spec.allowsOutcome && (
              <div>
                <label htmlFor="outcomeCode" className="label">
                  Clinical outcome
                </label>
                <select id="outcomeCode" name="outcomeCode" className="select" defaultValue="">
                  <option value="">Select an outcome…</option>
                  {OUTCOMES.map((o) => (
                    <option key={o.code} value={o.code}>
                      {o.display}
                    </option>
                  ))}
                </select>
                <p className="field-hint">
                  This becomes the referring provider&rsquo;s record of what happened, and maps to the FHIR Task
                  status reason.
                </p>
              </div>
            )}

            <div>
              <label htmlFor="note" className="label">
                {spec.requiresNote ? "Reason or clinical note" : "Note"}
                {spec.requiresNote && <span className="text-red-600"> *</span>}
              </label>
              <textarea
                id="note"
                name="note"
                rows={spec.action === "complete" ? 9 : 4}
                required={spec.requiresNote}
                className="textarea"
                placeholder={
                  spec.action === "request-info"
                    ? "State exactly which information or document is needed and why."
                    : spec.action === "decline"
                      ? "State the clinical or administrative reason for declining."
                      : spec.action === "complete"
                        ? "Record the diagnosis or procedure, the management given, the outcome, and the follow-up plan."
                        : "Add any context the receiving provider should know."
                }
              />
              {spec.action === "complete" && (
                <p className="field-hint">
                  This note is returned to the referring provider as the referral&rsquo;s clinical feedback. Include
                  discharge medication and follow-up arrangements.
                </p>
              )}
            </div>

            {spec.allowsFeedback && (
              <fieldset className="rounded-xl border border-ink-200 bg-ink-50/70 p-3.5">
                <legend className="px-1.5 text-[11px] font-semibold uppercase tracking-[0.06em] text-ink-500">
                  Send a message
                </legend>
                <p className="mb-3 text-[11.5px] leading-relaxed text-ink-500">
                  Optional. Use this to open a conversation with the other facility separately from the workflow note.
                </p>
                <div className="space-y-3">
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div>
                      <label htmlFor="messageKind" className="label">
                        Type
                      </label>
                      <select id="messageKind" name="messageKind" className="select" defaultValue="feedback">
                        <option value="feedback">Clinical feedback</option>
                        <option value="query">Query or clarification</option>
                        <option value="update">Care update</option>
                        <option value="information-request">Request for information</option>
                        <option value="information-supplied">Information supplied</option>
                        <option value="acknowledgment">Acknowledgment</option>
                      </select>
                    </div>
                    <div>
                      <label htmlFor="messageSubject" className="label">
                        Subject
                      </label>
                      <input id="messageSubject" name="messageSubject" type="text" className="input" maxLength={200} />
                    </div>
                  </div>
                  <div>
                    <label htmlFor="messageBody" className="label">
                      Message
                    </label>
                    <textarea
                      id="messageBody"
                      name="messageBody"
                      rows={4}
                      className="textarea"
                      placeholder="Appears in the other facility's feedback thread."
                    />
                  </div>
                </div>
              </fieldset>
            )}
          </div>

          <footer className="flex items-center justify-end gap-2 border-t border-ink-200/80 bg-ink-50/50 px-5 py-3">
            <button type="button" onClick={onClose} className="btn-secondary">
              Cancel
            </button>
            <button
              type="submit"
              disabled={pending}
              className={destructive ? "btn-danger" : "btn-primary"}
            >
              {pending ? (
                "Working…"
              ) : (
                <>
                  <IconCheck className="h-3.5 w-3.5" />
                  {spec.label}
                </>
              )}
            </button>
          </footer>
        </form>
      </div>
    </div>
  );
}

void IconAlert;
