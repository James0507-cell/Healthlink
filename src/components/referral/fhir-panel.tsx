"use client";

import { useActionState, useState } from "react";
import { validateReferralAction, type ValidateState } from "@/app/actions/referrals";
import { Card, Alert, formatDateTime } from "@/components/ui";
import { IconRefresh, IconCode, IconExternal, IconDownload, IconCheck, IconAlert } from "@/components/icons";

export interface FhirResourceSummary {
  resourceType: string;
  id?: string;
  profile?: string;
  profileName?: string;
  aligned: boolean;
  entryIndex: number;
}

const SEVERITY_ORDER = ["fatal", "error", "warning", "information"] as const;

const SEVERITY_STYLE: Record<string, { chip: string; label: string }> = {
  fatal: { chip: "chip-critical", label: "Fatal" },
  error: { chip: "chip-critical", label: "Error" },
  warning: { chip: "chip-warn", label: "Warning" },
  information: { chip: "chip-info", label: "Info" },
};

/**
 * The FHIR representation of this referral, plus on-demand validation.
 *
 * Warnings are presented separately from errors on purpose: terminology subsets
 * are advisory while the national value sets are drafts, so an unknown code is a
 * finding to review rather than a failure.
 */
export function FhirPanel({
  referralId,
  bundleValid,
  errorCount,
  warningCount,
  infoCount,
  resources,
  bundleUrl,
  jsonUrl,
}: {
  referralId: string;
  bundleValid: boolean;
  errorCount: number;
  warningCount: number;
  infoCount: number;
  resources: FhirResourceSummary[];
  bundleUrl: string;
  jsonUrl: string;
}) {
  const [state, formAction, pending] = useActionState<ValidateState, FormData>(validateReferralAction, {});
  const [view, setView] = useState<"resources" | "rules">("resources");
  const [copied, setCopied] = useState(false);

  const current = state.outcome ?? {
    valid: bundleValid,
    errorCount,
    warningCount,
    infoCount,
    issues: [] as NonNullable<ValidateState["outcome"]>["issues"],
  };

  const alignedToPHCore = resources.filter((r) => r.aligned).length;

  const copyProfileList = async () => {
    try {
      const list = resources
        .map((r) => `${r.resourceType}/${r.id ?? "(assigned)"}${r.profileName ? `  [${r.profileName}]` : "  [R4 base]"}`)
        .join("\n");
      await navigator.clipboard.writeText(list);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      setCopied(false);
    }
  };

  return (
    <Card
      divided
      title="FHIR exchange"
      description={
        <>
          Exchanged as a FHIR R4 transaction bundle. {alignedToPHCore} of {resources.length} resources map to a
          published Philippine Core profile; the remainder use the FHIR R4 base resource.
        </>
      }
      actions={
        <a href={jsonUrl} className="btn-secondary btn-sm" target="_blank" rel="noreferrer">
          <IconCode className="h-3.5 w-3.5" />
          JSON
        </a>
      }
      bodyClassName="p-0"
    >
      {/* ---------------- Validation summary ---------------- */}
      <div className="flex flex-wrap items-center gap-2 px-4 py-3">
        <span className={current.valid ? "chip-positive" : "chip-critical"}>
          {current.valid ? <IconCheck className="h-3 w-3" /> : <IconAlert className="h-3 w-3" />}
          {current.valid ? "Validation passed" : "Validation failed"}
        </span>
        <span className={current.errorCount ? "chip-critical" : "chip-neutral"}>
          {current.errorCount} error{current.errorCount === 1 ? "" : "s"}
        </span>
        <span className={current.warningCount ? "chip-warn" : "chip-neutral"}>
          {current.warningCount} warning{current.warningCount === 1 ? "" : "s"}
        </span>
        <span className="chip-neutral">{current.infoCount} info</span>

        <form action={formAction} className="ml-auto">
          <input type="hidden" name="referralId" value={referralId} />
          <button type="submit" disabled={pending} className="btn-secondary btn-sm">
            <IconRefresh className={`h-3.5 w-3.5 ${pending ? "animate-spin" : ""}`} />
            {pending ? "Validating…" : "Re-run validation"}
          </button>
        </form>
      </div>

      {state.error && (
        <div className="px-4 pb-3">
          <Alert tone="critical">{state.error}</Alert>
        </div>
      )}

      {/* ---------------- Views ---------------- */}
      <div className="flex items-center gap-1 border-y border-ink-200/80 bg-ink-50/50 px-3">
        {(
          [
            ["resources", `Resources (${resources.length})`],
            ["rules", "Rule detail"],
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            type="button"
            onClick={() => setView(id)}
            aria-pressed={view === id}
            className={`-mb-px border-b-2 px-2.5 py-2 text-[12px] font-medium transition-colors ${
              view === id ? "border-ink-900 text-ink-900" : "border-transparent text-ink-500 hover:text-ink-800"
            }`}
          >
            {label}
          </button>
        ))}
        {view === "resources" && (
          <button type="button" onClick={copyProfileList} className="ml-auto text-[10.5px] text-ink-500 hover:text-ink-800">
            {copied ? "Copied" : "Copy list"}
          </button>
        )}
      </div>

      {view === "resources" ? (
        <>
          <ul className="divide-y divide-ink-100">
            {resources.map((r) => (
              <li
                key={`${r.entryIndex}-${r.resourceType}-${r.id}`}
                className="flex items-center gap-3 px-4 py-2.5"
              >
                <span className="w-[9.5rem] shrink-0 text-[12.5px] font-medium text-ink-900">{r.resourceType}</span>
                <span className="mono-id min-w-0 flex-1 truncate">
                  {r.id ?? "(server assigned)"}
                </span>
                <span className="shrink-0">
                  {r.aligned ? (
                    <span className="chip-positive" title={r.profile}>
                      {r.profileName}
                    </span>
                  ) : (
                    <span
                      className="chip-neutral"
                      title="No profile for this resource type exists in PH Core v0.2.0. The resource is mapped to the FHIR R4 base and the gap is recorded in the alignment report."
                    >
                      R4 base
                    </span>
                  )}
                </span>
              </li>
            ))}
          </ul>
          <p className="border-t border-ink-200/80 px-4 py-2.5 text-[10.5px] leading-relaxed text-ink-400">
            Resources marked &ldquo;R4 base&rdquo; are exchanged using the FHIR R4 base resource because the draft
            Philippine Core guide does not yet define a profile for them. This is a tracked alignment gap, not an
            omission.{" "}
            <a href="/interop/alignment" className="link">
              Alignment report
            </a>
          </p>
        </>
      ) : (
        <div className="px-4 py-3.5">
          <p className="mb-3 text-[11.5px] leading-relaxed text-ink-500">
            Checks applied in order: FHIR R4 structural conformance, PH Core cardinality and must-support elements,
            required and extensible terminology bindings, reference target profiles, the{" "}
            <span className="font-mono">provenance-1</span> attribution invariant, and intra-bundle reference integrity.
            {current.issues.length === 0 && " Run validation to see the findings in detail."}
          </p>

          {current.issues.length > 0 ? (
            <ul className="space-y-1.5">
              {[...current.issues]
                .sort(
                  (a, b) =>
                    SEVERITY_ORDER.indexOf(a.severity as (typeof SEVERITY_ORDER)[number]) -
                    SEVERITY_ORDER.indexOf(b.severity as (typeof SEVERITY_ORDER)[number]),
                )
                .map((issue, i) => {
                  const s = SEVERITY_STYLE[issue.severity] ?? SEVERITY_STYLE.information;
                  return (
                    <li
                      key={i}
                      className="flex flex-wrap items-start gap-2 rounded-lg border border-ink-200 px-3 py-2"
                    >
                      <span className={`${s.chip} shrink-0`}>{s.label}</span>
                      <div className="min-w-0 flex-1">
                        {issue.expression && <p className="mono-id">{issue.expression}</p>}
                        <p className="text-[11.5px] leading-relaxed text-ink-700">{issue.diagnostics}</p>
                      </div>
                      <span className="mono-id shrink-0">{issue.code}</span>
                    </li>
                  );
                })}
            </ul>
          ) : (
            <p className="rounded-lg border border-dashed border-ink-200 bg-ink-50/50 px-3 py-5 text-center text-[11.5px] text-ink-500">
              The full rule report appears here after a validation run.
            </p>
          )}
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2 border-t border-ink-200/80 px-4 py-3">
        <a href={bundleUrl} className="btn-secondary btn-sm" download>
          <IconDownload className="h-3.5 w-3.5" />
          Download bundle
        </a>
        <a href="/fhir/metadata" className="btn-ghost btn-sm" target="_blank" rel="noreferrer">
          <IconExternal className="h-3.5 w-3.5" />
          CapabilityStatement
        </a>
        <span className="ml-auto text-[10.5px] text-ink-400">
          Validated {formatDateTime(new Date().toISOString())}
        </span>
      </div>
    </Card>
  );
}
