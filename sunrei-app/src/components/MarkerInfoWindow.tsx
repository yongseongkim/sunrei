'use client';

import { useEffect, useRef } from 'react';

interface MarkerInfoWindowProps {
  position: { lat: number; lng: number };
  map: google.maps.Map;
  sunreiTitle: string;
  placeName: string;
  markerState?: 'selected' | 'related' | 'default';
  onClick?: () => void;
}

export const MarkerInfoWindow: React.FC<MarkerInfoWindowProps> = ({
  position,
  map,
  sunreiTitle,
  placeName,
  markerState = 'default',
  onClick,
}) => {
  const overlayRef = useRef<google.maps.OverlayView | null>(null);

  useEffect(() => {
    if (!map) return;

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
      private sunreiTitle: string;
      private placeName: string;
      private markerState: 'selected' | 'related' | 'default';
      private containerWidth: number = 0;
      private containerHeight: number = 0;

      constructor(
        position: google.maps.LatLng,
        sunreiTitle: string,
        placeName: string,
        markerState: 'selected' | 'related' | 'default',
        onClick?: () => void,
      ) {
        super();
        this.position = position;
        this.sunreiTitle = sunreiTitle;
        this.placeName = placeName;
        this.markerState = markerState;
        this.onClick = onClick;
      }

      onAdd() {
        // Canvas를 사용하여 텍스트 너비 측정 및 텍스트 자르기
        const canvas = document.createElement('canvas');
        const context = canvas.getContext('2d');

        const maxTextWidth = 150; // 최대 텍스트 너비 (padding 제외)

        // Sunrei 제목 처리
        let displayTitle = this.sunreiTitle;
        if (context) {
          context.font = "700 12px 'SpoqaHanSans', -apple-system, sans-serif";
          let titleWidth = context.measureText(displayTitle).width;

          // 너무 길면 자르기
          if (titleWidth > maxTextWidth) {
            while (titleWidth > maxTextWidth && displayTitle.length > 0) {
              displayTitle = displayTitle.slice(0, -1);
              titleWidth = context.measureText(displayTitle + '...').width;
            }
            displayTitle = displayTitle + '...';
          }
        }

        // Place 이름 처리
        let displayPlace = this.placeName;
        if (context) {
          context.font = "400 11px 'SpoqaHanSans', -apple-system, sans-serif";
          let placeWidth = context.measureText(displayPlace).width;

          // 너무 길면 자르기
          if (placeWidth > maxTextWidth) {
            while (placeWidth > maxTextWidth && displayPlace.length > 0) {
              displayPlace = displayPlace.slice(0, -1);
              placeWidth = context.measureText(displayPlace + '...').width;
            }
            displayPlace = displayPlace + '...';
          }
        }

        // 최종 너비 측정
        if (context) {
          context.font = "700 12px 'SpoqaHanSans', -apple-system, sans-serif";
        }
        const titleWidth = context ? context.measureText(displayTitle).width : 0;

        if (context) {
          context.font = "400 11px 'SpoqaHanSans', -apple-system, sans-serif";
        }
        const placeWidth = context ? context.measureText(displayPlace).width : 0;

        // padding (12px * 2) + 텍스트 너비, 최소 88px
        const bubbleWidth = Math.max(88, Math.ceil(Math.max(titleWidth, placeWidth)) + 24);

        // bubble 높이 계산: padding(8*2) + title line-height(16) + place line-height(14)
        const bubbleHeight = 8 + 16 + 14 + 8; // 46px

        // container 전체 높이: bubble bottom(14) + bubble height
        const containerHeight = 14 + bubbleHeight; // 60px

        // 너비와 높이를 인스턴스 변수에 저장
        this.containerWidth = bubbleWidth;
        this.containerHeight = containerHeight;

        // 상태별 색상 결정
        let bgColor: string;
        let borderColor: string;

        switch (this.markerState) {
          case 'selected':
            // A: 선택된 마커 - Viola
            bgColor = 'var(--pantone-viola)'; // #9370DB
            borderColor = 'rgba(147, 112, 219, 0.2)';
            break;
          case 'related':
            // B: 같은 Sunrei - Cornflower Blue
            bgColor = 'var(--pantone-cornflower-blue)'; // #6495ED
            borderColor = 'rgba(100, 149, 237, 0.2)';
            break;
          default:
            // C: 선택되지 않은 - Cobblestone
            bgColor = 'var(--pantone-cobblestone)'; // #8B8680
            borderColor = 'rgba(139, 134, 128, 0.2)';
            break;
        }

        // Container
        const container = document.createElement('div');
        container.style.position = 'absolute';
        container.style.filter = 'drop-shadow(0px 2px 6px rgba(0, 0, 0, 0.249547))';
        container.style.cursor = 'pointer';
        container.style.pointerEvents = 'auto';
        container.style.width = bubbleWidth + 'px';
        container.style.height = containerHeight + 'px';

        // Bubble (rounded rectangle with two lines of text)
        const bubble = document.createElement('div');
        bubble.style.boxSizing = 'border-box';
        bubble.style.display = 'flex';
        bubble.style.flexDirection = 'column';
        bubble.style.justifyContent = 'center';
        bubble.style.alignItems = 'center';
        bubble.style.padding = '8px 12px';
        bubble.style.position = 'absolute';
        bubble.style.width = '100%';
        bubble.style.left = '0';
        bubble.style.bottom = '14px';
        bubble.style.background = bgColor;
        bubble.style.border = `1px solid ${borderColor}`;
        bubble.style.borderRadius = '100px';
        bubble.style.whiteSpace = 'nowrap';

        // Arrow (rotated square) - 컨테이너 중앙에 배치
        const arrow = document.createElement('div');
        arrow.style.boxSizing = 'border-box';
        arrow.style.position = 'absolute';
        arrow.style.width = '10px';
        arrow.style.height = '10px';
        arrow.style.left = '50%';
        arrow.style.marginLeft = '-5px';
        arrow.style.bottom = '12.14px';
        arrow.style.background = bgColor;
        arrow.style.border = `1px solid ${borderColor}`;
        arrow.style.transform = 'rotate(45deg)';

        // First line: Sunrei Title
        const titleText = document.createElement('span');
        titleText.style.fontFamily = "'SpoqaHanSans', -apple-system, sans-serif";
        titleText.style.fontWeight = '700';
        titleText.style.fontSize = '12px';
        titleText.style.lineHeight = '16px';
        titleText.style.color = '#FFFFFF';
        titleText.textContent = displayTitle;

        // Second line: Place Name
        const placeText = document.createElement('span');
        placeText.style.fontFamily = "'SpoqaHanSans', -apple-system, sans-serif";
        placeText.style.fontWeight = '400';
        placeText.style.fontSize = '11px';
        placeText.style.lineHeight = '14px';
        placeText.style.color = 'rgba(255, 255, 255, 0.9)';
        placeText.textContent = displayPlace;

        bubble.appendChild(titleText);
        bubble.appendChild(placeText);

        // Blockers (to prevent bubble border from showing through arrow) - 컨테이너 중앙 기준
        const leftBlocker = document.createElement('div');
        leftBlocker.style.position = 'absolute';
        leftBlocker.style.width = '2px';
        leftBlocker.style.height = '1px';
        leftBlocker.style.left = '50%';
        leftBlocker.style.marginLeft = '-6px';
        leftBlocker.style.bottom = '14px';
        leftBlocker.style.background = bgColor;

        const rightBlocker = document.createElement('div');
        rightBlocker.style.position = 'absolute';
        rightBlocker.style.width = '2px';
        rightBlocker.style.height = '1px';
        rightBlocker.style.left = '50%';
        rightBlocker.style.marginLeft = '3px';
        rightBlocker.style.bottom = '14px';
        rightBlocker.style.background = bgColor;

        const centerBlocker = document.createElement('div');
        centerBlocker.style.position = 'absolute';
        centerBlocker.style.width = '7px';
        centerBlocker.style.height = '1px';
        centerBlocker.style.left = '50%';
        centerBlocker.style.marginLeft = '-4px';
        centerBlocker.style.bottom = '14px';
        centerBlocker.style.background = bgColor;

        container.appendChild(arrow);
        container.appendChild(bubble);
        container.appendChild(leftBlocker);
        container.appendChild(rightBlocker);
        container.appendChild(centerBlocker);

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
          // Arrow와 마커 사이에 간격을 두기 위해 추가 offset 적용
          // 마커 반지름(6-8px) + 간격(8px) = 약 5px 위로 이동
          const markerGap = 5;

          this.containerDiv.style.left = position.x - this.containerWidth / 2 + 'px';
          this.containerDiv.style.top = position.y + 5 - this.containerHeight - markerGap + 'px';
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
      sunreiTitle,
      placeName,
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
  }, [map, position.lat, position.lng, sunreiTitle, placeName, markerState, onClick]);

  return null;
};

export default MarkerInfoWindow;
