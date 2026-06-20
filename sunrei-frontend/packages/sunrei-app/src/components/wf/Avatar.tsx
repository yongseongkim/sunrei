'use client';

/** Round avatar with a source initial. */
export function Avatar({ label, size = 22 }: { label: string; size?: number }) {
  return (
    <span
      className="grid place-items-center shrink-0 rounded-full bg-accent-soft text-ink2 font-bold border border-line2"
      style={{ width: size, height: size, fontSize: Math.round(size * 0.42) }}
    >
      {(label || '?').charAt(0).toUpperCase()}
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
