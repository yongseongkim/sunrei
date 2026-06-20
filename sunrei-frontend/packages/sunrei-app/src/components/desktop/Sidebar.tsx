'use client';

import { useTranslations } from 'next-intl';
import { MapPin } from 'lucide-react';
import { LocaleToggle, SourceChips, TagChipRail } from '@/components/panels';
import { SourceRail } from '@/components/desktop/SourceRail';
import type { ReactNode } from 'react';

/**
 * Desktop sidebar (Bd-2): brand header + distance subtitle + source rail + place list,
 * or the active detail/preview panel when one is open.
 */
export function Sidebar({
  detailPanel,
  listBody,
  count,
  showingPrevious,
}: {
  detailPanel: ReactNode | null;
  listBody: ReactNode;
  count: number;
  showingPrevious: boolean;
}) {
  const t = useTranslations('list');
  const nav = useTranslations('nav');
  return (
    <aside className="relative w-[380px] shrink-0 border-r border-line bg-card flex flex-col z-10">
      <div className="flex items-center gap-2 px-3 py-3 border-b border-line">
        <span className="h-6 w-6 rounded-md bg-primary" />
        <span className="font-extrabold text-base mr-auto tracking-tight">Sunrei</span>
        <LocaleToggle />
      </div>
      {!detailPanel && (
        <div className="px-3 pt-2 flex items-center gap-1.5 text-[11.5px] text-ink2">
          <MapPin className="h-3.5 w-3.5 text-primary" />
          {t('sortedByDistance')}
        </div>
      )}
      <SourceChips />
      {detailPanel ?? (
        <>
          <SourceRail />
          <TagChipRail />
          <div className="flex items-center justify-between px-3 py-2">
            <span className="text-[13px] font-semibold text-foreground">
              {showingPrevious ? t('showPrevious') : t('placesNear', { count })}
            </span>
            <span className="text-[11px] font-semibold text-ink2">{nav('nearest')} ▾</span>
          </div>
          {listBody}
        </>
      )}
    </aside>
  );
}
