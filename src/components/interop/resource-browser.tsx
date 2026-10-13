"use client";

import { useState } from "react";
import { formatDateTime, relativeTime } from "@/components/ui";
import { IconCopy, IconExternal, IconSearch } from "@/components/icons";

export interface ExplorerResource {
  id: string;
  versionId: number;
  lastUpdated: string;
  referralNumber: string | null;
  summary: string;
  profile?: string;
}

/**
 * Resource list plus JSON viewer.
 *
 * JSON renders in a plain <pre> rather than a highlighting library, so the exact
 * bytes a receiving system would parse are shown and the viewer keeps working
 * offline during the evaluation.
 */
export function ResourceBrowser({
  resourceType,
  resources,
  selectedId,
  selectedJson,
}: {
  resourceType: string;
  resources: ExplorerResource[];
  selectedId?: string;
  selectedJson: string;
}) {
  const [query, setQuery] = useState("");
  const [copied, setCopied] = useState(false);

  const filtered = query.trim()
    ? resources.filter(
        (r) =>
          r.id.toLowerCase().includes(query.toLowerCase()) ||
          r.summary.toLowerCase().includes(query.toLowerCase()) ||
          (r.referralNumber ?? "").toLowerCase().includes(query.toLowerCase()),
      )
    : resources;

  const selected = resources.find((r) => r.id === selectedId);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(selectedJson);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      setCopied(false);
    }
  };

  return (
    <div className="space-y-4">
      <section className="card">
        <header className="flex flex-wrap items-center justify-between gap-3 px-4 py-3.5">
          <div>
            <h2 className="card-title">{resourceType}</h2>
            <p className="card-desc">
              {filtered.length}
              {query && filtered.length !== resources.length ? ` of ${resources.length}` : ""} resource
              {filtered.length === 1 ? "" : "s"}
            </p>
          </div>
          <div className="relative w-full max-w-xs">
            <IconSearch className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-ink-400" />
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Filter by id, referral or summary"
              aria-label={`Filter ${resourceType} resources`}
              className="input h-8 pl-9 text-[12px]"
            />
          </div>
        </header>

        <div className="max-h-[30rem] overflow-y-auto thin-scroll">
          <ul className="divide-y divide-ink-100">
            {filtered.length === 0 && <li className="px-4 py-4 text-[12.5px] text-ink-500">No resource matched.</li>}
            {filtered.map((r) => {
              const isActive = r.id === selectedId;
              return (
                <li key={r.id}>
                  <a
                    href={`/interop/explorer?type=${encodeURIComponent(resourceType)}&id=${encodeURIComponent(r.id)}`}
                    className={`block px-4 py-2.5 transition-colors ${isActive ? "bg-ink-100" : "hover:bg-ink-50"}`}
                    aria-current={isActive ? "true" : undefined}
                  >
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="mono-id truncate text-ink-800">
                        {resourceType}/{r.id}
                      </span>
                      <span className="chip-neutral">v{r.versionId}</span>
                      {r.referralNumber && <span className="mono-id">{r.referralNumber}</span>}
                      <span className="ml-auto shrink-0 text-[10.5px] text-ink-400" title={formatDateTime(r.lastUpdated)}>
                        {relativeTime(r.lastUpdated)}
                      </span>
                    </div>
                    {r.summary && <p className="mt-1 truncate text-[11.5px] text-ink-600">{r.summary}</p>}
                    {r.profile && (
                      <p className="mono-id mt-1 truncate text-[10px] text-brand-700">{r.profile.split("/").pop()}</p>
                    )}
                  </a>
                </li>
              );
            })}
          </ul>
        </div>
      </section>

      {selectedId && selectedJson && (
        <section className="card">
          <header className="flex flex-wrap items-start justify-between gap-3 px-4 py-3.5">
            <div className="min-w-0">
              <h2 className="mono-id truncate text-[13px] font-medium text-ink-900">
                {resourceType}/{selectedId}
              </h2>
              {selected?.profile && <p className="mono-id mt-0.5 truncate text-[10px] text-brand-700">{selected.profile}</p>}
            </div>
            <div className="flex shrink-0 gap-2">
              <button type="button" onClick={copy} className="btn-secondary btn-sm">
                <IconCopy className="h-3.5 w-3.5" />
                {copied ? "Copied" : "Copy JSON"}
              </button>
              <a
                href={`/fhir/${resourceType}/${selectedId}`}
                target="_blank"
                rel="noreferrer"
                className="btn-secondary btn-sm"
              >
                <IconExternal className="h-3.5 w-3.5" />
                Via facade
              </a>
            </div>
          </header>
          <div className="px-3 pb-3">
            <pre className="code-block thin-scroll max-h-[40rem]">{selectedJson}</pre>
          </div>
          <footer className="border-t border-ink-200/80 px-4 py-2.5">
            <p className="text-[10.5px] leading-relaxed text-ink-400">
              &ldquo;Via facade&rdquo; calls the same FHIR endpoint a receiving facility&rsquo;s system would use. The
              read is authenticated, facility-scoped, and written to the audit trail.
            </p>
          </footer>
        </section>
      )}
    </div>
  );
}
