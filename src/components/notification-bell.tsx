"use client";

import { useState, useRef, useEffect } from "react";
import Link from "next/link";
import { IconBell, IconChevronRight } from "@/components/icons";
import { StatusPill, relativeTime } from "@/components/ui";

export interface NotificationItem {
  id: string;
  referralNumber: string;
  patientName: string;
  status: string;
  updatedAt: string;
  href: string;
}

/**
 * Notification centre: the referrals currently waiting on this user's facility,
 * with the most overdue first. Kept in the header rather than the sidebar so it
 * is visible from every screen without adding navigation noise.
 */
export function NotificationBellClient({
  awaitingCount,
  items,
}: {
  awaitingCount: number;
  items: NotificationItem[];
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="btn-icon relative border border-ink-200 bg-white text-ink-600 hover:border-ink-300 hover:text-ink-900"
        aria-label={awaitingCount > 0 ? `${awaitingCount} referrals need attention` : "No new notifications"}
        aria-expanded={open}
      >
        <IconBell className="h-[15px] w-[15px]" />
        {awaitingCount > 0 && (
          <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-brand-600 px-1 text-[9px] font-semibold text-white ring-2 ring-canvas">
            {awaitingCount > 9 ? "9+" : awaitingCount}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 z-40 mt-2 w-80 rounded-xl border border-ink-200 bg-white shadow-pop">
          <div className="flex items-center justify-between border-b border-ink-200/80 px-3.5 py-2.5">
            <p className="text-[13px] font-semibold text-ink-900">Needs attention</p>
            <span className="text-[11px] text-ink-400">{awaitingCount} total</span>
          </div>

          {items.length === 0 ? (
            <p className="px-3.5 py-5 text-center text-xs text-ink-500">
              Nothing is waiting on your facility.
            </p>
          ) : (
            <ul className="max-h-80 divide-y divide-ink-100 overflow-y-auto thin-scroll">
              {items.map((it) => (
                <li key={it.id}>
                  <Link
                    href={it.href}
                    onClick={() => setOpen(false)}
                    className="flex items-start gap-2.5 px-3.5 py-2.5 transition-colors hover:bg-ink-50"
                  >
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center gap-2">
                        <span className="mono-id truncate text-ink-700">{it.referralNumber}</span>
                        <StatusPill status={it.status} />
                      </span>
                      <span className="mt-0.5 block truncate text-[11.5px] text-ink-700">{it.patientName}</span>
                      <span className="block text-[10.5px] text-ink-400">{relativeTime(it.updatedAt)}</span>
                    </span>
                    <IconChevronRight className="mt-1 h-3.5 w-3.5 shrink-0 text-ink-300" />
                  </Link>
                </li>
              ))}
            </ul>
          )}

          <div className="border-t border-ink-200/80 px-3.5 py-2.5">
            <Link
              href="/referrals"
              onClick={() => setOpen(false)}
              className="text-[12px] font-medium text-brand-700 hover:underline"
            >
              Open the referral worklist
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}
