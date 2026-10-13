import Link from "next/link";
import { LogoMark } from "@/components/logo";
import { IconArrowLeft } from "@/components/icons";

export default function NotFound() {
  return (
    <main className="flex min-h-dvh items-center justify-center px-6 py-16">
      <div className="w-full max-w-md text-center">
        <LogoMark className="mx-auto h-10 w-10 text-ink-300" />
        <p className="mt-6 text-[13px] font-medium uppercase tracking-[0.08em] text-ink-400">Not found</p>
        <h1 className="mt-2 text-[22px] font-semibold tracking-[-0.02em] text-ink-900">
          This page does not exist
        </h1>
        <p className="mx-auto mt-3 max-w-sm text-[13px] leading-relaxed text-ink-500">
          The page may have moved, or the referral or patient it referred to may no longer be available to you. Access is
          scoped to your facility, so a valid link can still be refused if your facility is not a party to the record.
        </p>
        <div className="mt-6 flex flex-wrap items-center justify-center gap-2">
          <Link href="/dashboard" className="btn-primary">
            <IconArrowLeft className="h-4 w-4" />
            Back to the dashboard
          </Link>
          <Link href="/referrals" className="btn-secondary">
            Referral worklist
          </Link>
        </div>
      </div>
    </main>
  );
}
