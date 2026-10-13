/**
 * Wordmark. Two linked rings represent an exchange between two care settings.
 */
export function Logo({ className = "", size = 30 }: { className?: string; size?: number }) {
  return (
    <span
      className={`flex shrink-0 items-center justify-center rounded-[10px] bg-ink-900 text-white ${className}`}
      style={{ width: size, height: size }}
    >
      <svg viewBox="0 0 32 32" className="h-[18px] w-[18px]" fill="none" aria-hidden="true">
        <circle cx="10" cy="16" r="5.4" stroke="currentColor" strokeWidth="2.1" />
        <circle cx="22" cy="16" r="5.4" stroke="currentColor" strokeWidth="2.1" />
        <path d="M15.4 16h1.2" stroke="currentColor" strokeWidth="2.1" strokeLinecap="round" />
        <path
          d="M17.5 11.2h4.2M17.5 20.8h4.2"
          stroke="currentColor"
          strokeWidth="1.3"
          strokeLinecap="round"
          opacity="0.5"
        />
      </svg>
    </span>
  );
}

/** Larger lock-up used on the sign-in screen. */
export function LogoMark({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 40 40" className={className} fill="none" aria-hidden="true">
      <circle cx="12" cy="20" r="7" stroke="currentColor" strokeWidth="2.4" />
      <circle cx="28" cy="20" r="7" stroke="currentColor" strokeWidth="2.4" />
      <path d="M19 20h2" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" />
      <path d="M8 20h1.4M30.6 20H32" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" />
      <path d="M17 14.6h6M17 25.4h6" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" opacity="0.5" />
    </svg>
  );
}
