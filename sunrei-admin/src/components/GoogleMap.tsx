'use client';

import { Wrapper, Status } from '@googlemaps/react-wrapper';
import React, { useEffect, useRef, useState } from 'react';

interface MapProps {
  center: { lat: number; lng: number };
  zoom: number;
  onClick?: (e: google.maps.MapMouseEvent) => void;
  onLoad?: (map: google.maps.Map) => void;
  style?: React.CSSProperties;
  markers?: Array<{
    position: { lat: number; lng: number };
    title?: string;
  }>;
}

// Main Map component
const MapComponent: React.FC<MapProps> = ({
  center,
  zoom,
  onClick,
  onLoad,
  style,
  markers = [],
}) => {
  const ref = useRef<HTMLDivElement>(null);
  const [map, setMap] = useState<google.maps.Map>();
  const markersRef = useRef<google.maps.marker.AdvancedMarkerElement[]>([]);

  useEffect(() => {
    if (ref.current && !map) {
      const newMap = new google.maps.Map(ref.current, {
        center,
        zoom,
        disableDefaultUI: false,
        zoomControl: true,
        mapTypeControl: true,
        scaleControl: true,
        streetViewControl: true,
        rotateControl: false,
        fullscreenControl: true,
        mapId: process.env.NEXT_PUBLIC_GOOGLE_MAPS_MAP_ID || 'DEMO_MAP_ID',
      });

      setMap(newMap);

      if (onLoad) {
        onLoad(newMap);
      }

      if (onClick) {
        newMap.addListener('click', onClick);
      }
    }
  }, [ref, map, center, zoom, onClick, onLoad]);

  // Handle markers
  useEffect(() => {
    if (!map) return;

    // Clear existing markers
    markersRef.current.forEach((marker) => {
      marker.map = null;
    });
    markersRef.current = [];

    // Add new markers
    markers.forEach(({ position, title }) => {
      // Create custom marker element with Pantone color
      const markerElement = document.createElement('div');
      markerElement.style.width = '24px';
      markerElement.style.height = '24px';
      markerElement.style.borderRadius = '50%';
      markerElement.style.backgroundColor = 'var(--pantone-cornflower-blue)';
      markerElement.style.border = '3px solid white';
      markerElement.style.boxShadow = '0 2px 6px rgba(0, 0, 0, 0.3)';
      markerElement.style.cursor = 'pointer';

      const marker = new google.maps.marker.AdvancedMarkerElement({
        position,
        map,
        title,
        content: markerElement,
      });
      markersRef.current.push(marker);
    });

    return () => {
      markersRef.current.forEach((marker) => {
        marker.map = null;
      });
      markersRef.current = [];
    };
  }, [map, markers]);

  return <div ref={ref} style={{ width: '100%', height: '100%', ...style }} />;
};

// Wrapper component with API key
interface GoogleMapProps extends MapProps {
  apiKey: string;
}

export const GoogleMap: React.FC<GoogleMapProps> = ({
  apiKey,
  ...mapProps
}) => {
  const render = (status: Status) => {
    switch (status) {
      case Status.LOADING:
        return (
          <div className="flex items-center justify-center h-full">
            Loading map...
          </div>
        );
      case Status.FAILURE:
        return (
          <div className="flex items-center justify-center h-full text-red-500">
            Error loading map
          </div>
        );
      case Status.SUCCESS:
        return <MapComponent {...mapProps} />;
      default:
        return (
          <div className="flex items-center justify-center h-full">
            Loading map...
          </div>
        );
    }
  };

  return (
    <Wrapper apiKey={apiKey} render={render} libraries={['places', 'marker']}>
      <MapComponent {...mapProps} />
    </Wrapper>
  );
};

export default GoogleMap;
