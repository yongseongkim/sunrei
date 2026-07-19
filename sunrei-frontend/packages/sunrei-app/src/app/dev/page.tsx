'use client';

import { PlaceCard, PlaceCardSkeleton } from '@/components/place-card';
import type { PlaceCardDTO, SourceDTO } from '@/dto';
import { useState } from 'react';

// Component sandbox (Ba-5): renders the PlaceCard states board against mock data so the
// card can be eyeballed in isolation without seeding the backend. Not linked in the app.

const src = (id: string, name: string, type: SourceDTO['type']): SourceDTO => ({
  id,
  name,
  type,
  isClosed: false,
} as unknown as SourceDTO);

const card = (over: Partial<PlaceCardDTO> & Pick<PlaceCardDTO, 'place' | 'mentions'>): PlaceCardDTO => ({
  distanceMeters: 900,
  tags: [],
  sourceCount: over.mentions.length,
  sunreiCount: over.mentions.length,
  spotCount: over.mentions.length,
  ...over,
});

const place = (id: string, name: string) =>
  ({ id, name, latitude: 0, longitude: 0, isClosed: false }) as PlaceCardDTO['place'];

const single = card({
  place: place('p1', 'Hozenji Yokocho'),
  distanceMeters: 900,
  mentions: [
    {
      source: src('s1', 'WabiXabi', 'YOUTUBE'),
      sunreiId: 'v1',
      sunreiTitle: 'Hidden Alleys of Namba',
      spotId: 'sp1',
      context: 'A lantern-lit stone alley of tiny ramen and oden counters.',
      images: [],
      tags: [],
    },
  ],
});

const multi = card({
  place: place('p2', 'Namba Parks Rooftop'),
  distanceMeters: 400,
  mentions: [
    { source: src('s1', 'WabiXabi', 'YOUTUBE'), sunreiId: 'v2', sunreiTitle: 'Osaka Modernist Architecture', spotId: 'sp2', context: 'Modernist sky-garden over a stadium', images: [], tags: [] },
    { source: src('s2', 'Shinkai Works', 'ANIME'), sunreiId: 'v3', sunreiTitle: 'Your Name', spotId: 'sp3', context: 'Opening rooftop scene', images: [], tags: [] },
    { source: src('s3', 'TV Tokyo', 'TV'), sunreiId: 'v4', sunreiTitle: 'Solitary Gourmet S7', spotId: 'sp4', context: 'Goro eats on the terrace', images: [], tags: [] },
  ],
});

function Cell({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="w-[300px]">
      <div className="text-xs font-bold text-ink2 mb-2">{label}</div>
      {children}
    </div>
  );
}

export default function DevSandbox() {
  const [active, setActive] = useState(false);
  return (
    <div className="min-h-screen bg-background p-8">
      <h1 className="text-xl font-extrabold mb-6">PlaceCard — states</h1>
      <div className="flex flex-wrap gap-7">
        <Cell label="One mention (compact)">
          <PlaceCard card={single} />
        </Cell>
        <Cell label="Many videos (rich)">
          <PlaceCard card={multi} />
        </Cell>
        <Cell label="Active / selected (click)">
          <PlaceCard card={single} active={active} onClick={() => setActive((v) => !v)} />
        </Cell>
        <Cell label="Dimmed (tag filter miss)">
          <PlaceCard card={single} dimmed />
        </Cell>
        <Cell label="Loading">
          <PlaceCardSkeleton />
        </Cell>
      </div>
    </div>
  );
}
