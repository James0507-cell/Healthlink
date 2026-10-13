"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import {
  IconGrid,
  IconInbox,
  IconShield,
  IconLink,
  IconChart,
  IconBook,
  IconClipboard,
  IconChevronDown,
} from "@/components/icons";

export interface NavItem {
  href: string;
  label: string;
  icon: "dashboard" | "referrals" | "patients" | "consent" | "interop" | "reports" | "docs";
  badge?: number;
}

export interface NavSection {
  label: string;
  items: NavItem[];
  /** Render as an expandable group with sub-items. */
  collapsible?: boolean;
  defaultOpen?: boolean;
}

const ICONS = {
  dashboard: IconGrid,
  referrals: IconInbox,
  patients: IconClipboard,
  consent: IconShield,
  interop: IconLink,
  reports: IconChart,
  docs: IconBook,
} as const;

export function SidebarNav({ sections }: { sections: NavSection[] }) {
  const pathname = usePathname();
  const isActive = (href: string) =>
    href === "/dashboard" ? pathname === "/dashboard" : pathname === href || pathname.startsWith(`${href}/`);

  return (
    <nav className="space-y-5" aria-label="Main">
      {sections.map((section) => (
        <NavSectionGroup key={section.label} section={section} isActive={isActive} />
      ))}
    </nav>
  );
}

function NavSectionGroup({
  section,
  isActive,
}: {
  section: NavSection;
  isActive: (href: string) => boolean;
}) {
  const anyActive = section.items.some((i) => isActive(i.href));
  const [open, setOpen] = useState(section.defaultOpen ?? true);

  if (section.collapsible) {
    return (
      <div>
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="mb-1 flex w-full items-center justify-between px-2.5 py-1 text-left"
          aria-expanded={open}
        >
          <span className="section-label">{section.label}</span>
          <IconChevronDown
            className={`h-3 w-3 text-ink-400 transition-transform duration-150 ${open ? "" : "-rotate-90"}`}
          />
        </button>
        {open && (
          <ul className="space-y-0.5">
            {section.items.map((item) => (
              <NavRow key={item.href} item={item} active={isActive(item.href)} nested />
            ))}
          </ul>
        )}
        {!open && anyActive && (
          <p className="px-2.5 text-[11px] text-brand-700">
            {section.items.find((i) => isActive(i.href))?.label}
          </p>
        )}
      </div>
    );
  }

  return (
    <div>
      <p className="section-label mb-1 px-2.5">{section.label}</p>
      <ul className="space-y-0.5">
        {section.items.map((item) => (
          <NavRow key={item.href} item={item} active={isActive(item.href)} />
        ))}
      </ul>
    </div>
  );
}

function NavRow({ item, active, nested = false }: { item: NavItem; active: boolean; nested?: boolean }) {
  const Icon = ICONS[item.icon];
  return (
    <li>
      <Link
        href={item.href}
        className={`nav-item ${active ? "nav-item-active" : ""} ${nested ? "ml-1" : ""}`}
        aria-current={active ? "page" : undefined}
      >
        <Icon
          className={`h-[16px] w-[16px] shrink-0 transition-colors ${
            active ? "text-brand-600" : "text-ink-400 group-hover:text-ink-600"
          }`}
        />
        <span className="truncate">{item.label}</span>
        {item.badge !== undefined && item.badge > 0 && (
          <span className={active ? "nav-badge nav-badge-active" : "nav-badge"}>
            {item.badge > 99 ? "99+" : item.badge}
          </span>
        )}
      </Link>
    </li>
  );
}
