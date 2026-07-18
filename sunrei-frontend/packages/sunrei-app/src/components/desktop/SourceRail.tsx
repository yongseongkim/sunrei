'use client';

import { useTranslations } from 'next-intl';
import { useMapStore } from '@/stores/map-store';
import { useUiStore } from '@/stores/ui-store';
import { useNearbySources } from '@/hooks/use-map';
import { Avatar, sourceAvatarUrl } from '@/components/wf';
import { cn } from '@/lib/utils';
import type { ReactNode } from 'react';
import type { SourceDTO } from '@/dto';

/**
 * "Sources in view" rail (direction B): slim chips — avatar + name + a place-count
 * badge — for the distinct sources featured in the current viewport. Tapping a chip
 * scopes the map/list to that source (source mode); tapping the active chip clears it.
 */
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

  const count = (s: SourceDTO) => s.placeCount ?? s.spotCount ?? s.videoCount ?? null;

  return (
    <div className="border-b border-line px-4 py-[14px]">
      <SectionLabel count={sources.length}>{t('sourcesInView')}</SectionLabel>
      <div className="mt-[11px] flex gap-[9px] overflow-x-auto pb-0.5">
        {sources.map((s) => {
          const active = selected.includes(s.id);
          const n = count(s);
          return (
            <button
              key={s.id}
              type="button"
              onClick={() => {
                // Open this channel's view (single-source scope); tap again to clear.
                if (active) clearSources();
                else {
                  setSourceMode([s.id]);
                  setSourceFromSearch(false);
                }
              }}
              title={s.name}
              className={cn(
                'flex shrink-0 items-center gap-[7px] rounded-full border py-[5px] pl-[5px] pr-[10px] transition-colors',
                active ? 'border-primary bg-accent-soft' : 'border-line2 bg-card hover:border-ink3'
              )}
            >
              <Avatar label={s.name} src={sourceAvatarUrl(s, 22)} size={22} />
              <span className="whitespace-nowrap text-[12.5px] font-bold text-foreground">{s.name}</span>
              {n != null && (
                <span className="rounded-full bg-bg2 px-[7px] py-px text-[10.5px] font-extrabold text-ink2">
                  {n}
                </span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}

/** Uppercase section eyebrow with a count, shared by the sidebar sections (direction B). */
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
