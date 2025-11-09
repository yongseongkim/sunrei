'use client';

import { useMapSpots } from '@/hooks/useMapSpots';
import { useUIStore } from '@/stores/ui-store';
import { useMapStore } from '@/stores/map-store';
import { useMemo, useRef, useState } from 'react';
import { Header } from '../components/Header';
import { SunreiDetailDialog } from '../components/SunreiDetailDialog';
import { SunreiMap } from '../components/SunreiMap';
import { SunreiSidebar } from '../components/SunreiSidebar';
import { MobileSunreiCarousel } from '../components/MobileSunreiCarousel';
import { PlaceDetailDialog } from '../components/PlaceDetailDialog';

export default function Home() {
  // Zustand stores
  const {
    selectedSunrei,
    hoveredMarker,
    modalSpot,
    searchQuery,
    selectedPlaceId,
    setSelectedSunrei,
    setHoveredMarker,
    setModalSpot,
    setSearchQuery,
    setSelectedPlaceId,
  } = useUIStore();
  const { setCenter, setZoom } = useMapStore();

  // Local state
  const [currentPolygon, setCurrentPolygon] = useState<string | undefined>(
    undefined,
  );
  const [placeDetail, setPlaceDetail] = useState<any>(null);
  const debounceTimerRef = useRef<NodeJS.Timeout | null>(null);

  // React Query - fetch map spots with embedded sunrei info
  const { data: mapSpots = [], isLoading: loading } = useMapSpots(currentPolygon);

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

  // Transform MapSpotDTO to the format expected by components
  const allSpots = mapSpots.map((spot) => ({
    id: spot.id,
    title: spot.title,
    description: spot.description,
    youtubeLink: spot.youtubeLink,
    images: spot.images,
    placeId: spot.place?.id || '',
    placeName: spot.place?.name || '',
    placeAddress: spot.place?.address || '',
    lat: spot.place?.latitude || 0,
    lng: spot.place?.longitude || 0,
    sunreiId: spot.sunreiId,
    sunreiTitle: spot.sunreiInfo?.title || '',
    sunreiTags: spot.sunreiInfo?.tags?.map((tag) => tag.name) || [],
  }));

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
    // modalSpot을 닫을 때 placeDetail이 있었다면 다시 표시
    // (이미 placeDetail state가 유지되고 있으므로 별도 처리 불필요)
  };

  const handleClosePlaceDetail = () => {
    setPlaceDetail(null);
    // modalSpot도 함께 닫기
    setModalSpot(null);
  };

  // 장소 개수 계산
  const totalPlaces = useMemo(() => {
    const placeIds = new Set<string>();
    allSpots.forEach((spot) => {
      if (spot.placeId) {
        placeIds.add(spot.placeId);
      }
    });
    return placeIds.size;
  }, [allSpots]);

  // Sunrei 개수 계산
  const totalSunreis = useMemo(() => {
    const sunreiIds = new Set<string>();
    allSpots.forEach((spot) => {
      if (spot.sunreiId) {
        sunreiIds.add(spot.sunreiId);
      }
    });
    return sunreiIds.size;
  }, [allSpots]);

  // 검색 필터링된 spots
  const filteredSpots = useMemo(() => {
    if (!searchQuery.trim()) return allSpots;
    const query = searchQuery.toLowerCase();
    return allSpots.filter(
      (spot) =>
        spot.title?.toLowerCase().includes(query) ||
        spot.description?.toLowerCase().includes(query) ||
        spot.sunreiTitle?.toLowerCase().includes(query) ||
        spot.placeName?.toLowerCase().includes(query),
    );
  }, [allSpots, searchQuery]);

  // 모바일: 지도 영역에 보이는 Spot만 필터링
  const visibleSpots = useMemo(() => {
    // groupedMarkers에서 placeId 추출
    const visiblePlaceIds = new Set<string>();
    groupedMarkers.forEach((marker) => {
      visiblePlaceIds.add(marker.placeId);
    });

    // 검색 필터링 적용 후 visible spot만 반환
    return filteredSpots.filter((spot) => visiblePlaceIds.has(spot.placeId));
  }, [groupedMarkers, filteredSpots]);

  return (
    <div className="flex flex-col h-screen bg-muted/30">
      {/* Header */}
      <Header onViewMarkersClick={() => console.log('View markers clicked')} />

      {/* Body with padding - 반응형 */}
      <div className="flex flex-1 overflow-hidden lg:p-4 lg:gap-4">
        {/* Sidebar - 데스크톱만 */}
        <div className="hidden lg:flex">
          <SunreiSidebar
            spots={filteredSpots}
            loading={loading}
            searchQuery={searchQuery}
            totalPlaces={totalPlaces}
            totalSunreis={totalSunreis}
            onSpotClick={(spot) => {
              // 지도를 해당 장소로 이동
              setCenter({ lat: spot.lat, lng: spot.lng });
              setZoom(15); // 더 가까이 확대
              // InfoWindow 표시
              setSelectedPlaceId(spot.placeId);
            }}
            onSearchChange={setSearchQuery}
            onShowAllContent={handleShowAllContent}
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
          spots={visibleSpots}
          searchQuery={searchQuery}
          onSearchChange={setSearchQuery}
          onSpotClick={(spot) => {
            // 지도를 해당 장소로 이동
            setCenter({ lat: spot.lat, lng: spot.lng });
            setZoom(15); // 더 가까이 확대
            // InfoWindow 표시
            setSelectedPlaceId(spot.placeId);
          }}
          loading={loading}
        />
      </div>

      {/* Detail Dialogs */}
      {/* PlaceDetailDialog는 modalSpot이 없을 때만 표시 */}
      {placeDetail && !modalSpot && (
        <PlaceDetailDialog
          placeName={placeDetail.placeName}
          placeAddress={placeDetail.placeAddress}
          lat={placeDetail.lat}
          lng={placeDetail.lng}
          spots={placeDetail.spots}
          onClose={handleClosePlaceDetail}
          onSpotClick={(spot) => {
            // placeDetail을 유지하고 modalSpot만 설정
            setModalSpot(spot);
          }}
        />
      )}
      {/* SunreiDetailDialog는 modalSpot이 있을 때 표시 */}
      <SunreiDetailDialog
        modalSpot={modalSpot}
        onClose={handleCloseModal}
        onBack={placeDetail ? () => setModalSpot(null) : undefined}
      />
    </div>
  );
}
