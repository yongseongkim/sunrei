'use client';

import { Wrapper, Status } from '@googlemaps/react-wrapper';
import { useTranslations } from 'next-intl';
import { useEffect, useRef, useMemo } from 'react';
import { useMarkerStore } from '@/stores/marker-store';
import {
  markerVisual,
  categoryPaths,
  type MarkerVisual,
} from '@/lib/map-markers';
import { sourceAvatarUrl } from '@/components/wf/source-meta';
import { config } from '@/lib/config';
import { mapScopeKey } from '@/lib/navigation-history';
import { useMapStore } from '@/stores/map-store';
import { useUiStore } from '@/stores/ui-store';
import { useTagFilter, type Bounds } from '@/hooks/use-map';
import type {
  PlaceCardDTO,
  SunreiSpotDTO,
  SourceDTO,
  PlaceCategory,
} from '@/dto';

function toBounds(b: google.maps.LatLngBounds | null): Bounds | null {
  if (!b) return null;
  const sw = b.getSouthWest();
  const ne = b.getNorthEast();
  return { swLat: sw.lat(), swLng: sw.lng(), neLat: ne.lat(), neLng: ne.lng() };
}

type Marker = {
  id: string;
  lat: number;
  lng: number;
  visual: MarkerVisual;
  category: PlaceCategory;
  label: string;
  dim: boolean;
};
type PinState = {
  visual: MarkerVisual;
  category: PlaceCategory;
  label: string;
  active: boolean;
  dim: boolean;
};
interface PinHandle {
  setPosition: (lat: number, lng: number) => void;
  update: (state: PinState) => void;
  remove: () => void;
}
function makePinOverlay(
  map: google.maps.Map,
  lat: number,
  lng: number,
  onClick: () => void,
  initial: PinState,
): PinHandle {
  const container = document.createElement('button');
  container.type = 'button';
  container.style.cssText =
    'position:absolute;transform:translate(-50%,-50%);cursor:pointer;width:44px;height:44px;display:grid;place-items:center;border:0;background:transparent;padding:0';
  const dot = document.createElement('span');
  dot.style.cssText =
    'border-radius:50%;border:2px solid white;box-shadow:0 2px 6px #0005;display:flex;align-items:center;justify-content:center;overflow:hidden;color:white;font-weight:800';
  container.appendChild(dot);
  container.addEventListener('click', onClick);
  let visualKey = '';
  let generation = 0;
  const category = (value: PlaceCategory) => {
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('viewBox', '0 0 24 24');
    svg.setAttribute('width', '20');
    svg.setAttribute('height', '20');
    svg.setAttribute('fill', 'none');
    svg.setAttribute('stroke', 'currentColor');
    svg.setAttribute('stroke-width', '1.8');
    svg.setAttribute('aria-hidden', 'true');
    const path = document.createElementNS(svg.namespaceURI, 'path');
    path.setAttribute('d', categoryPaths[value] ?? categoryPaths.OTHER);
    svg.appendChild(path);
    dot.replaceChildren(svg);
  };
  const applyState = (state: PinState) => {
    dot.style.width = dot.style.height = state.active ? '38px' : '32px';
    dot.style.background = state.active ? 'var(--pin-selected)' : 'var(--pin)';
    dot.style.transform = state.active ? 'translateY(-4px)' : '';
    container.style.opacity = state.dim ? '0.4' : '1';
    container.style.zIndex = state.active ? '5' : '2';
    container.setAttribute('aria-label', state.label);
    container.setAttribute('aria-pressed', String(state.active));
    const next = JSON.stringify([state.visual, state.category]);
    if (next === visualKey) return;
    visualKey = next;
    const token = ++generation;
    if (state.visual.kind === 'count')
      dot.textContent = String(state.visual.count);
    else if (state.visual.kind === 'category') category(state.visual.category);
    else {
      const img = document.createElement('img');
      img.alt = '';
      img.style.cssText = 'width:100%;height:100%;object-fit:cover';
      img.onerror = () => {
        if (token === generation) category(state.category);
      };
      img.src = state.visual.url;
      dot.replaceChildren(img);
    }
  };
  applyState(initial);
  class PinOverlay extends google.maps.OverlayView {
    position = new google.maps.LatLng(lat, lng);
    onAdd() {
      this.getPanes()?.overlayMouseTarget.appendChild(container);
      google.maps.OverlayView.preventMapHitsAndGesturesFrom(container);
    }
    draw() {
      const point = this.getProjection()?.fromLatLngToDivPixel(this.position);
      if (point) {
        container.style.left = `${point.x}px`;
        container.style.top = `${point.y}px`;
      }
    }
    onRemove() {
      generation++;
      container.removeEventListener('click', onClick);
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

function GoogleMapInner({
  cards,
  previewSpots,
  previewSource,
}: {
  cards: PlaceCardDTO[];
  previewSpots: SunreiSpotDTO[] | null;
  previewSource?: SourceDTO;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const setMap = useMapStore((s) => s.setMap);
  const mapInstance = useMapStore((s) => s.map);
  const onIdle = useMapStore((s) => s.onIdle);
  const fitToPoints = useMapStore((s) => s.fitToPoints);
  const initialSeed = useMapStore((s) => s.initialSeed);
  const zoom = useMapStore((s) => s.zoom);
  const mode = useMapStore((s) => s.mode);
  const selectedSourceIds = useMapStore((s) => s.selectedSourceIds);
  const restoredScopeKey = useMapStore((s) => s.restoredScopeKey);
  const videoPreview = useUiStore((s) => s.videoPreview);
  const activePlaceId = useUiStore((s) => s.activePlaceId);
  const setActivePlace = useUiStore((s) => s.setActivePlace);
  const { dimmedIds } = useTagFilter(cards);
  const markerMode = useMarkerStore((state) => state.mode);
  const t = useTranslations('map');
  const markersRef = useRef<Record<string, PinHandle>>({});
  const fittedKeyRef = useRef<string | null>(null);

  useEffect(() => {
    if (!ref.current || window.google?.maps == null) return;
    const map = new google.maps.Map(ref.current, {
      center: useMapStore.getState().mapCenter ?? initialSeed,
      zoom: useMapStore.getState().zoom ?? zoom,
      disableDefaultUI: true,
      zoomControl: false,
      clickableIcons: false,
    });
    setMap(map);
    const listener = map.addListener('idle', () => {
      const currentZoom = map.getZoom();
      if (currentZoom != null) useMapStore.getState().setZoom(currentZoom);
      onIdle(toBounds(map.getBounds())!, map.getCenter()!.toJSON());
    });
    return () => {
      listener.remove();
      Object.values(markersRef.current).forEach((pin) => pin.remove());
      markersRef.current = {};
      setMap(null);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const markers: Marker[] = useMemo(() => {
    const entries = previewSpots
      ? [
          ...new Map(
            previewSpots.map((spot) => [spot.place.id, spot.place]),
          ).values(),
        ].map((place) => ({
          place,
          sources: previewSource ? [previewSource] : [],
          spotCount: previewSpots.filter((spot) => spot.place.id === place.id)
            .length,
        }))
      : cards.map((card) => ({
          place: card.place,
          spotCount: card.spotCount,
          sources: card.mentions
            .map((mention) => mention.source)
            .filter(
              (source) =>
                mode !== 'source' || selectedSourceIds.includes(source.id),
            ),
        }));
    return entries.map(({ place, sources, spotCount }) => ({
      id: place.id,
      lat: place.latitude,
      lng: place.longitude,
      category: place.category ?? 'OTHER',
      visual: markerVisual(markerMode, place.category, sources, (source) =>
        sourceAvatarUrl(source, 38),
      ),
      label: t('markerLabel', {
        name: place.name,
        mentions: spotCount,
        category: t(`category.${place.category ?? 'OTHER'}`),
        count: new Set(sources.map((source) => source.id)).size,
      }),
      dim: !previewSpots && dimmedIds.has(place.id),
    }));
  }, [
    cards,
    previewSpots,
    previewSource,
    mode,
    selectedSourceIds,
    markerMode,
    dimmedIds,
    t,
  ]);

  // 핀을 매번 새로 만들면 지도를 옮기거나 데이터가 바뀔 때 깜빡이므로 place id로 비교해 바뀐 핀만 고친다.
  useEffect(() => {
    const map = mapInstance;
    if (!map) return;
    const seen = new Set<string>();
    for (const m of markers) {
      seen.add(m.id);
      const state = {
        visual: m.visual,
        category: m.category,
        label: m.label,
        active: m.id === activePlaceId,
        dim: m.dim,
      };
      const existing = markersRef.current[m.id];
      if (existing) {
        existing.setPosition(m.lat, m.lng);
        existing.update(state);
      } else {
        markersRef.current[m.id] = makePinOverlay(
          map,
          m.lat,
          m.lng,
          () => setActivePlace(m.id),
          state,
        );
      }
    }
    for (const id of Object.keys(markersRef.current)) {
      if (!seen.has(id)) {
        markersRef.current[id].remove();
        delete markersRef.current[id];
      }
    }
  }, [mapInstance, markers, activePlaceId, setActivePlace]);

  // 미리보기는 Sunrei마다, source 모드는 선택한 Source 조합마다 한 번만 지도를 장소에 맞춘다.
  // 지도가 생기기 전에 키를 기록하면 끝내 맞추지 못하므로 mapInstance가 생긴 뒤에만 실행한다.
  useEffect(() => {
    if (!mapInstance) return;
    if (
      restoredScopeKey ===
      mapScopeKey({ sourceIds: selectedSourceIds, preview: videoPreview })
    ) {
      fittedKeyRef.current = previewSpots?.length
        ? 'preview:' + previewSpots.map((s) => s.id).join(',')
        : mode === 'source'
          ? 'source:' + selectedSourceIds.join(',') + ':' + cards.length
          : null;
      return;
    }
    if (videoPreview && !previewSpots?.length) return;
    if (previewSpots && previewSpots.length) {
      const key = 'preview:' + previewSpots.map((s) => s.id).join(',');
      if (fittedKeyRef.current === key) return;
      fittedKeyRef.current = key;
      fitToPoints(
        previewSpots.map((s) => ({
          lat: s.place.latitude,
          lng: s.place.longitude,
        })),
      );
      return;
    }
    if (mode === 'source' && cards.length) {
      const key = 'source:' + selectedSourceIds.join(',') + ':' + cards.length;
      if (fittedKeyRef.current === key) return;
      fittedKeyRef.current = key;
      fitToPoints(
        cards.map((c) => ({ lat: c.place.latitude, lng: c.place.longitude })),
      );
      return;
    }
    if (!previewSpots && mode === 'nearby') fittedKeyRef.current = null;
  }, [
    mapInstance,
    previewSpots,
    mode,
    selectedSourceIds,
    cards,
    fitToPoints,
    restoredScopeKey,
    videoPreview,
  ]);

  return <div ref={ref} className="absolute inset-0" />;
}

export function MapView({
  cards,
  previewSpots = null,
  previewSource,
}: {
  cards: PlaceCardDTO[];
  previewSpots?: SunreiSpotDTO[] | null;
  previewSource?: SourceDTO;
}) {
  const t = useTranslations('map');
  const render = (status: Status) =>
    status === Status.LOADING ? (
      <div className="absolute inset-0 grid place-items-center text-ink3">
        {t('loading')}
      </div>
    ) : (
      <div className="absolute inset-0 grid place-items-center text-destructive">
        {t('failed')}
      </div>
    );

  return (
    <Wrapper
      apiKey={config.googleMaps.apiKey}
      render={render}
      libraries={['places']}
    >
      <GoogleMapInner
        cards={cards}
        previewSpots={previewSpots}
        previewSource={previewSource}
      />
    </Wrapper>
  );
}
