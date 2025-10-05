'use client';

import { useEffect, useRef } from 'react';

interface CustomMarkerProps {
  position: { lat: number; lng: number };
  map: google.maps.Map;
  title?: string;
  isHighlighted?: boolean;
  onClick?: () => void;
}

export const CustomMarker: React.FC<CustomMarkerProps> = ({
  position,
  map,
  title,
  isHighlighted = false,
  onClick,
}) => {
  const markerRef = useRef<google.maps.marker.AdvancedMarkerElement | null>(null);
  const overlayRef = useRef<google.maps.OverlayView | null>(null);

  useEffect(() => {
    if (!map) return;

    // 기존 마커/오버레이 제거
    if (markerRef.current) {
      markerRef.current.map = null;
      markerRef.current = null;
    }
    if (overlayRef.current) {
      overlayRef.current.setMap(null);
      overlayRef.current = null;
    }

    // Custom HTML 마커 생성
    class CustomOverlay extends google.maps.OverlayView {
      private position: google.maps.LatLng;
      private containerDiv: HTMLDivElement | null = null;
      private onClick?: () => void;

      constructor(position: google.maps.LatLng, onClick?: () => void) {
        super();
        this.position = position;
        this.onClick = onClick;
      }

      onAdd() {
        const markerContainer = document.createElement('div');
        markerContainer.style.position = 'absolute';
        markerContainer.style.width = '28px';
        markerContainer.style.height = '28px';
        markerContainer.style.cursor = 'pointer';

        // Outer circle (12px)
        const outerCircle = document.createElement('div');
        outerCircle.style.position = 'absolute';
        outerCircle.style.width = '12px';
        outerCircle.style.height = '12px';
        outerCircle.style.left = 'calc(50% - 6px)';
        outerCircle.style.top = 'calc(50% - 6px)';
        outerCircle.style.background = '#283873'; // tada_navy_light
        outerCircle.style.borderRadius = '50%';
        outerCircle.style.transition = 'all 0.2s ease';

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

        // Highlighted state
        if (isHighlighted) {
          outerCircle.style.width = '16px';
          outerCircle.style.height = '16px';
          outerCircle.style.left = 'calc(50% - 8px)';
          outerCircle.style.top = 'calc(50% - 8px)';
          outerCircle.style.boxShadow = '0 2px 8px rgba(40, 56, 115, 0.4)';
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
  }, [map, position.lat, position.lng, isHighlighted, onClick]);

  return null;
};

export default CustomMarker;
