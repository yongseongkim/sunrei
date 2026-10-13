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

/** Sunrei에 없는 지역도 찾을 수 있도록 검색의 "지역 및 장소" 그룹에 Google Places 자동완성 결과를 섞는다. */
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

/** 지도 영역 칩에 보여 줄 "구, 시" 형태의 짧은 지역 이름을 좌표로 찾는다. */
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

export interface GooglePlaceInfo {
  rating?: number;
  reviews?: number;
  priceLevel?: number; // Google price_level 값이며 0부터 4까지다.
  openNow: boolean | null;
  photos: string[];
}

/**
 * 장소 상세의 "Google 정보" 카드에 쓸 평점, 리뷰 수, 가격대, 영업 여부, 사진을 google_maps_id로 가져온다.
 * Sunrei는 이 정보를 저장하지 않으므로 브라우저에서 직접 조회한다.
 * 이 필드로 getDetails를 호출하면 Places API 요금이 나간다.
 */
export function useGooglePlaceDetails(placeId?: string | null): GooglePlaceInfo | null {
  const [info, setInfo] = useState<GooglePlaceInfo | null>(null);

  useEffect(() => {
    setInfo(null);
    if (!placeId || !placesReady()) return;
    let cancelled = false;
    // PlacesService는 지도나 DOM 노드를 요구하지만 문서에 붙이지 않은 div로도 동작한다.
    const service = new google.maps.places.PlacesService(document.createElement('div'));
    service.getDetails(
      {
        placeId,
        fields: ['rating', 'user_ratings_total', 'price_level', 'opening_hours', 'utc_offset_minutes', 'photos'],
      },
      (res, status) => {
        if (cancelled) return;
        if (status !== google.maps.places.PlacesServiceStatus.OK || !res) {
          setInfo(null);
          return;
        }
        let openNow: boolean | null = null;
        try {
          openNow = res.opening_hours?.isOpen?.() ?? null;
        } catch {
          openNow = null;
        }
        setInfo({
          rating: res.rating ?? undefined,
          reviews: res.user_ratings_total ?? undefined,
          priceLevel: res.price_level ?? undefined,
          openNow,
          photos: (res.photos ?? []).slice(0, 4).map((p) => p.getUrl({ maxWidth: 240, maxHeight: 160 })),
        });
      }
    );
    return () => {
      cancelled = true;
    };
  }, [placeId]);

  return info;
}

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
