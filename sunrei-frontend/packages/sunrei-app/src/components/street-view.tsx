'use client';
import { useEffect, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Expand, Minimize2, RotateCcw, X } from 'lucide-react';
import { useUiStore } from '@/stores/ui-store';
import { useStreetView } from '@/hooks/use-street-view';
import { mapsStreetViewUrl } from '@/lib/street-view';
import { cn } from '@/lib/utils';
import type { SunreiSpotDTO } from '@/dto';

export function StreetViewWindow({
  spot,
  sourceName,
  mobile = false,
}: {
  spot: SunreiSpotDTO;
  sourceName?: string;
  mobile?: boolean;
}) {
  const t = useTranslations('streetView');
  const expanded = useUiStore((state) => state.streetViewExpanded);
  const camera = useUiStore((state) => state.streetViewCamera);
  const close = useUiStore((state) => state.closeStreetView);
  const [attempt, setAttempt] = useState(0);
  const root = useRef<HTMLDivElement>(null);
  const expandButton = useRef<HTMLButtonElement>(null);
  const { element, status, imageDate } = useStreetView(
    spot.id,
    spot.streetView!,
    attempt,
  );
  useEffect(() => {
    if (!expanded) return;
    const oldFocus = document.activeElement as HTMLElement | null;
    root.current?.focus();
    const keydown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        event.stopPropagation();
        useUiStore.setState({ streetViewExpanded: false });
      }
      if (event.key === 'Tab') {
        const nodes = [
          ...root.current!.querySelectorAll<HTMLElement>(
            'button:not([disabled]), a[href], [tabindex="0"]',
          ),
        ].filter((node) => node.offsetParent !== null);
        const first = nodes[0],
          last = nodes[nodes.length - 1];
        if (
          event.shiftKey &&
          (document.activeElement === first ||
            document.activeElement === root.current)
        ) {
          event.preventDefault();
          last?.focus();
        } else if (
          !event.shiftKey &&
          (document.activeElement === last ||
            document.activeElement === root.current)
        ) {
          event.preventDefault();
          first?.focus();
        }
      }
    };
    document.addEventListener('keydown', keydown, true);
    return () => {
      document.removeEventListener('keydown', keydown, true);
      if (oldFocus?.isConnected) oldFocus.focus();
    };
  }, [expanded]);
  const reset = () => {
    useUiStore.setState({ streetViewCamera: null });
    setAttempt((value) => value + 1);
  };
  const exploring =
    camera &&
    (camera.panoramaId !== spot.streetView!.panoramaId ||
      Math.abs(camera.heading - spot.streetView!.heading) > 1 ||
      Math.abs(camera.pitch - spot.streetView!.pitch) > 1 ||
      Math.abs(camera.zoom - spot.streetView!.zoom) > 0.05);
  return (
    <div
      ref={root}
      tabIndex={-1}
      role={expanded ? 'dialog' : 'region'}
      aria-modal={expanded || undefined}
      aria-label={`${t('title')} · ${spot.place.name}`}
      className={cn(
        'flex flex-col overflow-hidden border border-line2 bg-card text-foreground shadow-xl',
        expanded
          ? 'fixed inset-0 z-[80] rounded-none'
          : mobile
            ? 'my-3 w-full max-w-[358px] rounded-xl'
            : 'absolute bottom-5 right-5 z-30 w-[416px] max-w-[calc(100%-40px)] rounded-xl',
      )}
    >
      <div className="flex shrink-0 items-center gap-2 border-b border-line pl-3">
        <div className="min-w-0 flex-1 py-2">
          <div className="truncate text-sm font-bold">{spot.place.name}</div>
          <div className="truncate text-xs text-ink2">
            {sourceName} · {spot.title}
          </div>
        </div>
        <button
          ref={expandButton}
          type="button"
          aria-label={t(expanded ? 'collapse' : 'expand')}
          className="grid h-11 w-11 shrink-0 place-items-center"
          onClick={() => useUiStore.setState({ streetViewExpanded: !expanded })}
        >
          {expanded ? <Minimize2 size={18} /> : <Expand size={18} />}
        </button>
        <button
          type="button"
          aria-label={t('close')}
          className="grid h-11 w-11 shrink-0 place-items-center"
          onClick={close}
        >
          <X size={18} />
        </button>
      </div>
      <div
        className={cn(
          'relative bg-bg2',
          expanded ? 'min-h-0 flex-1' : mobile ? 'h-[174px]' : 'h-[216px]',
        )}
      >
        <div ref={element} className="absolute inset-0" />
        {status !== 'ready' && (
          <div
            role="status"
            className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-bg2 p-4 text-center text-sm"
          >
            {t(status === 'loading' ? 'loading' : 'failed')}
            {status === 'error' && (
              <button
                type="button"
                className="min-h-11 rounded-lg border border-line2 px-4 font-bold"
                onClick={() => setAttempt((value) => value + 1)}
              >
                {t('retry')}
              </button>
            )}
          </div>
        )}
      </div>
      <div className="shrink-0 px-3 pb-2 text-[11px] text-ink2">
        <div className="flex items-center justify-between gap-2">
          <span>{t(exploring ? 'exploring' : 'saved')}</span>
          <span>
            {imageDate ? t('date', { date: imageDate }) : t('unknownDate')}
          </span>
        </div>
        <div className="flex items-center justify-between gap-2">
          <button
            type="button"
            onClick={reset}
            className="inline-flex min-h-11 items-center gap-1 font-bold"
          >
            <RotateCcw size={13} />
            {t('reset')}
          </button>
          <a
            className="inline-flex min-h-11 items-center font-bold"
            href={mapsStreetViewUrl(camera ?? spot.streetView!)}
            target="_blank"
            rel="noreferrer"
          >
            {t('maps')} ↗
          </a>
        </div>
        <p>{t('disclaimer')}</p>
      </div>
    </div>
  );
}
export function StreetViewNotice() {
  const notice = useUiStore((state) => state.streetViewNotice);
  const t = useTranslations('streetView');
  if (!notice) return null;
  return (
    <div
      role="status"
      className="fixed bottom-5 left-1/2 z-[90] flex max-w-[90%] -translate-x-1/2 items-center gap-2 rounded-xl border border-line2 bg-card p-3 text-sm shadow-lg"
    >
      {t('unavailable')}
      <button
        type="button"
        className="grid h-11 w-11 shrink-0 place-items-center"
        aria-label={t('close')}
        onClick={() => useUiStore.setState({ streetViewNotice: false })}
      >
        <X size={16} />
      </button>
    </div>
  );
}
