'use client';

import { Wrapper, Status } from '@googlemaps/react-wrapper';
import { useEffect, useRef } from 'react';
import { config } from '@/lib/config';
import { useMapStore, SEOUL } from '@/stores/map-store';
import { useUiStore } from '@/stores/ui-store';
import { useFilterStore } from '@/stores/filter-store';
import type { Bounds, LatLng } from '@/hooks/use-map';
import type { PlaceCardDTO } from '@/dto';

function toBounds(b: google.maps.LatLngBounds | null): Bounds | null {
  if (!b) return null;
  const sw = b.getSouthWest();
  const ne = b.getNorthEast();
  return { swLat: sw.lat(), swLng: sw.lng(), neLat: ne.lat(), neLng: ne.lng() };
}

function GoogleMapInner({ cards }: { cards: PlaceCardDTO[] }) {
  const ref = useRef<HTMLDivElement>(null);
  const setMap = useMapStore((s) => s.setMap);
  const onIdle = useMapStore((s) => s.onIdle);
  const initialSeed = useMapStore((s) => s.initialSeed);
  const zoom = useMapStore((s) => s.zoom);
  const activePlaceId = useUiStore((s) => s.activePlaceId);
  const setActivePlace = useUiStore((s) => s.setActivePlace);
  const dimmedIds = useFilterDimmed(cards);
  const markersRef = useRef<Record<string, google.maps.Marker>>({});

  useEffect(() => {
    if (!ref.current || (window as any).google?.maps == null) return;
    const map = new google.maps.Map(ref.current, {
      center: initialSeed,
      zoom,
      disableDefaultUI: true,
      zoomControl: true,
      clickableIcons: false,
    });
    setMap(map);
    map.addListener('idle', () => {
      onIdle(toBounds(map.getBounds())!, map.getCenter().toJSON());
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Render/diff markers from cards.
  useEffect(() => {
    const map = useMapStore.getState().map;
    if (!map) return;
    const seen = new Set<string>();
    for (const card of cards) {
      const id = card.place.id;
      seen.add(id);
      const active = id === activePlaceId;
      const dim = dimmedIds.has(id);
      const existing = markersRef.current[id];
      const pos = { lat: card.place.latitude, lng: card.place.longitude };
      if (existing) {
        existing.setPosition(pos);
        existing.setLabel({
          text: String(card.spotCount),
          color: '#fff',
          fontSize: '11px',
          fontWeight: '700',
        });
        existing.setOpacity(dim ? 0.3 : 1);
        existing.setZIndex(active ? 999 : 1);
      } else {
        const m = new google.maps.Marker({
          position: pos,
          map,
          label: { text: String(card.spotCount), color: '#fff', fontSize: '11px', fontWeight: '700' },
          opacity: dim ? 0.3 : 1,
          zIndex: active ? 999 : 1,
        });
        m.addListener('click', () => setActivePlace(id));
        markersRef.current[id] = m;
      }
    }
    // Remove markers no longer present.
    for (const id of Object.keys(markersRef.current)) {
      if (!seen.has(id)) {
        markersRef.current[id].setMap(null);
        delete markersRef.current[id];
      }
    }
  }, [cards, activePlaceId, dimmedIds, setActivePlace]);

  return <div ref={ref} className="absolute inset-0" />;
}

// Read active tag ids + derive dimmed set (cards whose tags don't intersect the filter).
function useFilterDimmed(cards: PlaceCardDTO[]): Set<string> {
  const activeTagIds = useFilterStore((s) => s.activeTagIds);
  const ref = useRef(new Set<string>());
  ref.current.clear();
  if (activeTagIds.length === 0) return ref.current;
  for (const c of cards) {
    const ids = new Set((c.tags ?? []).map((t) => t.id));
    if (!activeTagIds.every((id) => ids.has(id))) ref.current.add(c.place.id);
  }
  return ref.current;
}

export function MapView({ cards }: { cards: PlaceCardDTO[] }) {
  const render = (status: Status) =>
    status === Status.LOADING ? (
      <div className="absolute inset-0 grid place-items-center text-muted-foreground">Loading map…</div>
    ) : (
      <div className="absolute inset-0 grid place-items-center text-destructive">Map failed to load</div>
    );

  return (
    <Wrapper apiKey={config.googleMaps.apiKey} render={render}>
      <GoogleMapInner cards={cards} />
    </Wrapper>
  );
}

/** Optional geolocation: seed opening center to the user, else Seoul. Non-blocking. */
export function useSeedInitialCenter() {
  const panTo = useMapStore((s) => s.panTo);
  useEffect(() => {
    if (typeof navigator === 'undefined' || !navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const c: LatLng = { lat: pos.coords.latitude, lng: pos.coords.longitude };
        useMapStore.setState({ initialSeed: c });
        panTo(c, 12);
      },
      () => {
        useMapStore.setState({ initialSeed: SEOUL });
      },
      { maximumAge: 60_000, timeout: 5000 }
    );
  }, [panTo]);
}
