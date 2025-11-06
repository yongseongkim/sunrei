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
  onBoundsChanged: (polygon: string) => void;
}

const center = {
  lat: 35.6762,
  lng: 139.6503,
};

export const SunreiMap: React.FC<SunreiMapProps> = ({
  groupedMarkers,
  selectedSunrei,
  onMarkerClick,
  onBoundsChanged,
}) => {
  const { setIsLoaded } = useMapStore();
  const { selectedPlaceId, setSelectedPlaceId } = useUIStore();

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
        zoom={12}
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

          if (hasSelectedSunrei) {
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
                // InfoWindow만 표시 (Dialog는 열지 않음)
                setSelectedPlaceId(marker.placeId);
              }}
            />
          );
        })}

        {/* 선택된 장소의 InfoWindow */}
        {selectedPlaceId &&
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

            // Sunrei 타이틀 목록 추출 (중복 제거)
            const sunreiTitles = Array.from(
              new Set(selectedMarker.spots.map((s) => s.sunreiTitle)),
            );

            return (
              <MarkerInfoWindow
                key={`info-${selectedPlaceId}`}
                position={{ lat: selectedMarker.lat, lng: selectedMarker.lng }}
                placeName={selectedMarker.placeName}
                placeAddress={selectedMarker.placeAddress}
                sunreiTitles={sunreiTitles}
                markerState={markerState}
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
