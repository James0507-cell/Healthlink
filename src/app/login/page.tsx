import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { all, migrate } from "@/lib/db";
import { isSeeded, seed, DEMO_PASSWORD } from "@/lib/seed";
import { LoginForm } from "@/components/login-form";
import { LogoMark } from "@/components/logo";
import { PHCORE_IG } from "@/lib/fhir/terminology";
import { ROLE_LABELS, type Role } from "@/lib/auth";
import { IconCheck, IconArrowRight } from "@/components/icons";

export const metadata: Metadata = { title: "Sign in" };

export const dynamic = "force-dynamic";

export default async function LoginPage() {
  // Make a fresh checkout usable without a manual seeding step.
  try {
    await migrate();
    if (!await isSeeded()) await seed();
  } catch (e) {
    console.error("Bootstrap failed:", e);
  }

  const session = await getSession();
  if (session) redirect("/dashboard");

  const rows = await all<{
    email: string;
    full_name: string;
    role: string;
    facility_name: string | null;
    is_referring: number | null;
    is_receiving: number | null;
  }>(
    `SELECT u.email, u.full_name, u.role, f.name AS facility_name, f.is_referring, f.is_receiving
       FROM users u LEFT JOIN facilities f ON f.id = u.facility_id
      WHERE u.active = 1
      ORDER BY
        CASE u.role WHEN 'hie_admin' THEN 2 WHEN 'privacy_auditor' THEN 3 ELSE 1 END,
        f.name, u.full_name`,
  );

  const accounts = rows.map((r) => ({
    email: r.email,
    name: r.full_name,
    role: ROLE_LABELS[r.role as Role] ?? r.role,
    facility: r.facility_name ?? "HealthLink network",
    side:
      r.role === "hie_admin" || r.role === "privacy_auditor"
        ? ("governance" as const)
        : r.is_receiving && !r.is_referring
          ? ("receiving" as const)
          : ("referring" as const),
  }));

  return (
    <main className="grid min-h-dvh lg:grid-cols-[1.1fr_1fr]">
      {/* ================= Left: framing ================= */}
      <div className="relative flex flex-col justify-between overflow-hidden bg-ink-950 px-8 py-10 text-white lg:px-14 lg:py-14">
        {/* Faint grid, kept barely visible so it reads as texture not structure. */}
        <div
          className="pointer-events-none absolute inset-0 opacity-[0.022]"
          style={{
            backgroundImage:
              "linear-gradient(to right, white 1px, transparent 1px), linear-gradient(to bottom, white 1px, transparent 1px)",
            backgroundSize: "28px 28px",
          }}
          aria-hidden="true"
        />
        {/* Accent wash from the upper left, so the panel has depth. */}
        <div
          className="pointer-events-none absolute inset-0"
          style={{
            background:
              "radial-gradient(70% 55% at 8% 12%, rgba(16,185,129,0.20) 0%, rgba(10,10,9,0) 62%), radial-gradient(60% 50% at 95% 100%, rgba(16,185,129,0.09) 0%, rgba(10,10,9,0) 60%)",
          }}
          aria-hidden="true"
        />

        <div className="relative">
          <div className="flex items-center gap-3">
            <LogoMark className="h-9 w-9 text-brand-400" />
            <div>
              <p className="text-[15px] font-semibold tracking-[-0.01em]">HealthLink</p>
              <p className="text-[11px] text-ink-400">Davao City referral network</p>
            </div>
          </div>

          <h1 className="mt-12 max-w-lg text-[30px] font-semibold leading-[1.15] tracking-[-0.025em] lg:text-[36px]">
            A referral should arrive with the clinical picture, not without it.
          </h1>
          <p className="mt-5 max-w-lg text-[13.5px] leading-[1.75] text-ink-400">
            HealthLink is a coordination layer that connects the systems facilities already run. It standardises what a
            referral must carry, validates it before it moves, routes it to the right facility, and tracks it until the
            referring provider has the answer back.
          </p>

          <ul className="mt-10 max-w-lg space-y-3.5">
            {[
              "Structured referral with the clinical context the receiver needs",
              "Validated against HL7 FHIR R4 and the draft Philippine Core profiles",
              "Consent and lawful basis recorded for every exchange",
              "A closed loop: submission through to returned clinical feedback",
              "Role-based, facility-scoped access with a tamper-evident audit trail",
            ].map((t) => (
              <li key={t} className="flex items-start gap-2.5">
                <IconCheck className="mt-0.5 h-4 w-4 shrink-0 text-brand-400" />
                <span className="text-[13px] leading-snug text-ink-200">{t}</span>
              </li>
            ))}
          </ul>
        </div>

        <div className="relative mt-12 max-w-lg border-t border-ink-800 pt-5">
          <p className="text-[11px] leading-relaxed text-ink-500">
            Alignment target: <span className="text-ink-300">{PHCORE_IG.name}</span>{" "}
            <span className="font-mono text-ink-400">
              {PHCORE_IG.package}#{PHCORE_IG.version}
            </span>
            . That guide is published as a draft and is not yet available for production use, so HealthLink treats it as
            an alignment reference rather than a finalized requirement.
          </p>
          <p className="mt-2.5 text-[11px] leading-relaxed text-ink-600">
            This is a concept prototype for evaluation. It contains synthetic demonstration data only &mdash; no real
            patient, provider or facility records.
          </p>
        </div>
      </div>

      {/* ================= Right: sign in ================= */}
      <div className="flex items-center justify-center px-6 py-10 lg:px-14">
        <div className="w-full max-w-sm">
          <h2 className="text-[20px] font-semibold tracking-[-0.02em] text-ink-900">Sign in</h2>
          <p className="mt-1.5 mb-6 text-[13px] leading-relaxed text-ink-500">
            Authorised facility users only. Access is role-based and scoped to your facility, and every action is
            recorded.
          </p>

          <LoginForm accounts={accounts} password={DEMO_PASSWORD} />

          <div className="mt-6 space-y-2 border-t border-ink-200 pt-5">
            <p className="text-[11px] leading-relaxed text-ink-500">
              Health information is sensitive personal information under the Data Privacy Act of 2012 (RA 10173). By
              signing in you confirm you will access it only for a lawful purpose relating to patient care, and only to
              the extent necessary.
            </p>
            <p className="text-[11px] leading-relaxed text-ink-500">
              A patient checking their own referral status?{" "}
              <Link href="/track" className="link inline-flex items-center gap-1">
                Look it up here
                <IconArrowRight className="h-3 w-3" />
              </Link>
            </p>
          </div>
        </div>
      </div>
    </main>
  );
}
