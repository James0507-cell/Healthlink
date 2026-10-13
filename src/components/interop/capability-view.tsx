"use client";

import { useState } from "react";
import { IconCode, IconCopy, IconCheck, IconAlert } from "@/components/icons";

interface RestResource {
  type: string;
  profile?: string;
  documentation?: string;
  interaction?: Array<{ code: string }>;
  searchParam?: Array<{ name: string; type: string; documentation?: string }>;
}

/**
 * Renders a CapabilityStatement grouped by resource, with the raw JSON and
 * runnable request examples alongside, so a reviewer can confirm the rendering
 * is faithful and see how a facility system would actually call it.
 */
export function CapabilityView({ capability, fhirBase }: { capability: unknown; fhirBase: string }) {
  const [tab, setTab] = useState<"grouped" | "curl" | "json">("grouped");
  const [copied, setCopied] = useState<string | null>(null);

  const cs = capability as {
    status?: string;
    date?: string;
    kind?: string;
    fhirVersion?: string;
    format?: string[];
    description?: string;
    rest?: Array<{ mode?: string; documentation?: string; resource?: RestResource[] }>;
  };

  const resources = cs?.rest?.flatMap((r) => r.resource ?? []) ?? [];
  const restDoc = cs?.rest?.[0]?.documentation;

  const curlFor = (r: RestResource): string => {
    const params = (r.searchParam ?? []).slice(0, 2).map((p) => {
      switch (p.name) {
        case "_id":
          return `${p.name}=example-id`;
        case "identifier":
          return `${p.name}=HL-2026-BHC-00001`;
        case "status":
          return `${p.name}=active`;
        default:
          return `${p.name}=…`;
      }
    });
    return `curl -H "Authorization: Bearer $HEALTHLINK_TOKEN" \\\n  "${fhirBase}/${r.type}?${params.join("&") || "_count=10"}"`;
  };

  const copy = async (text: string, key: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(key);
      setTimeout(() => setCopied(null), 1500);
    } catch {
      setCopied(null);
    }
  };

  return (
    <section className="card">
      <header className="flex flex-wrap items-start justify-between gap-3 px-4 py-3.5">
        <div className="min-w-0">
          <h2 className="card-title">Capability statement</h2>
          <p className="card-desc">
            {cs?.kind} &middot; status {cs?.status} &middot; FHIR {cs?.fhirVersion} &middot;{" "}
            {(cs?.format ?? []).join(", ")}
          </p>
        </div>
        <div className="segmented">
          {(
            [
              ["grouped", "By resource"],
              ["curl", "REST examples"],
              ["json", "Raw JSON"],
            ] as const
          ).map(([id, label]) => (
            <button
              key={id}
              type="button"
              onClick={() => setTab(id)}
              className={tab === id ? "segmented-item segmented-item-active" : "segmented-item"}
              aria-pressed={tab === id}
            >
              {label}
            </button>
          ))}
        </div>
      </header>

      {cs?.description && (
        <div className="border-y border-ink-200/80 bg-ink-50/60 px-4 py-3">
          <p className="text-[11.5px] leading-relaxed text-ink-600">{cs.description}</p>
          {restDoc && <p className="mt-1.5 text-[11.5px] leading-relaxed text-ink-600">{restDoc}</p>}
        </div>
      )}

      {tab === "grouped" && (
        <ul className="divide-y divide-ink-100">
          {resources.map((r) => (
            <li key={r.type} className="px-4 py-3.5">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-[13px] font-medium text-ink-900">{r.type}</span>
                {(r.interaction ?? []).map((i) => (
                  <span key={i.code} className="chip-neutral">
                    {i.code}
                  </span>
                ))}
                {r.profile ? (
                  <span className="chip-positive" title={r.profile}>
                    <IconCheck className="h-2.5 w-2.5" />
                    PH Core profiled
                  </span>
                ) : (
                  <span className="chip-neutral" title="No PH Core profile exists for this resource type in v0.2.0">
                    R4 base only
                  </span>
                )}
              </div>

              {r.documentation && (
                <p className="mt-1.5 text-[11.5px] leading-relaxed text-ink-600">{r.documentation}</p>
              )}

              {r.searchParam && r.searchParam.length > 0 && (
                <div className="mt-2">
                  <p className="section-label mb-1.5">Search parameters</p>
                  <ul className="flex flex-wrap gap-1.5">
                    {r.searchParam.map((p) => (
                      <li
                        key={p.name}
                        className="rounded border border-ink-200 bg-white px-1.5 py-0.5"
                        title={p.documentation}
                      >
                        <span className="mono-id text-ink-700">{p.name}</span>
                        <span className="ml-1 text-[9.5px] text-ink-400">{p.type}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {r.profile && <p className="mono-id mt-2 break-all text-[10px] text-brand-700">{r.profile}</p>}
            </li>
          ))}
          {resources.length === 0 && (
            <li className="px-4 py-4 text-[12.5px] text-ink-500">The capability statement lists no resources.</li>
          )}
        </ul>
      )}

      {tab === "curl" && (
        <div className="space-y-4 px-4 py-4">
          <p className="text-[12px] leading-relaxed text-ink-600">
            Each example is a request a facility system could make today. Replace{" "}
            <span className="font-mono text-[11px]">$HEALTHLINK_TOKEN</span> with an API token issued on the Directory
            page. Without a valid token the facade returns HTTP 401 with an OperationOutcome, and the attempt is audited.
          </p>

          {resources.slice(0, 8).map((r) => {
            const cmd = curlFor(r);
            const key = `curl-${r.type}`;
            return (
              <div key={r.type}>
                <div className="mb-1.5 flex items-center justify-between gap-2">
                  <p className="text-[12px] font-medium text-ink-800">{r.type}</p>
                  <button
                    type="button"
                    onClick={() => copy(cmd, key)}
                    className="text-[10.5px] font-medium text-ink-500 transition-colors hover:text-ink-800"
                  >
                    {copied === key ? "Copied" : "Copy"}
                  </button>
                </div>
                <pre className="code-block thin-scroll">{cmd}</pre>
              </div>
            );
          })}

          <div>
            <p className="mb-1.5 text-[12px] font-medium text-ink-800">Whole referral package</p>
            <pre className="code-block thin-scroll">{`curl -H "Authorization: Bearer $HEALTHLINK_TOKEN" \\\n  "${fhirBase}/Bundle/<referral-id>"`}</pre>
          </div>
        </div>
      )}

      {tab === "json" && (
        <div className="px-3 py-3">
          <pre className="code-block thin-scroll max-h-[36rem] text-[10.5px]">
            {JSON.stringify(capability, null, 2)}
          </pre>
        </div>
      )}
    </section>
  );
}

void IconCode;
void IconCopy;
void IconAlert;
