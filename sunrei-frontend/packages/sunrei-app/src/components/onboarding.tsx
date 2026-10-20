'use client';

import { useEffect } from 'react';
import { useTranslations } from 'next-intl';
import { MapPin } from 'lucide-react';
import { useMapStore, SEOUL } from '@/stores/map-store';
import { useUiStore } from '@/stores/ui-store';
import type { LatLng } from '@/hooks/use-map';

const GEO_KEY = 'sunrei_geo';

function requestLocation(panTo: (c: LatLng, zoom?: number) => void, done: () => void) {
  if (typeof navigator === 'undefined' || !navigator.geolocation) {
    useMapStore.setState({ initialSeed: SEOUL });
    done();
    return;
  }
  navigator.geolocation.getCurrentPosition(
    (pos) => {
      const c: LatLng = { lat: pos.coords.latitude, lng: pos.coords.longitude };
      useMapStore.setState({ initialSeed: c });
      panTo(c, 13);
      done();
    },
    () => {
      useMapStore.setState({ initialSeed: SEOUL });
      done();
    },
    { maximumAge: 60_000, timeout: 8000 }
  );
}

/**
 * 브라우저 권한 요청 전에 Sunrei 안내 카드를 먼저 보여 주고, 사용자의 선택을 localStorage에 기억한다.
 * 전에 허용했으면 카드 없이 위치를 확인하고, 거절했으면 서울에서 시작한다.
 */
export function useOnboarding() {
  const panTo = useMapStore((s) => s.panTo);
  const setOnboarding = useUiStore((s) => s.setOnboarding);
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const pref = localStorage.getItem(GEO_KEY);
    if (pref === 'allow') requestLocation(panTo, () => setOnboarding('done'));
    else if (pref === 'deny') useMapStore.setState({ initialSeed: SEOUL });
    else setOnboarding('priming');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
}

export function Onboarding() {
  const t = useTranslations('geo');
  const onboarding = useUiStore((s) => s.onboarding);
  const setOnboarding = useUiStore((s) => s.setOnboarding);
  const panTo = useMapStore((s) => s.panTo);
  if (onboarding === 'done') return null;

  const allow = () => {
    localStorage.setItem(GEO_KEY, 'allow');
    setOnboarding('locating');
    requestLocation(panTo, () => setOnboarding('done'));
  };
  const deny = () => {
    localStorage.setItem(GEO_KEY, 'deny');
    useMapStore.setState({ initialSeed: SEOUL });
    setOnboarding('done');
  };

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/35 p-4">
      {onboarding === 'priming' ? (
        <div className="w-full max-w-[432px] rounded-[18px] bg-card px-[22px] pb-5 pt-[26px] text-center shadow-[0_16px_48px_rgba(0,0,0,0.2)] sm:px-[30px] sm:pb-6 sm:pt-[30px]">
          <div className="mx-auto grid h-[52px] w-[52px] place-items-center rounded-[14px] border-2 border-primary bg-accent-soft">
            <MapPin className="h-6 w-6 text-accent-ink" strokeWidth={1.5} />
          </div>
          <h2 className="mt-4 text-[21px] font-extrabold tracking-tight text-foreground">
            {t('primingTitle')}
          </h2>
          <p className="mt-[9px] text-[13.5px] leading-relaxed text-ink2">{t('primingBody')}</p>
          <div className="mt-5 flex flex-col gap-2">
            <button
              type="button"
              onClick={allow}
              className="h-11 w-full rounded-full bg-primary px-[18px] text-[14px] font-extrabold text-primary-foreground shadow-[0_4px_12px_oklch(0.66_0.13_264/0.3)]"
            >
              {t('useLocation')}
            </button>
            <button
              type="button"
              onClick={deny}
              className="h-11 w-full rounded-full border border-line2 bg-card px-[18px] text-[14px] font-extrabold text-foreground hover:bg-bg2"
            >
              {t('browseSeoul')}
            </button>
          </div>
        </div>
      ) : (
        <div className="flex items-center gap-3 rounded-[14px] bg-card px-5 py-4 shadow-[0_12px_36px_rgba(0,0,0,0.18)]">
          <span className="h-5 w-5 shrink-0 animate-spin rounded-full border-2 border-line2 border-t-primary" />
          <div className="text-left">
            <div className="text-[14px] font-extrabold text-foreground">{t('locating')}</div>
            <div className="mt-0.5 text-[12px] text-ink3">{t('locatingSub')}</div>
          </div>
        </div>
      )}
    </div>
  );
}
