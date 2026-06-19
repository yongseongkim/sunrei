'use client';

import { useTranslations } from 'next-intl';
import { ExternalLink, Loader2, MapPin, X } from 'lucide-react';
import { useMemo } from 'react';
import { Button } from '@/components/ui/button';
import { useMapStore } from '@/stores/map-store';
import { useUiStore } from '@/stores/ui-store';
import { useSourceDetail, useSunreiDetail } from '@/hooks/use-map';
import { useTagLabel, tagColor } from '@/lib/i18n';
import type { SourceDTO, SunreiSpotDTO } from '@/dto';

/** Compact "Watch on YouTube ↗" / "Where to watch ↗" link, label by source type (Bg-1). */
export function LinkOutButton({ source }: { source: SourceDTO }) {
  const t = useTranslations('source');
  if (!source.externalUrl) return null;
  const isYouTube = source.type === 'YOUTUBE';
  return (
    <Button asChild size="sm" variant={isYouTube ? 'default' : 'outline'}>
      <a href={source.externalUrl} target="_blank" rel="noreferrer">
        <ExternalLink className="h-4 w-4" />
        {isYouTube ? t('watchOnYoutube') : t('whereToWatch')}
      </a>
    </Button>
  );
}

function OverlayShell({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className="absolute inset-0 z-40 bg-background flex flex-col">
      <div className="flex items-center justify-between p-3 border-b border-line">
        <div className="text-sm font-semibold truncate">{title}</div>
        <button onClick={onClose} className="text-ink3 hover:text-foreground">
          <X className="h-4 w-4" />
        </button>
      </div>
      <div className="flex-1 overflow-auto">{children}</div>
    </div>
  );
}

function poster(source: SourceDTO): string | undefined {
  return source.posterImage?.images?.[0]?.url ?? undefined;
}

/**
 * Source surface (Bg-1/2/3). YouTube → intro + "videos near you" + Watch-out CTA;
 * Anime/TV/Other → managed work page (poster, EN/KO title, synopsis, its spots,
 * optional secondary "Where to watch ↗").
 */
export function SourceDetail() {
  const t = useTranslations('source');
  const td = useTranslations('detail');
  const id = useUiStore((s) => s.sourceDetailId);
  const close = useUiStore((s) => s.closeSourceDetail);
  const openVideoDetail = useUiStore((s) => s.openVideoDetail);
  const mapCenter = useMapStore((s) => s.mapCenter);
  const { data, isLoading } = useSourceDetail(id, mapCenter);

  if (!id) return null;
  const source = data?.source;
  const managed = source ? source.type !== 'YOUTUBE' : false;

  return (
    <OverlayShell title={source?.name ?? '…'} onClose={close}>
      {isLoading || !data || !source ? (
        <div className="grid place-items-center py-10">
          <Loader2 className="h-5 w-5 animate-spin text-ink3" />
        </div>
      ) : (
        <div className="space-y-4 p-3">
          {poster(source) && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={poster(source)}
              alt=""
              className="w-full max-h-56 object-cover rounded-xl border border-line"
            />
          )}
          <div className="space-y-1">
            <h1 className="text-lg font-semibold">{source.nameEn || source.name}</h1>
            {source.nameKo && source.nameKo !== source.name && (
              <p className="text-sm text-ink2">{source.nameKo}</p>
            )}
            {managed && source.synopsis && (
              <p className="text-sm text-ink2 whitespace-pre-line pt-1">{source.synopsis}</p>
            )}
          </div>

          <LinkOutButton source={source} />

          {/* YouTube → "videos near you"; managed → "spots" from this work */}
          <div className="space-y-1.5">
            <h2 className="text-xs font-semibold uppercase text-ink3">
              {managed ? t('spots') : t('videosNearYou')}
            </h2>
            {data.sunreis.map((s) => (
              <button
                key={s.id}
                onClick={() => openVideoDetail(s.id)}
                className="w-full text-left rounded-lg border border-line bg-card hover:bg-accent-soft transition-colors p-2.5"
              >
                <div className="text-sm font-medium truncate">{s.title}</div>
                {s.summary && <div className="text-xs text-ink3 line-clamp-2">{s.summary}</div>}
                <div className="text-xs text-ink3 mt-0.5">
                  {td('spotCount', { count: s.spotCount })}
                </div>
              </button>
            ))}
          </div>
        </div>
      )}
    </OverlayShell>
  );
}

/**
 * Tag-grouped video summary (Bg-4): summary intro, then spots grouped by tag with a
 * per-group "see on map ›" and an optional in-video tag-chip filter (client-side over
 * GetSunreiResult.spots[].tags). Tag colors come from a fixed brand palette by tag id.
 */
export function VideoDetail() {
  const t = useTranslations('detail');
  const id = useUiStore((s) => s.videoDetailId);
  const close = useUiStore((s) => s.closeVideoDetail);
  const enterPreview = useUiStore((s) => s.enterVideoPreview);
  const mode = useMapStore((s) => s.mode);
  const tagLabel = useTagLabel();
  const { data, isLoading } = useSunreiDetail(id);

  const groups = useMemo(() => {
    const spots = data?.sunrei.spots ?? [];
    const byTag = new Map<string, { label: string; color: string; spots: SunreiSpotDTO[] }>();
    const untagged: SunreiSpotDTO[] = [];
    for (const s of spots) {
      if (!s.tags?.length) {
        untagged.push(s);
        continue;
      }
      for (const tag of s.tags) {
        if (!byTag.has(tag.id))
          byTag.set(tag.id, { label: tagLabel(tag), color: tagColor(tag.id), spots: [] });
        byTag.get(tag.id)!.spots.push(s);
      }
    }
    const arr = Array.from(byTag.values());
    if (untagged.length) arr.push({ label: '—', color: 'var(--ink3)', spots: untagged });
    return arr;
  }, [data, tagLabel]);

  if (!id) return null;

  return (
    <OverlayShell title={data?.sunrei.title ?? '…'} onClose={close}>
      {isLoading || !data ? (
        <div className="grid place-items-center py-10">
          <Loader2 className="h-5 w-5 animate-spin text-ink3" />
        </div>
      ) : (
        <div className="space-y-4 p-3">
          {data.sunrei.summary && <p className="text-sm text-ink2">{data.sunrei.summary}</p>}
          <Button
            size="sm"
            variant="outline"
            onClick={() => enterPreview(data.sunrei.id, mode === 'source' ? 'source' : 'nearby')}
          >
            <MapPin className="h-4 w-4" /> {t('seeOnMap')}
          </Button>

          {groups.map((g, i) => (
            <div key={i} className="space-y-1.5">
              <div className="flex items-center gap-1.5">
                <span className="h-2.5 w-2.5 rounded-full" style={{ background: g.color }} />
                <h2 className="text-xs font-semibold uppercase tracking-wide">{g.label}</h2>
              </div>
              {g.spots.map((s) => (
                <div key={s.id} className="rounded-lg border border-line bg-card p-2.5">
                  <div className="text-sm font-medium">{s.title}</div>
                  {s.context && <p className="text-xs text-ink2 mt-0.5">{s.context}</p>}
                  <div className="text-xs text-ink3 mt-0.5">{s.place.name}</div>
                </div>
              ))}
            </div>
          ))}
        </div>
      )}
    </OverlayShell>
  );
}
