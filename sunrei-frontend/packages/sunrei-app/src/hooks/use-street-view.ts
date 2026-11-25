'use client';
import { useEffect, useRef, useState } from 'react';
import { useMapStore } from '@/stores/map-store';
import { useUiStore } from '@/stores/ui-store';
import {
  cameraOf,
  lookupPanorama,
  PanoramaUnavailable,
} from '@/lib/street-view';
import type { StreetViewDTO } from '@/dto';

export function useStreetView(
  spotId: string,
  saved: StreetViewDTO,
  attempt: number,
) {
  const element = useRef<HTMLDivElement>(null);
  const viewer = useRef<google.maps.StreetViewPanorama | null>(null);
  const map = useMapStore((state) => state.map);
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>(
    'loading',
  );
  const [imageDate, setImageDate] = useState<string | null>(null);
  const { panoramaId, heading, pitch, zoom } = saved;
  useEffect(() => {
    if (!element.current) return;
    if (!map) {
      const timer = setTimeout(() => setStatus('error'), 12_000);
      return () => clearTimeout(timer);
    }
    const container = element.current;
    const savedCamera = { panoramaId, heading, pitch, zoom };
    let cancelled = false;
    const listeners: google.maps.MapsEventListener[] = [];
    let observer: ResizeObserver | undefined;
    let panorama: google.maps.StreetViewPanorama | undefined;
    setStatus('loading');
    setImageDate(null);
    const current = () =>
      !cancelled &&
      useUiStore.getState().activeSpotId === spotId &&
      useUiStore.getState().streetViewOpen;
    const run = async () => {
      try {
        await google.maps.importLibrary('streetView');
        if (!current()) return;
        const service = new google.maps.StreetViewService();
        let data = await lookupPanorama(service, panoramaId);
        if (!current()) return;
        let camera = savedCamera;
        const session = useUiStore.getState().streetViewCamera;
        if (session?.panoramaId && session.panoramaId !== panoramaId) {
          try {
            const sessionData = await lookupPanorama(
              service,
              session.panoramaId,
            );
            camera = { ...savedCamera, ...session };
            data = sessionData;
          } catch {
            /* A session-only position may expire. The saved panorama is already verified. */
          }
        } else if (session) camera = { ...savedCamera, ...session };
        if (!current()) return;
        panorama = new google.maps.StreetViewPanorama(container, {
          pano: camera.panoramaId,
          pov: { heading: camera.heading, pitch: camera.pitch },
          zoom: camera.zoom,
          visible: true,
          addressControl: false,
          fullscreenControl: false,
          enableCloseButton: false,
          motionTracking: false,
          motionTrackingControl: false,
        });
        viewer.current = panorama;
        setImageDate(data.imageDate ?? null);
        let lastPano = camera.panoramaId;
        const update = () => {
          if (!current() || !panorama) return;
          const next = cameraOf(panorama);
          if (
            !next.panoramaId ||
            ![next.heading, next.pitch, next.zoom].every(Number.isFinite)
          )
            return;
          useUiStore.setState({ streetViewCamera: next });
          if (next.panoramaId !== lastPano) {
            lastPano = next.panoramaId;
            setImageDate(null);
            lookupPanorama(service, next.panoramaId)
              .then((result) => {
                if (current() && panorama?.getPano() === next.panoramaId)
                  setImageDate(result.imageDate ?? null);
              })
              .catch(() => {});
          }
        };
        listeners.push(
          panorama.addListener('pov_changed', update),
          panorama.addListener('zoom_changed', update),
          panorama.addListener('pano_changed', update),
        );
        listeners.push(
          panorama.addListener('status_changed', () => {
            if (!current()) return;
            const state = panorama!.getStatus();
            if (state === google.maps.StreetViewStatus.ZERO_RESULTS)
              useUiStore.getState().unavailableStreetView();
            else if (state !== google.maps.StreetViewStatus.OK)
              setStatus('error');
            else setStatus('ready');
          }),
        );
        observer = new ResizeObserver(() => {
          if (panorama && current())
            google.maps.event.trigger(panorama, 'resize');
        });
        observer.observe(container);
        update();
        setStatus(
          panorama.getStatus() === google.maps.StreetViewStatus.OK
            ? 'ready'
            : 'loading',
        );
      } catch (error) {
        if (!current()) return;
        if (error instanceof PanoramaUnavailable)
          useUiStore.getState().unavailableStreetView();
        else setStatus('error');
      }
    };
    void run();
    return () => {
      cancelled = true;
      observer?.disconnect();
      listeners.forEach((listener) => listener.remove());
      panorama?.setVisible(false);
      if (viewer.current === panorama) viewer.current = null;
      container.replaceChildren();
    };
  }, [map, spotId, panoramaId, heading, pitch, zoom, attempt]);
  return { element, status, imageDate };
}
