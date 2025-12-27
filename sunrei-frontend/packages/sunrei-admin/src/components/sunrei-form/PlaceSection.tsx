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
  const place: PlaceInput | null = watch(`spots.${spotIndex}.place`) ?? null;

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
    setValue(`spots.${spotIndex}.place`, undefined);
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
            <p className="text-[10px] text-muted-foreground truncate">{place.address}</p>
            {place.latitude && place.longitude && (
              <p className="text-[10px] font-mono text-muted-foreground">
                {place.latitude.toFixed(5)}, {place.longitude.toFixed(5)}
              </p>
            )}
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
