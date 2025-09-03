'use client';

import { CreateSunreiRequest, ImageInput, PlaceInput, SunreiDTO, UpdateSunreiRequest } from '@/api';
import PlaceSearchModal from '@/components/PlaceSearchModalNew';
import ImageUpload from '@/components/ImageUpload';
import { adminApi } from '@/lib/api-client';
import { useEffect, useState } from 'react';
import { useFieldArray, useForm } from 'react-hook-form';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Separator } from '@/components/ui/separator';
import { 
  Plus, Edit2, Trash2, MapPin, AlertCircle, Loader2, 
  X, Save, ChevronDown, ChevronRight, Image
} from 'lucide-react';

export default function SunreisPage() {
  const [sunreis, setSunreis] = useState<SunreiDTO[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [creatingNew, setCreatingNew] = useState(false);
  
  // For place modal
  const [mapModalOpen, setMapModalOpen] = useState(false);
  const [currentSpotIndex, setCurrentSpotIndex] = useState<number | null>(null);
  const [editingPlace, setEditingPlace] = useState<PlaceInput | undefined>();

  useEffect(() => {
    fetchSunreis();
  }, []);

  const fetchSunreis = async () => {
    try {
      setLoading(true);
      setError(null);
      // Using page 1 with large size to get all items for now
      const response = await adminApi.adminListSunreis(1, 100);
      setSunreis(response.data.data || []);
    } catch (err: any) {
      setError(err.response?.data?.message || 'Failed to fetch Sunreis');
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Are you sure you want to delete this Sunrei?')) return;
    
    try {
      await adminApi.deleteSunrei(id);
      await fetchSunreis();
    } catch (err: any) {
      setError(err.response?.data?.message || 'Failed to delete Sunrei');
    }
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
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Sunreis</h1>
          <p className="text-muted-foreground mt-2">Manage all Sunrei locations</p>
        </div>
        {!creatingNew && (
          <Button onClick={() => setCreatingNew(true)}>
            <Plus className="h-4 w-4 mr-2" />
            New Sunrei
          </Button>
        )}
      </div>

      {error && (
        <Alert variant="destructive" className="mb-6">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      <div className="space-y-4">
        {creatingNew && (
          <CreateSunreiForm
            onCancel={() => setCreatingNew(false)}
            onSuccess={() => {
              setCreatingNew(false);
              fetchSunreis();
            }}
          />
        )}

        {sunreis.length === 0 && !creatingNew ? (
          <Card>
            <CardContent className="text-center py-12">
              <MapPin className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
              <h3 className="text-lg font-medium mb-2">No Sunreis yet</h3>
              <p className="text-muted-foreground mb-4">
                Get started by creating your first Sunrei location.
              </p>
              <Button onClick={() => setCreatingNew(true)}>
                <Plus className="h-4 w-4 mr-2" />
                Create First Sunrei
              </Button>
            </CardContent>
          </Card>
        ) : (
          sunreis.map((sunrei) => (
            <SunreiCard
              key={sunrei.id}
              sunrei={sunrei}
              isEditing={editingId === sunrei.id}
              isExpanded={expandedId === sunrei.id}
              onEdit={() => setEditingId(sunrei.id)}
              onCancelEdit={() => setEditingId(null)}
              onToggleExpand={() => setExpandedId(expandedId === sunrei.id ? null : sunrei.id)}
              onDelete={() => handleDelete(sunrei.id!)}
              onUpdate={() => {
                setEditingId(null);
                fetchSunreis();
              }}
            />
          ))
        )}
      </div>
    </div>
  );
}

function SunreiCard({ 
  sunrei, 
  isEditing, 
  isExpanded,
  onEdit, 
  onCancelEdit,
  onToggleExpand,
  onDelete,
  onUpdate
}: {
  sunrei: SunreiDTO;
  isEditing: boolean;
  isExpanded: boolean;
  onEdit: () => void;
  onCancelEdit: () => void;
  onToggleExpand: () => void;
  onDelete: () => void;
  onUpdate: () => void;
}) {
  const [error, setError] = useState<string | null>(null);
  const [mapModalOpen, setMapModalOpen] = useState(false);
  const [currentSpotIndex, setCurrentSpotIndex] = useState<number | null>(null);
  const [editingPlace, setEditingPlace] = useState<PlaceInput | undefined>();

  const {
    register,
    control,
    handleSubmit,
    setValue,
    watch,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<UpdateSunreiRequest>({
    defaultValues: {
      title: sunrei.title,
      description: sunrei.description,
      link: sunrei.link || '',
      spots: sunrei.spots?.map(spot => ({
        id: spot.id,
        title: spot.title,
        description: spot.description || '',
        youtubeLink: spot.youtubeLink || '',
        place: spot.place || null,
        images: spot.images || []
      })) || [],
      tagIds: sunrei.tags?.map(t => t.id!) || [],
      images: sunrei.images || []
    },
  });

  const { fields: spotFields, append: appendSpot, remove: removeSpot } = useFieldArray({
    control,
    name: 'spots',
  });

  const onSubmit = async (data: UpdateSunreiRequest) => {
    try {
      setError(null);
      await adminApi.updateSunrei(sunrei.id!, data);
      onUpdate();
    } catch (err: any) {
      setError(err.response?.data?.message || 'Failed to update Sunrei');
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

  if (isEditing) {
    return (
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle>Edit Sunrei</CardTitle>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                reset();
                onCancelEdit();
              }}
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
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
                />
                {errors.title && (
                  <p className="text-sm text-destructive">{errors.title.message}</p>
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
                {...register('description', { required: 'Description is required' })}
                rows={3}
              />
              {errors.description && (
                <p className="text-sm text-destructive">{errors.description.message}</p>
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

            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <Label>Spots</Label>
                <Button
                  type="button"
                  onClick={() => appendSpot({ 
                    title: '', 
                    description: '', 
                    youtubeLink: '', 
                    place: null,
                    images: [] 
                  })}
                  size="sm"
                  variant="outline"
                >
                  <Plus className="h-4 w-4 mr-2" />
                  Add Spot
                </Button>
              </div>

              {spotFields.map((field, index) => (
                <Card key={field.id}>
                  <CardHeader className="py-3">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium">Spot {index + 1}</span>
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
                        required: 'Spot title is required' 
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
                    <PlacesSection
                      spotIndex={index}
                      register={register}
                      setValue={setValue}
                      watch={watch}
                      onOpenMap={openMapForPlace}
                    />
                    <ImageUpload
                      images={watch(`spots.${index}.images`) || []}
                      onChange={(newImages) => setValue(`spots.${index}.images`, newImages)}
                      label="Spot Images"
                      maxImages={5}
                    />
                  </CardContent>
                </Card>
              ))}
            </div>

            <div className="flex justify-end gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  reset();
                  onCancelEdit();
                }}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={isSubmitting}>
                {isSubmitting ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Saving...
                  </>
                ) : (
                  <>
                    <Save className="mr-2 h-4 w-4" />
                    Save Changes
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
    );
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={onToggleExpand}
              className="p-0 h-auto"
            >
              {isExpanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
            </Button>
            <div>
              <CardTitle className="text-lg">{sunrei.title}</CardTitle>
              <CardDescription className="line-clamp-1">{sunrei.description}</CardDescription>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant="secondary">{sunrei.spots?.length || 0} spots</Badge>
            <Button variant="ghost" size="sm" onClick={onEdit}>
              <Edit2 className="h-4 w-4" />
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={onDelete}
              className="text-destructive hover:text-destructive"
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </CardHeader>
      {isExpanded && (
        <CardContent>
          <div className="space-y-3">
            <div>
              <p className="text-sm text-muted-foreground">{sunrei.description}</p>
              {sunrei.link && (
                <a href={sunrei.link} target="_blank" rel="noopener noreferrer" 
                   className="text-sm text-primary hover:underline">
                  {sunrei.link}
                </a>
              )}
            </div>
            {sunrei.images && sunrei.images.length > 0 && (
              <>
                <Separator />
                <div className="space-y-2">
                  <p className="text-sm font-medium">Images:</p>
                  <div className="grid grid-cols-4 gap-2">
                    {sunrei.images.map((image, index) => (
                      <div key={image.id || index} className="aspect-square rounded-md overflow-hidden bg-muted">
                        <img
                          src={image.url}
                          alt={`Sunrei image ${index + 1}`}
                          className="w-full h-full object-cover"
                        />
                      </div>
                    ))}
                  </div>
                </div>
              </>
            )}
            {sunrei.spots && sunrei.spots.length > 0 && (
              <>
                <Separator />
                <div className="space-y-2">
                  <p className="text-sm font-medium">Spots:</p>
                  {sunrei.spots.map((spot, index) => (
                    <div key={spot.id} className="pl-4 space-y-1">
                      <p className="text-sm font-medium">{index + 1}. {spot.title}</p>
                      {spot.description && (
                        <p className="text-sm text-muted-foreground pl-4">{spot.description}</p>
                      )}
                      {spot.place && (
                        <div className="pl-4 flex items-center gap-2">
                          <MapPin className="h-3 w-3" />
                          <span className="text-xs text-muted-foreground">
                            {spot.place.name} - {spot.place.address}
                          </span>
                        </div>
                      )}
                      {spot.images && spot.images.length > 0 && (
                        <div className="pl-4 mt-2">
                          <div className="flex gap-1">
                            {spot.images.slice(0, 3).map((image, imgIndex) => (
                              <div key={image.id || imgIndex} className="w-12 h-12 rounded overflow-hidden bg-muted">
                                <img
                                  src={image.url}
                                  alt={`Spot image ${imgIndex + 1}`}
                                  className="w-full h-full object-cover"
                                />
                              </div>
                            ))}
                            {spot.images.length > 3 && (
                              <div className="w-12 h-12 rounded bg-muted flex items-center justify-center">
                                <span className="text-xs text-muted-foreground">+{spot.images.length - 3}</span>
                              </div>
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>
        </CardContent>
      )}
    </Card>
  );
}

function CreateSunreiForm({ onCancel, onSuccess }: { onCancel: () => void; onSuccess: () => void }) {
  const [error, setError] = useState<string | null>(null);
  const [mapModalOpen, setMapModalOpen] = useState(false);
  const [currentSpotIndex, setCurrentSpotIndex] = useState<number | null>(null);
  const [editingPlace, setEditingPlace] = useState<PlaceInput | undefined>();

  const {
    register,
    control,
    handleSubmit,
    setValue,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<CreateSunreiRequest>({
    defaultValues: {
      spots: [],
      tagIds: [],
      images: [],
    },
  });

  const { fields: spotFields, append: appendSpot, remove: removeSpot } = useFieldArray({
    control,
    name: 'spots',
  });

  const onSubmit = async (data: CreateSunreiRequest) => {
    try {
      setError(null);
      await adminApi.createSunrei(data);
      onSuccess();
    } catch (err: any) {
      setError(err.response?.data?.message || 'Failed to create Sunrei');
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

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle>Create New Sunrei</CardTitle>
          <Button variant="ghost" size="sm" onClick={onCancel}>
            <X className="h-4 w-4" />
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
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
                <p className="text-sm text-destructive">{errors.title.message}</p>
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
              {...register('description', { required: 'Description is required' })}
              rows={3}
              placeholder="Describe this Sunrei location"
            />
            {errors.description && (
              <p className="text-sm text-destructive">{errors.description.message}</p>
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

          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <Label>Spots</Label>
              <Button
                type="button"
                onClick={() => appendSpot({ 
                  title: '', 
                  description: '', 
                  youtubeLink: '', 
                  place: null,
                  images: [] 
                })}
                size="sm"
                variant="outline"
              >
                <Plus className="h-4 w-4 mr-2" />
                Add Spot
              </Button>
            </div>

            {spotFields.map((field, index) => (
              <Card key={field.id}>
                <CardHeader className="py-3">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium">Spot {index + 1}</span>
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
                      required: 'Spot title is required' 
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
                  <PlacesSection
                    spotIndex={index}
                    register={register}
                    setValue={setValue}
                    watch={watch}
                    onOpenMap={openMapForPlace}
                  />
                  <ImageUpload
                    images={watch(`spots.${index}.images`) || []}
                    onChange={(newImages) => setValue(`spots.${index}.images`, newImages)}
                    label="Spot Images"
                    maxImages={5}
                  />
                </CardContent>
              </Card>
            ))}
          </div>

          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={onCancel}>
              Cancel
            </Button>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Creating...
                </>
              ) : (
                'Create Sunrei'
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
  );
}

function PlacesSection({ spotIndex, register, setValue, watch, onOpenMap }: any) {
  const place = watch(`spots.${spotIndex}.place`);

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
            <p className="text-xs font-medium">{place.name || 'Unnamed Place'}</p>
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
          
          {/* Hidden inputs */}
          <input type="hidden" {...register(`spots.${spotIndex}.place.id` as const)} />
          <input type="hidden" {...register(`spots.${spotIndex}.place.name` as const)} />
          <input type="hidden" {...register(`spots.${spotIndex}.place.address` as const)} />
          <input type="hidden" {...register(`spots.${spotIndex}.place.latitude` as const)} />
          <input type="hidden" {...register(`spots.${spotIndex}.place.longitude` as const)} />
        </div>
      )}
    </div>
  );
}