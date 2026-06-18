import SpotTagAutocomplete from '@/components/sunrei-form/SpotTagAutocomplete';
import ImageUpload from '@/components/ImageUpload';
import PlaceSection from '@/components/sunrei-form/PlaceSection';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Trash2 } from 'lucide-react';
import { TagDTO } from '@/api/admin';
import { UseFormRegister, UseFormSetValue, UseFormWatch } from 'react-hook-form';
import { SunreiFormValue } from '@/lib/schemas';

interface SpotCardProps {
  index: number;
  register: UseFormRegister<SunreiFormValue>;
  setValue: UseFormSetValue<SunreiFormValue>;
  watch: UseFormWatch<SunreiFormValue>;
  selectedTags: TagDTO[];
  onTagsChange: (tagIds: string[], tags: TagDTO[]) => void;
  onRemove: (index: number) => void;
  onOpenMap: (spotIndex: number) => void;
}

export default function SpotCard({
  index,
  register,
  setValue,
  watch,
  selectedTags,
  onTagsChange,
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
          {...register(`spots.${index}.title` as const)}
          placeholder="Spot title"
          className="h-8"
        />
        <Textarea
          {...register(`spots.${index}.context` as const)}
          rows={2}
          placeholder="Context — what this source says here (e.g. 7화에서 울며 식사한 식당)"
          className="text-xs resize-none"
        />
        <Textarea
          {...register(`spots.${index}.description` as const)}
          rows={3}
          placeholder="Spot description"
          className="text-sm resize-none"
        />
        <Input
          {...register(`spots.${index}.youtubeLink` as const)}
          type="url"
          placeholder="YouTube link / timestamp"
          className="h-8"
        />
        <PlaceSection
          spotIndex={index}
          watch={watch}
          setValue={setValue}
          onOpenMap={onOpenMap}
        />
        <div className="space-y-1">
          <Label className="text-xs">Spot tags (bilingual)</Label>
          <SpotTagAutocomplete
            selectedTagIds={watch(`spots.${index}.tagIds`) || []}
            selectedTags={selectedTags}
            onChange={onTagsChange}
          />
        </div>
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
