import { CreateSunreiRequest, UpdateSunreiRequest } from '@/api/admin';
import ImageUpload from '@/components/ImageUpload';
import PlaceSection from '@/components/sunrei-form/PlaceSection';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Trash2 } from 'lucide-react';
import { UseFormRegister, UseFormSetValue, UseFormWatch } from 'react-hook-form';

type FormData = CreateSunreiRequest | UpdateSunreiRequest;

interface SpotCardProps {
  index: number;
  register: UseFormRegister<FormData>;
  setValue: UseFormSetValue<FormData>;
  watch: UseFormWatch<FormData>;
  onRemove: (index: number) => void;
  onOpenMap: (spotIndex: number) => void;
}

export default function SpotCard({
  index,
  register,
  setValue,
  watch,
  onRemove,
  onOpenMap,
}: SpotCardProps) {
  return (
    <Card>
      <CardHeader className="py-3">
        <div className="flex items-center justify-between">
          <span className="text-sm font-medium">Spot {index + 1}</span>
          <Button
            type="button"
            onClick={() => onRemove(index)}
            variant="ghost"
            size="sm"
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        <Input
          {...register(`spots.${index}.title` as const, {
            required: 'Spot title is required',
          })}
          placeholder="Spot title"
        />
        <Textarea
          {...register(`spots.${index}.description` as const)}
          rows={2}
          placeholder="Spot description"
        />
        <Input
          {...register(`spots.${index}.youtubeLink` as const)}
          type="url"
          placeholder="YouTube link"
        />
        <PlaceSection
          spotIndex={index}
          watch={watch}
          setValue={setValue}
          onOpenMap={onOpenMap}
        />
        <ImageUpload
          images={watch(`spots.${index}.images`) || []}
          onChange={(newImages) => setValue(`spots.${index}.images`, newImages)}
          label="Spot Images"
          maxImages={5}
        />
      </CardContent>
    </Card>
  );
}
