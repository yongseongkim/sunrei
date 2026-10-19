'use client';

import { useLocale, useTranslations } from 'next-intl';
import { X } from 'lucide-react';
import { useUiStore } from '@/stores/ui-store';
import { useFilterStore } from '@/stores/filter-store';
import { useTags } from '@/hooks/use-discovery';
import { useTagLabel } from '@/lib/i18n';
import { cn } from '@/lib/utils';
import type { PlaceCardDTO } from '@/dto';

export function FiltersPanel({ places }: { places: PlaceCardDTO[] }) {
  const t = useTranslations('tags');
  const tagLabel = useTagLabel();
  const locale = useLocale();
  const open = useUiStore((s) => s.filtersOpen);
  const setOpen = useUiStore((s) => s.setFiltersOpen);
  const isMobile = useUiStore((s) => s.isMobile);
  const { data: tags = [] } = useTags();
  const activeTagIds = useFilterStore((s) => s.activeTagIds);
  const toggleTag = useFilterStore((s) => s.toggleTag);
  const clear = useFilterStore((s) => s.clear);

  if (!open) return null;

  const matched =
    activeTagIds.length === 0
      ? places.length
      : places.filter((p) => activeTagIds.every((id) => (p.tags ?? []).some((tg) => tg.id === id)))
          .length;

  const body = (
    <div className={cn('flex max-h-[80vh] flex-col', isMobile ? 'px-[18px] pb-[22px] pt-2' : 'p-[22px]')}>
      {isMobile && <div className="mx-auto mb-3 h-1 w-9 shrink-0 rounded-full bg-line2" />}
      <div className="flex items-center">
        <span className="text-[16px] font-extrabold">{t('title')}</span>
        <button onClick={() => setOpen(false)} className="ml-auto text-ink2 hover:text-foreground">
          <X className="h-4 w-4" />
        </button>
      </div>
      <div className="mt-4 flex-1 overflow-auto">
        {tags.length === 0 ? (
          <p className="py-6 text-center text-sm text-ink3">—</p>
        ) : (
          <div className="flex flex-wrap gap-[7px]">
            {tags.map((tag) => {
              const on = activeTagIds.includes(tag.id);
              return (
                <button
                  key={tag.id}
                  onClick={() => toggleTag(tag.id)}
                  className={cn(
                    'rounded-xl border px-[13px] py-1.5 text-left transition-colors',
                    on
                      ? 'bg-primary text-primary-foreground border-primary'
                      : 'bg-card border-line hover:bg-accent-soft'
                  )}
                >
                  <span className="block text-[13px] font-semibold leading-tight">
                    {tagLabel(tag)}
                  </span>
                  {/* 영어 라벨은 한국어 화면에서만 덧붙인다. 영어 화면에서는 첫 줄과 같은 말이다. */}
                  {locale === 'ko' && tag.labelEn && tag.labelEn !== tag.labelKo && (
                    <span className={cn('block text-[10px]', on ? 'text-primary-foreground/80' : 'text-ink3')}>
                      {tag.labelEn}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        )}
      </div>
      <div className="mt-5 flex gap-2">
        <button
          onClick={clear}
          disabled={activeTagIds.length === 0}
          className="h-[42px] rounded-full border border-line2 bg-card px-[18px] text-[13.5px] font-extrabold text-foreground disabled:opacity-40"
        >
          {t('reset')}
        </button>
        <button
          onClick={() => setOpen(false)}
          className="h-[42px] flex-1 rounded-full bg-primary px-[18px] text-[13.5px] font-extrabold text-primary-foreground shadow-[0_4px_12px_oklch(0.66_0.13_264/0.3)]"
        >
          {t('showPlaces', { count: matched })}
        </button>
      </div>
    </div>
  );

  return (
    <div
      className={cn(
        'absolute inset-0 z-40 flex bg-black/30',
        isMobile ? 'items-end' : 'items-center justify-center'
      )}
      onClick={() => setOpen(false)}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className={cn(
          'bg-card overflow-hidden',
          isMobile
            ? 'w-full rounded-t-[18px]'
            : 'w-[440px] max-w-[92vw] rounded-2xl shadow-[0_12px_40px_rgba(0,0,0,0.18)]'
        )}
      >
        {body}
      </div>
    </div>
  );
}
