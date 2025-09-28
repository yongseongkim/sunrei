'use client';

import { useEffect, useState } from 'react';
import { Wrapper } from '@googlemaps/react-wrapper';
import { PlaceInput } from '@/api/admin';

interface SpotsMapProps {
  spots: Array<{
    title: string;
    place: PlaceInput | null;
  }>;
  height?: string;
}

function Map({ spots }: { spots: SpotsMapProps['spots'] }) {
  const [map, setMap] = useState<google.maps.Map | null>(null);
  const [markers, setMarkers] = useState<google.maps.Marker[]>([]);

  useEffect(() => {
    const mapElement = document.getElementById('spots-map');
    if (!mapElement || !window.google) return;

    // Get all valid places
    const validSpots = spots.filter(spot => 
      spot.place && 
      spot.place.latitude && 
      spot.place.longitude
    );

    if (validSpots.length === 0) return;

    // Initialize map if not exists
    if (!map) {
      const newMap = new google.maps.Map(mapElement, {
        zoom: 12,
        mapTypeControl: false,
        streetViewControl: false,
      });
      setMap(newMap);
    }

    // Clear existing markers
    markers.forEach(marker => marker.setMap(null));
    const newMarkers: google.maps.Marker[] = [];

    // Create bounds to fit all markers
    const bounds = new google.maps.LatLngBounds();

    // Add markers for each spot
    validSpots.forEach((spot, index) => {
      if (!spot.place) return;

      const position = {
        lat: spot.place.latitude!,
        lng: spot.place.longitude!
      };

      const marker = new google.maps.Marker({
        position,
        map: map!,
        title: spot.title,
        label: {
          text: `${index + 1}`,
          color: 'white',
          fontSize: '12px',
          fontWeight: 'bold'
        }
      });

      // Add info window
      const infoWindow = new google.maps.InfoWindow({
        content: `
          <div style="padding: 4px;">
            <h4 style="margin: 0 0 4px 0; font-weight: 600;">${spot.title}</h4>
            <p style="margin: 0; font-size: 12px; color: #666;">
              ${spot.place.name || spot.place.address || 'No address'}
            </p>
          </div>
        `
      });

      marker.addListener('click', () => {
        infoWindow.open(map!, marker);
      });

      newMarkers.push(marker);
      bounds.extend(position);
    });

    setMarkers(newMarkers);

    // Fit map to show all markers
    if (map && validSpots.length > 0) {
      if (validSpots.length === 1) {
        map.setCenter(bounds.getCenter());
        map.setZoom(15);
      } else {
        map.fitBounds(bounds);
        // Add padding
        const padding = { top: 50, right: 50, bottom: 50, left: 50 };
        map.fitBounds(bounds, padding);
      }
    }

    return () => {
      newMarkers.forEach(marker => marker.setMap(null));
    };
  }, [spots, map]);

  return <div id="spots-map" className="w-full h-full rounded-lg" />;
}

export default function SpotsMap({ spots, height = '400px' }: SpotsMapProps) {
  const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY || '';

  // Check if there are any spots with valid places
  const hasValidSpots = spots.some(spot => 
    spot.place && 
    spot.place.latitude && 
    spot.place.longitude
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
      <Wrapper apiKey={apiKey} libraries={['places']}>
        <Map spots={spots} />
      </Wrapper>
    </div>
  );
}