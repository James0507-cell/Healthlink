import type { ReactNode } from "react";
import Link from "next/link";
import { getSession, ROLE_LABELS, hasPermission, PERMISSIONS, type Session, type Permission } from "@/lib/auth";
import { clearStaleSessionAction } from "@/app/actions/auth";
import { SidebarNav, type NavSection } from "@/components/sidebar-nav";
import { TopBar } from "@/components/topbar";
import { Logo } from "@/components/logo";
import { referralCounts } from "@/lib/referrals";
import { STATES, type ReferralState } from "@/lib/workflow";

export default async function AppLayout({ children }: { children: ReactNode }) {
  const session = await getSession();

  if (!session) {
    return (
      <div className="flex min-h-dvh items-center justify-center p-6">
        <div className="card max-w-sm p-6 text-center">
          <p className="text-sm font-medium text-ink-900">Your session has ended</p>
          <p className="mt-1.5 text-xs leading-relaxed text-ink-500">
            This happens after a period of inactivity, if an administrator ended the session, or if the demonstration
            database was rebuilt.
          </p>
          <form action={clearStaleSessionAction} className="mt-4">
            <button type="submit" className="btn-primary w-full">
              Sign in again
            </button>
          </form>
        </div>
      </div>
    );
  }

  const { sections, awaitingCount } = await buildNav(session);

  return (
    <div className="min-h-dvh lg:grid lg:grid-cols-[15.5rem_1fr]">
      {/* ---------------- Sidebar ---------------- */}
      <aside className="border-b border-ink-200 bg-canvas lg:sticky lg:top-0 lg:h-dvh lg:overflow-y-auto lg:border-b-0 lg:border-r no-print">
        <div className="flex items-center px-4 py-4">
          <Link href="/dashboard" className="flex items-center gap-2.5 transition-opacity hover:opacity-80">
            <Logo />
            <span className="min-w-0">
              <span className="block text-[13.5px] font-semibold leading-tight tracking-[-0.01em] text-ink-900">
                HealthLink
              </span>
              <span className="block truncate text-[10.5px] leading-tight text-ink-400">
                {session.facilityName ?? "Referral Network"}
              </span>
            </span>
          </Link>
        </div>

        <div className="px-2.5 pb-3">
          <SidebarNav sections={sections} />
        </div>

        <div className="mt-2 px-4 pb-5">
          <div className="rounded-xl border border-ink-200/80 bg-white/60 px-3 py-2.5">
            <p className="text-[10px] font-semibold uppercase tracking-[0.06em] text-ink-400">Environment</p>
            <p className="mt-1 text-[11px] leading-relaxed text-ink-500">
              Demonstration build with synthetic data. Not connected to live facility systems.
            </p>
          </div>
        </div>
      </aside>

      {/* ---------------- Main ---------------- */}
      <div className="flex min-w-0 flex-col">
        <TopBar
          user={{
            name: session.fullName,
            email: session.email,
            role: ROLE_LABELS[session.role],
            facility: session.facilityName ?? "Referral Network",
          }}
          awaitingCount={awaitingCount}
          canCreate={hasPermission(session, PERMISSIONS.REFERRAL_CREATE)}
        />

        <main className="min-w-0 flex-1 px-5 py-6 lg:px-8">{children}</main>

        <footer className="border-t border-ink-200/80 px-5 py-4 text-[10.5px] leading-relaxed text-ink-400 lg:px-8 no-print">
          HealthLink concept prototype &middot; aligned to the Draft Philippine Core FHIR Implementation Guide v0.2.0
          (FHIR R4 4.0.1) &middot; synthetic demonstration data only
        </footer>
      </div>
    </div>
  );
}

/**
 * Navigation, trimmed to what a clinician or officer actually opens during a
 * shift. Withdrawn as of this revision:
 *   - "New referral" (reached from Referrals and the dashboard, not a destination)
 *   - "PH Core alignment", "FHIR explorer", "Validate resource", "Capability
 *     statement" (four separate pages) collapse into one Interoperability section
 *   - "Data governance" (the retention/config surface) folds into Settings
 *   - "Directory" and "Access requests" appear only for the roles that use them
 */
async function buildNav(session: Session): Promise<{ sections: NavSection[]; awaitingCount: number }> {
  const can = (p: Permission) => session.permissions.includes(p);

  // Live count of work waiting on this user's facility.
  let awaitingCount = 0;
  try {
    const counts = await referralCounts(session);
    const byStatus = new Map(counts.map((c) => [c.status, c.n]));
    const isCross = session.role === "hie_admin" || session.role === "privacy_auditor";
    for (const [status, n] of byStatus) {
      const def = STATES[status as ReferralState];
      if (!def || def.isTerminal || def.awaiting === "none" || status === "draft") continue;
      if (isCross || def.awaiting === "receiving" || def.awaiting === "referring") awaitingCount += n;
    }
    if (session.role === "privacy_auditor") awaitingCount = 0;
  } catch {
    awaitingCount = 0;
  }

  const sections: NavSection[] = [];

  // --- Care coordination ---
  const care: NavSection["items"] = [];
  if (can(PERMISSIONS.REFERRAL_READ_OWN_FACILITY)) {
    care.push({ href: "/dashboard", label: "Dashboard", icon: "dashboard" });
    care.push({
      href: "/referrals",
      label: "Referrals",
      icon: "referrals",
      badge: session.role === "privacy_auditor" ? undefined : awaitingCount,
    });
  }
  if (can(PERMISSIONS.PATIENT_READ)) care.push({ href: "/patients", label: "Patients", icon: "patients" });
  if (care.length) sections.push({ label: "Worklist", items: care });

  // --- Compliance ---
  const compliance: NavSection["items"] = [];
  if (can(PERMISSIONS.CONSENT_READ)) compliance.push({ href: "/consent", label: "Consent", icon: "consent" });
  if (can(PERMISSIONS.AUDIT_READ)) compliance.push({ href: "/audit", label: "Audit trail", icon: "consent" });
  if (compliance.length) sections.push({ label: "Compliance", items: compliance });

  // --- Analytics ---
  if (can(PERMISSIONS.REPORT_VIEW)) {
    sections.push({ label: "Analytics", items: [{ href: "/reports", label: "Reports", icon: "reports" }] });
  }

  // --- Interoperability (collapsed group) ---
  if (can(PERMISSIONS.FHIR_READ)) {
    sections.push({
      label: "Interoperability",
      collapsible: true,
      defaultOpen: false,
      items: [
        { href: "/interop/alignment", label: "PH Core alignment", icon: "interop" },
        { href: "/interop/explorer", label: "FHIR resources", icon: "interop" },
        { href: "/interop/validate", label: "Validate a resource", icon: "interop" },
        { href: "/interop/capability", label: "Capability statement", icon: "interop" },
      ],
    });
  }

  // --- Administration (only for roles that manage something) ---
  const admin: NavSection["items"] = [];
  if (can(PERMISSIONS.USER_MANAGE)) admin.push({ href: "/directory", label: "Directory", icon: "patients" });
  if (can(PERMISSIONS.ACCESS_REQUEST_DECIDE))
    admin.push({ href: "/access-requests", label: "Access requests", icon: "consent" });
  if (can(PERMISSIONS.CONFIG_MANAGE)) admin.push({ href: "/governance", label: "Settings", icon: "consent" });
  if (admin.length) sections.push({ label: "Administration", items: admin });

  // --- Help ---
  sections.push({ label: "Help", items: [{ href: "/about", label: "About HealthLink", icon: "docs" }] });

  return { sections, awaitingCount };
}
