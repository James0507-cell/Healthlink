"use client";

import { useState, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import { initials, displayName, titlePrefix } from "@/components/ui";
import { IconLogout, IconChevronDown, IconUserCircle } from "@/components/icons";

export function UserMenu({
  name,
  email,
  role,
  facility,
  logout,
}: {
  name: string;
  email: string;
  role: string;
  facility: string;
  logout: () => Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const router = useRouter();

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

  const prefix = titlePrefix(name);
  const bare = displayName(name);

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-2 rounded-lg border border-ink-200 bg-white py-1 pl-1 pr-2 text-left shadow-xs transition-colors hover:border-ink-300"
        aria-expanded={open}
        aria-haspopup="menu"
      >
        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-ink-900 text-[11px] font-semibold text-white">
          {initials(name)}
        </span>
        <span className="hidden min-w-0 leading-tight sm:block">
          <span className="block max-w-[9.5rem] truncate text-[12.5px] font-medium text-ink-900">{bare}</span>
          <span className="block max-w-[9.5rem] truncate text-[10.5px] text-ink-400">{role}</span>
        </span>
        <IconChevronDown className="h-3 w-3 shrink-0 text-ink-400" />
      </button>

      {open && (
        <div
          className="absolute right-0 z-40 mt-2 w-72 overflow-hidden rounded-xl border border-ink-200 bg-white shadow-pop"
          role="menu"
        >
          <div className="flex items-start gap-3 border-b border-ink-200/80 px-4 py-3.5">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-ink-900 text-xs font-semibold text-white">
              {initials(name)}
            </span>
            <div className="min-w-0">
              <p className="truncate text-[13px] font-medium text-ink-900">
                {prefix ? `${prefix} ` : ""}
                {bare}
              </p>
              <p className="truncate text-[11px] text-ink-500">{email}</p>
              <p className="mt-1 truncate text-[11px] text-ink-400">
                {role} · {facility}
              </p>
            </div>
          </div>

          <div className="p-1.5">
            <button
              type="button"
              onClick={() => {
                setOpen(false);
                router.push("/account");
              }}
              className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-[13px] text-ink-700 transition-colors hover:bg-ink-100"
              role="menuitem"
            >
              <IconUserCircle className="h-4 w-4 text-ink-400" />
              Your account and access
            </button>
          </div>

          <div className="border-t border-ink-200/80 p-1.5">
            <form action={logout}>
              <button
                type="submit"
                className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-[13px] text-ink-700 transition-colors hover:bg-red-50 hover:text-red-700"
                role="menuitem"
              >
                <IconLogout className="h-4 w-4" />
                Sign out
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
