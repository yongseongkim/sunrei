'use client';

import { cn } from '@/lib/utils';

/** List / Map segmented toggle. */
export function ViewToggle({ map, onChange }: { map: boolean; onChange: (map: boolean) => void }) {
  return (
    <div className="inline-flex shrink-0 rounded-full bg-bg2 p-0.5 border border-line2">
      {([['List', false], ['Map', true]] as const).map(([t, isMap]) => {
        const on = isMap === map;
        return (
          <button
            key={t}
            type="button"
            onClick={() => onChange(isMap)}
            className={cn(
              'px-2.5 py-1 rounded-full text-[11.5px] font-bold transition-colors',
              on ? 'bg-card text-foreground shadow-sm' : 'text-ink3'
            )}
          >
            {t}
          </button>
        );
      })}
    </div>
  );
}
