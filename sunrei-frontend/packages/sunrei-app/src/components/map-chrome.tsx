'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';
import { useTranslations } from 'next-intl';
import { Minus, Plus, MapPin, LocateFixed } from 'lucide-react';
import { useMapStore } from '@/stores/map-store';
import { reverseGeocode } from '@/hooks/use-google-places';
import { cn } from '@/lib/utils';

/** 지도를 옮길 때마다 Geocoding API를 부르지 않도록 지도 중심이 500ms 동안 그대로일 때만 조회하고, 결과는 좌표별로 캐시한다. */
function useAreaLabel(): string | null {
  const center = useMapStore((s) => s.mapCenter);
  const [label, setLabel] = useState<string | null>(null);
  const cache = useRef<Map<string, string | null>>(new Map());

  useEffect(() => {
    if (!center) return;
    const key = `${center.lat.toFixed(3)},${center.lng.toFixed(3)}`;
    if (cache.current.has(key)) {
      setLabel(cache.current.get(key)!);
      return;
    }
    let cancelled = false;
    const id = setTimeout(async () => {
      const r = await reverseGeocode(center);
      if (cancelled) return;
      cache.current.set(key, r);
      setLabel(r);
    }, 500);
    return () => {
      cancelled = true;
      clearTimeout(id);
    };
  }, [center?.lat, center?.lng]);

  return label;
}

export function AreaChip({ className }: { className?: string }) {
  const label = useAreaLabel();
  if (!label) return null;
  return (
    <div
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full border border-line2 bg-card px-[13px] py-[7px]',
        'text-[12.5px] font-bold text-foreground shadow-[0_2px_8px_rgba(0,0,0,0.08)]',
        className
      )}
    >
      <MapPin className="h-3.5 w-3.5 text-ink2" strokeWidth={1.6} />
      <span className="whitespace-nowrap">{label}</span>
    </div>
  );
}

function MapBtn({
  children,
  onClick,
  label,
  accent,
}: {
  children: ReactNode;
  onClick: () => void;
  label: string;
  accent?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      className={cn(
        'grid h-[34px] w-[34px] place-items-center rounded-[9px] border border-line2 bg-card',
        'shadow-[0_2px_8px_rgba(0,0,0,0.10)] transition-colors hover:bg-bg2',
        accent ? 'text-accent-ink' : 'text-ink2'
      )}
    >
      {children}
    </button>
  );
}

/** 모바일은 지도 영역이 좁아서 `zoom={false}`로 내 위치 버튼만 보여 준다. */
export function MapControls({ zoom = true }: { zoom?: boolean }) {
  const t = useTranslations('map');
  const map = useMapStore((s) => s.map);
  const panTo = useMapStore((s) => s.panTo);
  const initialSeed = useMapStore((s) => s.initialSeed);

  const zoomBy = (d: number) => {
    if (map) map.setZoom((map.getZoom() ?? 12) + d);
  };
  const recenter = () => {
    if (typeof navigator !== 'undefined' && navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (pos) => panTo({ lat: pos.coords.latitude, lng: pos.coords.longitude }, 14),
        () => panTo(initialSeed, 13),
        { maximumAge: 60_000, timeout: 5000 }
      );
    } else {
      panTo(initialSeed, 13);
    }
  };

  return (
    <div className="flex flex-col gap-2">
      {zoom && (
        <>
          <MapBtn onClick={() => zoomBy(1)} label={t('zoomIn')}>
            <Plus className="h-[18px] w-[18px]" strokeWidth={2} />
          </MapBtn>
          <MapBtn onClick={() => zoomBy(-1)} label={t('zoomOut')}>
            <Minus className="h-[18px] w-[18px]" strokeWidth={2} />
          </MapBtn>
          <div className="h-1" />
        </>
      )}
      <MapBtn onClick={recenter} label={t('myLocation')} accent>
        <LocateFixed className="h-[17px] w-[17px]" strokeWidth={1.8} />
      </MapBtn>
    </div>
  );
}
