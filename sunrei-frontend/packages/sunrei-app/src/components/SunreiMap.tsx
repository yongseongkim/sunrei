'use client';

import { config } from '@/lib/config';
import { useMapStore } from '@/stores/map-store';
import { useUIStore } from '@/stores/ui-store';
import { useCallback } from 'react';
import { boundsToWKTPolygon } from '../utils/map-utils';
import { GoogleMap, Marker } from './Map';
import { MarkerInfoWindow } from './MarkerInfoWindow';

interface GroupedMarker {
  placeId: string;
  placeName: string;
  placeAddress: string;
  lat: number;
  lng: number;
  spots: any[];
}

interface SunreiMapProps {
  groupedMarkers: GroupedMarker[];
  selectedSunrei: string | null;
  onMarkerClick: (marker: GroupedMarker) => void;
  onMobileMarkerClick?: (marker: GroupedMarker) => void;
  onBoundsChanged: (polygon: string) => void;
}

export const SunreiMap: React.FC<SunreiMapProps> = ({
  groupedMarkers,
  selectedSunrei,
  onMarkerClick,
  onMobileMarkerClick,
  onBoundsChanged,
}) => {
  const { center, zoom, setIsLoaded } = useMapStore();
  const { selectedPlaceId, setSelectedPlaceId, setBottomBarDetailSpot, isMobile, bottomBarDetailSpot } = useUIStore();

  const onLoad = useCallback(() => {
    setIsLoaded(true);
  }, [setIsLoaded]);

  const handleBoundsChanged = useCallback(
    (bounds: google.maps.LatLngBounds) => {
      const polygon = boundsToWKTPolygon(bounds);
      onBoundsChanged(polygon);
    },
    [onBoundsChanged],
  );

  return (
    <div className="flex-1 relative bg-white lg:rounded-lg lg:shadow-sm lg:border overflow-hidden">
      <GoogleMap
        apiKey={config.googleMaps.apiKey}
        center={center}
        zoom={zoom}
        onMapLoad={onLoad}
        onBoundsChanged={handleBoundsChanged}
      >
        {groupedMarkers.map((marker) => {
          const markerId = `place-${marker.placeId}`;
          const spotCount = marker.spots.length;

          // 마커 상태 결정 (Place 기준)
          let markerState: 'selected' | 'related' | 'default';

          // 이 Place의 spots 중 하나라도 선택된 Sunrei에 속하는지 확인
          const hasSelectedSunrei =
            selectedSunrei &&
            marker.spots.some((s) => s.sunreiId === selectedSunrei);

          // 이 Place의 spot이 bottom bar detail에서 선택되었는지 확인
          const isSelectedSpot =
            bottomBarDetailSpot &&
            marker.spots.some((s) => s.id === bottomBarDetailSpot.id);

          // 이 Place가 선택된 장소인지 확인 (mobile에서 SpotSelector 표시 시)
          const isSelectedPlace = selectedPlaceId === marker.placeId;

          if (isSelectedSpot || isSelectedPlace) {
            // 선택된 마커 -> Viola (selected)
            markerState = 'selected';
          } else if (hasSelectedSunrei) {
            // 선택된 Sunrei에 속한 마커 -> Cornflower Blue
            markerState = 'related';
          } else {
            // 그 외 모든 마커 -> Cobblestone (회색)
            markerState = 'default';
          }

          // 첫 번째 spot을 대표로 사용
          const representativeSpot = marker.spots[0];

          return (
            <Marker
              key={markerId}
              position={{ lat: marker.lat, lng: marker.lng }}
              title={marker.placeName}
              markerState={markerState}
              count={spotCount}
              onClick={() => {
                if (isMobile) {
                  // On mobile: use mobile marker click handler
                  // (it handles setSelectedPlaceId for highlighting)
                  if (onMobileMarkerClick) {
                    onMobileMarkerClick(marker);
                  }
                } else {
                  // On desktop: show InfoWindow as before
                  setSelectedPlaceId(marker.placeId);
                }
              }}
            />
          );
        })}

        {/* 선택된 장소의 InfoWindow - desktop only */}
        {!isMobile && selectedPlaceId &&
          (() => {
            const selectedMarker = groupedMarkers.find(
              (m) => m.placeId === selectedPlaceId,
            );
            if (!selectedMarker) return null;

            // 마커 상태 결정
            let markerState: 'selected' | 'related' | 'default';
            const hasSelectedSunrei =
              selectedSunrei &&
              selectedMarker.spots.some((s) => s.sunreiId === selectedSunrei);

            if (hasSelectedSunrei) {
              markerState = 'related';
            } else {
              markerState = 'default';
            }

            // Sunrei 정보 목록 추출 (중복 제거) with spots
            const sunreiMap = new Map<
              string,
              {
                title: string;
                tags: string[];
                spots: Array<{ id: string; title: string }>;
              }
            >();
            selectedMarker.spots.forEach((spot) => {
              if (sunreiMap.has(spot.sunreiId)) {
                sunreiMap.get(spot.sunreiId)!.spots.push({
                  id: spot.id,
                  title: spot.title,
                });
              } else {
                sunreiMap.set(spot.sunreiId, {
                  title: spot.sunreiTitle,
                  tags: spot.sunreiTags || [],
                  spots: [{ id: spot.id, title: spot.title }],
                });
              }
            });
            const sunreis = Array.from(sunreiMap.values());

            return (
              <MarkerInfoWindow
                key={`info-${selectedPlaceId}`}
                position={{ lat: selectedMarker.lat, lng: selectedMarker.lng }}
                placeName={selectedMarker.placeName}
                placeAddress={selectedMarker.placeAddress}
                sunreis={sunreis}
                markerState={markerState}
                onClose={() => setSelectedPlaceId(null)}
                onClick={() => {
                  // InfoWindow 클릭 시 Place 상세 Dialog 열기
                  setSelectedPlaceId(null);
                  onMarkerClick(selectedMarker);
                }}
              />
            );
          })()}
      </GoogleMap>
    </div>
  );
};

export default SunreiMap;
