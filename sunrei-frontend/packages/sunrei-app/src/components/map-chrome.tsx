'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Minus, Plus, MapPin, LocateFixed } from 'lucide-react';
import { useMapStore } from '@/stores/map-store';
import { reverseGeocode } from '@/hooks/use-google-places';
import { cn } from '@/lib/utils';

/** Debounced, cached reverse-geocode of the map center → a "Ward, City" label. */
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

/** Pill naming the current map area, pinned over the map (direction B). */
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

/**
 * Map zoom + recenter controls (direction B). `zoom={false}` shows recenter only
 * (mobile, where the map region is short). Recenter re-requests geolocation and pans
 * there, falling back to the opening seed (Seoul if location was denied).
 */
export function MapControls({ zoom = true }: { zoom?: boolean }) {
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
          <MapBtn onClick={() => zoomBy(1)} label="Zoom in">
            <Plus className="h-[18px] w-[18px]" strokeWidth={2} />
          </MapBtn>
          <MapBtn onClick={() => zoomBy(-1)} label="Zoom out">
            <Minus className="h-[18px] w-[18px]" strokeWidth={2} />
          </MapBtn>
          <div className="h-1" />
        </>
      )}
      <MapBtn onClick={recenter} label="My location" accent>
        <LocateFixed className="h-[17px] w-[17px]" strokeWidth={1.8} />
      </MapBtn>
    </div>
  );
}
