'use client';

import { useTranslations } from 'next-intl';
import { useMapStore } from '@/stores/map-store';
import { useUiStore } from '@/stores/ui-store';
import { useNearbySources } from '@/hooks/use-map';
import { Avatar, sourceAvatarUrl } from '@/components/wf';
import { cn } from '@/lib/utils';
import type { ReactNode } from 'react';

export function SourceRail() {
  const t = useTranslations('list');
  const committedBounds = useMapStore((s) => s.committedBounds);
  const mapCenter = useMapStore((s) => s.mapCenter);
  const { data: sources = [] } = useNearbySources(committedBounds, mapCenter);
  const selected = useMapStore((s) => s.selectedSourceIds);
  const setSourceMode = useMapStore((s) => s.setSourceMode);
  const clearSources = useMapStore((s) => s.clearSources);
  const setSourceFromSearch = useUiStore((s) => s.setSourceFromSearch);
  if (sources.length === 0) return null;

  return (
    <div className="px-4 pt-1 lg:pt-[15px]">
      <div className="flex items-baseline gap-[7px]">
        <span className="text-[12px] font-extrabold text-foreground">{t('sourcesInView')}</span>
        <span className="text-[11.5px] font-extrabold text-accent-ink">{sources.length}</span>
      </div>
      <div className="mt-2 flex gap-[7px] overflow-x-auto pb-0.5">
        {sources.map((s) => {
          const active = selected.includes(s.id);
          return (
            <button
              key={s.id}
              type="button"
              onClick={() => {
                if (active) clearSources();
                else {
                  setSourceMode([s.id]);
                  setSourceFromSearch(false);
                }
              }}
              title={s.name}
              className={cn(
                'flex shrink-0 items-center gap-[7px] rounded-full border py-1 pl-1 pr-[11px] transition-colors',
                active ? 'border-primary bg-accent-soft' : 'border-line2 bg-card hover:border-ink3'
              )}
            >
              <Avatar label={s.name} src={sourceAvatarUrl(s, 22)} size={22} />
              <span className="whitespace-nowrap text-[12.5px] font-bold text-foreground">{s.name}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

export function SectionLabel({
  children,
  count,
  sub,
}: {
  children: ReactNode;
  count?: number;
  sub?: string;
}) {
  return (
    <div className="flex items-baseline gap-2">
      <span className="text-[11px] font-extrabold uppercase tracking-wide text-foreground">
        {children}
      </span>
      {count != null && <span className="text-[11.5px] font-extrabold text-accent-ink">{count}</span>}
      {sub && <span className="ml-auto text-[11px] font-semibold text-ink3">{sub}</span>}
    </div>
  );
}
