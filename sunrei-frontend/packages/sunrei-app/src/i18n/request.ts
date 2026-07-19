import { getRequestConfig } from 'next-intl/server';
import { headers } from 'next/headers';
import { localeFromAcceptLanguage, loadMessages } from '@/lib/i18n';

// Server-side next-intl config: locale follows the browser/OS language via the
// Accept-Language header (no routing, no cookie). Required by the next-intl plugin
// so server rendering can resolve locale + messages.
export default getRequestConfig(async () => {
  const h = await headers();
  const locale = localeFromAcceptLanguage(h.get('accept-language'));
  return { locale, messages: loadMessages(locale) };
});
