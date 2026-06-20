'use client';

import { useTranslations } from 'next-intl';
import { useMapStore } from '@/stores/map-store';
import { useSources } from '@/hooks/use-discovery';
import { cn } from '@/lib/utils';

/** "Sources near you" rail (desktop sidebar). Tap to scope to a source. */
export function SourceRail() {
  const nav = useTranslations('nav');
  const { data: sources = [] } = useSources();
  const selected = useMapStore((s) => s.selectedSourceIds);
  const addSource = useMapStore((s) => s.addSource);
  const clearSources = useMapStore((s) => s.clearSources);
  if (sources.length === 0) return null;

  const Item = ({
    label,
    active,
    onClick,
    glyph,
  }: {
    label: string;
    active: boolean;
    onClick: () => void;
    glyph?: string;
  }) => (
    <button
      type="button"
      onClick={onClick}
      className="flex flex-col items-center gap-1 w-14 shrink-0"
      title={label}
    >
      <span
        className={cn(
          'grid place-items-center h-11 w-11 rounded-full border text-sm font-bold transition-colors',
          active ? 'bg-primary text-primary-foreground border-primary' : 'bg-card text-ink2 border-line2'
        )}
      >
        {glyph ?? label.charAt(0).toUpperCase()}
      </span>
      <span className="w-full truncate text-center text-[10px] text-ink2">{label}</span>
    </button>
  );

  return (
    <div className="border-b border-line">
      <div className="px-3 pt-3 text-[10px] font-bold uppercase tracking-wide text-ink3">
        {nav('sourcesNearYou')}
      </div>
      <div className="flex gap-1 overflow-x-auto px-2 py-2">
        <Item label={nav('all')} glyph="◎" active={selected.length === 0} onClick={clearSources} />
        {sources.map((s) => (
          <Item
            key={s.id}
            label={s.name}
            active={selected.includes(s.id)}
            onClick={() => addSource(s.id)}
          />
        ))}
      </div>
    </div>
  );
}
