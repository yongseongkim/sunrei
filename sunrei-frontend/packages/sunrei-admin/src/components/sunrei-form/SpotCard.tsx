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
    <Card className="py-0 px-0 rounded-lg gap-0">
      <CardHeader className="py-1 px-2 gap-0">
        <div className="flex items-center justify-between">
          <span className="text-xs font-medium">Spot {index + 1}</span>
          <Button
            type="button"
            onClick={() => onRemove(index)}
            variant="ghost"
            size="sm"
            className="h-6 w-6 p-0"
          >
            <Trash2 className="h-3 w-3" />
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-1.5 px-2 py-0 pt-1.5">
        <Input
          {...register(`spots.${index}.title` as const, {
            required: 'Spot title is required',
          })}
          placeholder="Spot title"
          className="h-8"
        />
        <Textarea
          {...register(`spots.${index}.description` as const)}
          rows={4}
          placeholder="Spot description"
          className="text-sm resize-none"
        />
        <Input
          {...register(`spots.${index}.youtubeLink` as const)}
          type="url"
          placeholder="YouTube link"
          className="h-8"
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
          compact
        />
      </CardContent>
    </Card>
  );
}
