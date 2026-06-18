'use client';

import { useTranslations, useLocale } from 'next-intl';
import { useRouter } from 'next/navigation';
import { Loader2, Search, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { useMapStore } from '@/stores/map-store';
import { useUiStore } from '@/stores/ui-store';
import { useFilterStore } from '@/stores/filter-store';
import { usePlaceDetail, useSunreiDetail } from '@/hooks/use-map';
import { useSearch, useSources, useTags } from '@/hooks/use-discovery';
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

export function SearchNearbyButton() {
  const t = useTranslations('list');
  const pendingArea = useMapStore((s) => s.pendingArea);
  const commit = useMapStore((s) => s.commitSearchArea);
  const mode = useMapStore((s) => s.mode);
  if (mode !== 'nearby' || !pendingArea) return null;
  return (
    <div className="absolute left-1/2 -translate-x-1/2 bottom-[calc(40%+12px)] z-20">
      <Button size="sm" onClick={commit} className="shadow-lg">
        <Search className="h-4 w-4" /> {t('searchNearby')}
      </Button>
    </div>
  );
}

export function SourceChips() {
  const selectedSourceIds = useMapStore((s) => s.selectedSourceIds);
  const removeSource = useMapStore((s) => s.removeSource);
  const clearSources = useMapStore((s) => s.clearSources);
  const { data: all = [] } = useSources();
  if (selectedSourceIds.length === 0) return null;
  const name = (id: string) => all.find((s) => s.id === id)?.name ?? id;
  return (
    <div className="flex flex-wrap gap-1.5 items-center px-3 py-2 border-b bg-background/80 backdrop-blur">
      {selectedSourceIds.map((id) => (
        <Badge key={id} variant="default" className="gap-1">
          {name(id)}
          <button onClick={() => removeSource(id)}>
            <X className="h-3 w-3" />
          </button>
        </Badge>
      ))}
      <button
        onClick={clearSources}
        className="text-xs text-muted-foreground hover:text-foreground ml-1"
      >
        Clear all
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
  if (tags.length === 0) return null;
  return (
    <div className="flex gap-1.5 overflow-x-auto px-3 py-2 border-b bg-background/80 backdrop-blur">
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
                : 'bg-card hover:bg-accent')
            }
          >
            {tagLabel(tag)}
          </button>
        );
      })}
      {activeTagIds.length > 0 && (
        <button
          onClick={() => useFilterStore.getState().clear()}
          className="shrink-0 text-xs px-2 py-1 text-muted-foreground"
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
  const mode = useMapStore((s) => s.mode);

  useEffect(() => {
    const id = setTimeout(() => setDebounced(q), 250);
    return () => clearTimeout(id);
  }, [q]);

  const { data, isFetching } = useSearch(debounced, mapCenter, debounced.length > 0);

  return (
    <div className="absolute inset-0 z-40 bg-background/95 flex flex-col">
      <div className="flex gap-2 p-3 border-b">
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
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        )}
        {!isFetching && data && (
          <>
            <Section title={t('areas')}>
              {data.places.map((p) => (
                <ResultRow
                  key={p.place.id}
                  title={p.place.name}
                  sub={p.place.address ?? ''}
                  onClick={() => {
                    panTo({ lat: p.place.latitude, lng: p.place.longitude }, 14);
                    setActivePlace(p.place.id);
                    onClose();
                  }}
                />
              ))}
            </Section>
            <Section title={t('channels')}>
              {data.sources.map((s) => (
                <ResultRow
                  key={s.id}
                  title={s.name}
                  sub={s.type}
                  onClick={() => {
                    addSource(s.id);
                    onClose();
                  }}
                />
              ))}
            </Section>
            <Section title={t('videos')}>
              {data.sunreis.map((s) => (
                <ResultRow
                  key={s.id}
                  title={s.title}
                  sub={s.sourceName}
                  onClick={() => {
                    enterPreview(s.id, mode === 'source' ? 'source' : 'nearby');
                    onClose();
                  }}
                />
              ))}
            </Section>
            {data.places.length + data.sources.length + data.sunreis.length === 0 && (
              <p className="text-sm text-muted-foreground text-center">{t('noResults')}</p>
            )}
          </>
        )}
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  const arr = Array.isArray(children) ? children : [children];
  if (!arr.filter(Boolean).length) return null;
  return (
    <div>
      <h3 className="text-xs font-semibold text-muted-foreground uppercase mb-1.5">{title}</h3>
      <div className="space-y-1">{children}</div>
    </div>
  );
}

function ResultRow({ title, sub, onClick }: { title: string; sub?: string; onClick: () => void }) {
  return (
    <button onClick={onClick} className="w-full text-left p-2 rounded-md hover:bg-accent">
      <div className="text-sm font-medium truncate">{title}</div>
      {sub && <div className="text-xs text-muted-foreground truncate">{sub}</div>}
    </button>
  );
}

export function PlaceDetail({ placeId }: { placeId: string }) {
  const mapCenter = useMapStore((s) => s.mapCenter);
  const setActivePlace = useUiStore((s) => s.setActivePlace);
  const { data, isLoading } = usePlaceDetail(placeId, mapCenter);
  if (isLoading)
    return (
      <div className="grid place-items-center py-8">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  if (!data) return null;
  return (
    <div className="space-y-3 p-3">
      <div className="flex items-start justify-between gap-2">
        <div>
          <h2 className="text-lg font-semibold">{data.place.name}</h2>
          {data.place.areaLabel && (
            <p className="text-xs text-muted-foreground">{data.place.areaLabel}</p>
          )}
        </div>
        <button onClick={() => setActivePlace(null)} className="text-muted-foreground">
          <X className="h-4 w-4" />
        </button>
      </div>
      <div className="space-y-1.5">
        {data.mentions.map((m) => (
          <MentionRow key={m.spotId} mention={m} />
        ))}
      </div>
    </div>
  );
}

export function VideoPreview() {
  const t = useTranslations('detail');
  const videoPreview = useUiStore((s) => s.videoPreview);
  const exit = useUiStore((s) => s.exitVideoPreview);
  const { data, isLoading } = useSunreiDetail(videoPreview?.sunreiId ?? null);
  if (!videoPreview) return null;
  return (
    <div className="absolute inset-0 z-40 bg-background flex flex-col">
      <div className="flex items-center justify-between p-3 border-b">
        <div className="text-sm font-medium">{t('previewing')}</div>
        <button onClick={exit} className="text-muted-foreground flex items-center gap-1 text-sm">
          <X className="h-4 w-4" /> {t('backToList')}
        </button>
      </div>
      {isLoading || !data ? (
        <div className="grid place-items-center py-8">
          <Loader2 className="h-5 w-5 animate-spin" />
        </div>
      ) : (
        <div className="flex-1 overflow-auto p-3 space-y-2">
          <h2 className="text-lg font-semibold">{data.sunrei.title}</h2>
          {data.sunrei.summary && <p className="text-sm">{data.sunrei.summary}</p>}
          {data.sunrei.spots.map((s) => (
            <div key={s.id} className="rounded-lg border p-2.5">
              <div className="font-medium text-sm">{s.title}</div>
              {s.context && <p className="text-xs text-muted-foreground mt-0.5">{s.context}</p>}
              <div className="text-xs text-muted-foreground mt-0.5">{s.place.name}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
