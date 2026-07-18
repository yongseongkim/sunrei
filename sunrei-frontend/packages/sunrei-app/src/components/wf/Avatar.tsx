'use client';

import { useEffect, useState } from 'react';

/**
 * Round avatar. Shows an image (e.g. a YouTube channel thumbnail) when `src` is given
 * and loads; otherwise falls back to the label's initial — so a missing or hotlink-
 * blocked URL still renders a letter.
 */
export function Avatar({ label, src, size = 22 }: { label: string; src?: string | null; size?: number }) {
  const [broken, setBroken] = useState(false);
  // Reset the error state when the source changes (avatars are reused across rows).
  useEffect(() => setBroken(false), [src]);
  const showImg = !!src && !broken;
  return (
    <span
      className="grid place-items-center shrink-0 overflow-hidden rounded-full bg-accent-soft text-ink2 font-bold border border-line2"
      style={{ width: size, height: size, fontSize: Math.round(size * 0.42) }}
    >
      {showImg ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={src!}
          alt=""
          width={size}
          height={size}
          referrerPolicy="no-referrer"
          className="h-full w-full object-cover"
          onError={() => setBroken(true)}
        />
      ) : (
        (label || '?').charAt(0).toUpperCase()
      )}
    </span>
  );
}

/** Overlapping avatar cluster for the rich (multi-mention) card. */
export function AvatarCluster({ labels, size = 20 }: { labels: string[]; size?: number }) {
  return (
    <div className="flex">
      {labels.map((l, i) => (
        <span key={i} className="rounded-full border-2 border-card" style={{ marginLeft: i ? -6 : 0 }}>
          <Avatar label={l} size={size} />
        </span>
      ))}
    </div>
  );
}
