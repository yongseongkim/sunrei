import {
  CreateSunreiRequest,
  PlaceInput,
  UpdateSunreiRequest,
} from '@/api/admin';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { MapPin, X } from 'lucide-react';
import { useEffect } from 'react';
import { UseFormSetValue, UseFormWatch } from 'react-hook-form';

type FormData = CreateSunreiRequest | UpdateSunreiRequest;

interface PlaceSectionProps {
  spotIndex: number;
  watch: UseFormWatch<FormData>;
  setValue: UseFormSetValue<FormData>;
  onOpenMap: (spotIndex: number) => void;
}

export default function PlaceSection({
  spotIndex,
  watch,
  setValue,
  onOpenMap,
}: PlaceSectionProps) {
  const place: PlaceInput | null = watch(`spots.${spotIndex}.place`);

  // Ensure place data is registered when it exists
  useEffect(() => {
    if (place) {
      setValue(`spots.${spotIndex}.place.id`, place.id);
      setValue(`spots.${spotIndex}.place.name`, place.name);
      setValue(`spots.${spotIndex}.place.address`, place.address);
      setValue(`spots.${spotIndex}.place.latitude`, place.latitude);
      setValue(`spots.${spotIndex}.place.longitude`, place.longitude);
    }
  }, [place, spotIndex, setValue]);

  const handleRemovePlace = () => {
    setValue(`spots.${spotIndex}.place`, null);
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <Label className="text-xs">Place</Label>
        <Button
          type="button"
          onClick={() => onOpenMap(spotIndex)}
          variant="outline"
          size="sm"
          className="h-7 text-xs"
        >
          <MapPin className="h-3 w-3 mr-1" />
          {place ? 'Edit Place' : 'Add Place'}
        </Button>
      </div>

      {place && (
        <div className="bg-muted rounded-md p-2 flex items-start justify-between">
          <div className="flex-1 space-y-0.5">
            <p className="text-xs font-medium">
              {place.name || 'Unnamed Place'}
            </p>
            <p className="text-xs text-muted-foreground">{place.address}</p>
            {place.latitude && place.longitude && (
              <p className="text-xs font-mono text-muted-foreground">
                {place.latitude.toFixed(6)}, {place.longitude.toFixed(6)}
              </p>
            )}
          </div>
          <Button
            type="button"
            onClick={handleRemovePlace}
            variant="ghost"
            size="sm"
            className="h-6 w-6 p-0"
          >
            <X className="h-3 w-3" />
          </Button>
        </div>
      )}
    </div>
  );
}
