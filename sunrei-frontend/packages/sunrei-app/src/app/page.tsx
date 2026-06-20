'use client';

import { useTranslations } from 'next-intl';
import { MapPin, SlidersHorizontal } from 'lucide-react';
import { MapView, useSeedInitialCenter } from '@/components/map-view';
import { PlaceCard, PlaceCardSkeleton } from '@/components/place-card';
import { FiltersPanel } from '@/components/filters';
import {
  LocaleToggle,
  PlaceDetail,
  SearchNearbyButton,
  SourceChips,
  SourceRail,
  TagChipRail,
  UnifiedSearch,
  VideoPreviewPanel,
} from '@/components/panels';
import { SourceDetail, VideoDetail } from '@/components/detail-surfaces';
import { SearchPill, Handle, ViewToggle } from '@/components/wf';
import { useMapPlaces, useSunreiDetail, useTagFilter } from '@/hooks/use-map';
import { useDeepLinkSync } from '@/hooks/use-deep-link';
import { useMapStore } from '@/stores/map-store';
import { useUiStore } from '@/stores/ui-store';
import { cn } from '@/lib/utils';
import { useState } from 'react';

export default function AppShell() {
  const t = useTranslations('list');
  const nav = useTranslations('nav');
  const search = useTranslations('search');
  useSeedInitialCenter();
  useDeepLinkSync();

  const mode = useMapStore((s) => s.mode);
  const committedBounds = useMapStore((s) => s.committedBounds);
  const mapCenter = useMapStore((s) => s.mapCenter);
  const selectedSourceIds = useMapStore((s) => s.selectedSourceIds);
  const pendingArea = useMapStore((s) => s.pendingArea);

  const isMobile = useUiStore((s) => s.isMobile);
  const activePlaceId = useUiStore((s) => s.activePlaceId);
  const setActivePlace = useUiStore((s) => s.setActivePlace);
  const setSearchOpen = useUiStore((s) => s.setSearchOpen);
  const searchOpen = useUiStore((s) => s.searchOpen);
  const setFiltersOpen = useUiStore((s) => s.setFiltersOpen);
  const videoPreview = useUiStore((s) => s.videoPreview);

  // Mobile peek sheet snap points (Bd-2): peek → half → full (tap-driven).
  const [snap, setSnap] = useState<'peek' | 'half' | 'full'>('half');
  const cycleSnap = () =>
    setSnap((s) => (s === 'peek' ? 'half' : s === 'half' ? 'full' : 'peek'));

  const { data, isFetching, isLoading } = useMapPlaces({
    mode,
    bounds: committedBounds,
    center: mapCenter,
    sourceIds: selectedSourceIds,
  });

  const allCards = data?.places ?? [];
  const { dimmedIds } = useTagFilter(allCards);
  const { data: previewData } = useSunreiDetail(videoPreview?.sunreiId ?? null);
  const previewSpots = videoPreview ? previewData?.sunrei.spots ?? null : null;

  const firstLoad = isLoading && allCards.length === 0;
  const showingPrevious = mode === 'nearby' && !!pendingArea;

  const listBody = (
    <div className={cn('flex-1 overflow-auto px-3 py-2 space-y-2', showingPrevious && 'opacity-50')}>
      {firstLoad ? (
        <div className="space-y-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <PlaceCardSkeleton key={i} />
          ))}
        </div>
      ) : allCards.length === 0 ? (
        <EmptyState mode={mode} />
      ) : (
        allCards.map((c) => (
          <PlaceCard
            key={c.place.id}
            card={c}
            active={c.place.id === activePlaceId}
            dimmed={dimmedIds.has(c.place.id)}
            onClick={() => setActivePlace(c.place.id)}
          />
        ))
      )}
    </div>
  );

  // Count + sort row (sidebar / sheet header)
  const countRow = (
    <div className="flex items-center justify-between px-3 py-2">
      <span className="text-[13px] font-semibold text-foreground">
        {showingPrevious ? t('showPrevious') : t('placesNear', { count: allCards.length })}
      </span>
      <span className="text-[11px] font-semibold text-ink2">{nav('nearest')} ▾</span>
    </div>
  );

  // What the sidebar / sheet shows: video preview > place detail > list
  const panel = videoPreview ? (
    <VideoPreviewPanel />
  ) : activePlaceId ? (
    <div className="flex-1 overflow-auto">
      <PlaceDetail placeId={activePlaceId} />
    </div>
  ) : (
    <>
      {!isMobile && <SourceRail />}
      <TagChipRail />
      {countRow}
      {listBody}
    </>
  );

  return (
    <div className="fixed inset-0 flex bg-background text-foreground overflow-hidden">
      {/* Desktop sidebar */}
      {!isMobile && (
        <aside className="relative w-[380px] shrink-0 border-r border-line bg-card flex flex-col z-10">
          <div className="flex items-center gap-2 px-3 py-3 border-b border-line">
            <span className="h-6 w-6 rounded-md bg-primary" />
            <span className="font-extrabold text-base mr-auto tracking-tight">Sunrei</span>
            <LocaleToggle />
          </div>
          {!videoPreview && !activePlaceId && (
            <div className="px-3 pt-2 flex items-center gap-1.5 text-[11.5px] text-ink2">
              <MapPin className="h-3.5 w-3.5 text-primary" />
              {t('sortedByDistance')}
            </div>
          )}
          <SourceChips />
          {panel}
        </aside>
      )}

      {/* Map */}
      <div className="relative flex-1">
        <div className="absolute inset-0">
          <MapView cards={allCards} previewSpots={previewSpots} />
        </div>

        {/* Floating search pill + Filters (desktop) */}
        {!isMobile && (
          <div className="absolute top-3 left-4 right-4 z-20 flex items-center gap-2">
            <SearchPill
              placeholder={search('placeholder')}
              onClick={() => setSearchOpen(true)}
              className="flex-1 max-w-xl"
            />
            <button
              type="button"
              onClick={() => setFiltersOpen(true)}
              className="ml-auto flex items-center gap-1.5 rounded-full bg-card border border-line2 px-4 py-2.5 text-[13px] font-semibold shadow-[0_2px_8px_rgba(0,0,0,0.06)]"
            >
              <SlidersHorizontal className="h-4 w-4" />
              {nav('filters')}
            </button>
          </div>
        )}

        {/* Mobile floating search */}
        {isMobile && !videoPreview && (
          <div className="absolute top-3 left-3 right-3 z-20">
            <SearchPill placeholder={search('placeholder')} onClick={() => setSearchOpen(true)} />
          </div>
        )}

        {/* Map dims behind the sheet at the full snap (Bd-2) */}
        {isMobile && snap === 'full' && !videoPreview && !activePlaceId && (
          <div className="absolute inset-0 z-[15] bg-black/20 pointer-events-none" />
        )}

        <SearchNearbyButton isFetching={isFetching} />
      </div>

      {/* Mobile bottom sheet — 3 snaps */}
      {isMobile && (
        <div
          className={cn(
            'absolute left-0 right-0 bottom-0 bg-card border-t border-line rounded-t-2xl z-20 flex flex-col shadow-[0_-4px_20px_rgba(0,0,0,0.08)] transition-[height] duration-[250ms] ease-out',
            videoPreview || activePlaceId
              ? 'h-[72%]'
              : snap === 'peek'
                ? 'h-[96px]'
                : snap === 'full'
                  ? 'h-[90%]'
                  : 'h-[56%]'
          )}
        >
          <button onClick={cycleSnap} className="w-full" aria-label="Toggle sheet">
            <Handle />
          </button>
          {videoPreview || activePlaceId ? (
            panel
          ) : snap === 'peek' ? (
            <button
              onClick={() => setSnap('half')}
              className="flex items-center justify-between px-4 pb-3 text-left"
            >
              <span className="text-[13px] font-semibold">
                {showingPrevious ? t('showPrevious') : t('placesNear', { count: allCards.length })}
              </span>
              <span className="text-[12px] font-semibold text-primary">{t('showList')} ⌃</span>
            </button>
          ) : (
            <>
              <div className="flex items-center justify-between px-3 pb-1">
                <span className="text-[13px] font-semibold">
                  {showingPrevious ? t('showPrevious') : t('placesNear', { count: allCards.length })}
                </span>
                <ViewToggle map={false} onChange={(m) => setSnap(m ? 'peek' : 'half')} />
              </div>
              <TagChipRail />
              {listBody}
            </>
          )}
        </div>
      )}

      {searchOpen && <UnifiedSearch onClose={() => setSearchOpen(false)} />}
      <FiltersPanel places={allCards} />
      <SourceDetail />
      <VideoDetail />
    </div>
  );
}

function EmptyState({ mode }: { mode: 'nearby' | 'source' }) {
  const t = useTranslations(mode === 'source' ? 'source' : 'list');
  const clearSources = useMapStore((s) => s.clearSources);
  return (
    <div className="text-center py-10 text-ink3">
      <MapPin className="h-10 w-10 mx-auto mb-2 opacity-40" />
      <p className="text-sm">{mode === 'source' ? t('noPlaces') : t('empty')}</p>
      {mode === 'source' && (
        <button onClick={clearSources} className="mt-1 text-sm text-primary font-medium">
          {t('clearSource')}
        </button>
      )}
    </div>
  );
}
