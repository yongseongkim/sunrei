import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { MapPin, X } from 'lucide-react';
import { UseFormSetValue, UseFormWatch } from 'react-hook-form';
import { SunreiFormValue } from '@/lib/schemas';

interface PlaceSectionProps {
  spotIndex: number;
  watch: UseFormWatch<SunreiFormValue>;
  setValue: UseFormSetValue<SunreiFormValue>;
  onOpenMap: (spotIndex: number) => void;
}

export default function PlaceSection({
  spotIndex,
  watch,
  setValue,
  onOpenMap,
}: PlaceSectionProps) {
  const place = watch(`spots.${spotIndex}.place`) ?? null;

  const handleRemovePlace = () => {
    setValue(`spots.${spotIndex}.place`, null);
  };

  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between">
        <Label className="text-xs">Place</Label>
        <Button
          type="button"
          onClick={() => onOpenMap(spotIndex)}
          variant="outline"
          size="sm"
          className="h-6 text-xs px-2"
        >
          <MapPin className="h-2.5 w-2.5 mr-1" />
          {place ? 'Edit' : 'Add'}
        </Button>
      </div>

      {place && (
        <div className="bg-muted rounded-md p-1.5 flex items-start justify-between">
          <div className="flex-1 space-y-0">
            <p className="text-xs font-medium truncate">
              {place.name || 'Unnamed Place'}
            </p>
            <p className="text-[10px] text-muted-foreground truncate">
              {place.address}
            </p>
            <p className="text-[10px] font-mono text-muted-foreground">
              {place.latitude.toFixed(5)}, {place.longitude.toFixed(5)}
            </p>
          </div>
          <Button
            type="button"
            onClick={handleRemovePlace}
            variant="ghost"
            size="sm"
            className="h-5 w-5 p-0 ml-1"
          >
            <X className="h-2.5 w-2.5" />
          </Button>
        </div>
      )}
    </div>
  );
}
