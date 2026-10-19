import SpotTagAutocomplete from '@/components/sunrei-form/SpotTagAutocomplete';
import ImageUpload from '@/components/ImageUpload';
import ResponsiveImage from '@/components/ResponsiveImage';
import PlaceSection from '@/components/sunrei-form/PlaceSection';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { AlertCircle, Trash2 } from 'lucide-react';
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
  return message ? (
    <p className="flex items-center gap-1 text-[11px] font-medium text-destructive">
      <AlertCircle className="h-3 w-3 shrink-0" />
      {message}
    </p>
  ) : null;
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
  const link = watch(`spots.${index}.sourceLink` as const);
  return (
    <Card className={cn('gap-3 p-4', hasError && 'border-destructive')}>
      <div className="flex items-center gap-2">
        <span className="grid h-[22px] w-[22px] place-items-center rounded-full bg-primary text-[11.5px] font-bold text-primary-foreground">
          {index + 1}
        </span>
        <span className="text-sm font-semibold">Spot {index + 1}</span>
        <Button
          type="button"
          onClick={() => onRemove(index)}
          variant="ghost"
          size="sm"
          className="ml-auto h-7 w-7 p-0 text-destructive hover:text-destructive"
          aria-label="Remove spot"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </Button>
      </div>

      <div className="grid grid-cols-[180px_minmax(0,1fr)] gap-3.5">
        <div className="space-y-2">
          {videoId ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={`https://img.youtube.com/vi/${videoId}/mqdefault.jpg`}
              alt="Video thumbnail"
              className="aspect-video w-full rounded-md border object-cover"
            />
          ) : firstImage ? (
            <ResponsiveImage
              multiSizeImage={firstImage}
              alt="Post image"
              size="small"
              className="aspect-square w-[101px] rounded-md border object-cover"
            />
          ) : (
            <div className="grid h-10 place-items-center rounded-md border border-dashed text-[11.5px] text-muted-foreground">
              No thumbnail
            </div>
          )}
          <Input
            {...register(`spots.${index}.sourceLink` as const)}
            type="url"
            placeholder="YouTube timestamp or Instagram post link"
            className={cn('h-9 text-xs', link && 'font-mono')}
            aria-invalid={!!errors?.sourceLink}
          />
          <FieldError message={errors?.sourceLink} />
        </div>
        <div className="space-y-2">
          <Input
            {...register(`spots.${index}.title` as const)}
            placeholder="Spot title"
            aria-invalid={!!errors?.title}
          />
          <FieldError message={errors?.title} />
          <Textarea
            {...register(`spots.${index}.context` as const)}
            rows={3}
            placeholder="Context — what this source says here (e.g. 7화에서 울며 식사한 식당)"
            className="resize-none text-[13px]"
          />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <PlaceSection
            spotIndex={index}
            watch={watch}
            setValue={setValue}
            onOpenMap={onOpenMap}
            error={!!errors?.place}
          />
          <FieldError message={errors?.place} />
        </div>
        <div className="space-y-1.5">
          <Label className="text-[13px] font-semibold">Spot tags</Label>
          <SpotTagAutocomplete
            selectedTagIds={watch(`spots.${index}.tagIds`) || []}
            selectedTags={selectedTags}
            onChange={onTagsChange}
          />
        </div>
      </div>

      <ImageUpload
        images={watch(`spots.${index}.images`) || []}
        onChange={(newImages) => setValue(`spots.${index}.images`, newImages)}
        label="Spot Images"
        maxImages={5}
        compact
      />
    </Card>
  );
}
