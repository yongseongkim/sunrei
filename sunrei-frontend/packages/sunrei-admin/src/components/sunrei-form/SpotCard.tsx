import SpotTagAutocomplete from '@/components/sunrei-form/SpotTagAutocomplete';
import ImageUpload from '@/components/ImageUpload';
import ResponsiveImage from '@/components/ResponsiveImage';
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
import { cn } from '@/lib/utils';

// watch, youtu.be, embed, shorts 형식의 URL에서 썸네일에 쓸 영상 id만 뽑는다.
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
  errors?: { title?: string; sourceLink?: string; place?: string };
}

function FieldError({ message }: { message?: string }) {
  return message ? <p className="text-[11px] font-medium text-destructive">{message}</p> : null;
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
  errors,
}: SpotCardProps) {
  const hasError = !!(errors?.title || errors?.sourceLink || errors?.place);
  const videoId = youtubeVideoId(watch(`spots.${index}.sourceLink` as const));
  // YouTube가 아니면 spot의 첫 이미지(Instagram 게시물 이미지 등)를 썸네일로 보여 준다.
  const firstImage = watch(`spots.${index}.images` as const)?.[0];
  return (
    <Card className={cn('py-0 px-0 rounded-lg gap-0', hasError && 'border-destructive')}>
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
            {videoId ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={`https://img.youtube.com/vi/${videoId}/mqdefault.jpg`}
                alt="Video thumbnail"
                className="w-full rounded border object-cover aspect-video"
              />
            ) : firstImage ? (
              <ResponsiveImage
                multiSizeImage={firstImage}
                alt="Post image"
                size="small"
                className="w-full rounded border object-cover aspect-square"
              />
            ) : null}
            <Input
              {...register(`spots.${index}.sourceLink` as const)}
              type="url"
              placeholder="YouTube timestamp or Instagram post link"
              className="h-8 text-xs"
              aria-invalid={!!errors?.sourceLink}
            />
            <FieldError message={errors?.sourceLink} />
          </div>
          <div className="flex-1 min-w-0 space-y-1.5">
            <Input
              {...register(`spots.${index}.title` as const)}
              placeholder="Spot title"
              className="h-8"
              aria-invalid={!!errors?.title}
            />
            <FieldError message={errors?.title} />
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
        <FieldError message={errors?.place} />
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
