/** JS Workspace logosu: favicon.svg işareti (apps/web/public/brand) + yazı. */
export function Logo({ size = 28, wordmark = true }: { size?: number; wordmark?: boolean }) {
  return (
    <span className="inline-flex items-center gap-2.5">
      <svg width={size} height={size} viewBox="0 0 64 64" aria-hidden="true">
        <rect width="64" height="64" rx="16" fill="#01041E" stroke="rgba(255,255,255,.14)" />
        <path d="M18 13h13v26c0 10-6 15-15 15V43c4 0 5-1 5-5V13" fill="#edf0ff" />
        <circle cx="46" cy="46" r="7" fill="#ff4200" />
      </svg>
      {wordmark && <span className="text-[15px] font-bold tracking-tight">JS <span className="text-brand-ink">Workspace</span></span>}
    </span>
  );
}
