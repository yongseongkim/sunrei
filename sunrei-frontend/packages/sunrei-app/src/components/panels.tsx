'use client';

import { useTranslations, useLocale } from 'next-intl';
import { useRouter } from 'next/navigation';
import { ChevronDown, Loader2, MapPin, Search, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { useMapStore } from '@/stores/map-store';
import { useUiStore } from '@/stores/ui-store';
import { useFilterStore } from '@/stores/filter-store';
import { usePlaceDetail, useSunreiDetail, groupSpotsByArea } from '@/hooks/use-map';
import { useSearch, useSources, useTags } from '@/hooks/use-discovery';
import { useGooglePlaceAutocomplete, resolveGooglePlace } from '@/hooks/use-google-places';
import { useTagLabel, LOCALE_COOKIE } from '@/lib/i18n';
import { MentionRow } from './place-card';
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
  if (tags.length === 0) return null;
  return (
    <div className="flex gap-1.5 overflow-x-auto px-3 py-2 border-b border-line bg-background/80 backdrop-blur">
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
  const [q, setQ] = useState('');
  const [debounced, setDebounced] = useState('');
  const mapCenter = useMapStore((s) => s.mapCenter);
  const addSource = useMapStore((s) => s.addSource);
  const panTo = useMapStore((s) => s.panTo);
  const setActivePlace = useUiStore((s) => s.setActivePlace);
  const enterPreview = useUiStore((s) => s.enterVideoPreview);
  const selectedSourceIds = useMapStore((s) => s.selectedSourceIds);
  const removeSource = useMapStore((s) => s.removeSource);
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
      panTo(loc, 14);
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
                  title={p.place.name}
                  sub={p.place.address ?? ''}
                  hint={t('moveMap')}
                  onClick={() => {
                    panTo({ lat: p.place.latitude, lng: p.place.longitude }, 14);
                    setActivePlace(p.place.id);
                    onClose();
                  }}
                />
              ))}
              {gPredictions.map((g) => (
                <ResultRow
                  key={g.placeId}
                  title={g.primary}
                  sub={g.secondary}
                  hint={`Google · ${t('moveMap')}`}
                  onClick={() => selectGooglePlace(g.placeId)}
                />
              ))}
            </Section>
            <Section title={t('channels')}>
              {(data?.sources ?? []).map((s) => {
                const applied = selectedSourceIds.includes(s.id);
                return (
                  <ResultRow
                    key={s.id}
                    title={s.name}
                    sub={s.type}
                    hint={applied ? '✓' : t('addSource')}
                    onClick={() => {
                      if (applied) removeSource(s.id);
                      else addSource(s.id);
                      onClose();
                    }}
                  />
                );
              })}
            </Section>
            <Section title={t('videos')}>
              {(data?.sunreis ?? []).map((s) => (
                <ResultRow
                  key={s.id}
                  title={s.title}
                  sub={s.sourceName}
                  hint={t('open')}
                  onClick={() => {
                    enterPreview(s.id, mode === 'source' ? 'source' : 'nearby');
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

function ResultRow({
  title,
  sub,
  hint,
  onClick,
}: {
  title: string;
  sub?: string;
  hint?: string;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className="w-full text-left p-2 rounded-md hover:bg-accent-soft flex items-center gap-2"
    >
      <div className="min-w-0 flex-1">
        <div className="text-sm font-medium truncate">{title}</div>
        {sub && <div className="text-xs text-ink3 truncate">{sub}</div>}
      </div>
      {hint && <span className="text-xs text-accent-ink shrink-0">{hint}</span>}
    </button>
  );
}

export function PlaceDetail({ placeId }: { placeId: string }) {
  const t = useTranslations('detail');
  const tagLabel = useTagLabel();
  const mapCenter = useMapStore((s) => s.mapCenter);
  const setActivePlace = useUiStore((s) => s.setActivePlace);
  const [expanded, setExpanded] = useState(false);
  const { data, isLoading } = usePlaceDetail(placeId, mapCenter);
  if (isLoading)
    return (
      <div className="grid place-items-center py-8">
        <Loader2 className="h-5 w-5 animate-spin text-ink3" />
      </div>
    );
  if (!data) return null;
  const spots = data.spots ?? [];
  return (
    <div className="space-y-3 p-3">
      <div className="flex items-start justify-between gap-2">
        <div>
          <h2 className="text-lg font-semibold">{data.place.name}</h2>
          {data.place.areaLabel && <p className="text-xs text-ink3">{data.place.areaLabel}</p>}
        </div>
        <button onClick={() => setActivePlace(null)} className="text-ink3">
          <X className="h-4 w-4" />
        </button>
      </div>
      <div className="space-y-1.5">
        {data.mentions.map((m) => (
          <MentionRow key={m.spotId} mention={m} />
        ))}
      </div>

      {/* ExpandSpots (Bd-5): inline accordion of every spot at this place */}
      {spots.length > 0 && (
        <div className="border-t border-line pt-2">
          <button
            onClick={() => setExpanded((v) => !v)}
            className="flex items-center gap-1 text-xs font-medium text-ink2"
          >
            <ChevronDown className={'h-4 w-4 transition-transform ' + (expanded ? 'rotate-180' : '')} />
            {t('spotCount', { count: spots.length })}
          </button>
          {expanded && (
            <div className="mt-2 space-y-1.5">
              {spots.map((s) => (
                <div key={s.id} className="rounded-lg border border-line bg-card p-2.5">
                  <div className="text-sm font-medium">{s.title}</div>
                  {s.context && <p className="text-xs text-ink2 mt-0.5">{s.context}</p>}
                  {s.tags?.length > 0 && (
                    <div className="flex flex-wrap gap-1 mt-1">
                      {s.tags.map((tag) => (
                        <span key={tag.id} className="text-[10px] px-1.5 py-0.5 rounded bg-accent-soft text-accent-ink">
                          {tagLabel(tag)}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/**
 * Video preview itinerary (Bd-6). Map-anchored: the map (via MapView previewSpots) shows
 * this video's spots and fits to them; this panel lists those spots ward-grouped with a
 * banner + ✕. Exit nests back to the active base mode.
 */
export function VideoPreviewPanel() {
  const t = useTranslations('detail');
  const videoPreview = useUiStore((s) => s.videoPreview);
  const exit = useUiStore((s) => s.exitVideoPreview);
  const openVideoDetail = useUiStore((s) => s.openVideoDetail);
  const { data, isLoading } = useSunreiDetail(videoPreview?.sunreiId ?? null);
  if (!videoPreview) return null;
  const groups = groupSpotsByArea(data?.sunrei.spots ?? []);
  let n = 0;
  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between px-3 py-2 border-b border-line bg-accent-soft">
        <div className="min-w-0">
          <div className="text-xs font-medium text-accent-ink">{t('previewing')}</div>
          <div className="text-sm font-semibold truncate">{data?.sunrei.title ?? '…'}</div>
        </div>
        <button onClick={exit} className="text-ink2 flex items-center gap-1 text-sm shrink-0">
          <X className="h-4 w-4" /> {t('backToList')}
        </button>
      </div>
      {isLoading || !data ? (
        <div className="grid place-items-center py-8">
          <Loader2 className="h-5 w-5 animate-spin text-ink3" />
        </div>
      ) : (
        <div className="flex-1 overflow-auto p-3 space-y-3">
          <Button size="sm" variant="ghost" onClick={() => openVideoDetail(data.sunrei.id)}>
            {t('mentions')} →
          </Button>
          {groups.map((g) => (
            <div key={g.area} className="space-y-1.5">
              <div className="flex items-center gap-1 text-xs font-semibold text-ink3 uppercase">
                <MapPin className="h-3.5 w-3.5" /> {g.area}
              </div>
              {g.spots.map((s) => {
                n += 1;
                return (
                  <div key={s.id} className="rounded-lg border border-line bg-card p-2.5 flex gap-2.5">
                    <span className="h-5 w-5 shrink-0 grid place-items-center rounded-full bg-primary text-primary-foreground text-[11px] font-bold">
                      {n}
                    </span>
                    <div className="min-w-0">
                      <div className="text-sm font-medium truncate">{s.title}</div>
                      {s.context && <p className="text-xs text-ink2 line-clamp-2">{s.context}</p>}
                      <div className="text-xs text-ink3">{s.place.name}</div>
                    </div>
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
