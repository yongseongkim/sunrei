import { getRequestConfig } from 'next-intl/server';
import { cookies } from 'next/headers';
import { LOCALE_COOKIE, loadMessages, resolveLocale } from '@/lib/i18n';

// Server-side next-intl config (cookie locale, no routing). Required by the
// next-intl plugin so server rendering can resolve locale + messages.
export default getRequestConfig(async () => {
  const cookieStore = await cookies();
  const locale = resolveLocale(cookieStore.get(LOCALE_COOKIE)?.value);
  return { locale, messages: loadMessages(locale) };
});
