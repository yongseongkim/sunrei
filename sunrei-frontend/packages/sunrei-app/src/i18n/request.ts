import { getRequestConfig } from 'next-intl/server';
import { headers } from 'next/headers';
import { localeFromAcceptLanguage, loadMessages } from '@/lib/i18n';

// locale을 URL 경로에 넣지 않아야 지도 페이지 하나와 query 기반 deep link를 유지할 수 있으므로 Accept-Language로만 정한다.
// next-intl plugin이 서버 렌더링에서 locale과 메시지를 찾으려면 이 파일이 있어야 한다.
export default getRequestConfig(async () => {
  const h = await headers();
  const locale = localeFromAcceptLanguage(h.get('accept-language'));
  return { locale, messages: loadMessages(locale) };
});
