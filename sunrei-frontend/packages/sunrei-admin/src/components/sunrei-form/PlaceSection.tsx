import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { MapPin, Plus, X } from 'lucide-react';
import { UseFormSetValue, UseFormWatch } from 'react-hook-form';
import { SunreiFormValue } from '@/lib/schemas';
import { cn } from '@/lib/utils';

interface PlaceSectionProps {
  spotIndex: number;
  watch: UseFormWatch<SunreiFormValue>;
  setValue: UseFormSetValue<SunreiFormValue>;
  onOpenMap: (spotIndex: number) => void;
  error?: boolean;
}

export default function PlaceSection({ spotIndex, watch, setValue, onOpenMap, error }: PlaceSectionProps) {
  const place = watch(`spots.${spotIndex}.place`) ?? null;

  return (
    <div className="space-y-1.5">
      <Label className="text-[13px] font-semibold">Place</Label>
      {place ? (
        <div className="flex items-center gap-2 rounded-lg bg-muted px-2.5 py-[7px] text-[12.5px]">
          <MapPin className="h-3.5 w-3.5 shrink-0 text-primary" />
          <div className="min-w-0 flex-1">
            <p className="truncate font-semibold">{place.name || 'Unnamed Place'}</p>
            <p className="truncate text-[11.5px] text-muted-foreground">{place.address}</p>
          </div>
          <Button type="button" variant="outline" size="sm" className="h-7" onClick={() => onOpenMap(spotIndex)}>
            Edit
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-7 w-7 p-0 text-muted-foreground"
            aria-label="Remove place"
            onClick={() => setValue(`spots.${spotIndex}.place`, null)}
          >
            <X className="h-3.5 w-3.5" />
          </Button>
        </div>
      ) : (
        <div
          className={cn(
            'flex items-center gap-2 rounded-lg border border-dashed px-2.5 py-[7px] text-[12.5px] text-muted-foreground',
            error && 'border-destructive'
          )}
        >
          No place yet
          <Button type="button" variant="outline" size="sm" className="ml-auto h-7" onClick={() => onOpenMap(spotIndex)}>
            <Plus className="h-3 w-3" />
            Add
          </Button>
        </div>
      )}
    </div>
  );
}
