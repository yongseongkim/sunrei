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

type PinState = { label: string; active: boolean; dim: boolean };
interface PinHandle {
  setPosition: (lat: number, lng: number) => void;
  update: (s: PinState) => void;
  remove: () => void;
}

// One solid "stopover" dot per Place as a Google Maps OverlayView (wireframe Pin):
// filled cornflower + white number + white ring + shadow, centered on the point;
// deep-blue and enlarged when active, dimmed when tag-filtered. Badge = # of videos.
function makePinOverlay(
  map: google.maps.Map,
  lat: number,
  lng: number,
  onClick: () => void,
  initial: PinState
): PinHandle {
  const container = document.createElement('div');
  container.style.position = 'absolute';
  container.style.transform = 'translate(-50%,-50%)';
  container.style.cursor = 'pointer';
  const dot = document.createElement('div');
  dot.style.borderRadius = '50%';
  dot.style.border = '2px solid #fff';
  dot.style.boxShadow = '0 2px 7px rgba(0,0,0,.34)';
  dot.style.display = 'flex';
  dot.style.alignItems = 'center';
  dot.style.justifyContent = 'center';
  const num = document.createElement('span');
  num.style.fontWeight = '800';
  num.style.color = '#fff';
  dot.appendChild(num);
  container.appendChild(dot);
  container.addEventListener('click', onClick);

  const applyState = (s: PinState) => {
    const size = s.active ? 34 : 28;
    dot.style.width = `${size}px`;
    dot.style.height = `${size}px`;
    dot.style.background = s.active ? '#3f63a8' : '#6495ED';
    num.textContent = s.label;
    num.style.fontSize = s.active ? '14px' : '12.5px';
    container.style.opacity = s.dim ? '0.4' : '1';
    container.style.zIndex = String(s.active ? 5 : 2);
  };
  applyState(initial);

  class PinOverlay extends google.maps.OverlayView {
    position: google.maps.LatLng;
    constructor() {
      super();
      this.position = new google.maps.LatLng(lat, lng);
    }
    onAdd() {
      this.getPanes()?.overlayMouseTarget.appendChild(container);
    }
    draw() {
      const p = this.getProjection()?.fromLatLngToDivPixel(this.position);
      if (p) {
        container.style.left = `${p.x}px`;
        container.style.top = `${p.y}px`;
      }
    }
    onRemove() {
      container.remove();
    }
  }
  const overlay = new PinOverlay();
  overlay.setMap(map);

  return {
    setPosition: (la, ln) => {
      overlay.position = new google.maps.LatLng(la, ln);
      overlay.draw();
    },
    update: applyState,
    remove: () => overlay.setMap(null),
  };
}

function GoogleMapInner({ cards, previewSpots }: { cards: PlaceCardDTO[]; previewSpots: SunreiSpotDTO[] | null }) {
  const ref = useRef<HTMLDivElement>(null);
  const setMap = useMapStore((s) => s.setMap);
  const mapInstance = useMapStore((s) => s.map);
  const onIdle = useMapStore((s) => s.onIdle);
  const fitToPoints = useMapStore((s) => s.fitToPoints);
  const initialSeed = useMapStore((s) => s.initialSeed);
  const zoom = useMapStore((s) => s.zoom);
  const mode = useMapStore((s) => s.mode);
  const selectedSourceIds = useMapStore((s) => s.selectedSourceIds);
  const activePlaceId = useUiStore((s) => s.activePlaceId);
  const setActivePlace = useUiStore((s) => s.setActivePlace);
  const { dimmedIds } = useTagFilter(cards);
  const markersRef = useRef<Record<string, PinHandle>>({});
  const fittedKeyRef = useRef<string | null>(null);

  useEffect(() => {
    if (!ref.current || (window as any).google?.maps == null) return;
    const map = new google.maps.Map(ref.current, {
      center: initialSeed,
      zoom,
      disableDefaultUI: true,
      zoomControl: false,
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
        // Marker badge = # of videos mentioning this place (direction B), matching "In N videos".
        label: String(c.mentions.length),
        dim: dimmedIds.has(c.place.id),
        onClick: () => setActivePlace(c.place.id),
      }));

  // Render/diff markers as one teardrop OverlayView per Place (Bc-4), keyed + diffed
  // so panning/data changes don't recreate (no flicker). Re-runs when the map is ready.
  useEffect(() => {
    const map = mapInstance;
    if (!map) return;
    const seen = new Set<string>();
    for (const m of markers) {
      seen.add(m.id);
      const state = { label: m.label, active: m.id === activePlaceId, dim: m.dim };
      const existing = markersRef.current[m.id];
      if (existing) {
        existing.setPosition(m.lat, m.lng);
        existing.update(state);
      } else {
        markersRef.current[m.id] = makePinOverlay(map, m.lat, m.lng, m.onClick, state);
      }
    }
    for (const id of Object.keys(markersRef.current)) {
      if (!seen.has(id)) {
        markersRef.current[id].remove();
        delete markersRef.current[id];
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mapInstance, markers.map((m) => m.id + m.label + m.dim).join('|'), activePlaceId]);

  // Fit to the video's spots (once per video) or the source-mode union (once per source-set).
  // Guarded on mapInstance so it retries once the map is ready (avoids a cold-start race
  // where the key gets marked "fitted" before the map exists and never fits).
  useEffect(() => {
    if (!mapInstance) return;
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
  }, [mapInstance, previewSpots, mode, selectedSourceIds, cards, fitToPoints]);

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
