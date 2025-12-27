'use client';

import { useState, useMemo, useCallback, useEffect } from 'react';
import { CarouselView } from './CarouselView';
import { DetailView } from './DetailView';
import { SpotSelector } from './SpotSelector';

interface Spot {
  id: string;
  title: string;
  description?: string;
  youtubeLink?: string;
  images: any[];
  placeId: string;
  placeName: string;
  placeAddress: string;
  lat: number;
  lng: number;
  sunreiId: string;
  sunreiTitle: string;
}

interface SunreiBottomBarProps {
  spots: Spot[];
  searchQuery: string;
  onSearchChange: (query: string) => void;
  selectedSpot: Spot | null;
  onSpotClick: (spot: Spot) => void;
  onCloseDetail: (backToCarousel: boolean) => void;
  onCloseSpotSelector?: () => void;
  onSpotSelectorOpen?: (placeId: string) => void;
  loading?: boolean;
  // For map marker clicks with multiple spots
  selectedPlaceSpots?: PlaceSpots | null;
}

type ViewMode = 'carousel' | 'spotList' | 'detail';

interface PlaceSpots {
  placeId: string;
  placeName: string;
  placeAddress: string;
  spots: Spot[];
}

export const SunreiBottomBar: React.FC<SunreiBottomBarProps> = ({
  spots,
  searchQuery,
  onSearchChange,
  selectedSpot,
  onSpotClick,
  onCloseDetail,
  onCloseSpotSelector,
  onSpotSelectorOpen,
  loading,
  selectedPlaceSpots: externalPlaceSpots,
}) => {
  // Local state for view management
  const [viewMode, setViewMode] = useState<ViewMode>('carousel');
  const [internalPlaceSpots, setInternalPlaceSpots] = useState<PlaceSpots | null>(null);

  // Handle external placeSpots from map marker click
  useEffect(() => {
    if (externalPlaceSpots) {
      setInternalPlaceSpots(externalPlaceSpots);
      setViewMode('spotList');
    } else if (viewMode === 'spotList' && !selectedSpot) {
      // Only clear internal state if we're not in detail view
      setInternalPlaceSpots(null);
      setViewMode('carousel');
    }
  }, [externalPlaceSpots]);

  // Use internal or external placeSpots
  const selectedPlaceSpots = internalPlaceSpots;

  // Group spots by placeId
  const spotsByPlace = useMemo(() => {
    const placeMap = new Map<string, PlaceSpots>();
    spots.forEach((spot) => {
      const existing = placeMap.get(spot.placeId);
      if (existing) {
        existing.spots.push(spot);
      } else {
        placeMap.set(spot.placeId, {
          placeId: spot.placeId,
          placeName: spot.placeName,
          placeAddress: spot.placeAddress,
          spots: [spot],
        });
      }
    });
    return placeMap;
  }, [spots]);

  // 검색 필터링
  const filteredSpots = searchQuery.trim()
    ? spots.filter(
        (spot) =>
          spot.title?.toLowerCase().includes(searchQuery.toLowerCase()) ||
          spot.description?.toLowerCase().includes(searchQuery.toLowerCase()) ||
          spot.sunreiTitle?.toLowerCase().includes(searchQuery.toLowerCase()) ||
          spot.placeName?.toLowerCase().includes(searchQuery.toLowerCase()),
      )
    : spots;

  // Handle spot click from carousel
  const handleSpotClick = useCallback((spot: Spot) => {
    const placeSpots = spotsByPlace.get(spot.placeId);
    if (placeSpots && placeSpots.spots.length > 1) {
      // Multiple spots at this place - show spot selector
      setInternalPlaceSpots(placeSpots);
      setViewMode('spotList');
      onSpotSelectorOpen?.(spot.placeId);
    } else {
      // Single spot - go directly to detail view
      setViewMode('detail');
      onSpotClick(spot);
    }
  }, [spotsByPlace, onSpotClick, onSpotSelectorOpen]);

  // Handle spot click from spot list
  const handleSpotListClick = useCallback((spot: Spot) => {
    setViewMode('detail');
    onSpotClick(spot);
  }, [onSpotClick]);

  // Handle back from spot list
  const handleBackFromSpotList = useCallback(() => {
    setViewMode('carousel');
    setInternalPlaceSpots(null);
    onCloseSpotSelector?.();
  }, [onCloseSpotSelector]);

  // Handle back from detail view
  const handleBackFromDetail = useCallback(() => {
    if (viewMode === 'detail' && internalPlaceSpots) {
      // Came from spot selector - go back to spot selector (keep marker highlighted)
      setViewMode('spotList');
      onCloseDetail(false);  // false = not going back to carousel
    } else {
      // Came directly from carousel - go back to carousel (clear marker highlight)
      setViewMode('carousel');
      setInternalPlaceSpots(null);
      onCloseDetail(true);  // true = going back to carousel
    }
  }, [viewMode, internalPlaceSpots, onCloseDetail]);

  // Sync with external selectedSpot state
  const isDetailView = !!selectedSpot || viewMode === 'detail';

  return (
    <div className="fixed bottom-0 left-0 right-0 bg-white border-t shadow-lg z-20 transition-all duration-300 ease-out h-1/3 flex flex-col">
      {viewMode === 'spotList' && selectedPlaceSpots ? (
        <SpotSelector
          placeName={selectedPlaceSpots.placeName}
          placeAddress={selectedPlaceSpots.placeAddress}
          spots={selectedPlaceSpots.spots}
          onSpotClick={handleSpotListClick}
          onBack={handleBackFromSpotList}
        />
      ) : isDetailView ? (
        <DetailView spot={selectedSpot} onClose={handleBackFromDetail} />
      ) : (
        <CarouselView
          spots={filteredSpots}
          loading={loading}
          onSpotClick={handleSpotClick}
          searchQuery={searchQuery}
          onSearchChange={onSearchChange}
        />
      )}
    </div>
  );
};

export default SunreiBottomBar;
