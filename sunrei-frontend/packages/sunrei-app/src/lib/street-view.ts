import type { StreetViewDTO } from '@/dto';
export type Camera = Pick<
  StreetViewDTO,
  'panoramaId' | 'heading' | 'pitch' | 'zoom'
>;
export class PanoramaUnavailable extends Error {}
/** Exact-ID lookup only. Public viewers must never silently substitute nearby imagery. */
export async function lookupPanorama(
  service: Pick<google.maps.StreetViewService, 'getPanorama'>,
  id: string,
): Promise<google.maps.StreetViewPanoramaData> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const result = await Promise.race([
      service.getPanorama({ pano: id }),
      new Promise<never>((_, reject) => {
        timer = setTimeout(
          () => reject(new Error('Street View timeout')),
          12_000,
        );
      }),
    ]);
    if (result.data.location?.pano !== id)
      throw new PanoramaUnavailable('Saved panorama changed');
    return result.data;
  } catch (error) {
    if (
      error instanceof PanoramaUnavailable ||
      (error as { code?: string }).code === 'ZERO_RESULTS' ||
      String(error).includes('ZERO_RESULTS')
    )
      throw new PanoramaUnavailable('Panorama unavailable');
    throw error;
  } finally {
    clearTimeout(timer);
  }
}
export function cameraOf(panorama: google.maps.StreetViewPanorama): Camera {
  const pov = panorama.getPov();
  return {
    panoramaId: panorama.getPano(),
    heading: ((pov.heading % 360) + 360) % 360,
    pitch: pov.pitch,
    zoom: panorama.getZoom(),
  };
}
export function mapsStreetViewUrl(camera: Camera) {
  const query = new URLSearchParams({
    api: '1',
    map_action: 'pano',
    pano: camera.panoramaId,
    heading: String(camera.heading),
    pitch: String(camera.pitch),
    fov: String(180 / 2 ** camera.zoom),
  });
  return `https://www.google.com/maps/@?${query}`;
}
