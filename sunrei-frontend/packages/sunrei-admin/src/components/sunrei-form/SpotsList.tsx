import { CreateSunreiRequest, UpdateSunreiRequest } from '@/api/admin';
import SpotCard from '@/components/sunrei-form/SpotCard';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { MapPin, Plus } from 'lucide-react';
import {
  FieldArrayWithId,
  UseFormRegister,
  UseFormSetValue,
  UseFormWatch,
} from 'react-hook-form';

type FormData = CreateSunreiRequest | UpdateSunreiRequest;

interface SpotsListProps {
  spotFields: FieldArrayWithId<FormData, 'spots', 'id'>[];
  register: UseFormRegister<FormData>;
  setValue: UseFormSetValue<FormData>;
  watch: UseFormWatch<FormData>;
  onAddSpot: () => void;
  onRemoveSpot: (index: number) => void;
  onOpenMap: (spotIndex: number) => void;
}

export default function SpotsList({
  spotFields,
  register,
  setValue,
  watch,
  onAddSpot,
  onRemoveSpot,
  onOpenMap,
}: SpotsListProps) {
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <Label className="text-base">Spots</Label>
        <Button
          type="button"
          onClick={onAddSpot}
          size="sm"
          variant="outline"
        >
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
