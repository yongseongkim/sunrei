import SpotCard from '@/components/sunrei-form/SpotCard';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { MapPin, Plus } from 'lucide-react';
import { TagDTO } from '@/api/admin';
import {
  FieldArrayWithId,
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
  spotTags,
  onAddSpot,
  onRemoveSpot,
  onOpenMap,
  onSpotTagsChange,
}: SpotsListProps) {
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <Label className="text-base">Spots</Label>
        <Button type="button" onClick={onAddSpot} size="sm" variant="outline">
          <Plus className="h-4 w-4 mr-2" />
          Add Spot
        </Button>
      </div>

      <div className="space-y-1.5 overflow-y-auto" style={{ maxHeight: '1000px' }}>
        {spotFields.map((field, index) => (
          <SpotCard
            key={field.id}
            index={index}
            register={register}
            setValue={setValue}
            watch={watch}
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
