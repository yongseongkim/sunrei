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

// Extract a YouTube video id from a watch / youtu.be / embed URL (ignoring timestamps).
function youtubeVideoId(url?: string | null): string | null {
  if (!url) return null;
  const m = url.match(
    /(?:youtube\.com\/(?:watch\?(?:.*&)?v=|embed\/|shorts\/)|youtu\.be\/)([A-Za-z0-9_-]{11})/,
  );
  return m ? m[1] : null;
}

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
  const videoId = youtubeVideoId(watch(`spots.${index}.youtubeLink` as const));
  return (
    <Card className="py-0 px-0 rounded-lg gap-0">
      <CardHeader className="py-1 px-2 gap-0">
        <div className="flex items-center justify-between">
          <span className="flex items-center gap-1.5 text-xs font-medium">
            <span className="grid place-items-center h-5 w-5 rounded-full bg-primary text-primary-foreground text-[11px] font-bold">
              {index + 1}
            </span>
            Spot {index + 1}
          </span>
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
        <div className="flex gap-2">
          <div className="w-2/5 shrink-0 space-y-1.5">
            {videoId && (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={`https://img.youtube.com/vi/${videoId}/mqdefault.jpg`}
                alt="Video thumbnail"
                className="w-full rounded border object-cover aspect-video"
              />
            )}
            <Input
              {...register(`spots.${index}.youtubeLink` as const)}
              type="url"
              placeholder="YouTube link / timestamp"
              className="h-8 text-xs"
            />
          </div>
          <div className="flex-1 min-w-0 space-y-1.5">
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
          </div>
        </div>
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
