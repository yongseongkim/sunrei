'use client';

import { useTranslations } from 'next-intl';
import { Loader2, Search } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { MapView, useSeedInitialCenter } from '@/components/map-view';
import { PlaceCard } from '@/components/place-card';
import {
  LocaleToggle,
  PlaceDetail,
  SearchNearbyButton,
  SourceChips,
  TagChipRail,
  UnifiedSearch,
  VideoPreviewPanel,
} from '@/components/panels';
import { SourceDetail, VideoDetail } from '@/components/detail-surfaces';
import { useMapPlaces, useSunreiDetail, useTagFilter } from '@/hooks/use-map';
import { useDeepLinkSync } from '@/hooks/use-deep-link';
import { useMapStore } from '@/stores/map-store';
import { useUiStore } from '@/stores/ui-store';
import { useFilterStore } from '@/stores/filter-store';
import { cn } from '@/lib/utils';

export default function AppShell() {
  const t = useTranslations('list');
  const nav = useTranslations('nav');
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
  const searchOpen = useUiStore((s) => s.searchOpen);
  const setSearchOpen = useUiStore((s) => s.setSearchOpen);
  const videoPreview = useUiStore((s) => s.videoPreview);

  const { data, isFetching, isLoading } = useMapPlaces({
    mode,
    bounds: committedBounds,
    center: mapCenter,
    sourceIds: selectedSourceIds,
  });

  const allCards = data?.places ?? [];
  const { dimmedIds, hasFilter } = useTagFilter(allCards);

  // Video preview takes over the map with the video's spots (markers + fit handled in MapView).
  const { data: previewData } = useSunreiDetail(videoPreview?.sunreiId ?? null);
  const previewSpots = videoPreview ? previewData?.sunrei.spots ?? null : null;

  const firstLoad = isLoading && allCards.length === 0;
  const showingPrevious = mode === 'nearby' && !!pendingArea;

  const list = (
    <>
      <div className="px-3 py-2 text-sm font-semibold border-b border-line">
        {showingPrevious ? t('showPrevious') : t('title')}
      </div>
      <div className={cn('flex-1 overflow-auto p-2 space-y-2', showingPrevious && 'opacity-50')}>
        {firstLoad ? (
          <div className="grid place-items-center py-10">
            <Loader2 className="h-5 w-5 animate-spin text-ink3" />
          </div>
        ) : allCards.length === 0 ? (
          <EmptyState mode={mode} hasFilter={hasFilter} />
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
    </>
  );

  const panelContent = videoPreview ? (
    <VideoPreviewPanel />
  ) : activePlaceId ? (
    <div className="flex-1 overflow-auto">
      <PlaceDetail placeId={activePlaceId} />
    </div>
  ) : (
    list
  );

  return (
    <div className="fixed inset-0 flex flex-col bg-background text-foreground overflow-hidden">
      {/* Top bar */}
      <div className="flex items-center gap-2 px-3 py-2 border-b border-line bg-background/90 backdrop-blur z-30">
        <span className="font-bold text-base mr-auto">Sunrei</span>
        <Button variant="outline" size="sm" onClick={() => setSearchOpen(true)}>
          <Search className="h-4 w-4" />
          <span className="hidden sm:inline">{nav('search')}</span>
        </Button>
        <LocaleToggle />
      </div>

      <SourceChips />
      {!videoPreview && <TagChipRail />}

      <div className="relative flex-1 flex">
        {/* Map */}
        <div className="absolute inset-0">
          <MapView cards={allCards} previewSpots={previewSpots} />
        </div>

        {/* Desktop left panel */}
        {!isMobile && (
          <aside className="relative w-[380px] shrink-0 border-r border-line bg-background flex flex-col z-10">
            {panelContent}
          </aside>
        )}

        {/* Mobile bottom sheet */}
        {isMobile && (
          <div className="absolute left-0 right-0 bottom-0 h-[45%] bg-background border-t border-line rounded-t-xl z-20 flex flex-col">
            {panelContent}
          </div>
        )}

        <SearchNearbyButton isFetching={isFetching} />
      </div>

      {searchOpen && <UnifiedSearch onClose={() => setSearchOpen(false)} />}
      <SourceDetail />
      <VideoDetail />
    </div>
  );
}

function EmptyState({ mode, hasFilter }: { mode: 'nearby' | 'source'; hasFilter: boolean }) {
  const t = useTranslations(mode === 'source' ? 'source' : 'list');
  const nav = useTranslations('nav');
  const clearSources = useMapStore((s) => s.clearSources);
  const clearFilters = useFilterStore((s) => s.clear);
  return (
    <div className="text-center py-8 text-ink3">
      <p className="text-sm">{mode === 'source' ? t('noPlaces') : t('empty')}</p>
      {mode === 'source' ? (
        <Button variant="link" size="sm" onClick={clearSources}>
          {t('clearSource')}
        </Button>
      ) : (
        hasFilter && (
          <Button variant="link" size="sm" onClick={clearFilters}>
            {nav('clear')}
          </Button>
        )
      )}
    </div>
  );
}
