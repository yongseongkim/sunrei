'use client';

import { useTranslations } from 'next-intl';
import { MapPin } from 'lucide-react';
import { MapView } from '@/components/map-view';
import { PlaceCard, PlaceCardSkeleton } from '@/components/place-card';
import { FiltersPanel } from '@/components/filters';
import {
  PlaceDetail,
  SearchNearbyButton,
  UnifiedSearch,
  VideoPreviewPanel,
} from '@/components/panels';
import { SourceDetail, VideoDetail } from '@/components/detail-surfaces';
import { SourceChannelPanel } from '@/components/source-channel';
import { Sidebar } from '@/components/desktop/Sidebar';
import { PeekSheet, type Snap } from '@/components/mobile/PeekSheet';
import { SearchPill } from '@/components/wf';
import { AreaChip, MapControls } from '@/components/map-chrome';
import { Onboarding, useOnboarding } from '@/components/onboarding';
import { AuthControl, LoginModal } from '@/components/auth';
import { useMapPlaces, useSunreiDetail, useTagFilter } from '@/hooks/use-map';
import { useDeepLinkSync } from '@/hooks/use-deep-link';
import { useMapStore } from '@/stores/map-store';
import { useUiStore } from '@/stores/ui-store';
import { useAuthStore } from '@/stores/auth-store';
import { useFilterStore } from '@/stores/filter-store';
import { cn } from '@/lib/utils';
import { useEffect, useState } from 'react';

export default function AppShell() {
  const t = useTranslations('list');
  const search = useTranslations('search');
  useOnboarding();
  useDeepLinkSync();
  useEffect(() => useAuthStore.getState().hydrate(), []);

  const mode = useMapStore((s) => s.mode);
  const committedBounds = useMapStore((s) => s.committedBounds);
  const mapCenter = useMapStore((s) => s.mapCenter);
  const selectedSourceIds = useMapStore((s) => s.selectedSourceIds);
  const pendingArea = useMapStore((s) => s.pendingArea);

  const isMobile = useUiStore((s) => s.isMobile);
  const activePlaceId = useUiStore((s) => s.activePlaceId);
  const setActivePlace = useUiStore((s) => s.setActivePlace);
  const setSearchOpen = useUiStore((s) => s.setSearchOpen);
  const openSearch = useUiStore((s) => s.openSearch);
  const searchOpen = useUiStore((s) => s.searchOpen);
  const videoPreview = useUiStore((s) => s.videoPreview);

  const [mobileSnap, setMobileSnap] = useState<Snap>('half');

  const { data, isFetching, isLoading } = useMapPlaces({
    mode,
    bounds: committedBounds,
    center: mapCenter,
    sourceIds: selectedSourceIds,
  });

  const allCards = data?.places ?? [];
  // Tag filter (SPEC L57/L644/L723): the LIST filters to matches; the MAP keeps all pins
  // and dims non-matches (MapView dims via the same selector). Map always gets allCards.
  const { dimmedIds, hasFilter } = useTagFilter(allCards);
  const visibleCards = hasFilter ? allCards.filter((c) => !dimmedIds.has(c.place.id)) : allCards;
  const { data: previewData } = useSunreiDetail(videoPreview?.sunreiId ?? null);
  const previewSpots = videoPreview ? previewData?.sunrei.spots ?? null : null;

  const firstLoad = isLoading && allCards.length === 0;
  const showingPrevious = mode === 'nearby' && !!pendingArea;

  const listBody = (
    <div className={cn('flex-1 overflow-auto px-4 py-2 space-y-2.5', showingPrevious && 'opacity-50')}>
      {firstLoad ? (
        <div className="space-y-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <PlaceCardSkeleton key={i} />
          ))}
        </div>
      ) : visibleCards.length === 0 ? (
        <EmptyState mode={mode} />
      ) : (
        visibleCards.map((c) => (
          <PlaceCard
            key={c.place.id}
            card={c}
            active={c.place.id === activePlaceId}
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

  // Source mode = the channel view (wireframe §4): source header + its sunrei list,
  // while the map shows every place across the source. Detail/preview overrides it.
  const channelPanel =
    mode === 'source' && selectedSourceIds.length > 0 ? (
      <SourceChannelPanel sourceId={selectedSourceIds[0]} />
    ) : null;

  return (
    <div className="fixed inset-0 flex bg-background text-foreground overflow-hidden">
      {!isMobile && (
        <Sidebar
          detailPanel={detailPanel}
          channelPanel={channelPanel}
          listBody={listBody}
          count={visibleCards.length}
          showingPrevious={showingPrevious}
        />
      )}

      {/* Map */}
      <div className="relative flex-1">
        <div className="absolute inset-0">
          <MapView cards={allCards} previewSpots={previewSpots} />
        </div>

        {/* Desktop map chrome: area chip (top-left) + zoom/recenter (top-right). */}
        {!isMobile && !videoPreview && (
          <>
            <div className="absolute left-[18px] top-[18px] z-20">
              <AreaChip />
            </div>
            <div className="absolute right-[18px] top-[18px] z-20">
              <MapControls />
            </div>
          </>
        )}

        {isMobile && !videoPreview && (
          <>
            <div className="absolute left-3 right-3 top-3 z-20 flex items-center gap-2">
              <SearchPill placeholder={search('placeholder')} onClick={openSearch} className="flex-1" />
              <AuthControl variant="mobile" />
            </div>
            <div className="absolute left-3 top-16 z-20">
              <AreaChip />
            </div>
            <div className="absolute right-3 top-16 z-20">
              <MapControls zoom={false} />
            </div>
          </>
        )}

        {isMobile && mobileSnap === 'full' && !detailPanel && (
          <div className="absolute inset-0 z-[15] bg-black/20 pointer-events-none" />
        )}

        <SearchNearbyButton isFetching={isFetching} />
      </div>

      {isMobile && (
        <PeekSheet
          detailPanel={detailPanel}
          channelPanel={channelPanel}
          listBody={listBody}
          count={visibleCards.length}
          showingPrevious={showingPrevious}
          onSnapChange={setMobileSnap}
        />
      )}

      {searchOpen && <UnifiedSearch onClose={() => setSearchOpen(false)} />}
      <FiltersPanel places={allCards} />
      <SourceDetail />
      <VideoDetail />
      <LoginModal />
      <Onboarding />
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
