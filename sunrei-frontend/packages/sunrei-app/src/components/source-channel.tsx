'use client';

import { useTranslations } from 'next-intl';
import { Loader2, MapPin, Play } from 'lucide-react';
import { useMapStore } from '@/stores/map-store';
import { useUiStore } from '@/stores/ui-store';
import { useSourceDetail } from '@/hooks/use-map';
import { SectionLabel } from '@/components/desktop/SourceRail';
import { Avatar, sourceAvatarUrl } from '@/components/wf';
import { BackPill } from '@/components/panels';

/**
 * 검색이나 "주변 소스" 레일에서 Source를 고르면 목록 자리에 열리는 채널 화면이다.
 * 지도는 source 모드로 이 Source의 모든 장소를 보여 주고, 패널은 Sunrei 목록을 보여 준다.
 * Sunrei를 누르면 그 Sunrei의 장소만 미리보기로 보여 준다.
 */
export function SourceChannelPanel({ sourceId }: { sourceId: string }) {
  const t = useTranslations('source');
  const nav = useTranslations('nav');
  const search = useTranslations('search');
  const td = useTranslations('detail');
  const typeT = useTranslations('sourceType');
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
  const externalLabel =
    source?.type === 'YOUTUBE'
      ? t('watchOnYoutube')
      : source?.type === 'INSTAGRAM'
        ? t('viewOnInstagram')
        : t('whereToWatch');

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      <div className="border-b border-line px-4 pb-[14px] pt-2">
        <BackPill onClick={back}>{sourceFromSearch ? search('back') : nav('back')}</BackPill>
        {isLoading || !source ? (
          <div className="grid place-items-center py-6">
            <Loader2 className="h-5 w-5 animate-spin text-ink3" />
          </div>
        ) : (
          <>
            <div className="flex items-center gap-2.5">
              <Avatar label={source.name} src={sourceAvatarUrl(source, 44)} size={44} />
              <div className="min-w-0 flex-1">
                <div className="truncate text-[16px] font-extrabold text-foreground">{source.name}</div>
                <div className="mt-0.5 text-[12px] font-semibold text-ink2">
                  {typeT(source.type)}
                  {source.placeCount != null && ` · ${td('spotCount', { count: source.placeCount })}`}
                </div>
              </div>
            </div>
            {source.externalUrl && (
              <a
                href={source.externalUrl}
                target="_blank"
                rel="noreferrer"
                className="mt-2.5 inline-flex h-8 items-center gap-1.5 rounded-full border border-line2 bg-card px-[13px] text-[12.5px] font-bold text-foreground hover:border-ink3"
              >
                {/* 라벨 끝의 "↗"가 외부 링크 표시라 아이콘은 YouTube 재생 표시만 둔다. */}
                {source.type === 'YOUTUBE' && <Play className="h-3 w-3 fill-primary text-primary" />}
                {externalLabel}
              </a>
            )}
          </>
        )}
      </div>

      <div className="flex-1 overflow-auto px-4 pb-2 pt-[15px]">
        <SectionLabel count={sunreis.length}>{t('series')}</SectionLabel>
        <div className="mt-[11px] flex flex-col gap-2.5">
          {!isLoading && source && sunreis.length === 0 && (
            <div className="flex flex-col items-center gap-2.5 py-9 text-ink2">
              <MapPin className="h-9 w-9 opacity-40" strokeWidth={1.4} />
              <span className="text-[13.5px] font-bold">{t('empty')}</span>
            </div>
          )}
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
