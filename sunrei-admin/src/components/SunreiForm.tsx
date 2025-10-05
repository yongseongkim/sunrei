'use client';

import {
  CreateSunreiRequest,
  PlaceInput,
  UpdateSunreiRequest,
} from '@/api/admin';
import ImageUpload from '@/components/ImageUpload';
import PlaceSearchModal from '@/components/PlaceSearchModal';
import SpotsMap from '@/components/SpotsMap';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { Textarea } from '@/components/ui/textarea';
import {
  useCreateSunrei,
  useSunrei,
  useUpdateSunrei,
} from '@/lib/hooks/use-sunreis';
import {
  AlertCircle,
  Loader2,
  Map,
  MapPin,
  Plus,
  Save,
  Trash2,
  X,
} from 'lucide-react';
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

  const { data: sunreiData, isLoading: loading } = useSunrei(sunreiId || '');
  const createMutation = useCreateSunrei();
  const updateMutation = useUpdateSunrei();

  const error =
    (createMutation.error as any)?.response?.data?.message ||
    (updateMutation.error as any)?.response?.data?.message ||
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

            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="title">Title *</Label>
                <Input
                  id="title"
                  {...register('title', { required: 'Title is required' })}
                  placeholder="Enter Sunrei title"
                />
                {errors.title && (
                  <p className="text-sm text-destructive">
                    {errors.title.message}
                  </p>
                )}
              </div>

              <div className="space-y-2">
                <Label htmlFor="link">Link</Label>
                <Input
                  id="link"
                  {...register('link')}
                  type="url"
                  placeholder="https://example.com"
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="description">Description *</Label>
              <Textarea
                id="description"
                {...register('description', {
                  required: 'Description is required',
                })}
                rows={3}
                placeholder="Describe this Sunrei location"
              />
              {errors.description && (
                <p className="text-sm text-destructive">
                  {errors.description.message}
                </p>
              )}
            </div>

            <Separator />

            <ImageUpload
              images={watch('images') || []}
              onChange={(newImages) => setValue('images', newImages)}
              label="Sunrei Images"
              maxImages={10}
            />

            <Separator />

            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <Label className="text-base">Spots</Label>
                <Button
                  type="button"
                  onClick={() =>
                    appendSpot({
                      title: '',
                      description: '',
                      youtubeLink: '',
                      place: null,
                      images: [],
                    })
                  }
                  size="sm"
                  variant="outline"
                >
                  <Plus className="h-4 w-4 mr-2" />
                  Add Spot
                </Button>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                {/* Spots List */}
                <div
                  className="space-y-4 overflow-y-auto"
                  style={{ maxHeight: '1000px' }}
                >
                  {spotFields.map((field, index) => (
                    <Card key={field.id}>
                      <CardHeader className="py-3">
                        <div className="flex items-center justify-between">
                          <span className="text-sm font-medium">
                            Spot {index + 1}
                          </span>
                          <Button
                            type="button"
                            onClick={() => removeSpot(index)}
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
                          register={register}
                          setValue={setValue}
                          watch={watch}
                          onOpenMap={openMapForPlace}
                        />
                        <ImageUpload
                          images={watch(`spots.${index}.images`) || []}
                          onChange={(newImages) =>
                            setValue(`spots.${index}.images`, newImages)
                          }
                          label="Spot Images"
                          maxImages={5}
                        />
                      </CardContent>
                    </Card>
                  ))}
                  {spotFields.length === 0 && (
                    <div className="text-center py-8 text-muted-foreground">
                      <MapPin className="h-12 w-12 mx-auto mb-2 opacity-50" />
                      <p className="text-sm">No spots added yet</p>
                      <p className="text-xs mt-1">
                        Click "Add Spot" to get started
                      </p>
                    </div>
                  )}
                </div>

                {/* Map */}
                <div className="lg:sticky lg:top-0">
                  <div className="space-y-2">
                    <div className="flex items-center gap-2">
                      <Map className="h-4 w-4" />
                      <Label className="text-sm">Spots Map</Label>
                    </div>
                    <SpotsMap
                      spots={spotFields.map((field, index) => ({
                        title:
                          watch(`spots.${index}.title`) || `Spot ${index + 1}`,
                        place: watch(`spots.${index}.place`),
                      }))}
                      height="980px"
                    />
                  </div>
                </div>
              </div>
            </div>

            <Separator />

            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={onCancel}>
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={createMutation.isPending || updateMutation.isPending}
              >
                {createMutation.isPending || updateMutation.isPending ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    {mode === 'create' ? 'Creating...' : 'Saving...'}
                  </>
                ) : (
                  <>
                    <Save className="mr-2 h-4 w-4" />
                    {mode === 'create' ? 'Create Sunrei' : 'Save Changes'}
                  </>
                )}
              </Button>
            </div>
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

function PlaceSection({
  spotIndex,
  register,
  setValue,
  watch,
  onOpenMap,
}: any) {
  const place = watch(`spots.${spotIndex}.place`);

  // Ensure place data is registered when it exists
  useEffect(() => {
    if (place) {
      setValue(`spots.${spotIndex}.place.id`, place.id);
      setValue(`spots.${spotIndex}.place.name`, place.name);
      setValue(`spots.${spotIndex}.place.address`, place.address);
      setValue(`spots.${spotIndex}.place.latitude`, place.latitude);
      setValue(`spots.${spotIndex}.place.longitude`, place.longitude);
    }
  }, [place, spotIndex, setValue]);

  const handleRemovePlace = () => {
    setValue(`spots.${spotIndex}.place`, null);
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <Label className="text-xs">Place</Label>
        <Button
          type="button"
          onClick={() => onOpenMap(spotIndex)}
          variant="outline"
          size="sm"
          className="h-7 text-xs"
        >
          <MapPin className="h-3 w-3 mr-1" />
          {place ? 'Edit Place' : 'Add Place'}
        </Button>
      </div>

      {place && (
        <div className="bg-muted rounded-md p-2 flex items-start justify-between">
          <div className="flex-1 space-y-0.5">
            <p className="text-xs font-medium">
              {place.name || 'Unnamed Place'}
            </p>
            <p className="text-xs text-muted-foreground">{place.address}</p>
            {place.latitude && place.longitude && (
              <p className="text-xs font-mono text-muted-foreground">
                {place.latitude.toFixed(6)}, {place.longitude.toFixed(6)}
              </p>
            )}
          </div>
          <Button
            type="button"
            onClick={handleRemovePlace}
            variant="ghost"
            size="sm"
            className="h-6 w-6 p-0"
          >
            <X className="h-3 w-3" />
          </Button>
        </div>
      )}
    </div>
  );
}
