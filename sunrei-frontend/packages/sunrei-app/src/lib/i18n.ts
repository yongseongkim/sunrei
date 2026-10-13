import { useLocale } from 'next-intl';
import en from '../../messages/en.json';
import ko from '../../messages/ko.json';

export const locales = ['en', 'ko'] as const;
export type Locale = (typeof locales)[number];
export const DEFAULT_LOCALE: Locale = 'ko';

export const messages: Record<Locale, unknown> = { en, ko };

export function isLocale(v: string | undefined | null): v is Locale {
  return !!v && (locales as readonly string[]).includes(v);
}

export function loadMessages(locale: string | undefined | null) {
  return (isLocale(locale) ? messages[locale] : messages[DEFAULT_LOCALE]) as Record<string, unknown>;
}

/** Accept-Language에서 q 값이 가장 높은 지원 언어를 고르고, 지원하는 언어가 없으면 한국어를 쓴다. */
export function localeFromAcceptLanguage(header: string | null | undefined): Locale {
  if (!header) return DEFAULT_LOCALE;
  const ranked = header
    .split(',')
    .map((part) => {
      const [tag, q] = part.trim().split(';q=');
      return { base: tag.split('-')[0]?.toLowerCase(), q: q ? parseFloat(q) : 1 };
    })
    .sort((a, b) => b.q - a.q);
  for (const { base } of ranked) {
    if (isLocale(base)) return base;
  }
  return DEFAULT_LOCALE;
}

export function useTagLabel() {
  const locale = useLocale();
  return (tag: { labelKo?: string | null; labelEn?: string | null } | null | undefined) => {
    if (!tag) return '';
    if (locale === 'en') return tag.labelEn || tag.labelKo || '';
    return tag.labelKo || tag.labelEn || '';
  };
}
