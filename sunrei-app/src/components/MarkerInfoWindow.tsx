'use client';

import { useEffect, useRef } from 'react';

interface MarkerInfoWindowProps {
  position: { lat: number; lng: number };
  map?: google.maps.Map;
  placeName: string;
  placeAddress: string;
  sunreiTitles: string[]; // 여러 Sunrei 타이틀
  markerState?: 'selected' | 'related' | 'default';
  onClick?: () => void;
}

export const MarkerInfoWindow: React.FC<MarkerInfoWindowProps> = ({
  position,
  map,
  placeName,
  placeAddress,
  sunreiTitles,
  markerState = 'default',
  onClick,
}) => {
  const overlayRef = useRef<google.maps.OverlayView | null>(null);

  useEffect(() => {
    if (!map) {
      return;
    }

    // 기존 오버레이 제거
    if (overlayRef.current) {
      overlayRef.current.setMap(null);
      overlayRef.current = null;
    }

    // Custom HTML InfoWindow 생성
    class InfoWindowOverlay extends google.maps.OverlayView {
      private position: google.maps.LatLng;
      private containerDiv: HTMLDivElement | null = null;
      private onClick?: () => void;
      private placeName: string;
      private placeAddress: string;
      private sunreiTitles: string[];
      private markerState: 'selected' | 'related' | 'default';

      constructor(
        position: google.maps.LatLng,
        placeName: string,
        placeAddress: string,
        sunreiTitles: string[],
        markerState: 'selected' | 'related' | 'default',
        onClick?: () => void,
      ) {
        super();
        this.position = position;
        this.placeName = placeName;
        this.placeAddress = placeAddress;
        this.sunreiTitles = sunreiTitles;
        this.markerState = markerState;
        this.onClick = onClick;
      }

      onAdd() {
        // 상태별 배경색 결정
        let bgColor: string;
        let borderColor: string;

        switch (this.markerState) {
          case 'selected':
            bgColor = '#9370DB'; // Viola
            borderColor = 'rgba(147, 112, 219, 0.3)';
            break;
          case 'related':
            bgColor = '#6495ED'; // Cornflower Blue
            borderColor = 'rgba(100, 149, 237, 0.3)';
            break;
          default:
            bgColor = '#FFFFFF'; // White
            borderColor = 'rgba(0, 0, 0, 0.1)';
            break;
        }

        const textColor =
          this.markerState === 'default' ? '#000000' : '#FFFFFF';
        const secondaryTextColor =
          this.markerState === 'default'
            ? 'rgba(0, 0, 0, 0.6)'
            : 'rgba(255, 255, 255, 0.8)';

        // Container
        const container = document.createElement('div');
        container.style.position = 'absolute';
        container.style.filter =
          'drop-shadow(0px 4px 12px rgba(0, 0, 0, 0.15))';
        container.style.cursor = 'pointer';
        container.style.pointerEvents = 'auto';
        container.style.minWidth = '200px';
        container.style.maxWidth = '280px';
        container.style.transition = 'transform 0.2s ease';

        // Bubble (card)
        const bubble = document.createElement('div');
        bubble.style.boxSizing = 'border-box';
        bubble.style.display = 'flex';
        bubble.style.flexDirection = 'column';
        bubble.style.gap = '6px';
        bubble.style.padding = '12px';
        bubble.style.position = 'relative';
        bubble.style.background = bgColor;
        bubble.style.border = `1px solid ${borderColor}`;
        bubble.style.borderRadius = '8px';
        bubble.style.transition = 'all 0.2s ease';

        // Hover 효과
        container.addEventListener('mouseenter', () => {
          container.style.transform = 'translateY(-2px)';
          container.style.filter =
            'drop-shadow(0px 6px 16px rgba(0, 0, 0, 0.2))';
        });
        container.addEventListener('mouseleave', () => {
          container.style.transform = 'translateY(0)';
          container.style.filter =
            'drop-shadow(0px 4px 12px rgba(0, 0, 0, 0.15))';
        });

        // Place name (bold)
        const placeNameText = document.createElement('div');
        placeNameText.style.fontFamily =
          "'Pretendard Variable', -apple-system, sans-serif";
        placeNameText.style.fontWeight = '700';
        placeNameText.style.fontSize = '14px';
        placeNameText.style.lineHeight = '1.4';
        placeNameText.style.color = textColor;
        placeNameText.style.overflow = 'hidden';
        placeNameText.style.textOverflow = 'ellipsis';
        placeNameText.style.whiteSpace = 'nowrap';
        placeNameText.textContent = this.placeName;

        // Address
        const addressText = document.createElement('div');
        addressText.style.fontFamily =
          "'Pretendard Variable', -apple-system, sans-serif";
        addressText.style.fontWeight = '400';
        addressText.style.fontSize = '12px';
        addressText.style.lineHeight = '1.4';
        addressText.style.color = secondaryTextColor;
        addressText.style.overflow = 'hidden';
        addressText.style.textOverflow = 'ellipsis';
        addressText.style.whiteSpace = 'nowrap';
        addressText.textContent = this.placeAddress;

        // Featured in section
        if (this.sunreiTitles.length > 0) {
          const featuredLabel = document.createElement('div');
          featuredLabel.style.fontFamily =
            "'Pretendard Variable', -apple-system, sans-serif";
          featuredLabel.style.fontWeight = '600';
          featuredLabel.style.fontSize = '11px';
          featuredLabel.style.lineHeight = '1.4';
          featuredLabel.style.color = secondaryTextColor;
          featuredLabel.style.marginTop = '2px';
          featuredLabel.textContent = 'Featured in:';

          bubble.appendChild(placeNameText);
          bubble.appendChild(addressText);
          bubble.appendChild(featuredLabel);

          // Sunrei titles (최대 3개만 표시)
          const displayTitles = this.sunreiTitles.slice(0, 3);
          displayTitles.forEach((title) => {
            const sunreiItem = document.createElement('div');
            sunreiItem.style.fontFamily =
              "'Pretendard Variable', -apple-system, sans-serif";
            sunreiItem.style.fontWeight = '400';
            sunreiItem.style.fontSize = '11px';
            sunreiItem.style.lineHeight = '1.4';
            sunreiItem.style.color = textColor;
            sunreiItem.style.overflow = 'hidden';
            sunreiItem.style.textOverflow = 'ellipsis';
            sunreiItem.style.whiteSpace = 'nowrap';
            sunreiItem.style.paddingLeft = '8px';
            sunreiItem.textContent = `• ${title}`;
            bubble.appendChild(sunreiItem);
          });

          // 더 많은 Sunrei가 있으면 표시
          if (this.sunreiTitles.length > 3) {
            const moreItem = document.createElement('div');
            moreItem.style.fontFamily =
              "'Pretendard Variable', -apple-system, sans-serif";
            moreItem.style.fontWeight = '400';
            moreItem.style.fontSize = '11px';
            moreItem.style.lineHeight = '1.4';
            moreItem.style.color = secondaryTextColor;
            moreItem.style.paddingLeft = '8px';
            moreItem.textContent = `+${this.sunreiTitles.length - 3} more`;
            bubble.appendChild(moreItem);
          }
        } else {
          bubble.appendChild(placeNameText);
          bubble.appendChild(addressText);
        }

        // Arrow (pointer)
        const arrow = document.createElement('div');
        arrow.style.position = 'absolute';
        arrow.style.width = '10px';
        arrow.style.height = '10px';
        arrow.style.left = '50%';
        arrow.style.marginLeft = '-5px';
        arrow.style.bottom = '-5px';
        arrow.style.background = bgColor;
        arrow.style.border = `1px solid ${borderColor}`;
        arrow.style.borderTop = 'none';
        arrow.style.borderLeft = 'none';
        arrow.style.transform = 'rotate(45deg)';

        container.appendChild(bubble);
        container.appendChild(arrow);

        // Click handler
        if (this.onClick) {
          container.addEventListener('click', this.onClick);
        }

        this.containerDiv = container;
        const panes = this.getPanes();
        panes?.floatPane.appendChild(container);
      }

      draw() {
        if (!this.containerDiv) return;

        const overlayProjection = this.getProjection();
        const position = overlayProjection.fromLatLngToDivPixel(this.position);

        if (position) {
          const rect = this.containerDiv.getBoundingClientRect();
          const width = rect.width || 200;
          const height = rect.height || 100;

          // 마커 위에 표시 (마커 + 간격)
          const markerGap = 20;

          this.containerDiv.style.left = `${position.x - width / 2}px`;
          this.containerDiv.style.top = `${position.y - height - markerGap}px`;
        }
      }

      onRemove() {
        if (this.containerDiv && this.containerDiv.parentNode) {
          this.containerDiv.parentNode.removeChild(this.containerDiv);
          this.containerDiv = null;
        }
      }
    }

    const overlay = new InfoWindowOverlay(
      new google.maps.LatLng(position.lat, position.lng),
      placeName,
      placeAddress,
      sunreiTitles,
      markerState,
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
  }, [
    map,
    position.lat,
    position.lng,
    placeName,
    placeAddress,
    sunreiTitles,
    markerState,
    onClick,
  ]);

  return null;
};

export default MarkerInfoWindow;
