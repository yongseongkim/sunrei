import SpotsMap from '@/components/SpotsMap';
import { Label } from '@/components/ui/label';
import { Map } from 'lucide-react';

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
  height = 'calc(100vh - 8rem)',
}: SpotsMapSectionProps) {
  const total = spots.length;
  const matched = spots.filter(
    (s) => s.place && s.place.latitude && s.place.longitude,
  ).length;
  const unmatched = total - matched;
  return (
    <div className="lg:sticky lg:top-4 self-start">
      <div className="space-y-2">
        <div className="flex items-center gap-2">
          <Map className="h-4 w-4" />
          <Label className="text-sm">Spots Map</Label>
          {total > 0 && (
            <span className="ml-auto text-xs text-muted-foreground">
              numbered 1–{total}
              {unmatched > 0 ? (
                <span className="text-destructive"> · {unmatched} needs a place</span>
              ) : (
                ' · all matched'
              )}
            </span>
          )}
        </div>
        <SpotsMap spots={spots} height={height} />
      </div>
    </div>
  );
}
