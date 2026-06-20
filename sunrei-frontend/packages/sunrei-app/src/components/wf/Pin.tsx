'use client';

import { cn } from '@/lib/utils';

/** Teardrop place pin (one marker = one Place). */
export function Pin({ filled = true, className }: { filled?: boolean; className?: string }) {
  return (
    <span
      className={cn('inline-block shrink-0', className)}
      style={{
        width: 13,
        height: 13,
        borderRadius: '50% 50% 50% 0',
        transform: 'rotate(-45deg)',
        background: filled ? 'var(--primary)' : 'transparent',
        border: '1.6px solid var(--primary)',
      }}
    />
  );
}
