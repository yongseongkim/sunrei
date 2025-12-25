import { PlaceInput } from '@/api/admin';
import SpotsMap from '@/components/SpotsMap';
import { Label } from '@/components/ui/label';
import { Map } from 'lucide-react';

interface SpotsMapSectionProps {
  spots: Array<{
    title: string;
    place: PlaceInput | null;
  }>;
  height?: string;
}

export default function SpotsMapSection({
  spots,
  height = '980px',
}: SpotsMapSectionProps) {
  return (
    <div className="lg:sticky lg:top-0">
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
