'use client';

import SourceSelectField from '@/components/sunrei-form/SourceSelectField';
import BasicInfoSection from '@/components/sunrei-form/BasicInfoSection';
import FormActions from '@/components/sunrei-form/FormActions';
import SpotsList from '@/components/sunrei-form/SpotsList';
import SpotsMapSection from '@/components/sunrei-form/SpotsMapSection';
import ImageUpload from '@/components/ImageUpload';
import PlaceSearchModal from '@/components/PlaceSearchModal';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import {
  useCreateSunrei,
  useSunrei,
  useUpdateSunrei,
} from '@/lib/hooks/use-sunreis';
import { sunreiSchema, SunreiFormValue } from '@/lib/schemas';
import { CreateSunreiRequest, PlaceInput, TagDTO, UpdateSunreiRequest } from '@/api/admin';
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
  youtubeLink: '',
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
        description: s.description ?? '',
        context: s.context ?? '',
        youtubeLink: s.youtubeLink ?? '',
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
      youtubeLink: s.youtubeLink || null,
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
    tags: TagDTO[]
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

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">
          {mode === 'create' ? 'Create New Sunrei' : 'Edit Sunrei'}
        </h1>
        <p className="text-muted-foreground mt-2">
          {mode === 'create'
            ? 'Add a new Sunrei (video/work) under a source'
            : 'Update sunrei information and spots'}
        </p>
      </div>

      <Card>
        <CardContent className="pt-6">
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
            {error && (
              <Alert variant="destructive">
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}

            {/* Source + publish state */}
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label className="text-sm font-medium">Source *</Label>
                <SourceSelectField
                  value={watch('sourceId') || undefined}
                  onChange={(id) => setValue('sourceId', id, { shouldValidate: true })}
                />
                {errors.sourceId && (
                  <p className="text-sm text-destructive">
                    {errors.sourceId.message as string}
                  </p>
                )}
              </div>
              <div className="space-y-2">
                <Label className="text-sm font-medium">Status</Label>
                <div className="flex gap-2">
                  <Button
                    type="button"
                    variant={!published ? 'default' : 'outline'}
                    size="sm"
                    onClick={() => setValue('published', false)}
                    className={cn(!published && 'bg-muted-foreground/80')}
                  >
                    Draft
                  </Button>
                  <Button
                    type="button"
                    variant={published ? 'default' : 'outline'}
                    size="sm"
                    onClick={() => setValue('published', true)}
                  >
                    Published
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground">
                  Drafts are hidden from the public app.
                </p>
              </div>
            </div>

            <BasicInfoSection register={register} errors={errors} />

            <Separator />

            {/* Summary */}
            <div className="space-y-2">
              <Label htmlFor="summary" className="text-sm font-medium">
                Summary
              </Label>
              <Input
                id="summary"
                {...register('summary')}
                placeholder="One-line summary of this Sunrei"
              />
            </div>

            <Separator />

            <ImageUpload
              images={watch('images') || []}
              onChange={(newImages) => setValue('images', newImages)}
              label="Sunrei Images"
              maxImages={10}
            />

            <Separator />

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <SpotsList
                spotFields={spotFields}
                register={register}
                setValue={setValue}
                watch={watch}
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

            <Separator />

            <FormActions
              mode={mode}
              isSubmitting={createMutation.isPending || updateMutation.isPending}
              onCancel={onCancel}
            />
          </form>

          <PlaceSearchModal
            isOpen={mapModalOpen}
            onClose={() => setMapModalOpen(false)}
            onPlaceSelect={handlePlaceSelect}
            initialPlace={editingPlace}
          />
        </CardContent>
      </Card>
    </div>
  );
}
