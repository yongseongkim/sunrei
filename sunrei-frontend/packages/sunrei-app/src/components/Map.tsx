'use client';

import { Wrapper } from '@googlemaps/react-wrapper';
import React, { useEffect, useRef, useState } from 'react';
import { airbnbMapStyle } from '../styles/map-styles';

interface MapProps {
  center: { lat: number; lng: number };
  zoom: number;
  onMapLoad?: (map: google.maps.Map) => void;
  onBoundsChanged?: (bounds: google.maps.LatLngBounds) => void;
  children?: React.ReactNode;
}

interface MarkerProps {
  position: { lat: number; lng: number };
  map?: google.maps.Map;
  title?: string;
  markerState?: 'selected' | 'related' | 'default';
  count?: number; // 마커에 표시할 숫자 (2 이상일 때만 표시)
  onClick?: () => void;
}

// Custom marker component using company design system
export const Marker: React.FC<MarkerProps> = ({ position, map, title, markerState = 'default', count, onClick }) => {
  const overlayRef = useRef<google.maps.OverlayView | null>(null);

  useEffect(() => {
    if (!map) return;

    // 기존 오버레이 제거
    if (overlayRef.current) {
      overlayRef.current.setMap(null);
      overlayRef.current = null;
    }

    // Custom HTML 마커 생성
    class CustomOverlay extends google.maps.OverlayView {
      private position: google.maps.LatLng;
      private containerDiv: HTMLDivElement | null = null;
      private onClick?: () => void;
      private markerState: 'selected' | 'related' | 'default';
      private count?: number;

      constructor(position: google.maps.LatLng, markerState: 'selected' | 'related' | 'default', count: number | undefined, onClick?: () => void) {
        super();
        this.position = position;
        this.markerState = markerState;
        this.count = count;
        this.onClick = onClick;
      }

      onAdd() {
        const markerContainer = document.createElement('div');
        markerContainer.style.position = 'absolute';
        markerContainer.style.width = '28px';
        markerContainer.style.height = '28px';
        markerContainer.style.cursor = 'pointer';

        // 숫자 마커 (count >= 2)
        if (this.count !== undefined && this.count >= 2) {
          // 상태별 색상 결정
          let bgColor: string;
          let borderColor: string;

          switch (this.markerState) {
            case 'selected':
              bgColor = 'var(--pantone-viola)'; // #9370DB
              borderColor = 'rgba(0, 0, 0, 0.15)';
              break;
            case 'related':
              bgColor = 'var(--pantone-cornflower-blue)'; // #6495ED
              borderColor = 'rgba(0, 0, 0, 0.15)';
              break;
            default:
              bgColor = 'var(--pantone-cobblestone)'; // #8B8680 회색
              borderColor = 'rgba(0, 0, 0, 0.15)';
              break;
          }

          // 숫자 마커 (16x16px)
          const numberCircle = document.createElement('div');
          numberCircle.style.boxSizing = 'border-box';
          numberCircle.style.position = 'absolute';
          numberCircle.style.width = '16px';
          numberCircle.style.height = '16px';
          numberCircle.style.left = 'calc(50% - 8px)';
          numberCircle.style.top = 'calc(50% - 8px)';
          numberCircle.style.background = bgColor;
          numberCircle.style.border = `1px solid ${borderColor}`;
          numberCircle.style.borderRadius = '50%';
          numberCircle.style.display = 'flex';
          numberCircle.style.alignItems = 'center';
          numberCircle.style.justifyContent = 'center';
          numberCircle.style.transition = 'all 0.2s ease';

          // 숫자 텍스트
          const numberText = document.createElement('span');
          numberText.style.color = '#FFFFFF';
          numberText.style.fontSize = '9px';
          numberText.style.fontWeight = '700';
          numberText.style.lineHeight = '1';
          numberText.textContent = this.count.toString();

          numberCircle.appendChild(numberText);
          markerContainer.appendChild(numberCircle);
        } else {
          // 기존 원형 마커 (count < 2)
          // 상태별 크기와 색상 결정
          let size: string;
          let offset: string;
          let bgColor: string;
          let shadow: string;

          switch (this.markerState) {
            case 'selected':
              // A: 선택된 마커 - Viola, 가장 크게
              size = '18px';
              offset = 'calc(50% - 9px)';
              bgColor = 'var(--pantone-viola)'; // #9370DB
              shadow = '0 2px 10px rgba(147, 112, 219, 0.5)';
              break;
            case 'related':
              // B: 같은 Sunrei - Cornflower Blue, 중간 크기
              size = '16px';
              offset = 'calc(50% - 8px)';
              bgColor = 'var(--pantone-cornflower-blue)'; // #6495ED
              shadow = '0 2px 8px rgba(100, 149, 237, 0.4)';
              break;
            default:
              // C: 선택되지 않은 - Cobblestone, 작게
              size = '12px';
              offset = 'calc(50% - 6px)';
              bgColor = 'var(--pantone-cobblestone)'; // #8B8680
              shadow = 'none';
              break;
          }

          // Outer circle
          const outerCircle = document.createElement('div');
          outerCircle.style.position = 'absolute';
          outerCircle.style.width = size;
          outerCircle.style.height = size;
          outerCircle.style.left = offset;
          outerCircle.style.top = offset;
          outerCircle.style.background = bgColor;
          outerCircle.style.borderRadius = '50%';
          outerCircle.style.transition = 'all 0.2s ease';
          outerCircle.style.boxShadow = shadow;

          // Inner circle (4px)
          const innerCircle = document.createElement('div');
          innerCircle.style.position = 'absolute';
          innerCircle.style.width = '4px';
          innerCircle.style.height = '4px';
          innerCircle.style.left = 'calc(50% - 2px)';
          innerCircle.style.top = 'calc(50% - 2px)';
          innerCircle.style.background = '#FFFFFF';
          innerCircle.style.borderRadius = '50%';

          outerCircle.appendChild(innerCircle);
          markerContainer.appendChild(outerCircle);
        }

        // Click handler
        if (this.onClick) {
          markerContainer.addEventListener('click', this.onClick);
        }

        this.containerDiv = markerContainer;
        const panes = this.getPanes();
        panes?.overlayMouseTarget.appendChild(markerContainer);
      }

      draw() {
        if (!this.containerDiv) return;

        const overlayProjection = this.getProjection();
        const position = overlayProjection.fromLatLngToDivPixel(this.position);

        if (position) {
          this.containerDiv.style.left = position.x - 14 + 'px'; // center the 28px marker
          this.containerDiv.style.top = position.y - 14 + 'px';
        }
      }

      onRemove() {
        if (this.containerDiv && this.containerDiv.parentNode) {
          this.containerDiv.parentNode.removeChild(this.containerDiv);
          this.containerDiv = null;
        }
      }
    }

    const overlay = new CustomOverlay(
      new google.maps.LatLng(position.lat, position.lng),
      markerState,
      count,
      onClick,
    );
    overlay.setMap(map);
    overlayRef.current = overlay;

    return () => {
      if (overlayRef.current) {
        overlayRef.current.setMap(null);
        overlayRef.current = null;
      }
    };
  }, [map, position.lat, position.lng, markerState, count, onClick]);

  return null;
};

// Main Map component
const MapComponent: React.FC<MapProps> = ({ center, zoom, onMapLoad, onBoundsChanged, children }) => {
  const ref = useRef<HTMLDivElement>(null);
  const [map, setMap] = useState<google.maps.Map | undefined>(undefined);
  const boundsListenerRef = useRef<google.maps.MapsEventListener | undefined>(undefined);

  useEffect(() => {
    if (ref.current && !map) {
      const newMap = new google.maps.Map(ref.current, {
        center,
        zoom,
        styles: airbnbMapStyle,
        disableDefaultUI: true,
        zoomControl: true,
        mapTypeControl: false,
        scaleControl: false,
        streetViewControl: false,
        rotateControl: false,
        fullscreenControl: false,
      });

      setMap(newMap);
      if (onMapLoad) {
        onMapLoad(newMap);
      }
    }
  }, [ref, map, center, zoom, onMapLoad]);

  // Update map center when center prop changes
  useEffect(() => {
    if (map && center) {
      map.panTo(center);
    }
  }, [map, center.lat, center.lng]);

  // Update map zoom when zoom prop changes
  useEffect(() => {
    if (map && zoom) {
      map.setZoom(zoom);
    }
  }, [map, zoom]);

  // Add bounds changed listener
  useEffect(() => {
    if (map && onBoundsChanged) {
      // Remove previous listener if exists
      if (boundsListenerRef.current) {
        google.maps.event.removeListener(boundsListenerRef.current);
      }

      // Add new listener for bounds_changed event
      boundsListenerRef.current = map.addListener('bounds_changed', () => {
        const bounds = map.getBounds();
        if (bounds) {
          onBoundsChanged(bounds);
        }
      });

      // Trigger initial bounds
      const initialBounds = map.getBounds();
      if (initialBounds) {
        onBoundsChanged(initialBounds);
      }

      return () => {
        if (boundsListenerRef.current) {
          google.maps.event.removeListener(boundsListenerRef.current);
        }
      };
    }
  }, [map, onBoundsChanged]);

  return (
    <>
      <div ref={ref} className="w-full h-full" />
      {React.Children.map(children, (child) => {
        if (React.isValidElement(child) && map) {
          return React.cloneElement(child, { map } as any);
        }
        return child;
      })}
    </>
  );
};

// Wrapper component with API key
interface GoogleMapProps extends MapProps {
  apiKey: string;
}

export const GoogleMap: React.FC<GoogleMapProps> = ({ apiKey, ...mapProps }) => {
  const render = (status: any) => {
    switch (status) {
      case 'LOADING':
        return <div className="flex items-center justify-center h-full">Loading...</div>;
      case 'FAILURE':
        return <div className="flex items-center justify-center h-full text-red-500">Error loading map</div>;
      case 'SUCCESS':
        return <MapComponent {...mapProps} />;
      default:
        return null;
    }
  };

  return (
    <Wrapper apiKey={apiKey} render={render} libraries={['places']}>
      <MapComponent {...mapProps} />
    </Wrapper>
  );
};

export default GoogleMap;