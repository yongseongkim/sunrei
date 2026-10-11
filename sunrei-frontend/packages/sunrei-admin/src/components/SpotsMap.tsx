'use client';

import { Wrapper } from '@googlemaps/react-wrapper';
import { useEffect, useRef, useState } from 'react';

type SpotPlace = {
  name?: string | null;
  address?: string | null;
  latitude?: number;
  longitude?: number;
} | null;

interface SpotsMapProps {
  spots: Array<{
    title: string;
    place: SpotPlace;
  }>;
  height?: string;
}

function Map({ spots }: { spots: SpotsMapProps['spots'] }) {
  const [map, setMap] = useState<google.maps.Map | null>(null);
  const overlaysRef = useRef<google.maps.OverlayView[]>([]);

  useEffect(() => {
    const mapElement = document.getElementById('spots-map');
    if (!mapElement || !window.google || map) return;

    const newMap = new google.maps.Map(mapElement, {
      zoom: 12,
      mapTypeControl: false,
      streetViewControl: false,
      styles: [
        {
          elementType: 'labels.icon',
          stylers: [
            {
              visibility: 'off',
            },
          ],
        },
        {
          featureType: 'poi',
          elementType: 'labels.text',
          stylers: [
            {
              visibility: 'simplified',
            },
          ],
        },
        {
          featureType: 'poi.business',
          stylers: [
            {
              visibility: 'off',
            },
          ],
        },
      ],
    });
    setMap(newMap);
  }, [map]);

  useEffect(() => {
    if (!map || !window.google) return;

    // 핀 번호가 SpotCard 번호와 같도록 장소 없는 spot을 걸러내기 전의 순서를 쓴다.
    const validSpots = spots
      .map((spot, originalIndex) => ({ spot, originalIndex }))
      .filter(
        ({ spot }) => spot.place && spot.place.latitude && spot.place.longitude,
      );

    if (validSpots.length === 0) return;

    overlaysRef.current.forEach((overlay) => {
      overlay.setMap(null);
    });
    overlaysRef.current = [];

    const bounds = new google.maps.LatLngBounds();

    validSpots.forEach(({ spot, originalIndex }) => {
      if (!spot.place) return;

      const position = {
        lat: spot.place.latitude!,
        lng: spot.place.longitude!,
      };

      class MarkerOverlay extends google.maps.OverlayView {
        private position: google.maps.LatLng;
        private containerDiv: HTMLDivElement | null = null;
        private index: number;

        constructor(position: google.maps.LatLng, index: number) {
          super();
          this.position = position;
          this.index = index;
        }

        onAdd() {
          const container = document.createElement('div');
          container.style.position = 'absolute';

          const point = document.createElement('div');
          point.style.boxSizing = 'border-box';
          point.style.position = 'absolute';
          point.style.width = '16px';
          point.style.height = '16px';
          point.style.left = 'calc(50% - 8px)';
          point.style.top = 'calc(50% - 8px)';
          point.style.background = 'var(--pantone-cornflower-blue)';
          point.style.border = '1px solid rgba(0, 0, 0, 0.15)';
          point.style.borderRadius = '50%';
          point.style.display = 'flex';
          point.style.alignItems = 'center';
          point.style.justifyContent = 'center';
          point.style.color = '#FFFFFF';
          point.style.fontSize = '10px';
          point.style.fontWeight = '700';
          point.style.fontFamily = '-apple-system, sans-serif';

          // 한 자리 숫자는 줄 높이 안에서 위로 치우쳐 보여서 flex 가운데 정렬 뒤에 조금 내린다.
          const num = document.createElement('span');
          num.textContent = String(this.index + 1);
          num.style.lineHeight = '1';
          num.style.transform = 'translateY(0.5px)';
          point.appendChild(num);

          container.appendChild(point);

          this.containerDiv = container;
          const panes = this.getPanes();
          panes?.overlayMouseTarget.appendChild(container);
        }

        draw() {
          if (!this.containerDiv) return;

          const overlayProjection = this.getProjection();
          const position = overlayProjection.fromLatLngToDivPixel(
            this.position,
          );

          if (position) {
            this.containerDiv.style.left = position.x + 'px';
            this.containerDiv.style.top = position.y + 'px';
          }
        }

        onRemove() {
          if (this.containerDiv && this.containerDiv.parentNode) {
            this.containerDiv.parentNode.removeChild(this.containerDiv);
            this.containerDiv = null;
          }
        }
      }

      const overlay = new MarkerOverlay(
        new google.maps.LatLng(position.lat, position.lng),
        originalIndex,
      );
      overlay.setMap(map);
      overlaysRef.current.push(overlay);

      bounds.extend(position);
    });

    if (validSpots.length > 0) {
      if (validSpots.length === 1) {
        map.setCenter(bounds.getCenter());
        map.setZoom(15);
      } else {
        map.fitBounds(bounds);
        const padding = { top: 50, right: 50, bottom: 50, left: 50 };
        map.fitBounds(bounds, padding);
      }
    }

    return () => {
      overlaysRef.current.forEach((overlay) => {
        overlay.setMap(null);
      });
    };
  }, [spots, map]);

  return <div id="spots-map" className="w-full h-full rounded-lg" />;
}

export default function SpotsMap({ spots, height = '400px' }: SpotsMapProps) {
  const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY || '';

  const hasValidSpots = spots.some(
    (spot) => spot.place && spot.place.latitude && spot.place.longitude,
  );

  if (!hasValidSpots) {
    return (
      <div
        className="flex items-center justify-center bg-muted rounded-lg text-muted-foreground"
        style={{ height }}
      >
        <p className="text-sm">No spots with locations to display</p>
      </div>
    );
  }

  return (
    <div style={{ height }} className="w-full">
      <Wrapper apiKey={apiKey} libraries={['places', 'marker']}>
        <Map spots={spots} />
      </Wrapper>
    </div>
  );
}
