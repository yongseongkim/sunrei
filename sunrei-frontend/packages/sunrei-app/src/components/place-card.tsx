'use client';

import { PlaceCardDTO, PlaceMentionDTO } from '@/dto';
import { useTagLabel } from '@/lib/i18n';
import { useUiStore } from '@/stores/ui-store';
import { useMapStore } from '@/stores/map-store';
import { MapPin, Play } from 'lucide-react';
import { cn } from '@/lib/utils';

export function MentionRow({ mention }: { mention: PlaceMentionDTO }) {
  const tagLabel = useTagLabel();
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
      className="w-full text-left rounded-lg border border-line bg-card hover:bg-accent-soft transition-colors p-2.5 flex gap-2.5 cursor-pointer"
    >
      {mention.images?.[0]?.images?.[0]?.url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={mention.images[0].images[0].url}
          alt=""
          className="h-12 w-16 rounded-md object-cover shrink-0"
        />
      ) : (
        <div className="h-12 w-16 rounded-md bg-muted shrink-0" />
      )}
      <div className="min-w-0 flex-1">
        <div className="text-sm font-medium truncate">{mention.sunreiTitle}</div>
        <div className="text-xs text-muted-foreground truncate">
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              openSourceDetail(mention.source.id);
            }}
            className="hover:text-foreground hover:underline"
          >
            {mention.source.name}
          </button>
          {mention.context ? ` · ${mention.context}` : ''}
        </div>
        {mention.tags?.length > 0 && (
          <div className="flex flex-wrap gap-1 mt-1">
            {mention.tags.slice(0, 4).map((t) => (
              <span key={t.id} className="text-[10px] px-1.5 py-0.5 rounded bg-muted">
                {tagLabel(t)}
              </span>
            ))}
          </div>
        )}
      </div>
      <Play className="h-4 w-4 text-muted-foreground shrink-0 self-center" />
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
  const t = useTranslationsShim();
  const mentions = card.mentions ?? [];
  const compact = mentions.length <= 1;

  return (
    <div
      onClick={onClick}
      className={cn(
        'rounded-xl border bg-card p-3 cursor-pointer transition-opacity',
        active ? 'ring-2 ring-primary' : 'hover:border-foreground/20',
        dimmed && 'opacity-40'
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="flex items-center gap-1 font-semibold truncate">
            <MapPin className="h-3.5 w-3.5 shrink-0" />
            <span className="truncate">{card.place.name}</span>
          </div>
          {card.place.areaLabel && (
            <div className="text-xs text-muted-foreground truncate">{card.place.areaLabel}</div>
          )}
        </div>
        {card.distanceMeters != null && (
          <span className="text-xs text-muted-foreground shrink-0">
            {formatDistance(card.distanceMeters)}
          </span>
        )}
      </div>

      {mentions.length >= 2 && (
        <div className="text-xs font-medium text-primary mt-1.5">
          {t('list.inVideos', { count: mentions.length })}
        </div>
      )}

      <div className={cn('mt-2 space-y-1.5', compact ? '' : 'max-h-40 overflow-auto')}>
        {mentions.slice(0, compact ? 1 : 4).map((m) => (
          <MentionRow key={m.spotId} mention={m} />
        ))}
      </div>
    </div>
  );
}

function formatDistance(m: number) {
  if (m < 1000) return `${Math.round(m)} m`;
  return `${(m / 1000).toFixed(1)} km`;
}

// Lightweight useTranslations wrapper to avoid prop-drilling locale.
import { useTranslations } from 'next-intl';
function useTranslationsShim() {
  return useTranslations();
}
