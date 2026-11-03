'use client';

import { useMemo, useState } from 'react';
import { ImageOff } from 'lucide-react';
import type { SunreiDTO } from '@/api/admin';
import { sunreiThumbnailCandidates } from '@/lib/sunrei-thumbnails';

export function SunreiThumbnail({ sunrei }: { sunrei: SunreiDTO }) {
  const candidates = useMemo(() => sunreiThumbnailCandidates(sunrei), [sunrei]);
  const [failed, setFailed] = useState<string[]>([]);
  const url = candidates.find(candidate => !failed.includes(candidate));

  return (
    <div className="flex h-[54px] w-24 shrink-0 items-center justify-center overflow-hidden rounded-md border bg-muted">
      {url ? (
        // These thumbnails include external YouTube images and uploaded images of several sizes.
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={url}
          alt={`${sunrei.title} thumbnail`}
          className="h-full w-full object-cover"
          loading="lazy"
          decoding="async"
          onError={() => setFailed(previous => [...previous, url])}
        />
      ) : (
        <div role="img" aria-label="No thumbnail" className="flex flex-col items-center gap-1 text-muted-foreground">
          <ImageOff className="h-4 w-4" />
          <span className="text-[10px]">No image</span>
        </div>
      )}
    </div>
  );
}
