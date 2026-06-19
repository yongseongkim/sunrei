'use client';

import { Wrapper, Status } from '@googlemaps/react-wrapper';
import { useEffect, useRef } from 'react';
import { config } from '@/lib/config';
import { useMapStore, SEOUL } from '@/stores/map-store';
import { useUiStore } from '@/stores/ui-store';
import { useTagFilter, type Bounds, type LatLng } from '@/hooks/use-map';
import type { PlaceCardDTO, SunreiSpotDTO } from '@/dto';

function toBounds(b: google.maps.LatLngBounds | null): Bounds | null {
  if (!b) return null;
  const sw = b.getSouthWest();
  const ne = b.getNorthEast();
  return { swLat: sw.lat(), swLng: sw.lng(), neLat: ne.lat(), neLng: ne.lng() };
}

type Marker = { id: string; lat: number; lng: number; label: string; dim: boolean; onClick: () => void };

function GoogleMapInner({ cards, previewSpots }: { cards: PlaceCardDTO[]; previewSpots: SunreiSpotDTO[] | null }) {
  const ref = useRef<HTMLDivElement>(null);
  const setMap = useMapStore((s) => s.setMap);
  const onIdle = useMapStore((s) => s.onIdle);
  const fitToPoints = useMapStore((s) => s.fitToPoints);
  const initialSeed = useMapStore((s) => s.initialSeed);
  const zoom = useMapStore((s) => s.zoom);
  const mode = useMapStore((s) => s.mode);
  const selectedSourceIds = useMapStore((s) => s.selectedSourceIds);
  const activePlaceId = useUiStore((s) => s.activePlaceId);
  const setActivePlace = useUiStore((s) => s.setActivePlace);
  const { dimmedIds } = useTagFilter(cards);
  const markersRef = useRef<Record<string, google.maps.Marker>>({});
  const fittedKeyRef = useRef<string | null>(null);

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
      onIdle(toBounds(map.getBounds())!, map.getCenter()!.toJSON());
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Build the marker set: video-preview spots take over the map; else place cards.
  const markers: Marker[] = previewSpots
    ? previewSpots.map((s, i) => ({
        id: `spot-${s.id}`,
        lat: s.place.latitude,
        lng: s.place.longitude,
        label: String(i + 1),
        dim: false,
        onClick: () => {},
      }))
    : cards.map((c) => ({
        id: c.place.id,
        lat: c.place.latitude,
        lng: c.place.longitude,
        label: String(c.spotCount),
        dim: dimmedIds.has(c.place.id),
        onClick: () => setActivePlace(c.place.id),
      }));

  // Render/diff markers.
  useEffect(() => {
    const map = useMapStore.getState().map;
    if (!map) return;
    const seen = new Set<string>();
    for (const m of markers) {
      seen.add(m.id);
      const active = m.id === activePlaceId;
      const pos = { lat: m.lat, lng: m.lng };
      const existing = markersRef.current[m.id];
      const label = { text: m.label, color: '#fff', fontSize: '11px', fontWeight: '700' };
      if (existing) {
        existing.setPosition(pos);
        existing.setLabel(label);
        existing.setOpacity(m.dim ? 0.3 : 1);
        existing.setZIndex(active ? 999 : 1);
      } else {
        const marker = new google.maps.Marker({
          position: pos,
          map,
          label,
          opacity: m.dim ? 0.3 : 1,
          zIndex: active ? 999 : 1,
        });
        marker.addListener('click', m.onClick);
        markersRef.current[m.id] = marker;
      }
    }
    for (const id of Object.keys(markersRef.current)) {
      if (!seen.has(id)) {
        markersRef.current[id].setMap(null);
        delete markersRef.current[id];
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [markers.map((m) => m.id + m.label + m.dim).join('|'), activePlaceId]);

  // Fit to the video's spots (once per video) or the source-mode union (once per source-set).
  useEffect(() => {
    if (previewSpots && previewSpots.length) {
      const key = 'preview:' + previewSpots.map((s) => s.id).join(',');
      if (fittedKeyRef.current === key) return;
      fittedKeyRef.current = key;
      fitToPoints(previewSpots.map((s) => ({ lat: s.place.latitude, lng: s.place.longitude })));
      return;
    }
    if (mode === 'source' && cards.length) {
      const key = 'source:' + selectedSourceIds.join(',') + ':' + cards.length;
      if (fittedKeyRef.current === key) return;
      fittedKeyRef.current = key;
      fitToPoints(cards.map((c) => ({ lat: c.place.latitude, lng: c.place.longitude })));
      return;
    }
    if (!previewSpots && mode === 'nearby') fittedKeyRef.current = null;
  }, [previewSpots, mode, selectedSourceIds, cards, fitToPoints]);

  return <div ref={ref} className="absolute inset-0" />;
}

export function MapView({
  cards,
  previewSpots = null,
}: {
  cards: PlaceCardDTO[];
  previewSpots?: SunreiSpotDTO[] | null;
}) {
  const render = (status: Status) =>
    status === Status.LOADING ? (
      <div className="absolute inset-0 grid place-items-center text-ink3">Loading map…</div>
    ) : (
      <div className="absolute inset-0 grid place-items-center text-destructive">Map failed to load</div>
    );

  return (
    <Wrapper apiKey={config.googleMaps.apiKey} render={render} libraries={['places']}>
      <GoogleMapInner cards={cards} previewSpots={previewSpots} />
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
