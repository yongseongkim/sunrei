'use client';

import {
  CreateSunreiRequest,
  PlaceInput,
  TagDTO,
  UpdateSunreiRequest,
} from '@/api/admin';
import ImageUpload from '@/components/ImageUpload';
import PlaceSearchModal from '@/components/PlaceSearchModal';
import BasicInfoSection from '@/components/sunrei-form/BasicInfoSection';
import FormActions from '@/components/sunrei-form/FormActions';
import SpotsList from '@/components/sunrei-form/SpotsList';
import SpotsMapSection from '@/components/sunrei-form/SpotsMapSection';
import TagAutocomplete from '@/components/TagAutocomplete';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Card, CardContent } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import {
  useCreateSunrei,
  useSunrei,
  useUpdateSunrei,
} from '@/lib/hooks/use-sunreis';
import { AlertCircle, Loader2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useFieldArray, useForm } from 'react-hook-form';

type SunreiFormProps = {
  mode: 'create' | 'edit';
  sunreiId?: string;
  onSuccess: () => void;
  onCancel: () => void;
};

type FormData = CreateSunreiRequest | UpdateSunreiRequest;

export default function SunreiForm({
  mode,
  sunreiId,
  onSuccess,
  onCancel,
}: SunreiFormProps) {
  const [mapModalOpen, setMapModalOpen] = useState(false);
  const [currentSpotIndex, setCurrentSpotIndex] = useState<number | null>(null);
  const [editingPlace, setEditingPlace] = useState<PlaceInput | undefined>();
  const [selectedTags, setSelectedTags] = useState<TagDTO[]>([]);

  const { data: sunreiData, isLoading: loading } = useSunrei(sunreiId || '');
  const createMutation = useCreateSunrei();
  const updateMutation = useUpdateSunrei();

  const getErrorMessage = (error: unknown): string | null => {
    if (error && typeof error === 'object' && 'response' in error) {
      const response = (error as { response?: { data?: { message?: string } } })
        .response;
      return response?.data?.message || null;
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
  } = useForm<FormData>({
    defaultValues: {
      title: '',
      description: '',
      link: '',
      spots: [],
      tagIds: [],
      images: [],
    },
  });

  const {
    fields: spotFields,
    append: appendSpot,
    remove: removeSpot,
  } = useFieldArray({
    control,
    name: 'spots',
  });

  useEffect(() => {
    if (sunreiData) {
      reset({
        title: sunreiData.title,
        description: sunreiData.description,
        link: sunreiData.link || '',
        spots:
          sunreiData.spots?.map((spot) => ({
            id: spot.id,
            title: spot.title,
            description: spot.description || '',
            youtubeLink: spot.youtubeLink || '',
            place: spot.place || null,
            images: spot.images || [],
          })) || [],
        tagIds: sunreiData.tags?.map((t) => t.id!) || [],
        images: sunreiData.images || [],
      });
      setSelectedTags(sunreiData.tags || []);
    }
  }, [sunreiData, reset]);

  const onSubmit = async (data: FormData) => {
    if (mode === 'edit' && sunreiId) {
      updateMutation.mutate(
        { id: sunreiId, data: data as UpdateSunreiRequest },
        { onSuccess },
      );
    } else {
      createMutation.mutate(data as CreateSunreiRequest, { onSuccess });
    }
  };

  const openMapForPlace = (spotIndex: number) => {
    setCurrentSpotIndex(spotIndex);
    const spot = spotFields[spotIndex];
    if (spot.place) {
      setEditingPlace(spot.place as PlaceInput);
    } else {
      setEditingPlace(undefined);
    }
    setMapModalOpen(true);
  };

  const handlePlaceSelect = (place: PlaceInput) => {
    if (currentSpotIndex === null) return;
    setValue(`spots.${currentSpotIndex}.place`, place);
    setMapModalOpen(false);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">
          {mode === 'create' ? 'Create New Sunrei' : 'Edit Sunrei'}
        </h1>
        <p className="text-muted-foreground mt-2">
          {mode === 'create'
            ? 'Add a new Sunrei location with spots'
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

            <BasicInfoSection register={register} errors={errors} />

            <Separator />

            <div className="space-y-2">
              <label className="text-sm font-medium">Tags</label>
              <TagAutocomplete
                selectedTagIds={watch('tagIds') || []}
                selectedTags={selectedTags}
                onTagsChange={(tagIds, tags) => {
                  setValue('tagIds', tagIds);
                  setSelectedTags(tags);
                }}
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
                onAddSpot={() =>
                  appendSpot({
                    title: '',
                    description: '',
                    youtubeLink: '',
                    place: null,
                    images: [],
                  })
                }
                onRemoveSpot={removeSpot}
                onOpenMap={openMapForPlace}
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
              isSubmitting={
                createMutation.isPending || updateMutation.isPending
              }
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
