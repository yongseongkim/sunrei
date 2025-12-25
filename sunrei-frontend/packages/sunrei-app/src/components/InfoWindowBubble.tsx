'use client';

import { useEffect, useRef } from 'react';

interface InfoWindowBubbleProps {
  position: { lat: number; lng: number };
  map: google.maps.Map;
  label: string;
  onClick?: () => void;
}

export const InfoWindowBubble: React.FC<InfoWindowBubbleProps> = ({
  position,
  map,
  label,
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
    class BubbleOverlay extends google.maps.OverlayView {
      private position: google.maps.LatLng;
      private containerDiv: HTMLDivElement | null = null;
      private onClick?: () => void;
      private label: string;

      constructor(position: google.maps.LatLng, label: string, onClick?: () => void) {
        super();
        this.position = position;
        this.label = label;
        this.onClick = onClick;
      }

      onAdd() {
        // Container
        const container = document.createElement('div');
        container.style.position = 'absolute';
        container.style.width = '104px';
        container.style.height = '46px';
        container.style.filter = 'drop-shadow(0px 2px 6px rgba(0, 0, 0, 0.249547))';
        container.style.cursor = 'pointer';

        // Arrow (rotated square)
        const arrow = document.createElement('div');
        arrow.style.boxSizing = 'border-box';
        arrow.style.position = 'absolute';
        arrow.style.width = '10px';
        arrow.style.height = '10px';
        arrow.style.left = 'calc(50% - 5px - 2.57px)';
        arrow.style.bottom = '12.14px';
        arrow.style.background = 'var(--pantone-viola)'; // Pantone 2025: Viola
        arrow.style.border = '1px solid rgba(147, 112, 219, 0.2)';
        arrow.style.transform = 'rotate(45deg)';

        // Bubble (rounded rectangle)
        const bubble = document.createElement('div');
        bubble.style.boxSizing = 'border-box';
        bubble.style.display = 'flex';
        bubble.style.flexDirection = 'row';
        bubble.style.justifyContent = 'center';
        bubble.style.alignItems = 'center';
        bubble.style.padding = '6px 12px';
        bubble.style.position = 'absolute';
        bubble.style.height = '30px';
        bubble.style.left = 'calc(50% - 44px - 0.5px)'; // Center based on content
        bubble.style.bottom = '14px';
        bubble.style.background = 'var(--pantone-viola)'; // Pantone 2025: Viola
        bubble.style.border = '1px solid rgba(25, 37, 77, 0.1)';
        bubble.style.borderRadius = '100px';
        bubble.style.whiteSpace = 'nowrap';

        // Text
        const text = document.createElement('span');
        text.style.fontFamily = "'SpoqaHanSans', -apple-system, sans-serif";
        text.style.fontWeight = '700';
        text.style.fontSize = '12px';
        text.style.lineHeight = '18px';
        text.style.color = '#FFFFFF';
        text.textContent = this.label;

        bubble.appendChild(text);

        // Blockers (to prevent bubble border from showing through arrow)
        const leftBlocker = document.createElement('div');
        leftBlocker.style.position = 'absolute';
        leftBlocker.style.width = '2px';
        leftBlocker.style.height = '1px';
        leftBlocker.style.left = 'calc(50% - 1px - 5px)';
        leftBlocker.style.bottom = '14px';
        leftBlocker.style.background = 'var(--pantone-viola)';

        const rightBlocker = document.createElement('div');
        rightBlocker.style.position = 'absolute';
        rightBlocker.style.width = '2px';
        rightBlocker.style.height = '1px';
        rightBlocker.style.left = 'calc(50% - 1px + 4px)';
        rightBlocker.style.bottom = '14px';
        rightBlocker.style.background = 'var(--pantone-viola)';

        const centerBlocker = document.createElement('div');
        centerBlocker.style.position = 'absolute';
        centerBlocker.style.width = '7px';
        centerBlocker.style.height = '1px';
        centerBlocker.style.left = 'calc(50% - 3.5px - 0.5px)';
        centerBlocker.style.bottom = '14px';
        centerBlocker.style.background = 'var(--pantone-viola)';

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
          this.containerDiv.style.left = position.x - 52 + 'px'; // center the 104px bubble
          this.containerDiv.style.top = position.y - 60 + 'px'; // position above marker
        }
      }

      onRemove() {
        if (this.containerDiv && this.containerDiv.parentNode) {
          this.containerDiv.parentNode.removeChild(this.containerDiv);
          this.containerDiv = null;
        }
      }
    }

    const overlay = new BubbleOverlay(
      new google.maps.LatLng(position.lat, position.lng),
      label,
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
  }, [map, position.lat, position.lng, label, onClick]);

  return null;
};

export default InfoWindowBubble;
