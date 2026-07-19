'use client';

import { cn } from '@/lib/utils';

/** Rounded search pill matching the wireframe SearchBar. */
export function SearchPill({
  placeholder,
  onClick,
  className,
}: {
  placeholder: string;
  onClick?: () => void;
  className?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'flex items-center gap-2.5 px-4 py-2.5 rounded-full bg-card border border-line2 text-left',
        'shadow-[0_2px_8px_rgba(0,0,0,0.06)] hover:border-ink3 transition-colors',
        className
      )}
    >
      <svg width="15" height="15" viewBox="0 0 15 15" fill="none" stroke="var(--ink3)" strokeWidth="1.8">
        <circle cx="6.5" cy="6.5" r="4.5" />
        <path d="M10 10l3.5 3.5" strokeLinecap="round" />
      </svg>
      <span className="text-[13px] text-ink3 truncate">{placeholder}</span>
    </button>
  );
}
