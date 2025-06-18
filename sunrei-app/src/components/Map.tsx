'use client';

import { Wrapper } from '@googlemaps/react-wrapper';
import React, { useEffect, useRef, useState } from 'react';
import { airbnbMapStyle } from '../styles/map-styles';

interface MapProps {
  center: { lat: number; lng: number };
  zoom: number;
  onMapLoad?: (map: google.maps.Map) => void;
  onBoundsChanged?: (bounds: google.maps.LatLngBounds) => void;
  children?: React.ReactElement<any>[];
}

interface MarkerProps {
  position: { lat: number; lng: number };
  map: google.maps.Map;
  title?: string;
  isHighlighted?: boolean;
  onClick?: () => void;
}

// Custom marker component
export const Marker: React.FC<MarkerProps> = ({ position, map, title, isHighlighted = false, onClick }) => {
  const markerRef = useRef<google.maps.Marker | null>(null);

  useEffect(() => {
    if (!map) return;

    // 기존 마커 제거
    if (markerRef.current) {
      markerRef.current.setMap(null);
      markerRef.current = null;
    }

    // 강조 상태에 따른 스타일 결정
    const markerStyle = isHighlighted ? {
      path: google.maps.SymbolPath.CIRCLE,
      scale: 20,
      fillColor: '#FF5A5F', // Airbnb red color
      fillOpacity: 1,
      strokeColor: '#FFFFFF',
      strokeWeight: 6,
    } : {
      path: google.maps.SymbolPath.CIRCLE,
      scale: 14,
      fillColor: '#FF5A5F', // Airbnb red color
      fillOpacity: 0.8,
      strokeColor: '#FFFFFF',
      strokeWeight: 3,
    };

    // 새 마커 생성
    markerRef.current = new google.maps.Marker({
      position,
      map,
      title,
      icon: markerStyle,
      zIndex: isHighlighted ? 1000 : 100, // 강조된 마커를 위에 표시
    });

    // 클릭 이벤트 추가
    if (onClick) {
      markerRef.current.addListener('click', onClick);
    }

    // cleanup 함수
    return () => {
      if (markerRef.current) {
        markerRef.current.setMap(null);
        markerRef.current = null;
      }
    };
  }, [map, position.lat, position.lng, title, isHighlighted, onClick]);

  return null;
};

// Main Map component
const MapComponent: React.FC<MapProps> = ({ center, zoom, onMapLoad, onBoundsChanged, children }) => {
  const ref = useRef<HTMLDivElement>(null);
  const [map, setMap] = useState<google.maps.Map>();
  const boundsListenerRef = useRef<google.maps.MapsEventListener>();

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
          return React.cloneElement(child, { map });
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