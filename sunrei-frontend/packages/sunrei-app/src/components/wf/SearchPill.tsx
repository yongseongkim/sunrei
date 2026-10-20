'use client';

import { cn } from '@/lib/utils';

export function SearchPill({
  placeholder,
  onClick,
  shadow,
  className,
}: {
  placeholder: string;
  onClick?: () => void;
  /** 지도 위에 떠 있는 모바일 검색창만 그림자를 준다. */
  shadow?: boolean;
  className?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'flex h-[42px] items-center gap-[9px] px-[15px] rounded-full bg-card border border-line2 text-left',
        'hover:border-ink3 transition-colors',
        shadow && 'shadow-[0_2px_8px_rgba(0,0,0,0.08)]',
        className
      )}
    >
      <svg width="15" height="15" viewBox="0 0 15 15" fill="none" stroke="var(--ink3)" strokeWidth="1.8">
        <circle cx="6.5" cy="6.5" r="4.5" />
        <path d="M10 10l3.5 3.5" strokeLinecap="round" />
      </svg>
      <span className="text-[13.5px] text-ink3 truncate">{placeholder}</span>
    </button>
  );
}
