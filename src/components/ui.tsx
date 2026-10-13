/**
 * Shared presentation components.
 *
 * Visual language: soft canvas, white cards with hairline borders, one accent
 * colour reserved for affirmative and positive states, and restrained semantic
 * colour elsewhere. Status is always conveyed by a dot or glyph plus text, never
 * by colour alone.
 */

import type { ReactNode } from "react";
import Link from "next/link";
import { STATES, PRIORITY_LABELS, type ReferralState } from "@/lib/workflow";
import {
  IconAlert,
  IconCheck,
  IconChevronRight,
  IconInfo,
  IconInbox,
} from "@/components/icons";

/* ------------------------------------------------------------------ */
/* Status and priority                                                 */
/* ------------------------------------------------------------------ */

const TONE_DOT: Record<string, string> = {
  neutral: "bg-ink-400",
  info: "bg-sky-500",
  warn: "bg-amber-500",
  positive: "bg-brand-500",
  critical: "bg-red-500",
  done: "bg-ink-500",
};

export function StatusPill({ status, className = "" }: { status: string; className?: string }) {
  const def = STATES[status as ReferralState];
  const tone = def?.tone ?? "neutral";
  const label = def?.label ?? status;
  return (
    <span className={`chip-${tone} ${className}`} title={def?.description ?? undefined}>
      <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${TONE_DOT[tone]}`} aria-hidden="true" />
      {label}
    </span>
  );
}

/** Alias kept so existing call sites read naturally. */
export const StatusChip = StatusPill;

export function PriorityPill({ priority }: { priority: string }) {
  const label = PRIORITY_LABELS[priority] ?? priority;
  const tone = priority === "stat" ? "critical" : priority === "urgent" || priority === "asap" ? "warn" : "neutral";
  return <span className={`chip-${tone}`} title={`Priority: ${label}`}>{label}</span>;
}

export const PriorityChip = PriorityPill;

/* ------------------------------------------------------------------ */
/* Card                                                                */
/* ------------------------------------------------------------------ */

export function Card({
  title,
  description,
  actions,
  children,
  className = "",
  bodyClassName = "",
  footer,
  divided = false,
}: {
  title?: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
  bodyClassName?: string;
  footer?: ReactNode;
  /** Draw a hairline between header and body. */
  divided?: boolean;
}) {
  const hasHeader = title || actions || description;
  return (
    <section className={`card ${className}`}>
      {hasHeader && (
        <header className={`card-header ${divided ? "border-b border-ink-200/80 pb-3" : ""}`}>
          <div className="min-w-0">
            {typeof title === "string" ? <h2 className="card-title">{title}</h2> : title}
            {description && <p className="card-desc">{description}</p>}
          </div>
          {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
        </header>
      )}
      <div className={bodyClassName || (hasHeader ? "card-body" : "card-body py-4")}>{children}</div>
      {footer && <div className="card-footer">{footer}</div>}
    </section>
  );
}

/* ------------------------------------------------------------------ */
/* Page header                                                         */
/* ------------------------------------------------------------------ */

export function PageHeader({
  title,
  subtitle,
  actions,
  breadcrumb,
  meta,
}: {
  title: ReactNode;
  subtitle?: ReactNode;
  actions?: ReactNode;
  breadcrumb?: ReactNode;
  meta?: ReactNode;
}) {
  return (
    <header className="mb-5">
      {breadcrumb && (
        <nav className="mb-2.5 flex items-center gap-1.5 text-xs text-ink-500 no-print" aria-label="Breadcrumb">
          {breadcrumb}
        </nav>
      )}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <h1 className="text-[22px] font-semibold leading-tight tracking-[-0.02em] text-ink-900">{title}</h1>
          {subtitle && <div className="mt-1.5 text-[13px] leading-relaxed text-ink-500">{subtitle}</div>}
          {meta && <div className="mt-2.5 flex flex-wrap items-center gap-2">{meta}</div>}
        </div>
        {actions && <div className="flex flex-wrap items-center gap-2 no-print">{actions}</div>}
      </div>
    </header>
  );
}

export function BreadcrumbLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <>
      <Link href={href} className="transition-colors hover:text-ink-800">
        {children}
      </Link>
      <IconChevronRight className="h-3 w-3 text-ink-300" />
    </>
  );
}

/* ------------------------------------------------------------------ */
/* Metrics                                                             */
/* ------------------------------------------------------------------ */

export function Metric({
  label,
  value,
  hint,
  tone = "default",
  icon,
}: {
  label: string;
  value: ReactNode;
  hint?: string;
  tone?: "default" | "warn" | "critical" | "positive";
  icon?: ReactNode;
}) {
  const valueTone =
    tone === "critical"
      ? "text-red-600"
      : tone === "warn"
        ? "text-amber-600"
        : tone === "positive"
          ? "text-brand-600"
          : "text-ink-900";
  return (
    <div className="card px-4 py-3.5">
      <div className="flex items-center gap-1.5">
        {icon && <span className="text-ink-400">{icon}</span>}
        <p className="text-[11px] font-medium tracking-[-0.005em] text-ink-500">{label}</p>
      </div>
      <p className={`mt-1.5 text-[26px] font-semibold leading-none tracking-[-0.03em] tabular-nums ${valueTone}`}>
        {value}
      </p>
      {hint && <p className="mt-1.5 text-[11px] leading-snug text-ink-400">{hint}</p>}
    </div>
  );
}

/** A single card holding several metrics separated by rules, as in the references. */
export function MetricRow({ children }: { children: ReactNode }) {
  return (
    <div className="card metric-divide grid grid-cols-2 gap-y-4 px-5 py-4 lg:grid-cols-4">{children}</div>
  );
}

export function MetricCell({
  label,
  value,
  hint,
  tone = "default",
}: {
  label: string;
  value: ReactNode;
  hint?: string;
  tone?: "default" | "warn" | "critical" | "positive";
}) {
  const valueTone =
    tone === "critical"
      ? "text-red-600"
      : tone === "warn"
        ? "text-amber-600"
        : tone === "positive"
          ? "text-brand-600"
          : "text-ink-900";
  return (
    <div>
      <p className="text-[11px] font-medium text-ink-500">{label}</p>
      <p className={`mt-1 text-[24px] font-semibold leading-none tracking-[-0.03em] tabular-nums ${valueTone}`}>
        {value}
      </p>
      {hint && <p className="mt-1 text-[11px] leading-snug text-ink-400">{hint}</p>}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Feedback                                                            */
/* ------------------------------------------------------------------ */

export function EmptyState({
  title,
  description,
  action,
  icon,
}: {
  title: string;
  description?: string;
  action?: ReactNode;
  icon?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center rounded-card border border-dashed border-ink-200 bg-white/50 px-6 py-14 text-center">
      <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-full bg-ink-100 text-ink-400">
        {icon ?? <IconInbox className="h-5 w-5" />}
      </div>
      <p className="text-[13px] font-medium text-ink-800">{title}</p>
      {description && <p className="mt-1 max-w-md text-xs leading-relaxed text-ink-500">{description}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export function Alert({
  tone = "info",
  title,
  children,
  className = "",
  action,
}: {
  tone?: "info" | "warn" | "critical" | "positive" | "neutral";
  title?: string;
  children?: ReactNode;
  className?: string;
  action?: ReactNode;
}) {
  const tones: Record<string, { wrap: string; icon: ReactNode }> = {
    info: { wrap: "border-sky-200/80 bg-sky-50/70 text-sky-900", icon: <IconInfo className="h-4 w-4 text-sky-600" /> },
    warn: { wrap: "border-amber-200/80 bg-amber-50/70 text-amber-900", icon: <IconAlert className="h-4 w-4 text-amber-600" /> },
    critical: { wrap: "border-red-200/80 bg-red-50/70 text-red-900", icon: <IconAlert className="h-4 w-4 text-red-600" /> },
    positive: { wrap: "border-brand-200/80 bg-brand-50/70 text-brand-900", icon: <IconCheck className="h-4 w-4 text-brand-600" /> },
    neutral: { wrap: "border-ink-200 bg-ink-50 text-ink-800", icon: <IconInfo className="h-4 w-4 text-ink-400" /> },
  };
  const t = tones[tone];
  return (
    <div
      className={`flex gap-2.5 rounded-xl border px-3.5 py-3 text-[13px] leading-relaxed ${t.wrap} ${className}`}
      role={tone === "critical" ? "alert" : undefined}
    >
      <span className="mt-px shrink-0">{t.icon}</span>
      <div className="min-w-0 flex-1">
        {title && <p className="font-medium">{title}</p>}
        {children && <div className={title ? "mt-1" : ""}>{children}</div>}
      </div>
      {action && <div className="shrink-0 self-start">{action}</div>}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Segmented control (URL-driven)                                      */
/* ------------------------------------------------------------------ */

export function Segmented({
  items,
  active,
  basePath,
  paramName = "tab",
}: {
  items: Array<{ id: string; label: string; count?: number }>;
  active: string;
  basePath: string;
  paramName?: string;
}) {
  return (
    <div className="segmented no-print" role="tablist">
      {items.map((t) => {
        const isActive = t.id === active;
        return (
          <Link
            key={t.id}
            href={`${basePath}?${paramName}=${encodeURIComponent(t.id)}`}
            role="tab"
            aria-selected={isActive}
            className={isActive ? "segmented-item segmented-item-active" : "segmented-item"}
          >
            {t.label}
            {t.count !== undefined && (
              <span className={`ml-1.5 tabular-nums ${isActive ? "text-ink-400" : "text-ink-400"}`}>{t.count}</span>
            )}
          </Link>
        );
      })}
    </div>
  );
}

/** Backwards-compatible alias. */
export const Tabs = Segmented;

/* ------------------------------------------------------------------ */
/* Definition list for clinical content                                */
/* ------------------------------------------------------------------ */

export function ClinicalField({
  label,
  value,
  emptyText = "Not recorded",
}: {
  label: string;
  value?: string | null;
  emptyText?: string;
}) {
  const has = !!value?.trim();
  return (
    <div>
      <dt>{label}</dt>
      <dd className={has ? "" : "text-ink-300 italic"}>{has ? value : emptyText}</dd>
    </div>
  );
}

/** Label/value pair used in side panels. */
export function Fact({
  label,
  children,
  mono = false,
}: {
  label: string;
  children: ReactNode;
  mono?: boolean;
}) {
  return (
    <div>
      <dt className="text-[10px] font-semibold uppercase tracking-[0.06em] text-ink-400">{label}</dt>
      <dd className={`mt-1 text-[12.5px] leading-relaxed text-ink-800 ${mono ? "font-mono text-[11px]" : ""}`}>
        {children}
      </dd>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Section block inside forms                                          */
/* ------------------------------------------------------------------ */

export function SectionHeading({
  step,
  title,
  description,
}: {
  step?: number;
  title: string;
  description?: string;
}) {
  return (
    <div className="mb-4">
      <div className="flex items-center gap-2">
        {step !== undefined && (
          <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-ink-900 text-[10px] font-semibold text-white">
            {step}
          </span>
        )}
        <h2 className="text-[15px] font-semibold tracking-[-0.01em] text-ink-900">{title}</h2>
      </div>
      {description && <p className="mt-1 text-xs leading-relaxed text-ink-500">{description}</p>}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Formatting helpers                                                  */
/* ------------------------------------------------------------------ */

export function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString("en-PH", {
    year: "numeric",
    month: "short",
    day: "2-digit",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
}

export function formatDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("en-PH", { year: "numeric", month: "short", day: "2-digit" });
}

export function formatDateLong(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("en-PH", { year: "numeric", month: "long", day: "numeric" });
}

export function relativeTime(iso: string | null | undefined): string {
  if (!iso) return "—";
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return "—";
  const diffMs = Date.now() - then;
  const mins = Math.round(diffMs / 60000);
  if (Math.abs(mins) < 1) return "just now";
  if (Math.abs(mins) < 60) return `${mins}m ago`;
  const hours = Math.round(mins / 60);
  if (Math.abs(hours) < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  if (Math.abs(days) < 30) return `${days}d ago`;
  const months = Math.round(days / 30);
  if (Math.abs(months) < 12) return `${months}mo ago`;
  return `${Math.round(months / 12)}y ago`;
}

export function computeAge(birthDate: string | null | undefined): string {
  if (!birthDate) return "—";
  const b = new Date(birthDate);
  if (Number.isNaN(b.getTime())) return "—";
  const now = new Date();
  const totalMonths =
    (now.getFullYear() - b.getFullYear()) * 12 +
    (now.getMonth() - b.getMonth()) -
    (now.getDate() < b.getDate() ? 1 : 0);
  if (totalMonths < 0) return "—";
  if (totalMonths < 24) return `${totalMonths} mo`;
  return `${Math.floor(totalMonths / 12)} y`;
}

export function initials(name: string): string {
  return name
    .replace(/^(Dr|Dra|Mr|Ms|Mrs|Prof)\.?\s+/i, "")
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? "")
    .join("");
}

export function displayName(fullName: string): string {
  return fullName.replace(/^(Dr|Dra|Mr|Ms|Mrs|Prof)\.?\s+/i, "").replace(/\s+/g, " ").trim();
}

export function firstName(fullName: string): string {
  return displayName(fullName).split(/\s+/)[0] ?? fullName;
}

export function titlePrefix(fullName: string): string {
  const m = fullName.match(/^(Dr|Dra|Mr|Ms|Mrs|Prof)\.?\s+/i);
  return m ? m[1] : "";
}

/** Mask an identifier, keeping the last four characters visible. */
export function maskId(v: string | null | undefined): string {
  if (!v) return "—";
  const s = v.replace(/[^A-Za-z0-9]/g, "");
  if (s.length <= 4) return "••••";
  return `${"•".repeat(Math.max(s.length - 4, 4))}${s.slice(-4)}`;
}

export function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

export function formatNum(n: number): string {
  return Number.isInteger(n) ? String(n) : n.toFixed(2).replace(/\.?0+$/, "");
}

/* ------------------------------------------------------------------ */
/* Progress bar                                                        */
/* ------------------------------------------------------------------ */

export function Bar({ value, tone = "brand" }: { value: number; tone?: "brand" | "amber" | "red" | "ink" }) {
  const tones = {
    brand: "bg-brand-500",
    amber: "bg-amber-400",
    red: "bg-red-400",
    ink: "bg-ink-300",
  };
  return (
    <div className="h-1 overflow-hidden rounded-full bg-ink-100">
      <div className={`h-full rounded-full ${tones[tone]}`} style={{ width: `${Math.max(value, 2)}%` }} />
    </div>
  );
}
