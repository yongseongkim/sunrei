'use client';
import { Wrapper, Status } from '@googlemaps/react-wrapper';
import { useEffect, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { isAxiosError } from 'axios';
import type {
  SunreiSpotDTO,
  SunreiSpotStreetViewDTO,
  StreetViewInput,
} from '@/api/admin';
import { adminApi, streetViewApi } from '@/lib/api-client';
import { config } from '@/lib/config';
import { sunreiKeys } from '@/lib/hooks/use-sunreis';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';

function bearing(from: google.maps.LatLng, place: SunreiSpotDTO['place']) {
  const radians = Math.PI / 180,
    a = from.lat() * radians,
    b = place.latitude * radians,
    d = (place.longitude - from.lng()) * radians;
  return (
    (Math.atan2(
      Math.sin(d) * Math.cos(b),
      Math.cos(a) * Math.sin(b) - Math.sin(a) * Math.cos(b) * Math.cos(d),
    ) /
      radians +
      360) %
    360
  );
}
async function exact(service: google.maps.StreetViewService, id: string) {
  const result = await service.getPanorama({ pano: id });
  if (result.data.location?.pano !== id) throw new Error('Panorama changed');
  return result.data;
}

export default function StreetViewEditor({
  sunreiId,
  spot,
  sourceName,
  onClose,
}: {
  sunreiId: string;
  spot: SunreiSpotDTO;
  sourceName?: string;
  onClose: () => void;
}) {
  const [savedSpot, setSavedSpot] = useState(spot);
  const [savedSourceName, setSavedSourceName] = useState(sourceName);
  const [state, setState] = useState<SunreiSpotStreetViewDTO | null>(null);
  const [error, setError] = useState('');
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    setError('');
    setState(null);
    Promise.all([
      streetViewApi.getSunreiSpotStreetView(sunreiId, spot.id, { signal: controller.signal }),
      adminApi.getSunrei(sunreiId, { signal: controller.signal }),
    ])
      .then(([result, sunrei]) => {
        if (controller.signal.aborted) return;
        const latest = sunrei.data.spots.find(item => item.id === spot.id);
        if (!latest) throw new Error('Spot no longer exists');
        setSavedSpot(latest);
        setSavedSourceName(sunrei.data.source?.name);
        setState(result.data);
      })
      .catch(() => {
        if (!controller.signal.aborted)
          setError('Could not load the saved viewpoint.');
      });
    return () => controller.abort();
  }, [sunreiId, spot.id, attempt]);
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent className="max-h-[94vh] overflow-y-auto sm:max-w-[1000px]">
        <DialogHeader>
          <DialogTitle>Roadview · {savedSpot.place.name}</DialogTitle>
          <DialogDescription>
            {savedSourceName} · {savedSpot.title}. Save a reviewed camera direction for
            this spot.
          </DialogDescription>
        </DialogHeader>
        {error && (
          <p role="alert">
            {error}{' '}
            <Button
              variant="outline"
              onClick={() => setAttempt((value) => value + 1)}
            >
              Retry
            </Button>
          </p>
        )}
        {!error && !state && <p role="status">Loading saved viewpoint…</p>}
        {state && (
          <Wrapper
            apiKey={config.googleMaps.apiKey}
            libraries={['places', 'marker']}
            render={(status) => (
              <p role="status">
                {status === Status.FAILURE
                  ? 'Could not load Google Maps.'
                  : 'Loading Google Maps…'}
              </p>
            )}
          >
            <EditorBody
              sunreiId={sunreiId}
              spot={savedSpot}
              initial={state}
              onClose={onClose}
            />
          </Wrapper>
        )}
      </DialogContent>
    </Dialog>
  );
}
function EditorBody({
  sunreiId,
  spot,
  initial,
  onClose,
}: {
  sunreiId: string;
  spot: SunreiSpotDTO;
  initial: SunreiSpotStreetViewDTO;
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const [currentSpot, setCurrentSpot] = useState(spot);
  const editorMap = useRef<google.maps.Map | null>(null);
  const [server, setServer] = useState(initial);
  const [draft, setDraft] = useState<StreetViewInput | null>(
    initial.streetView,
  );
  const [status, setStatus] = useState<'loading' | 'ready' | 'empty' | 'error'>(
    'loading',
  );
  const [message, setMessage] = useState('');
  const [saving, setSaving] = useState(false);
  const [date, setDate] = useState<string | null>(null);
  const [custom, setCustom] = useState(!!initial.streetView?.searchAnchor);
  const [lat, setLat] = useState(
    String(initial.streetView?.searchAnchor?.latitude ?? spot.place.latitude),
  );
  const [lng, setLng] = useState(
    String(initial.streetView?.searchAnchor?.longitude ?? spot.place.longitude),
  );
  const panoElement = useRef<HTMLDivElement>(null),
    mapElement = useRef<HTMLDivElement>(null);
  const viewer = useRef<google.maps.StreetViewPanorama | null>(null);
  const service = useRef<google.maps.StreetViewService | null>(null);
  const live = useRef(false),
    generation = useRef(0),
    loading = useRef(true);
  const listeners = useRef<google.maps.MapsEventListener[]>([]);
  const anchorValid =
    !custom ||
    (lat.trim() !== '' &&
      lng.trim() !== '' &&
      Number.isFinite(Number(lat)) &&
      Number.isFinite(Number(lng)) &&
      Math.abs(Number(lat)) <= 90 &&
      Math.abs(Number(lng)) <= 180);
  const anchor = custom
    ? { latitude: Number(lat), longitude: Number(lng) }
    : null;

  const show = (
    data: google.maps.StreetViewPanoramaData,
    camera: StreetViewInput,
  ) => {
    const panoramaId = data.location?.pano;
    if (!live.current || !panoramaId || panoramaId !== camera.panoramaId)
      return;
    const panorama = viewer.current!;
    panorama.setPano(panoramaId);
    panorama.setPov({ heading: camera.heading, pitch: camera.pitch });
    panorama.setZoom(camera.zoom);
    panorama.setVisible(true);
    setDraft(camera);
    setDate(data.imageDate ?? null);
    loading.current = false;
    setStatus(
      panorama.getStatus() === google.maps.StreetViewStatus.OK
        ? 'ready'
        : 'loading',
    );
  };
  const find = async (point: { lat: number; lng: number }) => {
    if (!service.current) return;
    const token = ++generation.current;
    loading.current = true;
    setStatus('loading');
    setMessage('');
    viewer.current?.setVisible(false);
    try {
      const result = await service.current.getPanorama({
        location: point,
        radius: 50,
        sources: [google.maps.StreetViewSource.OUTDOOR],
        preference: google.maps.StreetViewPreference.NEAREST,
      });
      if (!live.current || token !== generation.current) return;
      const location = result.data.location;
      if (!location?.pano || !location.latLng) {
        setStatus('empty');
        return;
      }
      show(result.data, {
        panoramaId: location.pano,
        heading: bearing(location.latLng, currentSpot.place),
        pitch: 0,
        zoom: 1,
      });
    } catch (error) {
      if (!live.current || token !== generation.current) return;
      setStatus(String(error).includes('ZERO_RESULTS') ? 'empty' : 'error');
    }
  };
  useEffect(() => {
    live.current = true;
    let map: google.maps.Map | undefined;
    let observer: ResizeObserver | undefined;
    const token = ++generation.current;
    const start = async () => {
      try {
        await google.maps.importLibrary('streetView');
        if (!live.current || token !== generation.current) return;
        service.current = new google.maps.StreetViewService();
        viewer.current = new google.maps.StreetViewPanorama(
          panoElement.current!,
          {
            visible: false,
            addressControl: false,
            fullscreenControl: false,
            motionTracking: false,
            motionTrackingControl: false,
          },
        );
        const panorama = viewer.current;
        const update = () => {
          if (
            !live.current ||
            loading.current ||
            panorama.getStatus() !== google.maps.StreetViewStatus.OK
          )
            return;
          const pov = panorama.getPov(),
            id = panorama.getPano();
          if (!id) return;
          const rawZoom = panorama.getZoom();
          if (rawZoom < 0 || rawZoom > 3) {
            panorama.setZoom(Math.max(0, Math.min(3, rawZoom)));
            return;
          }
          const camera = {
            panoramaId: id,
            heading: ((pov.heading % 360) + 360) % 360,
            pitch: pov.pitch,
            zoom: panorama.getZoom(),
          };
          if (
            ![camera.heading, camera.pitch, camera.zoom].every(Number.isFinite)
          )
            return;
          setDraft(camera);
          setStatus('ready');
        };
        listeners.current.push(
          panorama.addListener('pov_changed', update),
          panorama.addListener('zoom_changed', update),
          panorama.addListener('pano_changed', () => {
            update();
            const id = panorama.getPano();
            setDate(null);
            if (id)
              exact(service.current!, id)
                .then((data) => {
                  if (live.current && panorama.getPano() === id)
                    setDate(data.imageDate ?? null);
                })
                .catch(() => {});
          }),
          panorama.addListener('status_changed', () => {
            if (loading.current || !live.current) return;
            if (panorama.getStatus() !== google.maps.StreetViewStatus.OK)
              setStatus(
                panorama.getStatus() ===
                  google.maps.StreetViewStatus.ZERO_RESULTS
                  ? 'empty'
                  : 'error',
              );
            else update();
          }),
        );
        const placePoint = {
          lat: spot.place.latitude,
          lng: spot.place.longitude,
        };
        map = new google.maps.Map(mapElement.current!, {
          center: placePoint,
          zoom: 18,
          streetViewControl: false,
          mapTypeControl: false,
          fullscreenControl: false,
          clickableIcons: false,
        });
        editorMap.current = map;
        const circle = new google.maps.Circle({
          map,
          center: initial.streetView?.searchAnchor
            ? {
                lat: initial.streetView.searchAnchor.latitude,
                lng: initial.streetView.searchAnchor.longitude,
              }
            : placePoint,
          radius: 50,
          fillOpacity: 0.06,
          strokeWeight: 1,
          clickable: false,
        });
        new google.maps.Circle({
          map,
          center: placePoint,
          radius: 2,
          fillColor: '#1a73e8',
          fillOpacity: 1,
          strokeColor: '#fff',
          strokeWeight: 2,
          clickable: false,
        });
        listeners.current.push(
          map.addListener('click', (event: google.maps.MapMouseEvent) => {
            if (!event.latLng) return;
            setCustom(true);
            setLat(String(event.latLng.lat()));
            setLng(String(event.latLng.lng()));
            circle.setCenter(event.latLng);
          }),
        );
        observer = new ResizeObserver(() =>
          google.maps.event.trigger(panorama, 'resize'),
        );
        observer.observe(panoElement.current!);
        if (initial.streetView && !initial.isStale) {
          try {
            const data = await exact(
              service.current,
              initial.streetView.panoramaId,
            );
            if (live.current && token === generation.current)
              show(data, initial.streetView);
            return;
          } catch (error) {
            if (
              !String(error).includes('ZERO_RESULTS') &&
              !String(error).includes('Panorama changed')
            )
              throw error;
          }
        }
        if (live.current && token === generation.current)
          await find(
            initial.streetView?.searchAnchor
              ? {
                  lat: initial.streetView.searchAnchor.latitude,
                  lng: initial.streetView.searchAnchor.longitude,
                }
              : placePoint,
          );
      } catch {
        if (live.current && token === generation.current) setStatus('error');
      }
    };
    void start();
    return () => {
      live.current = false;
      // Invalidate pending lookups as well as hiding the single SDK viewer.
      // eslint-disable-next-line react-hooks/exhaustive-deps
      generation.current++;
      observer?.disconnect();
      listeners.current.forEach((listener) => listener.remove());
      listeners.current = [];
      viewer.current?.setVisible(false);
      viewer.current = null;
      service.current = null;
      if (map) google.maps.event.clearInstanceListeners(map);
    };
    // This editor is mounted once for one persisted spot. Draft POV never recreates its viewer.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const save = async (clear: boolean) => {
    if (
      saving ||
      (!clear &&
        (!anchorValid ||
          status !== 'ready' ||
          !draft ||
          viewer.current?.getPano() !== draft.panoramaId ||
          viewer.current?.getStatus() !== google.maps.StreetViewStatus.OK))
    )
      return;
    setSaving(true);
    setMessage('');
    try {
      const response = await streetViewApi.updateSunreiSpotStreetView(
        sunreiId,
        spot.id,
        {
          expectedRevision: server.revision,
          streetView: clear ? null : { ...draft!, searchAnchor: anchor },
        },
      );
      if (!live.current) return;
      setServer(response.data);
      queryClient.setQueryData(
        ['street-view', sunreiId, spot.id],
        response.data,
      );
      void queryClient.invalidateQueries({
        queryKey: sunreiKeys.detail(sunreiId),
        refetchType: 'none',
      });
      void queryClient.invalidateQueries({ queryKey: sunreiKeys.lists() });
      onClose();
    } catch (error) {
      if (!live.current) return;
      if (isAxiosError(error) && error.response?.status === 409) {
        try {
          const [latest, sunrei] = await Promise.all([
            streetViewApi.getSunreiSpotStreetView(sunreiId, spot.id),
            adminApi.getSunrei(sunreiId),
          ]);
          if (live.current) {
            setServer(latest.data);
            const latestSpot = sunrei.data.spots.find(
              (item) => item.id === spot.id,
            );
            if (latestSpot) {
              setCurrentSpot(latestSpot);
              editorMap.current?.setCenter({
                lat: latestSpot.place.latitude,
                lng: latestSpot.place.longitude,
              });
            }
          }
        } catch {
          if (live.current)
            setMessage(
              'Conflict. Could not reload the current revision. Close and reopen the editor.',
            );
          return;
        }
        if (live.current)
          setMessage(
            'The saved viewpoint or place/content changed. Your draft is preserved. Compare it with the latest setting below before saving again.',
          );
      } else
        setMessage(
          isAxiosError(error) && error.response?.status === 404
            ? 'This spot or its parent was deleted. Close the editor and reload.'
            : 'Could not save the viewpoint. Your draft is preserved.',
        );
    } finally {
      if (live.current) setSaving(false);
    }
  };
  const change = (key: 'heading' | 'pitch' | 'zoom', value: number) => {
    if (!Number.isFinite(value) || !viewer.current || !draft) return;
    if (key === 'zoom') viewer.current.setZoom(Math.max(0, Math.min(3, value)));
    else viewer.current.setPov({ ...viewer.current.getPov(), [key]: value });
  };
  return (
    <div className="space-y-3">
      {server.isStale && (
        <p
          role="status"
          className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm"
        >
          Needs review:{' '}
          {server.staleReasons
            .map(
              (reason) =>
                ({
                  PLACE_CHANGED: 'Different Place',
                  PLACE_LOCATION_CHANGED: 'Place coordinates changed',
                  GOOGLE_PLACE_ID_CHANGED: 'Google place ID changed',
                  SOURCE_LINK_CHANGED: 'Source link changed',
                })[reason],
            )
            .join(', ')}
          . The public app hides this setting.
        </p>
      )}
      {message && (
        <div role="alert" className="rounded-lg border p-3 text-sm">
          {message}
          {server.streetView && (
            <p className="mt-2 break-all text-xs">
              Latest saved: {server.streetView.panoramaId} ·{' '}
              {server.streetView.heading.toFixed(1)}° /{' '}
              {server.streetView.pitch.toFixed(1)}° / zoom{' '}
              {server.streetView.zoom}
            </p>
          )}
        </div>
      )}
      <div className="grid grid-cols-[minmax(0,2fr)_minmax(240px,1fr)] gap-3">
        <div className="relative h-[350px] overflow-hidden rounded-lg border">
          <div ref={panoElement} className="absolute inset-0" />
          {status !== 'ready' && (
            <div
              role="status"
              className="absolute inset-0 grid place-items-center bg-muted p-4 text-center text-sm"
            >
              {status === 'loading'
                ? 'Loading Roadview…'
                : status === 'empty'
                  ? 'No outdoor imagery within 50 m. Pick another search anchor.'
                  : 'Could not load imagery. Check the key or quota, then retry.'}
            </div>
          )}
        </div>
        <div>
          <div ref={mapElement} className="h-[220px] rounded-lg border" />
          <p className="mt-1 text-xs text-muted-foreground">
            Click the map to set a search anchor. The circle shows a 50 m search
            radius.
          </p>
          <p className="mt-2 text-xs">
            {currentSpot.place.name}
            <br />
            {currentSpot.place.address}
            <br />
            Place: {currentSpot.place.latitude}, {currentSpot.place.longitude}
          </p>
        </div>
      </div>
      <div className="flex flex-wrap items-end gap-3">
        <label className="flex min-h-11 items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={custom}
            onChange={(event) => setCustom(event.target.checked)}
          />
          Custom search anchor
        </label>
        {custom && (
          <>
            <label className="text-xs">
              Latitude
              <Input
                type="number"
                step="any"
                value={lat}
                onChange={(event) => setLat(event.target.value)}
                className="w-36"
              />
            </label>
            <label className="text-xs">
              Longitude
              <Input
                type="number"
                step="any"
                value={lng}
                onChange={(event) => setLng(event.target.value)}
                className="w-36"
              />
            </label>
          </>
        )}
        <Button
          type="button"
          variant="outline"
          disabled={!anchorValid || saving || !service.current}
          onClick={() =>
            find(
              custom
                ? { lat: Number(lat), lng: Number(lng) }
                : {
                    lat: currentSpot.place.latitude,
                    lng: currentSpot.place.longitude,
                  },
            )
          }
        >
          Search outdoor imagery · 50 m
        </Button>
      </div>
      <div className="flex flex-wrap items-end gap-3">
        {(['heading', 'pitch', 'zoom'] as const).map((key) => (
          <label key={key} className="text-xs capitalize">
            {key}
            <Input
              type="number"
              step={key === 'zoom' ? '.1' : '1'}
              min={key === 'pitch' ? -90 : 0}
              max={key === 'heading' ? 360 : key === 'pitch' ? 90 : 3}
              value={draft?.[key] ?? 0}
              disabled={status !== 'ready' || saving}
              onChange={(event) => change(key, Number(event.target.value))}
              className="w-24"
            />
          </label>
        ))}
        <span className="pb-2 text-xs text-muted-foreground">
          {date ? `Captured: ${date}` : 'Capture date unavailable'}. Imagery may
          differ from the current appearance.
        </span>
      </div>
      <p className="text-sm">
        {currentSpot.context}
        {currentSpot.sourceLink && (
          <>
            {' '}
            ·{' '}
            <a
              href={currentSpot.sourceLink}
              target="_blank"
              rel="noreferrer"
              className="underline"
            >
              Open source ↗
            </a>
          </>
        )}
      </p>
      <div className="flex justify-between gap-2 border-t pt-3">
        <Button
          type="button"
          variant="outline"
          disabled={saving || !server.streetView}
          onClick={() => save(true)}
        >
          Clear saved Roadview
        </Button>
        <div className="flex gap-2">
          <Button
            type="button"
            variant="outline"
            disabled={saving}
            onClick={onClose}
          >
            Cancel
          </Button>
          <Button
            type="button"
            disabled={saving || status !== 'ready' || !draft || !anchorValid}
            onClick={() => save(false)}
          >
            {saving ? 'Saving…' : 'Save viewpoint'}
          </Button>
        </div>
      </div>
    </div>
  );
}
