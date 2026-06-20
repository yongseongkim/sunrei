import type { SourceType } from '@/dto';

const VERB: Record<SourceType, string> = {
  YOUTUBE: 'featured this',
  TV: 'visited',
  ANIME: 'set a scene at',
  OTHER: 'recommends',
};

/** Verb phrase for how a source relates to a place ("featured this", …). */
export const sourceVerb = (t: SourceType) => VERB[t] ?? 'featured this';
