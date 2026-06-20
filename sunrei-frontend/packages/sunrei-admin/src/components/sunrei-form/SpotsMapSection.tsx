import SpotsMap from '@/components/SpotsMap';
import { Label } from '@/components/ui/label';
import { Map } from 'lucide-react';

// Minimal structural place shape (only what the map needs); accepts both
// PlaceInput and the zod-derived form place value.
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
  return (
    <div className="lg:sticky lg:top-4 self-start">
      <div className="space-y-2">
        <div className="flex items-center gap-2">
          <Map className="h-4 w-4" />
          <Label className="text-sm">Spots Map</Label>
        </div>
        <SpotsMap spots={spots} height={height} />
      </div>
    </div>
  );
}
