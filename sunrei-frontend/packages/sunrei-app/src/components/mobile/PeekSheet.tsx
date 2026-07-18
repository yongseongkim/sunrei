'use client';

import { useTranslations } from 'next-intl';
import { TagChipRail } from '@/components/panels';
import { SourceRail } from '@/components/desktop/SourceRail';
import { Handle, ViewToggle } from '@/components/wf';
import { cn } from '@/lib/utils';
import { useState, type ReactNode } from 'react';

export type Snap = 'peek' | 'half' | 'full';

/**
 * Mobile peek sheet (Bd-2): 3 snap points (peek / half / full), tap-driven via the handle,
 * ~250ms transitions. Shows the active detail/preview panel when one is open, else the
 * place list. `onSnapChange` lets the shell dim the map at the full snap.
 */
export function PeekSheet({
  detailPanel,
  channelPanel,
  listBody,
  count,
  showingPrevious,
  onSnapChange,
}: {
  detailPanel: ReactNode | null;
  channelPanel: ReactNode | null;
  listBody: ReactNode;
  count: number;
  showingPrevious: boolean;
  onSnapChange?: (snap: Snap) => void;
}) {
  const t = useTranslations('list');
  const [snap, setSnapState] = useState<Snap>('half');
  const setSnap = (s: Snap) => {
    setSnapState(s);
    onSnapChange?.(s);
  };
  const cycle = () => setSnap(snap === 'peek' ? 'half' : snap === 'half' ? 'full' : 'peek');

  return (
    <div
      className={cn(
        'absolute left-0 right-0 bottom-0 bg-card border-t border-line rounded-t-2xl z-20 flex flex-col shadow-[0_-4px_20px_rgba(0,0,0,0.08)] transition-[height] duration-[250ms] ease-out',
        detailPanel || channelPanel
          ? 'h-[72%]'
          : snap === 'peek'
            ? 'h-[96px]'
            : snap === 'full'
              ? 'h-[90%]'
              : 'h-[56%]'
      )}
    >
      <button onClick={cycle} className="w-full" aria-label="Toggle sheet">
        <Handle />
      </button>
      {detailPanel ? (
        detailPanel
      ) : channelPanel ? (
        channelPanel
      ) : snap === 'peek' ? (
        <button
          onClick={() => setSnap('half')}
          className="flex items-center justify-between px-4 pb-3 text-left"
        >
          <span className="text-[13px] font-semibold">
            {showingPrevious ? t('showPrevious') : t('placesNear', { count })}
          </span>
          <span className="text-[12px] font-semibold text-primary">{t('showList')} ⌃</span>
        </button>
      ) : (
        <>
          <div className="flex items-center justify-between px-4 pb-1">
            <span className="text-[13px] font-semibold">
              {showingPrevious ? t('showPrevious') : t('placesNear', { count })}
            </span>
            <ViewToggle map={false} onChange={(m) => setSnap(m ? 'peek' : 'half')} />
          </div>
          <SourceRail />
          <TagChipRail />
          {listBody}
        </>
      )}
    </div>
  );
}
