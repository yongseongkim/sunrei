import type { SourceDTO } from '@/dto';

/**
 * A source's channel-thumbnail (posterImage) URL, sized for a `px` avatar. We want ~2× the
 * display size for retina without shipping a large original into a 22px circle:
 * uploaded posters (e.g. Instagram profile pictures) come in several sizes, largest first,
 * so we take the smallest that still covers the target; YouTube avatar URLs carry a size
 * token (…=s800-c-k-…) that we rewrite. Returns undefined when the source has no poster
 * image (Avatar then shows the initial).
 */
export function sourceAvatarUrl(
  source: Pick<SourceDTO, 'posterImage'> | null | undefined,
  px = 44
): string | undefined {
  const images = source?.posterImage?.images ?? [];
  if (!images.length) return undefined;
  const target = Math.min(800, Math.max(44, Math.round(px * 2)));
  const covering = images.filter((image) => (image.width ?? 0) >= target);
  const url = (covering[covering.length - 1] ?? images[0]).url;
  return url.replace(/=s\d+-/, `=s${target}-`);
}
