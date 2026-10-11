'use client';

import { Wrapper, Status } from '@googlemaps/react-wrapper';
import { useEffect, useRef } from 'react';
import { config } from '@/lib/config';
import { useMapStore } from '@/stores/map-store';
import { useUiStore } from '@/stores/ui-store';
import { useTagFilter, type Bounds } from '@/hooks/use-map';
import type { PlaceCardDTO, SunreiSpotDTO } from '@/dto';

function toBounds(b: google.maps.LatLngBounds | null): Bounds | null {
  if (!b) return null;
  const sw = b.getSouthWest();
  const ne = b.getNorthEast();
  return { swLat: sw.lat(), swLng: sw.lng(), neLat: ne.lat(), neLng: ne.lng() };
}

type Marker = { id: string; placeId: string; lat: number; lng: number; label: string; dim: boolean; onClick: () => void };

type PinState = { label: string; active: boolean; dim: boolean };
interface PinHandle {
  setPosition: (lat: number, lng: number) => void;
  update: (s: PinState) => void;
  remove: () => void;
}

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

  // 미리보기 중에는 그 Sunrei의 장소만 핀으로 보여 준다.
  // 목록처럼 Place 하나에 핀 하나만 두도록 spot을 장소별로 묶고, 핀 숫자는 그 장소의 spot 수다.
  const markers: Marker[] = previewSpots
    ? (() => {
        const byPlace = new Map<string, { place: SunreiSpotDTO['place']; count: number }>();
        for (const s of previewSpots) {
          const e = byPlace.get(s.place.id);
          if (e) e.count += 1;
          else byPlace.set(s.place.id, { place: s.place, count: 1 });
        }
        return Array.from(byPlace.values()).map(({ place, count }) => ({
          id: place.id,
          placeId: place.id,
          lat: place.latitude,
          lng: place.longitude,
          label: String(count),
          dim: false,
          onClick: () => setActivePlace(place.id),
        }));
      })()
    : cards.map((c) => ({
        id: c.place.id,
        placeId: c.place.id,
        lat: c.place.latitude,
        lng: c.place.longitude,
        // 핀 숫자는 이 장소를 언급한 Sunrei 수다.
        label: String(c.mentions.length),
        dim: dimmedIds.has(c.place.id),
        onClick: () => setActivePlace(c.place.id),
      }));

  // 핀을 매번 새로 만들면 지도를 옮기거나 데이터가 바뀔 때 깜빡이므로 place id로 비교해 바뀐 핀만 고친다.
  useEffect(() => {
    const map = mapInstance;
    if (!map) return;
    const seen = new Set<string>();
    for (const m of markers) {
      seen.add(m.id);
      const state = { label: m.label, active: m.placeId === activePlaceId, dim: m.dim };
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

  // 미리보기는 Sunrei마다, source 모드는 선택한 Source 조합마다 한 번만 지도를 장소에 맞춘다.
  // 지도가 생기기 전에 키를 기록하면 끝내 맞추지 못하므로 mapInstance가 생긴 뒤에만 실행한다.
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
