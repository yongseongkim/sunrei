import SpotsMap from '@/components/SpotsMap';
import { Card } from '@/components/ui/card';

// PlaceInput과 zod 스키마에서 나온 폼의 place 값을 모두 받도록 지도에 필요한 필드만 둔다.
type MapPlace = {
  name?: string | null;
  address?: string | null;
  latitude: number;
  longitude: number;
} | null;

interface SpotsMapSectionProps {
  spots: Array<{
    title: string;
    place: MapPlace;
  }>;
  height?: string;
}

export default function SpotsMapSection({
  spots,
  height = '360px',
}: SpotsMapSectionProps) {
  const total = spots.length;
  const matched = spots.filter(
    (s) => s.place && s.place.latitude && s.place.longitude,
  ).length;
  const unmatched = total - matched;
  // Spots 헤더 높이만큼 내려 첫 spot 카드와 위쪽을 맞추고, 스크롤해도 지도가 따라오게 둔다.
  return (
    <Card className="gap-3 self-start p-4 lg:sticky lg:top-20 lg:mt-12">
      <div>
        <div className="text-sm font-semibold">Spots Map</div>
        {total > 0 && (
          <div className="mt-0.5 text-xs text-muted-foreground">
            numbered 1–{total}
            {unmatched > 0 ? (
              <span className="font-semibold text-destructive"> · {unmatched} needs a place</span>
            ) : (
              ' · all matched'
            )}
          </div>
        )}
      </div>
      <SpotsMap spots={spots} height={height} />
    </Card>
  );
}
