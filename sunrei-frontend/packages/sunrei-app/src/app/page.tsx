'use client';

import { useTranslations } from 'next-intl';
import { MapPin, SlidersHorizontal } from 'lucide-react';
import { MapView, useSeedInitialCenter } from '@/components/map-view';
import { PlaceCard, PlaceCardSkeleton } from '@/components/place-card';
import { FiltersPanel } from '@/components/filters';
import {
  PlaceDetail,
  SearchNearbyButton,
  UnifiedSearch,
  VideoPreviewPanel,
} from '@/components/panels';
import { SourceDetail, VideoDetail } from '@/components/detail-surfaces';
import { Sidebar } from '@/components/desktop/Sidebar';
import { PeekSheet, type Snap } from '@/components/mobile/PeekSheet';
import { SearchPill } from '@/components/wf';
import { useMapPlaces, useSunreiDetail, useTagFilter } from '@/hooks/use-map';
import { useDeepLinkSync } from '@/hooks/use-deep-link';
import { useMapStore } from '@/stores/map-store';
import { useUiStore } from '@/stores/ui-store';
import { useFilterStore } from '@/stores/filter-store';
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

  const [mobileSnap, setMobileSnap] = useState<Snap>('half');

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

  // Active detail/preview overrides the list in both sidebar and sheet.
  const detailPanel = videoPreview ? (
    <VideoPreviewPanel />
  ) : activePlaceId ? (
    <div className="flex-1 overflow-auto">
      <PlaceDetail placeId={activePlaceId} />
    </div>
  ) : null;

  return (
    <div className="fixed inset-0 flex bg-background text-foreground overflow-hidden">
      {!isMobile && (
        <Sidebar
          detailPanel={detailPanel}
          listBody={listBody}
          count={allCards.length}
          showingPrevious={showingPrevious}
        />
      )}

      {/* Map */}
      <div className="relative flex-1">
        <div className="absolute inset-0">
          <MapView cards={allCards} previewSpots={previewSpots} />
        </div>

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

        {isMobile && !videoPreview && (
          <div className="absolute top-3 left-3 right-3 z-20">
            <SearchPill placeholder={search('placeholder')} onClick={() => setSearchOpen(true)} />
          </div>
        )}

        {isMobile && mobileSnap === 'full' && !detailPanel && (
          <div className="absolute inset-0 z-[15] bg-black/20 pointer-events-none" />
        )}

        <SearchNearbyButton isFetching={isFetching} />
      </div>

      {isMobile && (
        <PeekSheet
          detailPanel={detailPanel}
          listBody={listBody}
          count={allCards.length}
          showingPrevious={showingPrevious}
          onSnapChange={setMobileSnap}
        />
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
  const nav = useTranslations('nav');
  const clearSources = useMapStore((s) => s.clearSources);
  const clearFilters = useFilterStore((s) => s.clear);
  const hasFilter = useFilterStore((s) => s.activeTagIds.length > 0);
  return (
    <div className="text-center py-10 text-ink3">
      <MapPin className="h-10 w-10 mx-auto mb-2 opacity-40" />
      <p className="text-sm">{mode === 'source' ? t('noPlaces') : t('empty')}</p>
      {mode === 'source' ? (
        <button onClick={clearSources} className="mt-1 text-sm text-primary font-medium">
          {t('clearSource')}
        </button>
      ) : (
        hasFilter && (
          <button onClick={clearFilters} className="mt-1 text-sm text-primary font-medium">
            {nav('clear')}
          </button>
        )
      )}
    </div>
  );
}
