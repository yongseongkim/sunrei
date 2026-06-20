'use client';

import { PlaceCardDTO, PlaceMentionDTO } from '@/dto';
import { useTranslations } from 'next-intl';
import { useUiStore } from '@/stores/ui-store';
import { useMapStore } from '@/stores/map-store';
import { Pin, Avatar, AvatarCluster, sourceVerb } from '@/components/wf';
import { cn } from '@/lib/utils';

function formatDistance(m?: number | null) {
  if (m == null) return '';
  if (m < 1000) return `${Math.round(m)} m`;
  return `${(m / 1000).toFixed(1)} km`;
}

/** One mention row (one video) used in the rich card and the detail panel. */
export function MentionRow({ mention, divided }: { mention: PlaceMentionDTO; divided?: boolean }) {
  const enterPreview = useUiStore((s) => s.enterVideoPreview);
  const openSourceDetail = useUiStore((s) => s.openSourceDetail);
  const mode = useMapStore((s) => s.mode);
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => enterPreview(mention.sunreiId, mode === 'source' ? 'source' : 'nearby')}
      onKeyDown={(e) =>
        e.key === 'Enter' && enterPreview(mention.sunreiId, mode === 'source' ? 'source' : 'nearby')
      }
      className={cn(
        'flex gap-2 py-1.5 items-start cursor-pointer',
        divided && 'border-t border-line'
      )}
    >
      <Avatar label={mention.source.name} size={20} />
      <div className="min-w-0 flex-1">
        <div className="text-[11.5px] font-extrabold text-foreground leading-tight truncate">
          {mention.sunreiTitle}
        </div>
        <div className="text-[11px] leading-snug text-ink2 truncate">
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              openSourceDetail(mention.source.id);
            }}
            className="text-ink3 hover:text-foreground hover:underline"
          >
            {mention.source.name}
          </button>
          {mention.context ? ` · ${mention.context}` : ''}
        </div>
      </div>
    </div>
  );
}

/** Loading skeleton sharing the card footprint (Bh-1). */
export function PlaceCardSkeleton() {
  const bar = (w: string, h = 'h-1.5') => (
    <div className={cn('rounded-full bg-line', h)} style={{ width: w }} />
  );
  return (
    <div className="rounded-xl px-3 py-[11px] bg-card border border-line flex flex-col gap-2.5">
      <div className="flex items-center gap-[7px]">
        <span
          className="bg-bg2 shrink-0"
          style={{ width: 13, height: 13, borderRadius: '50% 50% 50% 0', transform: 'rotate(-45deg)' }}
        />
        {bar('50%')}
        <div className="flex-1" />
        {bar('18%')}
      </div>
      <div className="flex gap-2.5">
        <div className="h-[26px] w-[26px] rounded-full bg-bg2 shrink-0" />
        <div className="flex-1 flex flex-col gap-1.5 pt-1">
          {bar('70%')}
          {bar('92%')}
          {bar('55%')}
        </div>
      </div>
    </div>
  );
}

export function PlaceCard({
  card,
  active,
  dimmed,
  onClick,
}: {
  card: PlaceCardDTO;
  active?: boolean;
  dimmed?: boolean;
  onClick?: () => void;
}) {
  const t = useTranslations('list');
  const mentions = card.mentions ?? [];
  const multi = mentions.length > 1;

  return (
    <div
      onClick={onClick}
      className={cn(
        'rounded-xl px-3 py-[11px] cursor-pointer transition-all bg-card',
        active
          ? 'border-[1.5px] border-primary bg-accent-soft shadow-[0_4px_14px_oklch(0.66_0.13_264/0.16)]'
          : multi
            ? 'border-[1.5px] border-primary'
            : 'border border-line hover:border-ink3/40',
        dimmed && 'opacity-40'
      )}
    >
      {/* Header: pin + name + distance */}
      <div className="flex items-center gap-[7px]">
        <Pin />
        <span className="flex-1 min-w-0 truncate text-[13.5px] font-extrabold text-foreground">
          {card.place.name}
        </span>
        {card.distanceMeters != null && (
          <span className="shrink-0 text-[11px] font-bold text-accent-ink">
            {formatDistance(card.distanceMeters)}
          </span>
        )}
      </div>

      {multi ? (
        <>
          <div className="flex items-center gap-1.5 my-[7px]">
            <AvatarCluster labels={mentions.map((m) => m.source.name)} />
            <span className="text-[10.5px] font-extrabold uppercase tracking-wide text-accent-ink">
              {t('inVideos', { count: mentions.length })}
            </span>
          </div>
          <div className="flex flex-col">
            {mentions.map((m, i) => (
              <MentionRow key={m.spotId} mention={m} divided={i > 0} />
            ))}
          </div>
        </>
      ) : (
        mentions[0] && (
          <div className="flex gap-2.5 items-start mt-1.5">
            <Avatar label={mentions[0].source.name} size={26} />
            <div className="min-w-0 flex-1">
              <div className="text-[11.5px] text-ink2 truncate">
                <span className="font-bold text-foreground">{mentions[0].source.name}</span>{' '}
                {sourceVerb(mentions[0].source.type)}
                {mentions[0].sunreiTitle ? (
                  <span className="text-ink3"> · {mentions[0].sunreiTitle}</span>
                ) : null}
              </div>
              {mentions[0].context && (
                <div className="mt-0.5 text-[12px] leading-snug text-foreground line-clamp-2">
                  {mentions[0].context}
                </div>
              )}
            </div>
          </div>
        )
      )}
    </div>
  );
}
