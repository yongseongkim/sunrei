'use client';

import { useTranslations } from 'next-intl';
import { ChevronLeft, ExternalLink, Loader2 } from 'lucide-react';
import { useMapStore } from '@/stores/map-store';
import { useUiStore } from '@/stores/ui-store';
import { useSourceDetail } from '@/hooks/use-map';
import { SectionLabel } from '@/components/desktop/SourceRail';
import { Avatar } from '@/components/wf';
import type { SourceType } from '@/dto';

const TYPE_LABEL: Record<SourceType, string> = {
  YOUTUBE: 'YouTube',
  TV: 'TV',
  ANIME: 'Anime',
  OTHER: 'Other',
};

/**
 * Channel view (wireframe §4): opened when a source is selected from search or the
 * "Sources in view" rail. The map (source mode) shows every place across all of this
 * source's sunreis; this left panel is the channel header + its sunrei (series) list.
 * Tapping a sunrei previews just that sunrei's places. Back exits the scope — to the
 * search results if we came from search, else to Home.
 */
export function SourceChannelPanel({ sourceId }: { sourceId: string }) {
  const t = useTranslations('source');
  const nav = useTranslations('nav');
  const search = useTranslations('search');
  const td = useTranslations('detail');
  const mapCenter = useMapStore((s) => s.mapCenter);
  const clearSources = useMapStore((s) => s.clearSources);
  const enterPreview = useUiStore((s) => s.enterVideoPreview);
  const sourceFromSearch = useUiStore((s) => s.sourceFromSearch);
  const setSourceFromSearch = useUiStore((s) => s.setSourceFromSearch);
  const setSearchOpen = useUiStore((s) => s.setSearchOpen);
  const { data, isLoading } = useSourceDetail(sourceId, mapCenter);

  const back = () => {
    clearSources();
    if (sourceFromSearch) setSearchOpen(true);
    setSourceFromSearch(false);
  };

  const source = data?.source;
  const sunreis = data?.sunreis ?? [];
  const isYouTube = source?.type === 'YOUTUBE';

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      {/* Channel header */}
      <div className="border-b border-line px-4 pb-[14px] pt-2">
        <button
          onClick={back}
          className="mb-2.5 flex items-center gap-0.5 text-ink2 hover:text-foreground"
        >
          <ChevronLeft className="h-[18px] w-[18px]" />
          <span className="text-[13px] font-semibold">
            {sourceFromSearch ? search('back') : nav('back')}
          </span>
        </button>
        {isLoading || !source ? (
          <div className="grid place-items-center py-6">
            <Loader2 className="h-5 w-5 animate-spin text-ink3" />
          </div>
        ) : (
          <>
            <div className="flex items-center gap-2.5">
              <Avatar label={source.name} size={44} />
              <div className="min-w-0 flex-1">
                <div className="truncate text-[16px] font-extrabold text-foreground">{source.name}</div>
                <div className="text-[11.5px] font-semibold text-ink2">
                  {TYPE_LABEL[source.type]}
                  {source.placeCount != null && ` · ${td('spotCount', { count: source.placeCount })}`}
                </div>
              </div>
            </div>
            {source.externalUrl && (
              <a
                href={source.externalUrl}
                target="_blank"
                rel="noreferrer"
                className="mt-2.5 inline-flex items-center gap-1.5 rounded-full border border-line2 bg-card px-3 py-1.5 text-[11.5px] font-bold text-foreground hover:border-ink3"
              >
                <ExternalLink className="h-3.5 w-3.5" />
                {isYouTube ? t('watchOnYoutube') : t('whereToWatch')}
              </a>
            )}
          </>
        )}
      </div>

      {/* Sunrei (series) list — tapping one previews that sunrei's places */}
      <div className="flex-1 overflow-auto px-4 pb-2 pt-[15px]">
        <SectionLabel count={sunreis.length}>{t('series')}</SectionLabel>
        <div className="mt-[11px] flex flex-col gap-2.5">
          {sunreis.map((s) => (
            <button
              key={s.id}
              type="button"
              onClick={() => enterPreview(s.id, 'source')}
              className="rounded-xl border border-line bg-card p-3 text-left transition-colors hover:border-ink3/40"
            >
              <div className="text-[14px] font-extrabold text-foreground">{s.title}</div>
              {s.summary && <div className="mt-1 line-clamp-2 text-[12px] text-ink2">{s.summary}</div>}
              <div className="mt-1.5 text-[11px] font-bold text-accent-ink">
                {td('spotCount', { count: s.placeCount ?? s.spotCount })}
              </div>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
