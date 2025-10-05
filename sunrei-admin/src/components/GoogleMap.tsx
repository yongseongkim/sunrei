'use client';

import { Wrapper } from '@googlemaps/react-wrapper';
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
  markers = []
}) => {
  const ref = useRef<HTMLDivElement>(null);
  const [map, setMap] = useState<google.maps.Map>();
  const markersRef = useRef<google.maps.Marker[]>([]);

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
    markersRef.current.forEach(marker => marker.setMap(null));
    markersRef.current = [];

    // Add new markers
    markers.forEach(({ position, title }) => {
      const marker = new google.maps.Marker({
        position,
        map,
        title,
      });
      markersRef.current.push(marker);
    });

    return () => {
      markersRef.current.forEach(marker => marker.setMap(null));
      markersRef.current = [];
    };
  }, [map, markers]);

  return <div ref={ref} style={{ width: '100%', height: '100%', ...style }} />;
};

// Wrapper component with API key
interface GoogleMapProps extends MapProps {
  apiKey: string;
}

export const GoogleMap: React.FC<GoogleMapProps> = ({ apiKey, ...mapProps }) => {
  const render = (status: any) => {
    switch (status) {
      case 'LOADING':
        return <div className="flex items-center justify-center h-full">Loading map...</div>;
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