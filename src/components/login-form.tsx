"use client";

import { useActionState, useState } from "react";
import { loginAction, type LoginState } from "@/app/actions/auth";
import { IconChevronRight, IconShield, IconAlert } from "@/components/icons";

interface DemoAccount {
  email: string;
  name: string;
  role: string;
  facility: string;
  side: "referring" | "receiving" | "governance";
}

const GROUPS = [
  { id: "referring", label: "Referring facility", hint: "Creates and routes referrals" },
  { id: "receiving", label: "Receiving facility", hint: "Reviews, decides and returns feedback" },
  { id: "governance", label: "Oversight", hint: "Administration and audit" },
] as const;

export function LoginForm({ accounts, password }: { accounts: DemoAccount[]; password: string }) {
  const [state, formAction, pending] = useActionState<LoginState, FormData>(loginAction, {});
  const [email, setEmail] = useState("");
  const [group, setGroup] = useState<"referring" | "receiving" | "governance">("referring");

  const visible = accounts.filter((a) => a.side === group);
  const activeGroup = GROUPS.find((g) => g.id === group);

  return (
    <div className="space-y-5">
      {state.error && (
        <div className="flex gap-2.5 rounded-xl border border-red-200 bg-red-50 px-3.5 py-3 text-[13px] text-red-800" role="alert">
          <IconAlert className="mt-px h-4 w-4 shrink-0" />
          <p>{state.error}</p>
        </div>
      )}

      <form action={formAction} className="space-y-4">
        <div>
          <label htmlFor="email" className="label">
            Work email
          </label>
          <input
            id="email"
            name="email"
            type="email"
            autoComplete="username"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="input h-10"
            placeholder="you@facility.example.ph"
          />
        </div>

        <div>
          <label htmlFor="password" className="label">
            Password
          </label>
          <input
            id="password"
            name="password"
            type="password"
            autoComplete="current-password"
            required
            defaultValue={password}
            className="input h-10"
          />
        </div>

        <button type="submit" disabled={pending} className="btn-primary btn-lg w-full">
          {pending ? "Signing in…" : "Sign in"}
          {!pending && <IconChevronRight className="h-4 w-4" />}
        </button>
      </form>

      {/* ---------------- Demo account picker ---------------- */}
      <div className="rounded-xl border border-ink-200 bg-ink-50/70 p-3.5">
        <div className="mb-3 flex items-start justify-between gap-3">
          <div>
            <p className="text-[12px] font-semibold text-ink-800">Demonstration accounts</p>
            <p className="mt-0.5 text-[11px] text-ink-500">Select one to fill the form</p>
          </div>
          <span className="chip-neutral shrink-0">Synthetic data</span>
        </div>

        <div className="mb-3 flex gap-1 rounded-lg border border-ink-200 bg-white p-0.5">
          {GROUPS.map((g) => (
            <button
              key={g.id}
              type="button"
              onClick={() => setGroup(g.id)}
              className={`flex-1 rounded-[6px] px-2 py-1.5 text-[11.5px] font-medium transition-colors ${
                group === g.id ? "bg-ink-900 text-white shadow-xs" : "text-ink-600 hover:bg-ink-100"
              }`}
            >
              {g.label.split(" ")[0]}
            </button>
          ))}
        </div>

        {activeGroup && <p className="mb-2 text-[10.5px] text-ink-500">{activeGroup.hint}</p>}

        <ul className="max-h-52 space-y-1 overflow-y-auto thin-scroll">
          {visible.map((a) => (
            <li key={a.email}>
              <button
                type="button"
                onClick={() => setEmail(a.email)}
                className={`flex w-full items-center gap-2.5 rounded-lg border px-2.5 py-2 text-left transition-colors ${
                  email === a.email
                    ? "border-brand-300 bg-brand-50"
                    : "border-transparent bg-white hover:border-ink-200"
                }`}
              >
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[12.5px] font-medium text-ink-900">{a.name}</span>
                  <span className="block truncate text-[10.5px] text-ink-500">
                    {a.role} · {a.facility}
                  </span>
                </span>
                <IconChevronRight className="h-3.5 w-3.5 shrink-0 text-ink-300" />
              </button>
            </li>
          ))}
        </ul>

        <p className="mt-3 flex items-start gap-1.5 border-t border-ink-200/80 pt-2.5 text-[10.5px] leading-relaxed text-ink-500">
          <IconShield className="mt-px h-3 w-3 shrink-0" />
          <span>
            All accounts share the password{" "}
            <code className="rounded bg-white px-1 py-0.5 font-mono text-[10.5px] text-ink-800">{password}</code>.
            Sign in as different roles to follow a referral around the closed loop.
          </span>
        </p>
      </div>
    </div>
  );
}
