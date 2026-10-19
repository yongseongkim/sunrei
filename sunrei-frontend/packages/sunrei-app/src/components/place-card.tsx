'use client';

import { PlaceCardDTO, PlaceMentionDTO } from '@/dto';
import { useTranslations } from 'next-intl';
import { ChevronRight } from 'lucide-react';
import { Avatar, sourceAvatarUrl } from '@/components/wf';
import { useTagLabel } from '@/lib/i18n';
import { cn } from '@/lib/utils';

function formatDistance(m?: number | null) {
  if (m == null) return '';
  if (m < 1000) return `${Math.round(m)} m`;
  return `${(m / 1000).toFixed(1)} km`;
}

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

/** Source 하나가 이 장소를 어떻게 소개했는지 보여 주는 줄이다. */
function PlaceTake({ mention }: { mention: PlaceMentionDTO }) {
  return (
    <div className="flex items-start gap-[9px] border-t border-line py-2">
      <Avatar label={mention.source.name} src={sourceAvatarUrl(mention.source, 22)} size={22} />
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

/** 미리보기에서 한 시리즈 안의 spot 하나다. 배너가 Source와 시리즈를 이미 보여 주므로 회차 제목과 맥락만 쓴다. */
export type SeriesTake = { spotId: string; title?: string | null; context?: string | null };

function SeriesTakeRow({ take }: { take: SeriesTake }) {
  return (
    <div className="border-t border-line py-2">
      {take.title && <div className="truncate text-[11.5px] font-extrabold text-foreground">{take.title}</div>}
      {take.context && (
        <div className="mt-[3px] text-[12px] leading-relaxed text-ink2 line-clamp-2">{take.context}</div>
      )}
    </div>
  );
}

export function PlaceCard({
  card,
  seriesTakes,
  onClick,
}: {
  card: PlaceCardDTO;
  /** 있으면 미리보기 카드로 그려, 언급 대신 이 시리즈의 spot을 보여 준다. */
  seriesTakes?: SeriesTake[];
  onClick?: () => void;
}) {
  const t = useTranslations('list');
  const tagLabel = useTagLabel();
  const mentions = card.mentions ?? [];
  const tag = card.tags?.[0];

  // 보여 준 두 언급에 없는 Source만 "외 소스 N개"로 센다.
  const shownIds = new Set(mentions.slice(0, 2).map((m) => m.source.id));
  const otherSources = new Set(
    mentions.slice(2).map((m) => m.source.id).filter((id) => !shownIds.has(id))
  ).size;

  const eyebrow = seriesTakes
    ? t('inSeries', { count: seriesTakes.length })
    : card.sourceCount > 1
      ? t('featuredBySources', { count: card.sourceCount })
      : t('featuredTimes', { count: mentions.length });

  return (
    <div
      onClick={onClick}
      className="cursor-pointer rounded-xl border border-line bg-card px-[13px] py-[11px] transition-colors hover:border-ink3/40"
    >
      <div className="flex items-center gap-2">
        <span className="flex-1 min-w-0 truncate text-[14px] font-extrabold text-foreground">
          {card.place.name}
        </span>
        {card.place.isClosed && <ClosedChip label={t('closed')} />}
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

      {mentions.length > 0 && (
        <div className="mt-[9px] text-[10px] font-extrabold uppercase tracking-wide text-accent-ink">
          {eyebrow}
        </div>
      )}

      <div>
        {seriesTakes
          ? seriesTakes.map((take) => <SeriesTakeRow key={take.spotId} take={take} />)
          : mentions.slice(0, 2).map((m) => <PlaceTake key={m.spotId} mention={m} />)}
      </div>

      {!seriesTakes && otherSources > 0 && (
        <div className="mt-2 flex items-center gap-1.5 border-t border-line pt-[9px] text-[11.5px] font-bold text-accent-ink">
          {t('andOtherSources', { count: otherSources })}
          <ChevronRight className="h-3 w-3" strokeWidth={2.4} />
        </div>
      )}
    </div>
  );
}

/** 폐업한 장소도 방송 기록이라 지도에 남기고, 찾아가기 전에 알 수 있게 표시한다. */
export function ClosedChip({ label }: { label: string }) {
  return (
    <span className="shrink-0 rounded-full border border-line2 px-[9px] py-0.5 text-[10.5px] font-extrabold text-ink3">
      {label}
    </span>
  );
}
