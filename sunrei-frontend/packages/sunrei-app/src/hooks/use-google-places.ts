'use client';

import { useEffect, useState } from 'react';
import type { LatLng } from './use-map';

export interface GooglePrediction {
  placeId: string;
  primary: string;
  secondary: string;
}

function placesReady(): boolean {
  return typeof window !== 'undefined' && !!(window as any).google?.maps?.places;
}

/**
 * Google Places autocomplete predictions for `query` (Be-2/Be-3). Returns external
 * area/location results to merge into the search "Areas & places" group. Empty until
 * the places library is loaded and the query is non-trivial.
 */
export function useGooglePlaceAutocomplete(query: string): GooglePrediction[] {
  const [predictions, setPredictions] = useState<GooglePrediction[]>([]);

  useEffect(() => {
    if (!placesReady() || query.trim().length < 2) {
      setPredictions([]);
      return;
    }
    const service = new google.maps.places.AutocompleteService();
    let cancelled = false;
    service.getPlacePredictions({ input: query }, (results) => {
      if (cancelled) return;
      setPredictions(
        (results ?? []).slice(0, 5).map((r) => ({
          placeId: r.place_id,
          primary: r.structured_formatting?.main_text ?? r.description,
          secondary: r.structured_formatting?.secondary_text ?? '',
        }))
      );
    });
    return () => {
      cancelled = true;
    };
  }, [query]);

  return predictions;
}

/** Resolve a Google place_id to a lat/lng via Geocoder (for panTo). */
export async function resolveGooglePlace(placeId: string): Promise<LatLng | null> {
  if (!placesReady()) return null;
  const geocoder = new google.maps.Geocoder();
  return new Promise((resolve) => {
    geocoder.geocode({ placeId }, (results, status) => {
      if (status === 'OK' && results?.[0]) {
        const loc = results[0].geometry.location;
        resolve({ lat: loc.lat(), lng: loc.lng() });
      } else {
        resolve(null);
      }
    });
  });
}
