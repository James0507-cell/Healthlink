"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { IconSearch } from "@/components/icons";
import { StatusPill } from "@/components/ui";
import { relativeTime } from "@/components/ui";

interface SearchResult {
  kind: "referral" | "patient";
  id: string;
  title: string;
  subtitle: string;
  href: string;
  status?: string;
  updatedAt?: string;
}

/**
 * Header search across referrals and patients the user may see.
 *
 * Debounced, keyboard-navigable, and scoped server-side by the same facility
 * rules as every other read, so it cannot be used to enumerate another
 * facility's patients.
 */
export function GlobalSearchClient() {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [cursor, setCursor] = useState(0);
  const wrapRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Debounce the query.
  useEffect(() => {
    const q = query.trim();
    if (q.length < 2) {
      setResults([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      try {
        const res = await fetch(`/api/search?q=${encodeURIComponent(q)}`, { signal: controller.signal });
        if (res.ok) {
          const data = (await res.json()) as { results: SearchResult[] };
          setResults(data.results ?? []);
          setCursor(0);
        }
      } catch {
        /* aborted or offline */
      } finally {
        setLoading(false);
      }
    }, 220);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [query]);

  // Close on outside click.
  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  // Keyboard shortcut: "/" or Ctrl/Cmd+K focuses search.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const target = e.target as HTMLElement;
      const typing = /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName) || target.isContentEditable;
      if ((e.key === "k" && (e.metaKey || e.ctrlKey)) || (e.key === "/" && !typing)) {
        e.preventDefault();
        inputRef.current?.focus();
      }
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  const go = (r: SearchResult) => {
    setOpen(false);
    setQuery("");
    router.push(r.href);
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setCursor((c) => Math.min(c + 1, results.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setCursor((c) => Math.max(c - 1, 0));
    } else if (e.key === "Enter" && results[cursor]) {
      e.preventDefault();
      go(results[cursor]);
    } else if (e.key === "Escape") {
      setOpen(false);
      inputRef.current?.blur();
    }
  };

  const showPanel = open && query.trim().length >= 2;

  return (
    <div ref={wrapRef} className="relative max-w-xl">
      <div className="relative">
        <IconSearch className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-400" />
        <input
          ref={inputRef}
          type="search"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={onKeyDown}
          placeholder="Search patients or referrals"
          aria-label="Search patients or referrals"
          aria-expanded={showPanel}
          role="combobox"
          aria-controls="search-results"
          className="input h-9 w-full rounded-lg pl-9 pr-16 text-[13px]"
        />
        <span className="pointer-events-none absolute right-2.5 top-1/2 hidden -translate-y-1/2 items-center gap-1 sm:flex">
          <kbd className="kbd">Ctrl</kbd>
          <kbd className="kbd">K</kbd>
        </span>
      </div>

      {showPanel && (
        <div
          id="search-results"
          role="listbox"
          className="absolute left-0 right-0 top-[calc(100%+6px)] z-40 max-h-[26rem] overflow-y-auto rounded-xl border border-ink-200 bg-white p-1.5 shadow-pop thin-scroll"
        >
          {loading && results.length === 0 && (
            <p className="px-3 py-3 text-xs text-ink-500">Searching…</p>
          )}
          {!loading && results.length === 0 && (
            <p className="px-3 py-3 text-xs text-ink-500">
              No patient or referral matched &ldquo;{query.trim()}&rdquo;.
            </p>
          )}
          {results.map((r, i) => (
            <button
              key={`${r.kind}-${r.id}`}
              type="button"
              role="option"
              aria-selected={i === cursor}
              onClick={() => go(r)}
              onMouseEnter={() => setCursor(i)}
              className={`flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left transition-colors ${
                i === cursor ? "bg-ink-100" : "hover:bg-ink-50"
              }`}
            >
              <span className="min-w-0 flex-1">
                <span className="flex items-center gap-2">
                  <span className="truncate text-[13px] font-medium text-ink-900">{r.title}</span>
                  {r.status && <StatusPill status={r.status} />}
                </span>
                <span className="mt-0.5 block truncate text-[11px] text-ink-500">{r.subtitle}</span>
              </span>
              <span className="shrink-0 text-[10px] uppercase tracking-wide text-ink-400">{r.kind}</span>
              {r.updatedAt && (
                <span className="hidden shrink-0 text-[10px] text-ink-400 sm:block">{relativeTime(r.updatedAt)}</span>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
