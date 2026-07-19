import type { Metadata } from 'next';
import { headers } from 'next/headers';
import { NextIntlClientProvider } from 'next-intl';
import './globals.css';
import { Providers } from './providers';
import { localeFromAcceptLanguage, loadMessages } from '@/lib/i18n';

export const metadata: Metadata = {
  title: 'Sunrei — 성지순례 지도',
  description: '영화·드라마·애니메이션의 촬영지를 지도에서 탐색하세요.',
};

export default async function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const h = await headers();
  const locale = localeFromAcceptLanguage(h.get('accept-language'));
  const messages = loadMessages(locale);

  return (
    <html lang={locale}>
      <head>
        <link
          rel="stylesheet"
          as="style"
          crossOrigin="anonymous"
          href="https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/variable/pretendardvariable.min.css"
        />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=Spline+Sans+Mono:wght@400;500;600&display=swap"
        />
      </head>
      <body className="antialiased">
        <NextIntlClientProvider locale={locale} messages={messages}>
          <Providers>{children}</Providers>
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
