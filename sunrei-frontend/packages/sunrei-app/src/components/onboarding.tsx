'use client';

import { useEffect } from 'react';
import { useTranslations } from 'next-intl';
import { Loader2, MapPin } from 'lucide-react';
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
 * §0 — decide the opening flow once on mount: a previously-allowed user gets a
 * silent locate; a previously-declined user stays on Seoul; a first-timer sees
 * the priming card. The browser's own permission prompt is OS chrome (not ours).
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

/** The priming card + "Centering the map…" state — our UI (§0). */
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
        <div className="w-full max-w-[432px] rounded-2xl bg-card p-8 text-center shadow-2xl">
          <div className="mx-auto grid h-[52px] w-[52px] place-items-center rounded-2xl border-2 border-primary bg-accent-soft">
            <MapPin className="h-6 w-6 text-primary" />
          </div>
          <h2 className="mt-4 text-[21px] font-extrabold tracking-tight text-foreground">
            {t('primingTitle')}
          </h2>
          <p className="mt-2.5 text-[13.5px] leading-relaxed text-ink2">{t('primingBody')}</p>
          <div className="mt-5 flex flex-col gap-2.5">
            <button
              type="button"
              onClick={allow}
              className="inline-flex w-full items-center justify-center gap-2 rounded-full bg-primary px-4 py-3 text-[14px] font-bold text-primary-foreground shadow-[0_4px_12px_oklch(0.66_0.13_264/0.3)]"
            >
              <MapPin className="h-4 w-4" /> {t('useLocation')}
            </button>
            <button
              type="button"
              onClick={deny}
              className="w-full rounded-full border border-line2 bg-card px-4 py-2.5 text-[13.5px] font-bold text-ink2 hover:bg-bg2"
            >
              {t('browseSeoul')}
            </button>
          </div>
        </div>
      ) : (
        <div className="flex items-center gap-3.5 rounded-2xl bg-card px-6 py-5 shadow-2xl">
          <Loader2 className="h-7 w-7 animate-spin text-primary" />
          <div className="text-left">
            <div className="text-[14.5px] font-extrabold text-foreground">{t('locating')}</div>
            <div className="mt-0.5 text-[12px] text-ink2">{t('locatingSub')}</div>
          </div>
        </div>
      )}
    </div>
  );
}
