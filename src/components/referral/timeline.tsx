import { Card, StatusPill } from "@/components/ui";
import { STATES, type ReferralState } from "@/lib/workflow";

const TONE_MARKER: Record<string, string> = {
  neutral: "bg-ink-400",
  info: "bg-sky-500",
  warn: "bg-amber-500",
  positive: "bg-brand-500",
  critical: "bg-red-500",
  done: "bg-ink-700",
};

/**
 * Closed-loop history.
 *
 * Rendered as a single vertical timeline with the FHIR mapping shown inline, so
 * an evaluator can see at a glance that each workflow state corresponds to a
 * Task.status value rather than being an application-only construct.
 */
export function ReferralTimeline({
  events,
}: {
  events: Array<{
    id: string;
    sequence: number;
    from_status: string | null;
    to_status: string;
    action: string;
    actor_name: string | null;
    actor_role: string | null;
    note: string | null;
    created_at: string;
    fhir_task_status: string | null;
    business_status: string | null;
    fhir_task_version: number | null;
  }>;
}) {
  if (events.length === 0) {
    return (
      <Card title="History">
        <p className="text-[12.5px] text-ink-500">No workflow events recorded yet.</p>
      </Card>
    );
  }

  return (
    <Card
      title="History"
      description={`${events.length} recorded step${events.length === 1 ? "" : "s"}, newest last`}
      bodyClassName="px-4 pb-5 pt-1"
    >
      <ol className="relative">
        {events.map((e, i) => {
          const def = STATES[e.to_status as ReferralState];
          const isLast = i === events.length - 1;
          return (
            <li key={e.id} className="relative flex gap-3.5">
              {/* Rail */}
              <span className="relative flex w-3 shrink-0 justify-center">
                <span
                  className={`mt-[7px] h-2.5 w-2.5 shrink-0 rounded-full ring-2 ring-white ${
                    TONE_MARKER[def?.tone ?? "neutral"]
                  } ${isLast ? "shadow-[0_0_0_3px_rgba(16,185,129,0.14)]" : ""}`}
                  aria-hidden="true"
                />
                {!isLast && <span className="absolute top-[19px] h-[calc(100%-10px)] w-px bg-ink-200" aria-hidden="true" />}
              </span>

              <div className={`min-w-0 flex-1 ${isLast ? "pb-0" : "pb-5"}`}>
                <div className="flex flex-wrap items-center gap-2">
                  <StatusPill status={e.to_status} />
                  {e.from_status && (
                    <span className="text-[10.5px] text-ink-400">
                      from {STATES[e.from_status as ReferralState]?.label ?? e.from_status}
                    </span>
                  )}
                  <time className="ml-auto shrink-0 text-[10.5px] tabular-nums text-ink-400">
                    {new Date(e.created_at).toLocaleString("en-PH", {
                      month: "short",
                      day: "2-digit",
                      hour: "numeric",
                      minute: "2-digit",
                      hour12: true,
                    })}
                  </time>
                </div>

                <p className="mt-1.5 text-[12px] text-ink-600">
                  {e.actor_name ? (
                    <>
                      by <span className="font-medium text-ink-800">{e.actor_name}</span>
                      {e.actor_role ? ` · ${e.actor_role.replace(/_/g, " ")}` : ""}
                    </>
                  ) : (
                    "recorded by the system"
                  )}
                </p>

                {e.note && (
                  <p className="mt-2 rounded-lg border-l-2 border-brand-300 bg-brand-50/50 px-3 py-2 text-[12.5px] leading-relaxed text-ink-700">
                    {e.note}
                  </p>
                )}

                <p className="mono-id mt-1.5 flex flex-wrap gap-x-2 gap-y-0.5">
                  <span title="FHIR Task.status">
                    Task.status={e.fhir_task_status ?? "—"}
                  </span>
                  {e.business_status && <span title="FHIR Task.businessStatus">/ {e.business_status}</span>}
                  {e.fhir_task_version != null && <span className="text-ink-400">· bundle v{e.fhir_task_version}</span>}
                </p>
              </div>
            </li>
          );
        })}
      </ol>
    </Card>
  );
}
