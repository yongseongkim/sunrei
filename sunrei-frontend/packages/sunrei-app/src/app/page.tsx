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
  VideoPreview,
} from '@/components/panels';
import { useMapPlaces } from '@/hooks/use-map';
import { useMapStore } from '@/stores/map-store';
import { useUiStore } from '@/stores/ui-store';
import { useFilterStore } from '@/stores/filter-store';

export default function AppShell() {
  const t = useTranslations('list');
  const nav = useTranslations('nav');
  const searchLabel = nav('search');
  useSeedInitialCenter();

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

  const activeTagIds = useFilterStore((s) => s.activeTagIds);

  const { data, isFetching, isLoading } = useMapPlaces({
    mode,
    bounds: committedBounds,
    center: mapCenter,
    sourceIds: selectedSourceIds,
  });

  const allCards = data?.places ?? [];
  const visibleCards =
    activeTagIds.length === 0
      ? allCards
      : allCards.filter((c) =>
          activeTagIds.every((id) => (c.tags ?? []).some((tg) => tg.id === id))
        );
  const dimmed = activeTagIds.length > 0;

  const firstLoad = isLoading && allCards.length === 0;

  return (
    <div className="fixed inset-0 flex flex-col bg-background text-foreground overflow-hidden">
      {/* Top bar */}
      <div className="flex items-center gap-2 px-3 py-2 border-b bg-background/90 backdrop-blur z-30">
        <span className="font-bold text-base mr-auto">Sunrei</span>
        <Button variant="outline" size="sm" onClick={() => setSearchOpen(true)}>
          <Search className="h-4 w-4" />
          <span className="hidden sm:inline">{searchLabel}</span>
        </Button>
        <LocaleToggle />
      </div>

      <SourceChips />
      <TagChipRail />

      <div className="relative flex-1 flex">
        {/* Map (always rendered; markers from allCards; non-matching pins dimmed) */}
        <div className="absolute inset-0">
          <MapView cards={allCards} />
        </div>

        {/* Desktop sidebar */}
        {!isMobile && (
          <aside className="relative w-[380px] shrink-0 border-r bg-background flex flex-col z-10">
            <div className="px-3 py-2 text-sm font-semibold border-b">{t('title')}</div>
            <div className="flex-1 overflow-auto p-2 space-y-2">
              {firstLoad || isFetching ? (
                <div className="grid place-items-center py-10">
                  <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                </div>
              ) : visibleCards.length === 0 ? (
                <EmptyState mode={mode} />
              ) : (
                visibleCards.map((c) => (
                  <PlaceCard
                    key={c.place.id}
                    card={c}
                    active={c.place.id === activePlaceId}
                    dimmed={dimmed && !(activeTagIds.length === 0)}
                    onClick={() => setActivePlace(c.place.id)}
                  />
                ))
              )}
            </div>
          </aside>
        )}

        {/* Desktop detail panel */}
        {!isMobile && activePlaceId && (
          <div className="absolute right-0 top-0 bottom-0 w-[360px] bg-background border-l z-20 overflow-auto">
            <PlaceDetail placeId={activePlaceId} />
          </div>
        )}

        {/* Mobile bottom sheet (card list / detail) */}
        {isMobile && (
          <div className="absolute left-0 right-0 bottom-0 h-[45%] bg-background border-t rounded-t-xl z-20 flex flex-col">
            {activePlaceId ? (
              <div className="flex-1 overflow-auto">
                <PlaceDetail placeId={activePlaceId} />
              </div>
            ) : (
              <>
                <div className="px-3 py-2 text-sm font-semibold border-b">{t('title')}</div>
                <div className="flex-1 overflow-auto p-2 space-y-2">
                  {firstLoad || isFetching ? (
                    <div className="grid place-items-center py-8">
                      <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                    </div>
                  ) : visibleCards.length === 0 ? (
                    <EmptyState mode={mode} />
                  ) : (
                    visibleCards.map((c) => (
                      <PlaceCard
                        key={c.place.id}
                        card={c}
                        active={c.place.id === activePlaceId}
                        dimmed={dimmed}
                        onClick={() => setActivePlace(c.place.id)}
                      />
                    ))
                  )}
                </div>
              </>
            )}
          </div>
        )}

        <SearchNearbyButton />
      </div>

      {searchOpen && <UnifiedSearch onClose={() => setSearchOpen(false)} />}
      <VideoPreview />

      {/* Hidden pending-area hint label */}
      {pendingArea && mode === 'nearby' && (
        <div className="pointer-events-none absolute bottom-[45%] left-0 right-0 text-center text-xs text-muted-foreground z-10 sm:bottom-6" />
      )}
    </div>
  );
}

function EmptyState({ mode }: { mode: 'nearby' | 'source' }) {
  const t = useTranslations(mode === 'source' ? 'source' : 'list');
  const clearSources = useMapStore((s) => s.clearSources);
  return (
    <div className="text-center py-8 text-muted-foreground">
      <p className="text-sm">
        {mode === 'source' ? t('noPlaces') : t('empty')}
      </p>
      {mode === 'source' && (
        <Button variant="link" size="sm" onClick={clearSources}>
          {t('clearSource')}
        </Button>
      )}
    </div>
  );
}
