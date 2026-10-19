'use client';

import { useTranslations } from 'next-intl';
import { cn } from '@/lib/utils';

export function ViewToggle({ map, onChange }: { map: boolean; onChange: (map: boolean) => void }) {
  const t = useTranslations('list');
  return (
    <div className="inline-flex shrink-0 rounded-full bg-bg2 p-0.5 border border-line2">
      {([['viewList', false], ['viewMap', true]] as const).map(([key, isMap]) => {
        const on = isMap === map;
        return (
          <button
            key={key}
            type="button"
            onClick={() => onChange(isMap)}
            className={cn(
              'px-[11px] py-1 rounded-full text-[12px] font-bold transition-colors',
              on ? 'bg-card text-foreground shadow-sm' : 'text-ink2'
            )}
          >
            {t(key)}
          </button>
        );
      })}
    </div>
  );
}
