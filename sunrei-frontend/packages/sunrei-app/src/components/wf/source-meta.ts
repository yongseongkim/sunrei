import type { SourceType, SourceDTO } from '@/dto';

const VERB: Record<SourceType, string> = {
  YOUTUBE: 'featured this',
  TV: 'visited',
  ANIME: 'set a scene at',
  OTHER: 'recommends',
};

/** Verb phrase for how a source relates to a place ("featured this", …). */
export const sourceVerb = (t: SourceType) => VERB[t] ?? 'featured this';

/**
 * A source's channel-thumbnail (posterImage) URL, sized for a `px` avatar. YouTube
 * avatar URLs carry a size token (…=s800-c-k-…); we request ~2× the display size for
 * retina and to avoid shipping the 800px original into a 22px circle. Returns undefined
 * when the source has no poster image (Avatar then shows the initial).
 */
export function sourceAvatarUrl(
  source: Pick<SourceDTO, 'posterImage'> | null | undefined,
  px = 44
): string | undefined {
  const url = source?.posterImage?.images?.[0]?.url;
  if (!url) return undefined;
  const target = Math.min(800, Math.max(44, Math.round(px * 2)));
  return url.replace(/=s\d+-/, `=s${target}-`);
}
