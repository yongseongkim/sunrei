'use client';

import { useTranslations } from 'next-intl';
import { X } from 'lucide-react';
import { useUiStore } from '@/stores/ui-store';
import { useFilterStore } from '@/stores/filter-store';
import { useTags } from '@/hooks/use-discovery';
import { useTagLabel } from '@/lib/i18n';
import { cn } from '@/lib/utils';
import type { PlaceCardDTO } from '@/dto';

/**
 * Bilingual tag filter (Bf-2). Desktop = centered modal, mobile = bottom sheet.
 * Full KO+EN tag grid, Reset, and a "Show N places" CTA reflecting the live match
 * count over the in-scope places (client-side; never refetches the map).
 */
export function FiltersPanel({ places }: { places: PlaceCardDTO[] }) {
  const t = useTranslations('tags');
  const nav = useTranslations('nav');
  const tagLabel = useTagLabel();
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
    <div className="flex flex-col max-h-[80vh]">
      <div className="flex items-center justify-between px-4 py-3 border-b border-line">
        <span className="text-sm font-semibold">{t('title')}</span>
        <button onClick={() => setOpen(false)} className="text-ink3 hover:text-foreground">
          <X className="h-4 w-4" />
        </button>
      </div>
      <div className="flex-1 overflow-auto p-4">
        {tags.length === 0 ? (
          <p className="text-sm text-ink3 text-center py-6">—</p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {tags.map((tag) => {
              const on = activeTagIds.includes(tag.id);
              return (
                <button
                  key={tag.id}
                  onClick={() => toggleTag(tag.id)}
                  className={cn(
                    'rounded-full border px-3 py-2 text-left transition-colors',
                    on
                      ? 'bg-primary text-primary-foreground border-primary'
                      : 'bg-card border-line2 hover:bg-accent-soft'
                  )}
                >
                  <span className="block text-[13px] font-semibold leading-tight">
                    {tagLabel(tag)}
                  </span>
                  <span className={cn('block text-[10px]', on ? 'text-primary-foreground/80' : 'text-ink3')}>
                    {tag.labelEn}
                  </span>
                </button>
              );
            })}
          </div>
        )}
      </div>
      <div className="flex items-center gap-2 px-4 py-3 border-t border-line">
        <button
          onClick={clear}
          disabled={activeTagIds.length === 0}
          className="text-sm font-medium text-ink2 disabled:opacity-40"
        >
          {t('reset')}
        </button>
        <button
          onClick={() => setOpen(false)}
          className="ml-auto rounded-full bg-primary text-primary-foreground px-5 py-2.5 text-sm font-semibold shadow-[0_4px_12px_oklch(0.66_0.13_264/0.3)]"
        >
          {t('showPlaces', { count: matched })}
        </button>
      </div>
    </div>
  );

  return (
    <div
      className="absolute inset-0 z-40 bg-black/30 flex items-end sm:items-center sm:justify-center"
      onClick={() => setOpen(false)}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className={cn(
          'bg-card overflow-hidden',
          isMobile
            ? 'w-full rounded-t-2xl'
            : 'w-[440px] max-w-[92vw] rounded-2xl border border-line shadow-xl'
        )}
      >
        {body}
      </div>
    </div>
  );
}
