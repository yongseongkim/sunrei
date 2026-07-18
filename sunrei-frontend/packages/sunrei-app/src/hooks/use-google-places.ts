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

/**
 * Reverse-geocode a lat/lng to a short "Ward, City" label for the map area chip.
 * Best-effort: returns null if the Geocoding API is unavailable or nothing matches.
 */
export async function reverseGeocode(loc: LatLng): Promise<string | null> {
  if (!placesReady()) return null;
  const geocoder = new google.maps.Geocoder();
  return new Promise((resolve) => {
    geocoder.geocode({ location: loc }, (results, status) => {
      if (status !== 'OK' || !results?.length) return resolve(null);
      const comps = results[0].address_components ?? [];
      const pick = (types: string[]) => {
        for (const type of types) {
          const c = comps.find((cc) => cc.types.includes(type));
          if (c) return c.long_name;
        }
        return null;
      };
      const primary = pick(['sublocality_level_1', 'sublocality', 'neighborhood', 'locality']);
      const secondary = pick(['locality', 'administrative_area_level_1']);
      const parts = [primary, secondary].filter((v, i, a) => v && a.indexOf(v) === i) as string[];
      resolve(parts.length ? parts.join(', ') : results[0].formatted_address ?? null);
    });
  });
}

/** Resolve a Google place_id to a lat/lng via the Geocoder (needs the Geocoding API). */
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
