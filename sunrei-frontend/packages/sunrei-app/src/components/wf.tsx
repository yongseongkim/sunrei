'use client';

import { cn } from '@/lib/utils';
import type { SourceType } from '@/dto';

// Wireframe primitives (Sunrei Wireframes.html). Cornflower-blue accent, cream/greige
// neutrals, teardrop pins, avatar-initial source rows. Tokens live in globals.css.

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

/** Round avatar with a source initial. */
export function Avatar({ label, size = 22 }: { label: string; size?: number }) {
  return (
    <span
      className="grid place-items-center shrink-0 rounded-full bg-accent-soft text-ink2 font-bold border border-line2"
      style={{ width: size, height: size, fontSize: Math.round(size * 0.42) }}
    >
      {(label || '?').charAt(0).toUpperCase()}
    </span>
  );
}

/** Overlapping avatar cluster for the rich (multi-mention) card. */
export function AvatarCluster({ labels, size = 20 }: { labels: string[]; size?: number }) {
  return (
    <div className="flex">
      {labels.map((l, i) => (
        <span key={i} className="rounded-full border-2 border-card" style={{ marginLeft: i ? -6 : 0 }}>
          <Avatar label={l} size={size} />
        </span>
      ))}
    </div>
  );
}

const VERB: Record<SourceType, string> = {
  YOUTUBE: 'featured this',
  TV: 'visited',
  ANIME: 'set a scene at',
  OTHER: 'recommends',
};
export const sourceVerb = (t: SourceType) => VERB[t] ?? 'featured this';

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

/** Sheet grab handle. */
export function Handle() {
  return <div className="mx-auto mt-2 mb-1.5 h-1 w-9 rounded-full bg-line2" />;
}

/** List / Map segmented toggle. */
export function ViewToggle({ map, onChange }: { map: boolean; onChange: (map: boolean) => void }) {
  return (
    <div className="inline-flex shrink-0 rounded-full bg-bg2 p-0.5 border border-line2">
      {([['List', false], ['Map', true]] as const).map(([t, isMap]) => {
        const on = isMap === map;
        return (
          <button
            key={t}
            type="button"
            onClick={() => onChange(isMap)}
            className={cn(
              'px-2.5 py-1 rounded-full text-[11.5px] font-bold transition-colors',
              on ? 'bg-card text-foreground shadow-sm' : 'text-ink3'
            )}
          >
            {t}
          </button>
        );
      })}
    </div>
  );
}
