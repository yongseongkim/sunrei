'use client';

import { PlaceCardDTO, PlaceMentionDTO } from '@/dto';
import { useTranslations } from 'next-intl';
import { ChevronRight } from 'lucide-react';
import { useUiStore } from '@/stores/ui-store';
import { useMapStore } from '@/stores/map-store';
import { Pin, Avatar } from '@/components/wf';
import { useTagLabel } from '@/lib/i18n';
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

/**
 * One source's "take" on a place — how that source introduced it (channel · video +
 * a 2-line description). Presentational only: the whole card selects the Place (opens
 * Place detail, matching a marker tap); the per-video preview lives one level down,
 * on the mention rows inside Place detail.
 */
function PlaceTake({ mention }: { mention: PlaceMentionDTO }) {
  return (
    <div className="flex items-start gap-[9px] border-t border-line py-2">
      <Avatar label={mention.source.name} size={22} />
      <div className="min-w-0 flex-1">
        <div className="text-[11.5px] font-extrabold leading-tight text-foreground">
          {mention.source.name}
          {mention.sunreiTitle && <span className="font-semibold text-ink3"> · {mention.sunreiTitle}</span>}
        </div>
        {mention.context && (
          <div className="mt-[3px] text-[12px] leading-relaxed text-ink2 line-clamp-2">
            {mention.context}
          </div>
        )}
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
  const tagLabel = useTagLabel();
  const mentions = card.mentions ?? [];
  const tag = card.tags?.[0];

  // "and N other sources" — distinct sources beyond the two takes we show.
  const shownIds = new Set(mentions.slice(0, 2).map((m) => m.source.id));
  const otherSources = new Set(
    mentions.slice(2).map((m) => m.source.id).filter((id) => !shownIds.has(id))
  ).size;

  const eyebrow =
    card.sourceCount > 1
      ? t('featuredBySources', { count: card.sourceCount })
      : t('featuredInVideos', { count: mentions.length });

  return (
    <div
      onClick={onClick}
      className={cn(
        'rounded-xl px-[13px] py-[11px] cursor-pointer transition-colors bg-card',
        active
          ? 'border-[1.5px] border-primary bg-accent-soft shadow-[0_4px_14px_oklch(0.66_0.13_264/0.16)]'
          : 'border border-line hover:border-ink3/40',
        dimmed && 'opacity-40'
      )}
    >
      {/* Header: pin + name + tag + distance */}
      <div className="flex items-center gap-2">
        <Pin />
        <span className="flex-1 min-w-0 truncate text-[14px] font-extrabold text-foreground">
          {card.place.name}
        </span>
        {tag && (
          <span className="shrink-0 rounded-full bg-bg2 px-[9px] py-0.5 text-[10.5px] font-bold text-ink2">
            {tagLabel(tag)}
          </span>
        )}
        {card.distanceMeters != null && (
          <span className="shrink-0 text-[11px] font-bold text-accent-ink">
            {formatDistance(card.distanceMeters)}
          </span>
        )}
      </div>

      {/* Eyebrow — how widely it's featured */}
      {mentions.length > 0 && (
        <div className="mt-[9px] text-[10px] font-extrabold uppercase tracking-wide text-accent-ink">
          {eyebrow}
        </div>
      )}

      {/* Up to two source "takes" */}
      <div>
        {mentions.slice(0, 2).map((m) => (
          <PlaceTake key={m.spotId} mention={m} />
        ))}
      </div>

      {otherSources > 0 && (
        <div className="mt-2 flex items-center gap-1.5 border-t border-line pt-[9px] text-[11.5px] font-bold text-accent-ink">
          {t('andOtherSources', { count: otherSources })}
          <ChevronRight className="h-3 w-3" strokeWidth={2.4} />
        </div>
      )}
    </div>
  );
}
