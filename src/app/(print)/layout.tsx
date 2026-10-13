import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Referral summary",
  robots: { index: false, follow: false },
};

/**
 * Bare shell for printable documents.
 *
 * Deliberately has no application chrome: a printed referral or report should
 * contain the clinical content and nothing else. Also marked noindex, because a
 * printable clinical document should never be crawlable.
 */
export default function PrintLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-dvh bg-white">
      <div className="no-print sticky top-0 z-10 flex items-center justify-between gap-4 border-b border-ink-200 bg-ink-50/90 px-5 py-2.5 backdrop-blur">
        <p className="text-[11px] text-ink-500">
          Print preview. Use your browser&rsquo;s print function for a paper or PDF copy.
        </p>
        <a href="javascript:window.print()" className="btn-secondary btn-sm">
          Print this page
        </a>
      </div>
      {children}
    </div>
  );
}
