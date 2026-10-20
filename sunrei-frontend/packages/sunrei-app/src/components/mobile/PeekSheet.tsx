'use client';

import { useTranslations } from 'next-intl';
import { TagChipRail } from '@/components/panels';
import { SourceRail } from '@/components/desktop/SourceRail';
import { Handle, ViewToggle } from '@/components/wf';
import { cn } from '@/lib/utils';
import { ChevronUp } from 'lucide-react';
import { useState, type ReactNode } from 'react';

export type Snap = 'peek' | 'half' | 'full';

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
        'absolute left-0 right-0 bottom-0 bg-card border-t border-line2 rounded-t-[18px] z-20 flex flex-col shadow-[0_-4px_16px_rgba(0,0,0,0.06)] transition-[height] duration-[250ms] ease-out',
        detailPanel || channelPanel
          ? 'h-[72%]'
          : snap === 'peek'
            ? 'h-[96px]'
            : snap === 'full'
              ? 'h-[90%]'
              : 'h-[56%]'
      )}
    >
      <button onClick={cycle} className="w-full" aria-label={t('resizeSheet')}>
        <Handle />
      </button>
      {detailPanel ? (
        detailPanel
      ) : channelPanel ? (
        channelPanel
      ) : snap === 'peek' ? (
        <button
          onClick={() => setSnap('half')}
          className="flex items-center justify-between px-[18px] py-2 text-left"
        >
          <span className="text-[15px] font-extrabold">
            {showingPrevious ? t('showPrevious') : t('placesNear', { count })}
          </span>
          <span className="inline-flex items-center gap-1 text-[12.5px] font-bold text-accent-ink">
            {t('showList')} <ChevronUp className="h-3 w-3" strokeWidth={2.4} />
          </span>
        </button>
      ) : (
        <>
          <div className="flex items-center justify-between px-[14px] pb-2.5 pt-0.5">
            <span className="text-[15px] font-extrabold">
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
