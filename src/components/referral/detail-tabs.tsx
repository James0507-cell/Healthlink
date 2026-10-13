"use client";

import { useState, type ReactNode } from "react";

/**
 * In-page tabs for the referral detail view.
 *
 * Client-side rather than URL-driven so that switching between the clinical
 * summary and the history does not reload the referral or re-issue reads. That
 * matters here because every read is audited: an evaluator clicking through tabs
 * should not generate a stream of spurious access events.
 */
export function DetailTabsClient({
  tabs,
  panels,
  defaultTab,
}: {
  tabs: Array<{ id: string; label: string; count?: number }>;
  panels: Record<string, ReactNode>;
  defaultTab: string;
}) {
  const [active, setActive] = useState(defaultTab);

  return (
    <div>
      <div className="mb-4 flex items-center gap-1 border-b border-ink-200 no-print" role="tablist">
        {tabs.map((t) => {
          const isActive = t.id === active;
          return (
            <button
              key={t.id}
              type="button"
              role="tab"
              aria-selected={isActive}
              onClick={() => setActive(t.id)}
              className={`-mb-px flex items-center gap-1.5 border-b-2 px-3 py-2 text-[13px] font-medium transition-colors ${
                isActive
                  ? "border-ink-900 text-ink-900"
                  : "border-transparent text-ink-500 hover:border-ink-300 hover:text-ink-800"
              }`}
            >
              {t.label}
              {t.count !== undefined && (
                <span
                  className={`rounded-full px-1.5 py-0.5 text-[10px] font-semibold tabular-nums ${
                    isActive ? "bg-ink-900 text-white" : "bg-ink-200/70 text-ink-600"
                  }`}
                >
                  {t.count}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* All panels stay mounted so form state and scroll survive tab switches. */}
      {tabs.map((t) => (
        <div key={t.id} role="tabpanel" hidden={t.id !== active}>
          {panels[t.id]}
        </div>
      ))}
    </div>
  );
}
