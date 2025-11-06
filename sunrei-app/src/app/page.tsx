'use client';

import { useSunreis } from '@/hooks/useSunreis';
import { useUIStore } from '@/stores/ui-store';
import { useMemo, useRef, useState } from 'react';
import { Header } from '../components/Header';
import { SunreiDetailDialog } from '../components/SunreiDetailDialog';
import { SunreiMap } from '../components/SunreiMap';
import { SunreiSidebar } from '../components/SunreiSidebar';
import { MobileSunreiCarousel } from '../components/MobileSunreiCarousel';
import { MobileSunreiDetailModal } from '../components/MobileSunreiDetailModal';
import { PlaceDetailDialog } from '../components/PlaceDetailDialog';

export default function Home() {
  // Zustand stores
  const {
    selectedSunrei,
    hoveredMarker,
    modalSpot,
    searchQuery,
    setSelectedSunrei,
    setHoveredMarker,
    setModalSpot,
    setSearchQuery,
  } = useUIStore();

  // Local state
  const [currentPolygon, setCurrentPolygon] = useState<string | undefined>(
    undefined,
  );
  const [mobileSunreiDetail, setMobileSunreiDetail] = useState<any>(null);
  const [placeDetail, setPlaceDetail] = useState<any>(null);
  const debounceTimerRef = useRef<NodeJS.Timeout | null>(null);

  // React Query
  const { data: sunreis = [], isLoading: loading } = useSunreis(currentPolygon);

  // Debounced bounds change handler
  const handleBoundsChanged = (polygon: string) => {
    // Clear existing timer
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }

    // Set new timer with 500ms delay
    debounceTimerRef.current = setTimeout(() => {
      setCurrentPolygon(polygon);
    }, 500);
  };

  const allSpots = sunreis.flatMap(
    (sunrei) =>
      sunrei.spots?.map((spot) => ({
        id: spot.id,
        title: spot.title,
        description: spot.description,
        youtubeLink: spot.youtubeLink,
        images: spot.images,
        placeId: spot.place.id,
        placeName: spot.place.name,
        placeAddress: spot.place.address,
        lat: spot.place.latitude || 0,
        lng: spot.place.longitude || 0,
        sunreiId: sunrei.id,
        sunreiTitle: sunrei.title,
      })) || [],
  );

  // Place 기준으로 마커 그룹화
  const groupedMarkers = useMemo(() => {
    const markerMap = new Map<
      string,
      {
        placeId: string;
        placeName: string;
        placeAddress: string;
        lat: number;
        lng: number;
        spots: typeof allSpots;
      }
    >();

    allSpots.forEach((spot) => {
      const existing = markerMap.get(spot.placeId);
      if (existing) {
        existing.spots.push(spot);
      } else {
        markerMap.set(spot.placeId, {
          placeId: spot.placeId,
          placeName: spot.placeName,
          placeAddress: spot.placeAddress,
          lat: spot.lat,
          lng: spot.lng,
          spots: [spot],
        });
      }
    });

    return Array.from(markerMap.values());
  }, [allSpots]);

  // Handlers
  const handleSunreiClick = (sunreiId: string) => {
    setSelectedSunrei(sunreiId);
  };

  const handleMarkerClick = (marker: any) => {
    setPlaceDetail(marker);
  };

  const handleShowAllContent = () => {
    setSelectedSunrei(null);
    setSearchQuery('');
  };

  const handleCloseModal = () => {
    setModalSpot(null);
  };

  const handleClosePlaceDetail = () => {
    setPlaceDetail(null);
  };

  // 검색 필터링
  const filteredSunreis = useMemo(() => {
    if (!searchQuery.trim()) return sunreis;
    const query = searchQuery.toLowerCase();
    return sunreis.filter(
      (sunrei: any) =>
        sunrei.title?.toLowerCase().includes(query) ||
        sunrei.description?.toLowerCase().includes(query),
    );
  }, [sunreis, searchQuery]);

  // 장소 개수 계산
  const totalPlaces = useMemo(() => {
    const placeIds = new Set<string>();
    sunreis.forEach((sunrei: any) => {
      sunrei.spots?.forEach((spot: any) => {
        if (spot.place?.id) {
          placeIds.add(spot.place.id);
        }
      });
    });
    return placeIds.size;
  }, [sunreis]);

  // 모바일: 지도 영역에 보이는 Sunrei만 필터링
  const visibleSunreis = useMemo(() => {
    // groupedMarkers에서 Sunrei ID 추출
    const visibleSunreiIds = new Set<string>();
    groupedMarkers.forEach((marker) => {
      marker.spots.forEach((spot) => {
        visibleSunreiIds.add(spot.sunreiId);
      });
    });

    // 검색 필터링 적용 후 visible Sunrei만 반환
    return filteredSunreis.filter((sunrei: any) =>
      visibleSunreiIds.has(sunrei.id),
    );
  }, [groupedMarkers, filteredSunreis]);

  return (
    <div className="flex flex-col h-screen bg-muted/30">
      {/* Header */}
      <Header onViewMarkersClick={() => console.log('View markers clicked')} />

      {/* Body with padding - 반응형 */}
      <div className="flex flex-1 overflow-hidden lg:p-4 lg:gap-4">
        {/* Sidebar - 데스크톱만 */}
        <div className="hidden lg:flex">
          <SunreiSidebar
            sunreis={sunreis}
            filteredSunreis={filteredSunreis}
            loading={loading}
            selectedSunrei={selectedSunrei}
            searchQuery={searchQuery}
            totalPlaces={totalPlaces}
            onSunreiClick={handleSunreiClick}
            onSearchChange={setSearchQuery}
            onShowAllContent={handleShowAllContent}
            onMarkerHover={setHoveredMarker}
          />
        </div>

        {/* Map - 전체 화면 */}
        <SunreiMap
          groupedMarkers={groupedMarkers}
          selectedSunrei={selectedSunrei}
          onMarkerClick={handleMarkerClick}
          onBoundsChanged={handleBoundsChanged}
        />
      </div>

      {/* Mobile Carousel - 모바일만 */}
      <div className="lg:hidden">
        <MobileSunreiCarousel
          sunreis={visibleSunreis}
          searchQuery={searchQuery}
          onSearchChange={setSearchQuery}
          onSunreiClick={(sunreiId) => {
            const sunrei = sunreis.find((s: any) => s.id === sunreiId);
            setMobileSunreiDetail(sunrei);
          }}
          loading={loading}
        />
      </div>

      {/* Detail Dialogs */}
      {placeDetail && (
        <PlaceDetailDialog
          placeName={placeDetail.placeName}
          placeAddress={placeDetail.placeAddress}
          lat={placeDetail.lat}
          lng={placeDetail.lng}
          spots={placeDetail.spots}
          onClose={handleClosePlaceDetail}
          onSpotClick={(spot) => {
            setPlaceDetail(null);
            setModalSpot(spot);
          }}
        />
      )}
      <SunreiDetailDialog modalSpot={modalSpot} onClose={handleCloseModal} />
      <MobileSunreiDetailModal
        sunrei={mobileSunreiDetail}
        onClose={() => setMobileSunreiDetail(null)}
        onSpotClick={(spot) => {
          setMobileSunreiDetail(null);
          setModalSpot(spot);
        }}
      />
    </div>
  );
}
