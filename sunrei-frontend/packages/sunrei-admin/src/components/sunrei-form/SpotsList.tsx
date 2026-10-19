import SpotCard from '@/components/sunrei-form/SpotCard';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { MapPin, Plus } from 'lucide-react';
import { TagDTO } from '@/api/admin';
import {
  FieldArrayWithId,
  FieldErrors,
  UseFormRegister,
  UseFormSetValue,
  UseFormWatch,
} from 'react-hook-form';
import { SunreiFormValue } from '@/lib/schemas';

interface SpotsListProps {
  spotFields: FieldArrayWithId<SunreiFormValue, 'spots', 'id'>[];
  register: UseFormRegister<SunreiFormValue>;
  setValue: UseFormSetValue<SunreiFormValue>;
  watch: UseFormWatch<SunreiFormValue>;
  errors: FieldErrors<SunreiFormValue>;
  spotTags: TagDTO[][];
  onAddSpot: () => void;
  onRemoveSpot: (index: number) => void;
  onOpenMap: (spotIndex: number) => void;
  onSpotTagsChange: (
    index: number,
    tagIds: string[],
    tags: TagDTO[]
  ) => void;
}

export default function SpotsList({
  spotFields,
  register,
  setValue,
  watch,
  errors,
  spotTags,
  onAddSpot,
  onRemoveSpot,
  onOpenMap,
  onSpotTagsChange,
}: SpotsListProps) {
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <Label className="text-base font-bold">Spots</Label>
        <Button type="button" onClick={onAddSpot} size="sm" variant="outline">
          <Plus className="h-3.5 w-3.5" />
          Add spot
        </Button>
      </div>

      <div className="space-y-3">
        {spotFields.map((field, index) => (
          <SpotCard
            key={field.id}
            index={index}
            register={register}
            setValue={setValue}
            watch={watch}
            errors={{
              title: errors.spots?.[index]?.title?.message,
              sourceLink: errors.spots?.[index]?.sourceLink?.message,
              place: errors.spots?.[index]?.place?.message,
            }}
            selectedTags={spotTags[index] ?? []}
            onTagsChange={(tagIds, tags) => onSpotTagsChange(index, tagIds, tags)}
            onRemove={onRemoveSpot}
            onOpenMap={onOpenMap}
          />
        ))}
        {spotFields.length === 0 && (
          <div className="text-center py-8 text-muted-foreground">
            <MapPin className="h-12 w-12 mx-auto mb-2 opacity-50" />
            <p className="text-sm">No spots added yet</p>
            <p className="text-xs mt-1">
              Click &quot;Add Spot&quot; to get started
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
