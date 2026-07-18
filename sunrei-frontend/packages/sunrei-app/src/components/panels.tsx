'use client';

import { useTranslations, useLocale } from 'next-intl';
import { useRouter } from 'next/navigation';
import { Check, ChevronLeft, Loader2, MapPin, Navigation, Play, Search, Star, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Avatar, sourceAvatarUrl } from '@/components/wf';
import { cn } from '@/lib/utils';
import { useMapStore } from '@/stores/map-store';
import { useUiStore } from '@/stores/ui-store';
import { useFilterStore } from '@/stores/filter-store';
import { usePlaceDetail, useSunreiDetail } from '@/hooks/use-map';
import { useSearch, useSources, useTags } from '@/hooks/use-discovery';
import {
  useGooglePlaceAutocomplete,
  useGooglePlaceDetails,
  resolveGooglePlace,
  type GooglePlaceInfo,
} from '@/hooks/use-google-places';
import { useTagLabel, LOCALE_COOKIE } from '@/lib/i18n';
import { PlaceCard } from './place-card';
import type { PlaceCardDTO, PlaceMentionDTO, SourceType, SunreiDTO, TagDTO } from '@/dto';
import { useEffect, useState } from 'react';

export function LocaleToggle() {
  const t = useTranslations('locale');
  const router = useRouter();
  const locale = useLocale();
  const next = locale === 'en' ? 'ko' : 'en';
  return (
    <Button
      variant="outline"
      size="sm"
      onClick={() => {
        document.cookie = `${LOCALE_COOKIE}=${next};path=/;max-age=31536000`;
        router.refresh();
      }}
    >
      {t('toggle')}
    </Button>
  );
}

/** "Search nearby" → "Finding spots…" → reload (nearby mode only, Bd-3). */
export function SearchNearbyButton({ isFetching }: { isFetching: boolean }) {
  const t = useTranslations('list');
  const pendingArea = useMapStore((s) => s.pendingArea);
  const commit = useMapStore((s) => s.commitSearchArea);
  const mode = useMapStore((s) => s.mode);
  const videoPreview = useUiStore((s) => s.videoPreview);
  // Suppressed in source mode and during video preview (Bd-6 / Be-6).
  if (mode !== 'nearby' || videoPreview) return null;

  const finding = isFetching && !pendingArea;
  if (!pendingArea && !finding) return null;

  return (
    <div className="absolute left-1/2 -translate-x-1/2 bottom-[calc(40%+12px)] z-20 sm:bottom-6">
      <Button size="sm" onClick={commit} disabled={finding} className="shadow-lg">
        {finding ? (
          <>
            <Loader2 className="h-4 w-4 animate-spin" /> {t('finding')}
          </>
        ) : (
          <>
            <Search className="h-4 w-4" /> {t('searchNearby')}
          </>
        )}
      </Button>
    </div>
  );
}

export function SourceChips() {
  const t = useTranslations('source');
  const nav = useTranslations('nav');
  const selectedSourceIds = useMapStore((s) => s.selectedSourceIds);
  const removeSource = useMapStore((s) => s.removeSource);
  const addSource = useMapStore((s) => s.addSource);
  const clearSources = useMapStore((s) => s.clearSources);
  const { data: all = [] } = useSources();
  const [undo, setUndo] = useState<{ id: string; name: string } | null>(null);

  const name = (id: string) => all.find((s) => s.id === id)?.name ?? id;
  const handleRemove = (id: string) => {
    setUndo({ id, name: name(id) });
    removeSource(id);
    setTimeout(() => setUndo((u) => (u?.id === id ? null : u)), 4000);
  };

  if (selectedSourceIds.length === 0 && !undo) return null;
  return (
    <>
      {selectedSourceIds.length > 0 && (
        <div className="flex flex-wrap gap-1.5 items-center px-3 py-2 border-b border-line bg-background/80 backdrop-blur">
          {selectedSourceIds.map((id) => (
            <Badge key={id} variant="default" className="gap-1">
              {name(id)}
              <button onClick={() => handleRemove(id)} aria-label={t('clearSource')}>
                <X className="h-3 w-3" />
              </button>
            </Badge>
          ))}
          <button onClick={clearSources} className="text-xs text-ink3 hover:text-foreground ml-1">
            {nav('clear')}
          </button>
        </div>
      )}
      {undo && (
        <div className="absolute left-1/2 -translate-x-1/2 bottom-6 z-40 flex items-center gap-3 rounded-full bg-foreground text-background px-4 py-2 text-[13px] shadow-lg">
          <span>{t('removed', { name: undo.name })}</span>
          <button
            onClick={() => {
              addSource(undo.id);
              setUndo(null);
            }}
            className="font-bold underline"
          >
            {t('undo')}
          </button>
        </div>
      )}
    </>
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
    <div className="flex gap-1.5 overflow-x-auto px-4 py-2 border-b border-line bg-background/80 backdrop-blur">
      {/* Entry point to the full filters sheet (both desktop sidebar and mobile sheet). */}
      <button
        onClick={() => setFiltersOpen(true)}
        className="shrink-0 inline-flex items-center gap-1 text-xs font-bold whitespace-nowrap px-2.5 py-1 rounded-full border border-dashed border-line2 bg-card text-ink2 hover:bg-accent-soft"
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
              'shrink-0 text-xs px-2.5 py-1 rounded-full border transition-colors ' +
              (active
                ? 'bg-primary text-primary-foreground border-primary'
                : 'bg-card border-line hover:bg-accent-soft')
            }
          >
            {tagLabel(tag)}
          </button>
        );
      })}
      {activeTagIds.length > 0 && (
        <button
          onClick={() => useFilterStore.getState().clear()}
          className="shrink-0 text-xs px-2 py-1 text-ink3"
        >
          {t('clear')}
        </button>
      )}
    </div>
  );
}

export function UnifiedSearch({ onClose }: { onClose: () => void }) {
  const t = useTranslations('search');
  // Query is stored (not local) so it survives previewing a video and coming back.
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
  // External Google Places results, merged into the Areas & places group (Be-2/Be-3).
  const gPredictions = useGooglePlaceAutocomplete(debounced);

  const selectGooglePlace = async (placeId: string) => {
    const loc = await resolveGooglePlace(placeId);
    if (loc) {
      // A location pick is a Nearby jump: drop any source scope and load the new area.
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
    <div className="absolute inset-0 z-50 bg-background flex flex-col">
      <div className="flex gap-2 p-3 border-b border-line">
        <Input
          autoFocus
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder={t('placeholder')}
        />
        <Button variant="ghost" size="icon" onClick={onClose}>
          <X className="h-4 w-4" />
        </Button>
      </div>
      <div className="flex-1 overflow-auto p-3 space-y-4">
        {isFetching && (
          <div className="flex justify-center">
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
                  sub={s.type}
                  hint={t('open')}
                  onClick={() => {
                    // Open the channel view (wireframe §4): single-source scope + sunrei list.
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
              <p className="text-sm text-ink3 text-center">{t('noResults')}</p>
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
    <div>
      <h3 className="text-xs font-semibold text-ink3 uppercase mb-1.5">{title}</h3>
      <div className="space-y-1">{children}</div>
    </div>
  );
}

/** 28px result-type glyph holder: circle for places, rounded square for videos. */
function IconCircle({ children, square }: { children: React.ReactNode; square?: boolean }) {
  return (
    <span
      className={cn(
        'shrink-0 grid place-items-center h-7 w-7 bg-bg2 text-ink2',
        square ? 'rounded-[7px]' : 'rounded-full'
      )}
    >
      {children}
    </span>
  );
}

/**
 * Video result thumbnail (16:9-ish) for the "Videos" search group — a real image
 * makes video rows unmistakable next to the pin-icon place rows and avatar channel
 * rows. Falls back to a play glyph on the greige placeholder when a video has no image.
 */
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
  selected,
  onClick,
}: {
  title: string;
  sub?: string;
  hint?: string;
  icon?: React.ReactNode;
  selected?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        'w-full text-left p-2 rounded-md flex items-center gap-2.5',
        selected ? 'bg-accent-soft' : 'hover:bg-accent-soft'
      )}
    >
      {icon}
      <div className="min-w-0 flex-1">
        <div className="text-sm font-medium truncate">{title}</div>
        {sub && <div className="text-xs text-ink3 truncate">{sub}</div>}
      </div>
      {hint &&
        (selected ? (
          <span className="shrink-0 inline-flex items-center gap-1 text-[10.5px] font-extrabold tracking-wide text-accent-ink whitespace-nowrap">
            <span className="grid place-items-center h-4 w-4 rounded-full bg-primary text-primary-foreground">
              <Check className="h-2.5 w-2.5" strokeWidth={3} />
            </span>
            {hint}
          </span>
        ) : (
          <span className="text-xs shrink-0 text-accent-ink">{hint}</span>
        ))}
    </button>
  );
}

/**
 * Place (spot) detail — wireframe §1b. Opened by tapping a marker or a PlaceCard.
 * The Home card folds mentions to 2 + "N more"; this expands EVERY source that
 * featured this place. Header (pin · name · tag · distance · address) + actions
 * (directions / Google Maps) stay pinned; the body scrolls: a Google-info card
 * (live rating/reviews/price/hours/photos, distinct from Sunrei) then every
 * source's take with a YouTube deep link.
 */
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
      {/* Pinned header: back · name/tag/distance/address · actions */}
      <div className="border-b border-line px-4 pb-3.5 pt-2">
        <button
          onClick={() => setActivePlace(null)}
          className="mb-3 inline-flex items-center gap-1 rounded-full border border-primary bg-accent-soft px-3 py-[7px] text-[12.5px] font-extrabold text-accent-ink"
        >
          <ChevronLeft className="h-3.5 w-3.5" strokeWidth={2.4} /> {t('backToList')}
        </button>

        <div className="flex items-center gap-2">
          <span className="min-w-0 flex-1 truncate text-[20px] font-extrabold tracking-tight text-foreground">
            {place.name}
          </span>
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
            <MapPin className="h-[15px] w-[15px] text-ink2" /> {t('viewOnGoogleMaps')}{' '}
            <span className="text-ink3">↗</span>
          </a>
        </div>
      </div>

      {/* Scrolling body: Google info card + every source's take */}
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

const SRC_TYPE_LABEL: Record<SourceType, string> = {
  YOUTUBE: 'YouTube',
  TV: 'TV',
  ANIME: 'Anime',
  OTHER: 'Other',
};

function TypeBadge({ type }: { type: SourceType }) {
  return (
    <span className="shrink-0 rounded bg-bg2 px-1.5 py-0.5 text-[9.5px] font-extrabold uppercase tracking-wide text-ink3">
      {SRC_TYPE_LABEL[type] ?? type}
    </span>
  );
}

/** One fully-expanded source take: avatar · channel · type · series · take · YouTube ↗. */
function PDMention({ m }: { m: PlaceMentionDTO }) {
  const yt = m.youtubeLink ?? m.sunreiLink;
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
      {yt && (
        <a
          href={yt}
          target="_blank"
          rel="noreferrer"
          className="mt-2.5 inline-flex items-center gap-1.5 rounded-lg border border-line2 bg-card px-2.5 py-1.5 text-[11.5px] font-bold text-foreground hover:border-ink3"
        >
          <Play className="h-3 w-3 text-primary" fill="currentColor" strokeWidth={0} /> YouTube{' '}
          <span className="text-ink3">↗</span>
        </a>
      )}
    </div>
  );
}

/** Google's own info for the place — rating/reviews/price/open-now/photos (not Sunrei). */
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
        <span className="text-[10.5px] font-extrabold uppercase tracking-wide text-ink3">
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
                    style={{ color: '#f5a623' }}
                    fill={i < Math.round(info.rating!) ? '#f5a623' : 'none'}
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
                style={{ color: info.openNow ? 'oklch(0.60 0.12 150)' : 'var(--ink3)' }}
              >
                <span
                  className="h-1.5 w-1.5 rounded-full"
                  style={{ background: info.openNow ? 'oklch(0.60 0.12 150)' : 'var(--ink3)' }}
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

/** 4-color Google "G" glyph. */
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
 * Series (Sunrei) view — wireframe §4 "일본 시리즈". Opened by picking a series in the
 * channel view (or a video in search). Place-first: a series scope chip (channel ·
 * series · N places, ✕ to exit) over the SAME PlaceCards as Home, scoped to this
 * series, while the map (via MapView previewSpots) flies to and shows the series'
 * places. Tapping a card opens that place's detail, which nests over this panel and
 * backs out to it.
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
  const cards = sunrei ? spotsToPlaceCards(sunrei) : [];
  const backLabel = videoPreview.fromSearch
    ? searchT('back')
    : sourceT('allSeries', { name: sunrei?.source.name ?? '' });

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      {/* Back + series scope chip */}
      <div className="border-b border-line px-4 pb-3.5 pt-2">
        <button onClick={exit} className="mb-2.5 flex items-center gap-0.5 text-ink2 hover:text-foreground">
          <ChevronLeft className="h-[18px] w-[18px]" />
          <span className="text-[13px] font-semibold">{backLabel}</span>
        </button>
        <div className="flex items-center gap-2.5 rounded-[10px] border border-primary bg-accent-soft px-2.5 py-2">
          <Avatar label={sunrei?.source.name ?? '?'} src={sourceAvatarUrl(sunrei?.source, 26)} size={26} />
          <div className="min-w-0 flex-1">
            <div className="truncate text-[12.5px] font-extrabold text-foreground">{sunrei?.title ?? '…'}</div>
            {sunrei && (
              <div className="text-[10.5px] font-bold text-accent-ink">{t('spotCount', { count: cards.length })}</div>
            )}
          </div>
          <button
            onClick={exit}
            aria-label={nav('clear')}
            className="grid h-[22px] w-[22px] shrink-0 place-items-center rounded-full border border-primary bg-card text-accent-ink"
          >
            <X className="h-3 w-3" strokeWidth={2.5} />
          </button>
        </div>
      </div>

      {/* Place-first list — this series' places */}
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
            {cards.map((c) => (
              <PlaceCard key={c.place.id} card={c} onClick={() => setActivePlace(c.place.id)} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

/** Group a series' spots into per-place cards (reuses the Home PlaceCard). */
function spotsToPlaceCards(sunrei: SunreiDTO): PlaceCardDTO[] {
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
      youtubeLink: s.youtubeLink,
      images: s.images,
      tags: s.tags,
    }));
    return {
      place: group[0].place,
      distanceMeters: group[0].distanceMeters ?? null,
      mentions,
      tags: Array.from(tagMap.values()),
      sourceCount: 1,
      sunreiCount: 1,
      spotCount: group.length,
    };
  });
}
