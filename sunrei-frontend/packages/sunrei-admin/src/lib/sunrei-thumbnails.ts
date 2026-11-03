import type { MultiSizeImageDTO, SunreiDTO } from '@/api/admin';

/** A playlist/channel URL is not a video thumbnail; only accept real YouTube video IDs. */
export function youtubeThumbnail(url?: string | null): string | null {
  if (!url) return null;
  try {
    const parsed = new URL(url);
    if (!['https:', 'http:'].includes(parsed.protocol)) return null;
    const host = parsed.hostname.toLowerCase();
    const parts = parsed.pathname.split('/').filter(Boolean);
    let id: string | null = null;
    if (host === 'youtu.be' || host === 'www.youtu.be') id = parts[0];
    else if (['youtube.com', 'www.youtube.com', 'm.youtube.com', 'music.youtube.com', 'youtube-nocookie.com', 'www.youtube-nocookie.com'].includes(host)) {
      if (parsed.pathname === '/watch') id = parsed.searchParams.get('v');
      else if (['embed', 'shorts', 'live'].includes(parts[0])) id = parts[1];
    }
    return id && /^[\w-]{11}$/.test(id) ? `https://img.youtube.com/vi/${id}/mqdefault.jpg` : null;
  } catch {
    return null;
  }
}

function imageUrls(groups?: MultiSizeImageDTO[] | null): string[] {
  return (groups ?? []).flatMap(group =>
    [...(group.images ?? [])]
      .filter(image => image.url?.trim())
      .sort((a, b) => {
        // A 96px-wide thumbnail needs roughly 192px on a Retina screen.
        const score = (width?: number) => !width ? 10_000 : width >= 192 ? width - 192 : 10_000 - width;
        return score(a.width) - score(b.width);
      })
      .map(image => image.url.trim()),
  );
}

export function sunreiThumbnailCandidates(sunrei: SunreiDTO): string[] {
  const candidates = [
    ...imageUrls(sunrei.images),
    ...(sunrei.spots ?? []).flatMap(spot => imageUrls(spot.images)),
    youtubeThumbnail(sunrei.link),
    ...(sunrei.spots ?? []).map(spot => youtubeThumbnail(spot.sourceLink)),
    ...imageUrls(sunrei.source?.posterImage ? [sunrei.source.posterImage] : []),
  ];
  return [...new Set(candidates.filter((url): url is string => !!url))];
}
