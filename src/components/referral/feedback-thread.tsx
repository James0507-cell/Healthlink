import { Card, formatDateTime, initials } from "@/components/ui";
import { MESSAGE_KINDS } from "@/lib/workflow";
import { IconMessage } from "@/components/icons";

/**
 * Two-way feedback thread.
 *
 * This is how the closed loop actually closes: the receiving provider records
 * the decision and outcome here, and the referring provider acknowledges it.
 * Each message maps to a FHIR Communication.
 */
export function FeedbackThread({
  detail,
  canPost,
}: {
  detail: {
    id: string;
    referral_number: string;
    messages: Array<{
      id: string;
      kind: string;
      subject: string | null;
      body: string;
      sender_name: string | null;
      sender_facility: string | null;
      created_at: string;
      read_at: string | null;
    }>;
    referringFacility: { id: string; name: string };
    receivingFacility: { id: string; name: string };
  };
  canPost: boolean;
  currentUserId: string;
}) {
  const messages = detail.messages;

  const facilityName = (facilityId: string | null) => {
    if (!facilityId) return null;
    if (facilityId === detail.referringFacility.id) return detail.referringFacility.name;
    if (facilityId === detail.receivingFacility.id) return detail.receivingFacility.name;
    return null;
  };

  return (
    <Card
      title="Feedback and communication"
      description={
        messages.length > 0
          ? `${messages.length} message${messages.length === 1 ? "" : "s"} exchanged, oldest first`
          : undefined
      }
      divided
      bodyClassName="px-4 pb-4 pt-4"
    >
      {messages.length === 0 ? (
        <div className="rounded-xl border border-dashed border-ink-200 bg-ink-50/50 px-5 py-8 text-center">
          <div className="mx-auto mb-3 flex h-9 w-9 items-center justify-center rounded-full bg-white text-ink-400 ring-1 ring-ink-200">
            <IconMessage className="h-4 w-4" />
          </div>
          <p className="text-[13px] font-medium text-ink-800">No feedback exchanged yet</p>
          <p className="mx-auto mt-1.5 max-w-md text-[12px] leading-relaxed text-ink-500">
            {canPost
              ? "Use an action such as “Request more information” or “Complete & send feedback” to start the conversation."
              : "The receiving provider's decision and outcome will appear here."}
          </p>
          <p className="mx-auto mt-3 max-w-md text-[10.5px] leading-relaxed text-ink-400">
            Closed-loop referral management depends on feedback. Without it the referring provider cannot know whether
            the patient attended, whether the requested service was appropriate, or what follow-up is needed.
          </p>
        </div>
      ) : (
        <ul className="space-y-3.5">
          {messages.map((m) => {
            const kind = MESSAGE_KINDS.find((k) => k.code === m.kind);
            const fromFacility = facilityName(m.sender_facility);
            const isReceiving = m.sender_facility === detail.receivingFacility.id;

            return (
              <li
                key={m.id}
                className={`rounded-xl border px-4 py-3.5 ${
                  isReceiving ? "border-ink-200 bg-white" : "border-brand-200/70 bg-brand-50/40"
                }`}
              >
                <div className="flex items-start gap-3">
                  <span
                    className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-[11px] font-semibold ${
                      isReceiving ? "bg-ink-900 text-white" : "bg-brand-600 text-white"
                    }`}
                  >
                    {initials(m.sender_name ?? "HL")}
                  </span>

                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                      <span className="text-[13px] font-medium text-ink-900">{m.sender_name ?? "HealthLink"}</span>
                      <span className={`chip-${toneFor(kind?.tone)}`}>{kind?.display ?? m.kind}</span>
                      <time className="ml-auto shrink-0 text-[10.5px] tabular-nums text-ink-400">
                        {formatDateTime(m.created_at)}
                      </time>
                    </div>

                    {fromFacility && <p className="mt-0.5 text-[11px] text-ink-500">{fromFacility}</p>}

                    {m.subject && (
                      <p className="mt-2 text-[13.5px] font-medium leading-snug text-ink-900">{m.subject}</p>
                    )}
                    <div className="mt-1.5 whitespace-pre-wrap text-[13.5px] leading-[1.7] text-ink-700">
                      {m.body}
                    </div>

                    <p className="mono-id mt-2.5">Communication/{m.id.slice(0, 18)}</p>
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </Card>
  );
}

function toneFor(tone: string | undefined): string {
  if (tone === "positive") return "positive";
  if (tone === "warn") return "warn";
  if (tone === "info") return "info";
  return "neutral";
}
