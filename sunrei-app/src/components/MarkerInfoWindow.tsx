'use client';

import { useEffect, useRef } from 'react';

interface MarkerInfoWindowProps {
  position: { lat: number; lng: number };
  map?: google.maps.Map;
  placeName: string;
  placeAddress: string;
  sunreis: Array<{
    title: string;
    tags: string[];
    spots: Array<{ id: string; title: string }>;
  }>; // Sunrei with tags and spots
  markerState?: 'selected' | 'related' | 'default';
  onClose?: () => void;
  onClick?: () => void;
}

export const MarkerInfoWindow: React.FC<MarkerInfoWindowProps> = ({
  position,
  map,
  placeName,
  placeAddress,
  sunreis,
  markerState = 'default',
  onClose,
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
      private onClose?: () => void;
      private placeName: string;
      private placeAddress: string;
      private sunreis: Array<{
        title: string;
        tags: string[];
        spots: Array<{ id: string; title: string }>;
      }>;
      private markerState: 'selected' | 'related' | 'default';

      constructor(
        position: google.maps.LatLng,
        placeName: string,
        placeAddress: string,
        sunreis: Array<{
          title: string;
          tags: string[];
          spots: Array<{ id: string; title: string }>;
        }>,
        markerState: 'selected' | 'related' | 'default',
        onClose?: () => void,
        onClick?: () => void,
      ) {
        super();
        this.position = position;
        this.placeName = placeName;
        this.placeAddress = placeAddress;
        this.sunreis = sunreis;
        this.markerState = markerState;
        this.onClose = onClose;
        this.onClick = onClick;
      }

      onAdd() {
        // 항상 흰색 배경 사용
        const bgColor = '#FFFFFF';
        const borderColor = 'rgba(0, 0, 0, 0.1)';
        const textColor = '#000000';
        const secondaryTextColor = 'rgba(0, 0, 0, 0.6)';

        // Container
        const container = document.createElement('div');
        container.style.position = 'absolute';
        container.style.filter =
          'drop-shadow(0px 4px 12px rgba(0, 0, 0, 0.15))';
        container.style.pointerEvents = 'auto';
        container.style.minWidth = '240px';
        container.style.maxWidth = '300px';
        container.style.transition = 'transform 0.2s ease, filter 0.2s ease';

        // Bubble (card)
        const bubble = document.createElement('div');
        bubble.style.boxSizing = 'border-box';
        bubble.style.display = 'flex';
        bubble.style.flexDirection = 'column';
        bubble.style.gap = '8px';
        bubble.style.padding = '16px';
        bubble.style.position = 'relative';
        bubble.style.background = bgColor;
        bubble.style.border = `1px solid ${borderColor}`;
        bubble.style.borderRadius = '12px';
        bubble.style.transition = 'all 0.2s ease';

        // Header with place name and close button
        const header = document.createElement('div');
        header.style.display = 'flex';
        header.style.alignItems = 'flex-start';
        header.style.justifyContent = 'space-between';
        header.style.gap = '8px';

        // Place name (bold)
        const placeNameText = document.createElement('div');
        placeNameText.style.fontFamily =
          "'Pretendard Variable', -apple-system, sans-serif";
        placeNameText.style.fontWeight = '700';
        placeNameText.style.fontSize = '14px';
        placeNameText.style.lineHeight = '1.4';
        placeNameText.style.color = textColor;
        placeNameText.style.flex = '1';
        placeNameText.style.overflow = 'hidden';
        placeNameText.style.textOverflow = 'ellipsis';
        placeNameText.style.whiteSpace = 'nowrap';
        placeNameText.textContent = this.placeName;

        // Close button (X)
        const closeButton = document.createElement('button');
        closeButton.style.background = 'transparent';
        closeButton.style.border = 'none';
        closeButton.style.padding = '0';
        closeButton.style.width = '20px';
        closeButton.style.height = '20px';
        closeButton.style.cursor = 'pointer';
        closeButton.style.display = 'flex';
        closeButton.style.alignItems = 'center';
        closeButton.style.justifyContent = 'center';
        closeButton.style.borderRadius = '4px';
        closeButton.style.transition = 'background 0.2s ease';
        closeButton.innerHTML = `<svg width="14" height="14" viewBox="0 0 14 14" fill="none" xmlns="http://www.w3.org/2000/svg">
          <path d="M1 1L13 13M1 13L13 1" stroke="${textColor}" stroke-width="2" stroke-linecap="round"/>
        </svg>`;
        closeButton.addEventListener('mouseenter', () => {
          closeButton.style.background = 'rgba(0, 0, 0, 0.05)';
        });
        closeButton.addEventListener('mouseleave', () => {
          closeButton.style.background = 'transparent';
        });
        if (this.onClose) {
          closeButton.addEventListener('click', (e) => {
            e.stopPropagation();
            this.onClose!();
          });
        }

        header.appendChild(placeNameText);
        header.appendChild(closeButton);
        bubble.appendChild(header);

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
        bubble.appendChild(addressText);

        // Featured in section with count badge
        if (this.sunreis.length > 0) {
          // Separator
          const separator = document.createElement('div');
          separator.style.height = '1px';
          separator.style.background = 'rgba(0, 0, 0, 0.08)';
          separator.style.margin = '4px 0';
          bubble.appendChild(separator);

          // "Featured In:" with count badge
          const featuredHeader = document.createElement('div');
          featuredHeader.style.display = 'flex';
          featuredHeader.style.alignItems = 'center';
          featuredHeader.style.gap = '6px';
          featuredHeader.style.marginBottom = '4px';

          const featuredLabel = document.createElement('span');
          featuredLabel.style.fontFamily =
            "'Pretendard Variable', -apple-system, sans-serif";
          featuredLabel.style.fontWeight = '600';
          featuredLabel.style.fontSize = '11px';
          featuredLabel.style.lineHeight = '1.4';
          featuredLabel.style.color = secondaryTextColor;
          featuredLabel.textContent = 'Featured In:';

          const countBadge = document.createElement('span');
          countBadge.style.fontFamily =
            "'Pretendard Variable', -apple-system, sans-serif";
          countBadge.style.fontWeight = '600';
          countBadge.style.fontSize = '10px';
          countBadge.style.lineHeight = '1';
          countBadge.style.color = '#FFFFFF';
          countBadge.style.background = '#6495ED'; // Cornflower Blue
          countBadge.style.padding = '2px 6px';
          countBadge.style.borderRadius = '10px';
          countBadge.textContent = this.sunreis.length.toString();

          featuredHeader.appendChild(featuredLabel);
          featuredHeader.appendChild(countBadge);
          bubble.appendChild(featuredHeader);

          // Sunrei list (최대 3개만 표시)
          const displaySunreis = this.sunreis.slice(0, 3);
          const sunreiList = document.createElement('div');
          sunreiList.style.display = 'flex';
          sunreiList.style.flexDirection = 'column';
          sunreiList.style.gap = '6px';

          displaySunreis.forEach((sunrei) => {
            const sunreiItem = document.createElement('div');
            sunreiItem.style.display = 'flex';
            sunreiItem.style.flexDirection = 'column';
            sunreiItem.style.gap = '4px';

            // Sunrei title
            const title = document.createElement('div');
            title.style.fontFamily =
              "'Pretendard Variable', -apple-system, sans-serif";
            title.style.fontWeight = '600';
            title.style.fontSize = '12px';
            title.style.lineHeight = '1.4';
            title.style.color = textColor;
            title.style.overflow = 'hidden';
            title.style.textOverflow = 'ellipsis';
            title.style.whiteSpace = 'nowrap';
            title.textContent = sunrei.title;
            sunreiItem.appendChild(title);

            // Tags
            if (sunrei.tags.length > 0) {
              const tagsContainer = document.createElement('div');
              tagsContainer.style.display = 'flex';
              tagsContainer.style.gap = '4px';
              tagsContainer.style.flexWrap = 'wrap';
              tagsContainer.style.marginBottom = '2px';

              sunrei.tags.forEach((tag) => {
                const tagBadge = document.createElement('span');
                tagBadge.style.fontFamily =
                  "'Pretendard Variable', -apple-system, sans-serif";
                tagBadge.style.fontWeight = '400';
                tagBadge.style.fontSize = '10px';
                tagBadge.style.lineHeight = '1';
                tagBadge.style.color = secondaryTextColor;
                tagBadge.style.background = 'rgba(0, 0, 0, 0.05)';
                tagBadge.style.padding = '3px 6px';
                tagBadge.style.borderRadius = '4px';
                tagBadge.textContent = tag;
                tagsContainer.appendChild(tagBadge);
              });

              sunreiItem.appendChild(tagsContainer);
            }

            // Spots 목록 (최대 2개만 표시)
            if (sunrei.spots.length > 0) {
              const spotsContainer = document.createElement('div');
              spotsContainer.style.display = 'flex';
              spotsContainer.style.flexDirection = 'column';
              spotsContainer.style.gap = '2px';
              spotsContainer.style.paddingLeft = '8px';

              const displaySpots = sunrei.spots.slice(0, 2);
              displaySpots.forEach((spot) => {
                const spotItem = document.createElement('div');
                spotItem.style.fontFamily =
                  "'Pretendard Variable', -apple-system, sans-serif";
                spotItem.style.fontWeight = '400';
                spotItem.style.fontSize = '11px';
                spotItem.style.lineHeight = '1.4';
                spotItem.style.color = secondaryTextColor;
                spotItem.style.overflow = 'hidden';
                spotItem.style.textOverflow = 'ellipsis';
                spotItem.style.whiteSpace = 'nowrap';
                spotItem.textContent = `• ${spot.title}`;
                spotsContainer.appendChild(spotItem);
              });

              // 더 많은 spots가 있으면 표시
              if (sunrei.spots.length > 2) {
                const moreSpots = document.createElement('div');
                moreSpots.style.fontFamily =
                  "'Pretendard Variable', -apple-system, sans-serif";
                moreSpots.style.fontWeight = '400';
                moreSpots.style.fontSize = '10px';
                moreSpots.style.lineHeight = '1.4';
                moreSpots.style.color = secondaryTextColor;
                moreSpots.style.fontStyle = 'italic';
                moreSpots.textContent = `  +${sunrei.spots.length - 2} more spots`;
                spotsContainer.appendChild(moreSpots);
              }

              sunreiItem.appendChild(spotsContainer);
            }

            sunreiList.appendChild(sunreiItem);
          });

          bubble.appendChild(sunreiList);

          // "+N more" if there are more than 3
          if (this.sunreis.length > 3) {
            const moreText = document.createElement('div');
            moreText.style.fontFamily =
              "'Pretendard Variable', -apple-system, sans-serif";
            moreText.style.fontWeight = '400';
            moreText.style.fontSize = '11px';
            moreText.style.lineHeight = '1.4';
            moreText.style.color = secondaryTextColor;
            moreText.style.marginTop = '2px';
            moreText.textContent = `+${this.sunreis.length - 3} more`;
            bubble.appendChild(moreText);
          }

          // View Details button
          const viewButton = document.createElement('button');
          viewButton.style.fontFamily =
            "'Pretendard Variable', -apple-system, sans-serif";
          viewButton.style.fontWeight = '600';
          viewButton.style.fontSize = '12px';
          viewButton.style.lineHeight = '1';
          viewButton.style.color = '#FFFFFF';
          viewButton.style.background = '#000000';
          viewButton.style.border = 'none';
          viewButton.style.padding = '10px 16px';
          viewButton.style.borderRadius = '8px';
          viewButton.style.cursor = 'pointer';
          viewButton.style.marginTop = '8px';
          viewButton.style.width = '100%';
          viewButton.style.transition = 'background 0.2s ease';
          viewButton.textContent = 'View Details';
          viewButton.addEventListener('mouseenter', () => {
            viewButton.style.background = '#333333';
          });
          viewButton.addEventListener('mouseleave', () => {
            viewButton.style.background = '#000000';
          });
          if (this.onClick) {
            viewButton.addEventListener('click', (e) => {
              e.stopPropagation();
              this.onClick!();
            });
          }
          bubble.appendChild(viewButton);
        }

        // Arrow (pointer)
        const arrow = document.createElement('div');
        arrow.style.position = 'absolute';
        arrow.style.width = '12px';
        arrow.style.height = '12px';
        arrow.style.left = '50%';
        arrow.style.marginLeft = '-6px';
        arrow.style.bottom = '-6px';
        arrow.style.background = bgColor;
        arrow.style.border = `1px solid ${borderColor}`;
        arrow.style.borderTop = 'none';
        arrow.style.borderLeft = 'none';
        arrow.style.transform = 'rotate(45deg)';

        container.appendChild(bubble);
        container.appendChild(arrow);

        // Hover effect on container
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
      sunreis,
      markerState,
      onClose,
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
    sunreis,
    markerState,
    onClose,
    onClick,
  ]);

  return null;
};

export default MarkerInfoWindow;
