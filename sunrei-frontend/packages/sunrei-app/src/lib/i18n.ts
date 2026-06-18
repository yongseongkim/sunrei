import { useLocale } from 'next-intl';
import en from '../../messages/en.json';
import ko from '../../messages/ko.json';

export const locales = ['en', 'ko'] as const;
export type Locale = (typeof locales)[number];
export const DEFAULT_LOCALE: Locale = 'ko';
export const LOCALE_COOKIE = 'NEXT_LOCALE';

export const messages: Record<Locale, unknown> = { en, ko };

export function isLocale(v: string | undefined | null): v is Locale {
  return !!v && (locales as readonly string[]).includes(v);
}

export function loadMessages(locale: string | undefined | null) {
  return (isLocale(locale) ? messages[locale] : messages[DEFAULT_LOCALE]) as Record<string, unknown>;
}

export function resolveLocale(locale: string | undefined | null): Locale {
  return isLocale(locale) ? locale : DEFAULT_LOCALE;
}

/** Pick a tag's display label by current locale (KO default, EN fallback). */
export function useTagLabel() {
  const locale = useLocale();
  return (tag: { labelKo?: string | null; labelEn?: string | null } | null | undefined) => {
    if (!tag) return '';
    if (locale === 'en') return tag.labelEn || tag.labelKo || '';
    return tag.labelKo || tag.labelEn || '';
  };
}

export const SOURCE_TAG_COLORS: Record<string, string> = {
  cornflower: '#6495ED',
  willow: '#9CAF88',
  viola: '#9370DB',
  taupe: '#8B8680',
};

/** Stable brand-palette color for a tag id (cornflower/willow/viola/taupe). */
export function tagColor(tagId: string): string {
  const palette = ['#6495ED', '#9CAF88', '#9370DB', '#8B8680'];
  let h = 0;
  for (let i = 0; i < tagId.length; i++) h = (h * 31 + tagId.charCodeAt(i)) >>> 0;
  return palette[h % palette.length];
}
