'use client';

import { useTranslations } from 'next-intl';
import { ChevronLeft, Loader2, MapPin, Navigation, Play, Search, Star, X } from 'lucide-react';
import { Avatar, fittedImageUrl, sourceAvatarUrl } from '@/components/wf';
import { cn, linkKind } from '@/lib/utils';
import { useMapStore } from '@/stores/map-store';
import { useUiStore } from '@/stores/ui-store';
import { useFilterStore } from '@/stores/filter-store';
import { usePlaceDetail, useSunreiDetail } from '@/hooks/use-map';
import { useSearch, useTags } from '@/hooks/use-discovery';
import {
  useGooglePlaceAutocomplete,
  useGooglePlaceDetails,
  resolveGooglePlace,
  type GooglePlaceInfo,
} from '@/hooks/use-google-places';
import { useTagLabel } from '@/lib/i18n';
import { ClosedChip, PlaceCard, type SeriesTake } from './place-card';
import type { PlaceCardDTO, PlaceMentionDTO, SourceType, SunreiDTO, TagDTO } from '@/dto';
import { useEffect, useState } from 'react';

/** 장소 상세, 채널, 미리보기 패널 위쪽의 뒤로 버튼이다. */
export function BackPill({ onClick, children }: { onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className="mb-3 inline-flex items-center gap-1 rounded-full border border-primary bg-accent-soft py-[7px] pl-2 pr-3 text-[12.5px] font-extrabold text-accent-ink"
    >
      <ChevronLeft className="h-3.5 w-3.5" strokeWidth={2.4} /> {children}
    </button>
  );
}

/**
 * 지도를 아직 안 부른 영역으로 옮겼을 때 그 영역을 불러오는 버튼이다.
 * 모바일은 하단 시트 높이와 무관하게 보이도록 지역 칩 줄 아래에 두고, 지도를 덮는 펼침 상태에서는 숨긴다.
 */
export function SearchNearbyButton({
  isFetching,
  mobile,
  hidden,
}: {
  isFetching: boolean;
  mobile: boolean;
  hidden?: boolean;
}) {
  const t = useTranslations('list');
  const pendingArea = useMapStore((s) => s.pendingArea);
  const commit = useMapStore((s) => s.commitSearchArea);
  const mode = useMapStore((s) => s.mode);
  const videoPreview = useUiStore((s) => s.videoPreview);
  // source 모드와 미리보기는 화면 영역과 관계없이 장소를 보여 주므로 버튼을 띄우지 않는다.
  if (mode !== 'nearby' || videoPreview || hidden) return null;

  const finding = isFetching && !pendingArea;
  if (!pendingArea && !finding) return null;

  return (
    <div className={cn('absolute left-1/2 z-20 -translate-x-1/2', mobile ? 'top-[108px]' : 'bottom-7')}>
      <button
        onClick={commit}
        disabled={finding}
        className="inline-flex items-center gap-[7px] whitespace-nowrap rounded-full bg-primary px-3.5 py-2 text-[12.5px] font-extrabold text-primary-foreground shadow-[0_4px_12px_oklch(0.66_0.13_264/0.3)] disabled:opacity-90"
      >
        {finding ? (
          <>
            <Loader2 className="h-[13px] w-[13px] animate-spin" /> {t('finding')}
          </>
        ) : (
          <>
            <Search className="h-[13px] w-[13px]" strokeWidth={2.4} /> {t('searchNearby')}
          </>
        )}
      </button>
    </div>
  );
}

export function TagChipRail() {
  const t = useTranslations('nav');
  const tagLabel = useTagLabel();
  const { data: tags = [] } = useTags();
  const activeTagIds = useFilterStore((s) => s.activeTagIds);
  const toggleTag = useFilterStore((s) => s.toggleTag);
  const setFiltersOpen = useUiStore((s) => s.setFiltersOpen);
  if (tags.length === 0) return null;
  return (
    <div className="flex items-center gap-1.5 overflow-x-auto px-4 pt-3">
      <button
        onClick={() => setFiltersOpen(true)}
        className="shrink-0 inline-flex items-center gap-1 text-xs font-bold whitespace-nowrap px-[11px] py-[5px] rounded-full border border-dashed border-primary bg-card text-accent-ink hover:bg-accent-soft"
      >
        ✦ {t('filters')}
      </button>
      {tags.map((tag) => {
        const active = activeTagIds.includes(tag.id);
        return (
          <button
            key={tag.id}
            onClick={() => toggleTag(tag.id)}
            className={
              'shrink-0 rounded-full border px-[11px] py-[5px] text-xs font-semibold transition-colors ' +
              (active
                ? 'bg-primary text-primary-foreground border-primary'
                : 'bg-card border-line text-ink2 hover:bg-accent-soft')
            }
          >
            {tagLabel(tag)}
          </button>
        );
      })}
      {activeTagIds.length > 0 && (
        <button
          onClick={() => useFilterStore.getState().clear()}
          className="shrink-0 px-1 py-1 text-xs font-bold text-ink2 underline underline-offset-[3px]"
        >
          {t('clear')}
        </button>
      )}
    </div>
  );
}

export function UnifiedSearch({ onClose }: { onClose: () => void }) {
  const t = useTranslations('search');
  const nav = useTranslations('nav');
  const typeT = useTranslations('sourceType');
  const q = useUiStore((s) => s.searchQuery);
  const setQ = useUiStore((s) => s.setSearchQuery);
  const [debounced, setDebounced] = useState(q);
  const mapCenter = useMapStore((s) => s.mapCenter);
  const setSourceMode = useMapStore((s) => s.setSourceMode);
  const clearSources = useMapStore((s) => s.clearSources);
  const panTo = useMapStore((s) => s.panTo);
  const setActivePlace = useUiStore((s) => s.setActivePlace);
  const enterPreview = useUiStore((s) => s.enterVideoPreview);
  const setSourceFromSearch = useUiStore((s) => s.setSourceFromSearch);
  const mode = useMapStore((s) => s.mode);

  useEffect(() => {
    const id = setTimeout(() => setDebounced(q), 250);
    return () => clearTimeout(id);
  }, [q]);

  const { data, isFetching } = useSearch(debounced, mapCenter, debounced.length > 0);
  const gPredictions = useGooglePlaceAutocomplete(debounced);

  const selectGooglePlace = async (placeId: string) => {
    const loc = await resolveGooglePlace(placeId);
    if (loc) {
      // 위치를 고르면 source 모드를 풀고 nearby 모드에서 그 지역을 바로 불러온다.
      clearSources();
      panTo(loc, 14, true);
      onClose();
    }
  };

  const total =
    (data?.places.length ?? 0) +
    (data?.sources.length ?? 0) +
    (data?.sunreis.length ?? 0) +
    gPredictions.length;

  return (
    <div className="absolute inset-0 z-50 flex flex-col bg-card">
      {/* 누른 검색 pill이 그대로 입력창이 되도록 같은 모양을 쓰고, 넓은 화면에서는 가운데 640px로 읽기 쉽게 둔다. */}
      <div>
        <div className="mx-auto flex w-full max-w-[640px] items-center gap-2.5 px-[14px] pt-2 lg:px-6 lg:pt-7">
          <label className="flex h-[42px] min-w-0 flex-1 items-center gap-2.5 rounded-full border border-line2 bg-card px-[15px]">
            <Search className="h-[15px] w-[15px] shrink-0 text-ink3" />
            <input
              autoFocus
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder={t('placeholder')}
              className="min-w-0 flex-1 bg-transparent text-[13.5px] font-semibold text-foreground outline-none placeholder:font-normal placeholder:text-ink3"
            />
          </label>
          <button
            type="button"
            onClick={onClose}
            aria-label={nav('back')}
            className="grid h-9 w-9 shrink-0 place-items-center rounded-full text-ink2 hover:bg-bg2"
          >
            <X className="h-[17px] w-[17px]" strokeWidth={2} />
          </button>
        </div>
      </div>
      <div className="mx-auto w-full max-w-[640px] flex-1 overflow-auto px-[14px] pb-4 lg:px-6">
        {isFetching && (
          <div className="mt-[18px] flex justify-center">
            <Loader2 className="h-5 w-5 animate-spin text-ink3" />
          </div>
        )}
        {!isFetching && debounced && (
          <>
            <Section title={t('areas')}>
              {(data?.places ?? []).map((p) => (
                <ResultRow
                  key={p.place.id}
                  icon={<IconCircle><MapPin className="h-3.5 w-3.5" /></IconCircle>}
                  title={p.place.name}
                  sub={p.place.address ?? ''}
                  hint={t('moveMap')}
                  onClick={() => {
                    clearSources();
                    panTo({ lat: p.place.latitude, lng: p.place.longitude }, 14, true);
                    setActivePlace(p.place.id);
                    onClose();
                  }}
                />
              ))}
              {gPredictions.map((g) => (
                <ResultRow
                  key={g.placeId}
                  icon={<IconCircle><MapPin className="h-3.5 w-3.5" /></IconCircle>}
                  title={g.primary}
                  sub={g.secondary}
                  hint={`Google · ${t('moveMap')}`}
                  onClick={() => selectGooglePlace(g.placeId)}
                />
              ))}
            </Section>
            <Section title={t('channels')}>
              {(data?.sources ?? []).map((s) => (
                <ResultRow
                  key={s.id}
                  icon={<Avatar label={s.name} src={sourceAvatarUrl(s, 28)} size={28} />}
                  title={s.name}
                  sub={typeT(s.type)}
                  hint={t('open')}
                  onClick={() => {
                    setSourceMode([s.id]);
                    setSourceFromSearch(true);
                    onClose();
                  }}
                />
              ))}
            </Section>
            <Section title={t('videos')}>
              {(data?.sunreis ?? []).map((s) => (
                <ResultRow
                  key={s.id}
                  icon={<VideoThumb url={s.images?.[0]?.images?.[0]?.url} />}
                  title={s.title}
                  sub={s.sourceName}
                  hint={t('open')}
                  onClick={() => {
                    enterPreview(s.id, mode === 'source' ? 'source' : 'nearby', true);
                    onClose();
                  }}
                />
              ))}
            </Section>
            {total === 0 && (
              <p className="py-14 text-center text-[13.5px] font-bold text-ink3">{t('noResults')}</p>
            )}
          </>
        )}
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  const arr = Array.isArray(children) ? children.flat() : [children];
  if (!arr.filter(Boolean).length) return null;
  return (
    <div className="mt-[18px]">
      <h3 className="mb-0.5 text-[11px] font-extrabold uppercase tracking-wide text-ink3">{title}</h3>
      <div>{children}</div>
    </div>
  );
}

function IconCircle({ children }: { children: React.ReactNode }) {
  return <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-bg2 text-ink2">{children}</span>;
}

/** 영상 결과를 장소나 채널 결과와 바로 구분할 수 있도록 썸네일을 보여 준다. */
function VideoThumb({ url }: { url?: string }) {
  return (
    <span
      className="relative shrink-0 overflow-hidden rounded-md border border-line bg-bg2"
      style={{ width: 56, height: 34 }}
    >
      {url ? (
        <>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={url} alt="" className="h-full w-full object-cover" />
          <span className="absolute inset-0 grid place-items-center">
            <span className="grid h-[18px] w-[18px] place-items-center rounded-full bg-black/50">
              <Play className="h-2 w-2 text-white" fill="currentColor" strokeWidth={0} />
            </span>
          </span>
        </>
      ) : (
        <span className="grid h-full w-full place-items-center text-ink3">
          <Play className="h-3.5 w-3.5" fill="currentColor" strokeWidth={0} />
        </span>
      )}
    </span>
  );
}

function ResultRow({
  title,
  sub,
  hint,
  icon,
  onClick,
}: {
  title: string;
  sub?: string;
  hint?: string;
  icon?: React.ReactNode;
  onClick: () => void;
}) {
  return (
    <button onClick={onClick} className="flex w-full items-center gap-[11px] rounded-md px-0.5 py-[9px] text-left hover:bg-accent-soft">
      {icon}
      <div className="min-w-0 flex-1">
        <div className="truncate text-[13.5px] font-bold">{title}</div>
        {sub && <div className="truncate text-[11.5px] text-ink3">{sub}</div>}
      </div>
      {hint && <span className="shrink-0 text-[11.5px] font-bold text-ink3">{hint}</span>}
    </button>
  );
}

/** PlaceCard는 언급을 두 개까지만 보여 주고, 장소 상세는 이 장소의 모든 언급을 보여 준다. */
export function PlaceDetail({ placeId }: { placeId: string }) {
  const t = useTranslations('detail');
  const tagLabel = useTagLabel();
  const mapCenter = useMapStore((s) => s.mapCenter);
  const setActivePlace = useUiStore((s) => s.setActivePlace);
  const { data, isLoading } = usePlaceDetail(placeId, mapCenter);
  const info = useGooglePlaceDetails(data?.place.googleMapsId ?? null);

  if (isLoading)
    return (
      <div className="grid flex-1 place-items-center py-8">
        <Loader2 className="h-5 w-5 animate-spin text-ink3" />
      </div>
    );
  if (!data) return null;

  const { place, mentions } = data;
  const tag = mentions.flatMap((m) => m.tags)[0];
  const dist = mapCenter
    ? distanceMeters(mapCenter, { lat: place.latitude, lng: place.longitude })
    : null;
  const sourceCount = new Set(mentions.map((m) => m.source.id)).size;
  const mapsView = place.googleMapsId
    ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(place.name)}&query_place_id=${place.googleMapsId}`
    : `https://www.google.com/maps/search/?api=1&query=${place.latitude},${place.longitude}`;
  const mapsDir = `https://www.google.com/maps/dir/?api=1&destination=${place.latitude},${place.longitude}${
    place.googleMapsId ? `&destination_place_id=${place.googleMapsId}` : ''
  }`;

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      <div className="border-b border-line px-4 pb-3.5 pt-2">
        <BackPill onClick={() => setActivePlace(null)}>{t('backToList')}</BackPill>

        <div className="flex items-center gap-2">
          <span className="min-w-0 flex-1 truncate text-[20px] font-extrabold tracking-tight text-foreground">
            {place.name}
          </span>
          {place.isClosed && <ClosedChip label={t('closed')} />}
          {tag && (
            <span className="shrink-0 rounded-full bg-bg2 px-[10px] py-[3px] text-[10.5px] font-bold text-ink2">
              {tagLabel(tag)}
            </span>
          )}
        </div>
        <div className="mt-2 flex items-center gap-2 pl-0.5">
          {dist != null && (
            <>
              <span className="text-[12px] font-extrabold text-accent-ink">{formatDistanceM(dist)}</span>
              <span className="h-[3px] w-[3px] rounded-full bg-line2" />
            </>
          )}
          {place.address && <span className="min-w-0 truncate text-[12px] text-ink2">{place.address}</span>}
        </div>

        <div className="mt-3.5 flex gap-2.5">
          <a
            href={mapsDir}
            target="_blank"
            rel="noreferrer"
            className="flex flex-1 items-center justify-center gap-1.5 rounded-[10px] bg-primary px-3 py-2.5 text-[13px] font-extrabold text-primary-foreground hover:opacity-95"
          >
            <Navigation className="h-[15px] w-[15px]" /> {t('directions')}
          </a>
          <a
            href={mapsView}
            target="_blank"
            rel="noreferrer"
            className="flex flex-1 items-center justify-center gap-1.5 rounded-[10px] border border-line2 bg-card px-3 py-2.5 text-[13px] font-extrabold text-foreground hover:border-ink3"
          >
            {t('viewOnGoogleMaps')}
            <span className="text-ink3">↗</span>
          </a>
        </div>
      </div>

      <div className="flex-1 overflow-auto px-4 pb-4 pt-3.5">
        {info && <GoogleInfoCard info={info} />}

        <div className="mt-4 flex items-baseline gap-2">
          <span className="text-[11px] font-extrabold uppercase tracking-wide text-foreground">
            {t('introducedBy')}
          </span>
          {sourceCount > 0 && (
            <span className="text-[11.5px] font-extrabold text-accent-ink">
              {t('sourceCount', { count: sourceCount })}
            </span>
          )}
        </div>
        <div className="mt-1">
          {mentions.map((m) => (
            <PDMention key={m.spotId} m={m} />
          ))}
        </div>
      </div>
    </div>
  );
}

function TypeBadge({ type }: { type: SourceType }) {
  const typeT = useTranslations('sourceType');
  return (
    <span className="shrink-0 rounded bg-bg2 px-1.5 py-0.5 text-[9.5px] font-extrabold uppercase tracking-wide text-ink3">
      {typeT(type)}
    </span>
  );
}

function PDMention({ m }: { m: PlaceMentionDTO }) {
  const t = useTranslations('detail');
  // spot의 링크(YouTube 타임스탬프나 Instagram 게시물)가 있으면 그곳으로, 없으면 Sunrei 링크로 보낸다.
  const link = m.sourceLink ?? m.sunreiLink;
  const kind = link ? linkKind(link) : null;
  return (
    <div className="border-t border-line py-3">
      <div className="flex items-center gap-2.5">
        <Avatar label={m.source.name} src={sourceAvatarUrl(m.source, 34)} size={34} />
        <div className="min-w-0 flex-1">
          <div className="truncate text-[13px] font-extrabold text-foreground">{m.source.name}</div>
          <div className="mt-0.5 flex items-center gap-1.5">
            <TypeBadge type={m.source.type} />
            <span className="min-w-0 truncate text-[11px] font-semibold text-ink3">{m.sunreiTitle}</span>
          </div>
        </div>
      </div>
      {m.context && <p className="mt-2 text-[12.5px] leading-relaxed text-ink2">{m.context}</p>}
      <MentionImages images={m.images} link={link} wide={kind === 'youtube'} />
      {link && (
        <a
          href={link}
          target="_blank"
          rel="noreferrer"
          className="mt-2.5 inline-flex items-center gap-1.5 rounded-lg border border-line2 bg-card px-2.5 py-1.5 text-[11.5px] font-bold text-foreground hover:border-ink3"
        >
          {kind === 'youtube' ? (
            <>
              <Play className="h-3 w-3 text-primary" fill="currentColor" strokeWidth={0} /> {t('linkYoutube')}
            </>
          ) : kind === 'instagram' ? (
            t('linkInstagram')
          ) : (
            t('linkWeb')
          )}{' '}
          <span className="text-ink3">↗</span>
        </a>
      )}
    </div>
  );
}

/** 언급한 게시물이나 영상의 이미지를 보여 주며, 누르면 그 게시물이나 영상으로 간다. YouTube 썸네일은 16:9로 둔다. */
function MentionImages({ images, link, wide }: { images: PlaceMentionDTO['images']; link?: string | null; wide: boolean }) {
  const shown = images.slice(0, wide ? 1 : 4);
  if (!shown.length) return null;
  const width = wide ? 128 : 72;
  return (
    <div className="mt-2.5 flex gap-1.5 overflow-hidden">
      {shown.map((image, i) => {
        const src = fittedImageUrl(image, width);
        if (!src) return null;
        // eslint-disable-next-line @next/next/no-img-element
        const img = <img src={src} alt="" className="h-[72px] shrink-0 rounded-lg border border-line object-cover" style={{ width }} />;
        return link ? (
          <a key={i} href={link} target="_blank" rel="noreferrer" className="shrink-0">
            {img}
          </a>
        ) : (
          <span key={i} className="shrink-0">
            {img}
          </span>
        );
      })}
    </div>
  );
}

function GoogleInfoCard({ info }: { info: GooglePlaceInfo }) {
  const t = useTranslations('detail');
  const hasHead =
    info.rating != null || info.reviews != null || info.priceLevel != null || info.openNow != null;
  if (!hasHead && info.photos.length === 0) return null;
  const dot = <span className="h-[3px] w-[3px] shrink-0 rounded-full bg-line2" />;
  return (
    <div className="rounded-xl border border-line bg-background p-3">
      <div className="mb-2.5 flex items-center gap-1.5">
        <GoogleGlyph />
        <span className="text-[10.5px] font-extrabold uppercase tracking-wide text-ink2">
          {t('googleInfo')}
        </span>
      </div>
      {hasHead && (
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          {info.rating != null && (
            <span className="inline-flex items-center gap-1 text-[13px] font-extrabold text-foreground">
              {info.rating.toFixed(1)}
              <span className="inline-flex gap-px">
                {[0, 1, 2, 3, 4].map((i) => (
                  <Star
                    key={i}
                    className="h-[11px] w-[11px]"
                    style={{ color: 'var(--star)' }}
                    fill={i < Math.round(info.rating!) ? 'var(--star)' : 'none'}
                    strokeWidth={1}
                  />
                ))}
              </span>
            </span>
          )}
          {info.reviews != null && (
            <span className="text-[11.5px] font-semibold text-ink3">
              {t('reviews', { count: info.reviews })}
            </span>
          )}
          {info.priceLevel ? (
            <>
              {dot}
              <span className="text-[11.5px] font-bold text-ink2">{'₩'.repeat(info.priceLevel)}</span>
            </>
          ) : null}
          {info.openNow != null && (
            <>
              {dot}
              <span
                className="inline-flex items-center gap-1 text-[11.5px] font-bold"
                style={{ color: info.openNow ? 'var(--success)' : 'var(--ink3)' }}
              >
                <span
                  className="h-1.5 w-1.5 rounded-full"
                  style={{ background: info.openNow ? 'var(--success)' : 'var(--ink3)' }}
                />
                {info.openNow ? t('openNow') : t('closedNow')}
              </span>
            </>
          )}
        </div>
      )}
      {info.photos.length > 0 && (
        <div className="mt-2.5 flex gap-1.5 overflow-hidden">
          {info.photos.map((src, i) => (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              key={i}
              src={src}
              alt=""
              className="shrink-0 rounded-lg border border-line object-cover"
              style={{ width: i === 0 ? 96 : 64, height: 62 }}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function GoogleGlyph() {
  return (
    <svg width="13" height="13" viewBox="0 0 48 48" className="shrink-0">
      <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z" />
      <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z" />
      <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z" />
      <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z" />
    </svg>
  );
}

function distanceMeters(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const R = 6371000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
}

function formatDistanceM(m: number) {
  return m < 1000 ? `${Math.round(m)} m` : `${(m / 1000).toFixed(1)} km`;
}

/**
 * Sunrei 미리보기 패널이며, 채널 화면에서 Sunrei를 고르거나 검색에서 영상을 고르면 열린다.
 * 목록은 홈과 같은 PlaceCard를 이 Sunrei의 장소로만 채우고, 지도는 MapView의 previewSpots로 같은 장소를 보여 준다.
 */
export function VideoPreviewPanel() {
  const t = useTranslations('detail');
  const listT = useTranslations('list');
  const sourceT = useTranslations('source');
  const searchT = useTranslations('search');
  const nav = useTranslations('nav');
  const videoPreview = useUiStore((s) => s.videoPreview);
  const exit = useUiStore((s) => s.exitVideoPreview);
  const setActivePlace = useUiStore((s) => s.setActivePlace);
  const { data, isLoading } = useSunreiDetail(videoPreview?.sunreiId ?? null);
  if (!videoPreview) return null;
  const sunrei = data?.sunrei;
  const cards = sunrei ? spotsToSeriesCards(sunrei) : [];
  const backLabel = videoPreview.fromSearch
    ? searchT('back')
    : sourceT('allSeries', { name: sunrei?.source.name ?? '' });

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      <div className="border-b border-line px-4 pb-3.5 pt-2">
        <BackPill onClick={exit}>{backLabel}</BackPill>
        <div className="flex items-center gap-2.5 rounded-xl border border-primary bg-accent-soft px-3 py-2.5">
          <Avatar label={sunrei?.source.name ?? '?'} src={sourceAvatarUrl(sunrei?.source, 26)} size={26} />
          <div className="min-w-0 flex-1">
            <div className="truncate text-[12.5px] font-extrabold text-foreground">{sunrei?.title ?? '…'}</div>
            {sunrei && (
              <div className="text-[11.5px] font-bold text-accent-ink">{t('spotCount', { count: cards.length })}</div>
            )}
          </div>
          <button
            onClick={exit}
            aria-label={nav('clear')}
            className="grid h-[22px] w-[22px] shrink-0 place-items-center rounded-full border border-line2 bg-card text-ink2"
          >
            <X className="h-3 w-3" strokeWidth={2.5} />
          </button>
        </div>
      </div>

      {isLoading || !sunrei ? (
        <div className="grid flex-1 place-items-center py-8">
          <Loader2 className="h-5 w-5 animate-spin text-ink3" />
        </div>
      ) : (
        <div className="flex-1 overflow-auto px-4 pb-2 pt-[15px]">
          <div className="mb-[11px] flex items-baseline gap-2">
            <span className="text-[11px] font-extrabold uppercase tracking-wide text-foreground">{listT('places')}</span>
            <span className="text-[11.5px] font-extrabold text-accent-ink">{cards.length}</span>
            <span className="ml-auto text-[11px] font-semibold text-ink3">{sourceT('seriesPlacesSub')}</span>
          </div>
          <div className="space-y-2.5">
            {cards.map(({ card, takes }) => (
              <PlaceCard
                key={card.place.id}
                card={card}
                seriesTakes={takes}
                onClick={() => setActivePlace(card.place.id)}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * 미리보기 목록에도 PlaceCard를 쓰도록 Sunrei의 spot을 장소별 카드로 묶는다.
 * 한 장소에 spot이 여럿이면 카드 하나에 회차 줄로 넣어, 같은 Source·시리즈 줄이 반복되지 않게 한다.
 */
function spotsToSeriesCards(sunrei: SunreiDTO): { card: PlaceCardDTO; takes: SeriesTake[] }[] {
  const byPlace = new Map<string, SunreiDTO['spots']>();
  for (const s of sunrei.spots) {
    const arr = byPlace.get(s.place.id) ?? [];
    arr.push(s);
    byPlace.set(s.place.id, arr);
  }
  return Array.from(byPlace.values()).map((group) => {
    const tagMap = new Map<string, TagDTO>();
    group.forEach((s) => s.tags.forEach((tag) => tagMap.set(tag.id, tag)));
    const mentions: PlaceMentionDTO[] = group.map((s) => ({
      source: sunrei.source,
      sunreiId: sunrei.id,
      sunreiTitle: sunrei.title,
      spotId: s.id,
      context: s.context,
      sunreiLink: sunrei.link,
      sourceLink: s.sourceLink,
      images: s.images,
      tags: s.tags,
    }));
    const card: PlaceCardDTO = {
      place: group[0].place,
      distanceMeters: group[0].distanceMeters ?? null,
      mentions,
      tags: Array.from(tagMap.values()),
      sourceCount: 1,
      sunreiCount: 1,
      spotCount: group.length,
    };
    const takes = group.map((s) => ({ spotId: s.id, title: s.title, context: s.context }));
    return { card, takes };
  });
}
