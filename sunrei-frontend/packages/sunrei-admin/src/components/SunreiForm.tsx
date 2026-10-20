'use client';

import SourceSelectField from '@/components/sunrei-form/SourceSelectField';
import BasicInfoSection from '@/components/sunrei-form/BasicInfoSection';
import FormActions from '@/components/sunrei-form/FormActions';
import SpotsList from '@/components/sunrei-form/SpotsList';
import SpotsMapSection from '@/components/sunrei-form/SpotsMapSection';
import ImageUpload from '@/components/ImageUpload';
import PlaceSearchModal from '@/components/PlaceSearchModal';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Card, CardContent } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  useCreateSunrei,
  useSunrei,
  useUpdateSunrei,
} from '@/lib/hooks/use-sunreis';
import { sunreiSchema, SunreiFormValue } from '@/lib/schemas';
import {
  CreateSunreiRequest,
  PlaceInput,
  TagDTO,
  UpdateSunreiRequest,
} from '@/api/admin';
import { zodResolver } from '@hookform/resolvers/zod';
import { AlertCircle, Loader2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useFieldArray, useForm } from 'react-hook-form';
import { cn } from '@/lib/utils';

type SunreiFormProps = {
  mode: 'create' | 'edit';
  sunreiId?: string;
  onSuccess: () => void;
  onCancel: () => void;
};

const emptySpot: SunreiFormValue['spots'][number] = {
  title: '',
  description: '',
  context: '',
  sourceLink: '',
  place: null,
  tagIds: [],
  tagLabels: [],
  images: [],
};

export default function SunreiForm({
  mode,
  sunreiId,
  onSuccess,
  onCancel,
}: SunreiFormProps) {
  const [mapModalOpen, setMapModalOpen] = useState(false);
  const [currentSpotIndex, setCurrentSpotIndex] = useState<number | null>(null);
  const [editingPlace, setEditingPlace] = useState<PlaceInput | undefined>();
  const [spotTags, setSpotTags] = useState<TagDTO[][]>([]);

  const { data: sunreiData, isLoading: loading } = useSunrei(sunreiId || '');
  const createMutation = useCreateSunrei();
  const updateMutation = useUpdateSunrei();

  const getErrorMessage = (error: unknown): string | null => {
    if (error && typeof error === 'object' && 'response' in error) {
      const response = (
        error as { response?: { data?: { message?: string; error?: string } } }
      ).response;
      return response?.data?.message || response?.data?.error || null;
    }
    return null;
  };

  const error =
    getErrorMessage(createMutation.error) ||
    getErrorMessage(updateMutation.error) ||
    null;

  const {
    register,
    control,
    handleSubmit,
    setValue,
    watch,
    reset,
    formState: { errors },
  } = useForm<SunreiFormValue>({
    resolver: zodResolver(sunreiSchema),
    defaultValues: {
      sourceId: '',
      published: false,
      title: '',
      summary: '',
      description: '',
      link: '',
      images: [],
      spots: [],
    },
  });

  const {
    fields: spotFields,
    append: appendSpot,
    remove: removeSpot,
  } = useFieldArray({ control, name: 'spots' });

  useEffect(() => {
    if (sunreiData) {
      const spots = (sunreiData.spots || []).map((s) => ({
        id: s.id,
        title: s.title,
        context: s.context ?? '',
        sourceLink: s.sourceLink ?? '',
        place: s.place ?? null,
        tagIds: (s.tags || []).map((t) => t.id!).filter(Boolean),
        tagLabels: [],
        images: s.images || [],
      }));
      reset({
        sourceId: sunreiData.sourceId,
        published: sunreiData.publishedAt != null,
        title: sunreiData.title,
        summary: sunreiData.summary ?? '',
        description: sunreiData.description ?? '',
        link: sunreiData.link ?? '',
        images: sunreiData.images || [],
        spots,
      });
      setSpotTags((sunreiData.spots || []).map((s) => s.tags || []));
    }
  }, [sunreiData, reset]);

  const onSubmit = (data: SunreiFormValue) => {
    const spotsPayload = data.spots.map((s) => ({
      id: s.id,
      title: s.title,
      description: s.description || null,
      context: s.context || null,
      sourceLink: s.sourceLink || null,
      place: (s.place ?? null) as PlaceInput | null,
      tagIds: s.tagIds,
      images: s.images,
    }));

    if (mode === 'edit' && sunreiId) {
      const payload: UpdateSunreiRequest = {
        sourceId: data.sourceId,
        published: data.published,
        title: data.title,
        summary: data.summary ?? null,
        description: data.description ?? null,
        link: data.link ?? null,
        images: data.images,
        spots: spotsPayload,
      };
      updateMutation.mutate({ id: sunreiId, data: payload }, { onSuccess });
    } else {
      const payload: CreateSunreiRequest = {
        sourceId: data.sourceId,
        published: data.published,
        title: data.title,
        summary: data.summary ?? null,
        description: data.description ?? null,
        link: data.link ?? null,
        images: data.images,
        spots: spotsPayload,
      };
      createMutation.mutate(payload, { onSuccess });
    }
  };

  const openMapForPlace = (spotIndex: number) => {
    setCurrentSpotIndex(spotIndex);
    const spot = watch(`spots.${spotIndex}`);
    setEditingPlace((spot?.place ?? undefined) as PlaceInput | undefined);
    setMapModalOpen(true);
  };

  const handlePlaceSelect = (place: PlaceInput) => {
    if (currentSpotIndex === null) return;
    setValue(`spots.${currentSpotIndex}.place`, place);
    setMapModalOpen(false);
  };

  const handleSpotTagsChange = (
    index: number,
    tagIds: string[],
    tags: TagDTO[],
  ) => {
    setValue(`spots.${index}.tagIds`, tagIds);
    setSpotTags((prev) => {
      const next = [...prev];
      next[index] = tags;
      return next;
    });
  };

  const handleAddSpot = () => {
    appendSpot({ ...emptySpot });
    setSpotTags((prev) => [...prev, []]);
  };

  const handleRemoveSpot = (index: number) => {
    removeSpot(index);
    setSpotTags((prev) => prev.filter((_, i) => i !== index));
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const published = watch('published');
  // 필드 배열 오류는 spot 위치마다 비어 있을 수 있어 실제로 오류가 있는 spot만 센다.
  const spotErrorCount = Array.isArray(errors.spots)
    ? errors.spots.filter(Boolean).length
    : 0;

  const summaryLength = (watch('summary') || '').length;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">
          {mode === 'create' ? 'Create New Sunrei' : 'Edit Sunrei'}
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {mode === 'create'
            ? 'Add a new Sunrei (video/work) under a source'
            : [
                sunreiData?.source?.name,
                `${spotFields.length} ${spotFields.length === 1 ? 'spot' : 'spots'}`,
              ]
                .filter(Boolean)
                .join(' · ')}
        </p>
      </div>

      {/* 브라우저 기본 검증 말풍선 대신 zod 오류를 각 필드와 Save 옆에 보여 준다. */}
      <form onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-6">
        {error && (
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        <Card>
          <CardContent className="space-y-4">
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label className="text-sm font-medium">Source *</Label>
                <SourceSelectField
                  value={watch('sourceId') || undefined}
                  onChange={(id) =>
                    setValue('sourceId', id, { shouldValidate: true })
                  }
                />
                {errors.sourceId && (
                  <p className="text-sm text-destructive">
                    {errors.sourceId.message as string}
                  </p>
                )}
              </div>
              <div className="space-y-2">
                <Label className="text-sm font-medium">Status</Label>
                <div className="inline-flex w-fit rounded-lg bg-muted p-[3px]">
                  {([false, true] as const).map((value) => (
                    <button
                      key={String(value)}
                      type="button"
                      onClick={() => setValue('published', value)}
                      className={cn(
                        'rounded-md px-3.5 py-1 text-sm font-semibold transition-colors',
                        published === value
                          ? 'bg-background text-foreground shadow-sm'
                          : 'text-muted-foreground',
                      )}
                    >
                      {value ? 'Published' : 'Draft'}
                    </button>
                  ))}
                </div>
                <p className="text-xs text-muted-foreground">
                  Drafts are hidden from the public app.
                </p>
              </div>
            </div>

            <BasicInfoSection register={register} errors={errors} />

            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="description">Description</Label>
                <Textarea
                  id="description"
                  {...register('description')}
                  rows={3}
                  placeholder="Describe this Sunrei"
                />
              </div>
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label htmlFor="summary">Summary</Label>
                  {/* 공개 앱 카드와 검색 결과에 한두 줄로 보이므로 200자 안쪽을 권한다. */}
                  <span
                    className={cn(
                      'text-xs',
                      summaryLength > 200
                        ? 'text-destructive'
                        : 'text-muted-foreground',
                    )}
                  >
                    {summaryLength} / 200
                  </span>
                </div>
                <Textarea
                  id="summary"
                  {...register('summary')}
                  rows={3}
                  placeholder="One-line summary of this Sunrei"
                />
              </div>
            </div>

            <ImageUpload
              images={watch('images') || []}
              onChange={(newImages) => setValue('images', newImages)}
              label="Sunrei Images"
              maxImages={10}
              compact
              tileSize={64}
            />
          </CardContent>
        </Card>

        <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-[minmax(0,1fr)_380px]">
          <SpotsList
            spotFields={spotFields}
            register={register}
            setValue={setValue}
            watch={watch}
            errors={errors}
            spotTags={spotTags}
            onAddSpot={handleAddSpot}
            onRemoveSpot={handleRemoveSpot}
            onOpenMap={openMapForPlace}
            onSpotTagsChange={handleSpotTagsChange}
          />

          <SpotsMapSection
            spots={spotFields.map((field, index) => ({
              title: watch(`spots.${index}.title`) || `Spot ${index + 1}`,
              place: watch(`spots.${index}.place`) ?? null,
            }))}
          />
        </div>

        <FormActions
          mode={mode}
          isSubmitting={createMutation.isPending || updateMutation.isPending}
          onCancel={onCancel}
          errorText={
            spotErrorCount > 0
              ? `${spotErrorCount} ${spotErrorCount === 1 ? 'spot has' : 'spots have'} errors`
              : undefined
          }
        />
      </form>

      <PlaceSearchModal
        isOpen={mapModalOpen}
        onClose={() => setMapModalOpen(false)}
        onPlaceSelect={handlePlaceSelect}
        initialPlace={editingPlace}
      />
    </div>
  );
}
