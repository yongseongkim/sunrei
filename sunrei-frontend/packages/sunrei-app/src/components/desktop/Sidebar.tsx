'use client';

import { useTranslations } from 'next-intl';
import { LocaleToggle, TagChipRail } from '@/components/panels';
import { AuthControl } from '@/components/auth';
import { SourceRail, SectionLabel } from '@/components/desktop/SourceRail';
import { SearchPill } from '@/components/wf';
import { useUiStore } from '@/stores/ui-store';
import type { ReactNode } from 'react';

/**
 * Desktop sidebar (direction B): brand + search header, "Sources in view" chip rail,
 * and the "Places · nearest first" list — or the active detail/preview panel, or the
 * source channel view (§4), when one is open.
 */
export function Sidebar({
  detailPanel,
  channelPanel,
  listBody,
  count,
  showingPrevious,
}: {
  detailPanel: ReactNode | null;
  channelPanel: ReactNode | null;
  listBody: ReactNode;
  count: number;
  showingPrevious: boolean;
}) {
  const t = useTranslations('list');
  const search = useTranslations('search');
  const openSearch = useUiStore((s) => s.openSearch);
  return (
    <aside className="relative z-10 flex w-[408px] shrink-0 flex-col border-r border-line bg-card">
      <div className="border-b border-line px-4 pb-[14px] pt-[18px]">
        <div className="mb-[13px] flex items-center gap-2">
          <span className="h-6 w-6 rounded-md bg-primary" />
          <span className="mr-auto text-base font-extrabold tracking-tight">Sunrei</span>
          <LocaleToggle />
          <AuthControl />
        </div>
        <SearchPill
          placeholder={search('placeholder')}
          onClick={openSearch}
          className="w-full"
        />
      </div>
      {detailPanel ?? channelPanel ?? (
        <>
          <SourceRail />
          <TagChipRail />
          <div className="px-4 pb-2 pt-[15px]">
            <SectionLabel count={count} sub={showingPrevious ? t('showPrevious') : t('nearestFirst')}>
              {t('places')}
            </SectionLabel>
          </div>
          {listBody}
        </>
      )}
    </aside>
  );
}
