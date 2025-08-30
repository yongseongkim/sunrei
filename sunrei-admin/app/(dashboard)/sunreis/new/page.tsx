'use client';

import { CreateSunreiRequest } from '@/api';
import { adminApi } from '@/lib/api-client';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { useFieldArray, useForm } from 'react-hook-form';

export default function NewSunreiPage() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  
  const {
    register,
    control,
    handleSubmit,
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
      router.push('/sunreis');
    } catch (err: any) {
      setError(err.response?.data?.message || 'Failed to create Sunrei');
    }
  };

  return (
    <div>
      <h1 className="text-3xl font-bold text-gray-900 mb-6">Create New Sunrei</h1>
      
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-6 max-w-4xl">
        {error && (
          <div className="rounded-md bg-red-50 p-4">
            <p className="text-sm text-red-800">{error}</p>
          </div>
        )}

        <div className="bg-white shadow rounded-lg p-6">
          <h2 className="text-lg font-medium mb-4">Basic Information</h2>
          
          <div className="grid grid-cols-1 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700">
                Title *
              </label>
              <input
                {...register('title', { required: 'Title is required' })}
                type="text"
                className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500"
              />
              {errors.title && (
                <p className="mt-1 text-sm text-red-600">{errors.title.message}</p>
              )}
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700">
                Description *
              </label>
              <textarea
                {...register('description', { required: 'Description is required' })}
                rows={4}
                className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500"
              />
              {errors.description && (
                <p className="mt-1 text-sm text-red-600">{errors.description.message}</p>
              )}
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700">
                Link
              </label>
              <input
                {...register('link')}
                type="url"
                className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500"
              />
            </div>
          </div>
        </div>

        <div className="bg-white shadow rounded-lg p-6">
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-lg font-medium">Spots</h2>
            <button
              type="button"
              onClick={() => appendSpot({ 
                title: '', 
                description: '', 
                youtubeLink: '', 
                places: [],
                images: [] 
              })}
              className="px-4 py-2 text-sm font-medium text-white bg-indigo-600 rounded-md hover:bg-indigo-700"
            >
              Add Spot
            </button>
          </div>

          {spotFields.map((field, index) => (
            <div key={field.id} className="border rounded-lg p-4 mb-4">
              <div className="flex justify-between items-start mb-2">
                <h3 className="font-medium">Spot {index + 1}</h3>
                <button
                  type="button"
                  onClick={() => removeSpot(index)}
                  className="text-red-600 hover:text-red-900"
                >
                  Remove
                </button>
              </div>

              <div className="grid grid-cols-1 gap-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700">
                    Title *
                  </label>
                  <input
                    {...register(`spots.${index}.title` as const, { 
                      required: 'Spot title is required' 
                    })}
                    type="text"
                    className="mt-1 block w-full rounded-md border-gray-300 shadow-sm"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700">
                    Description
                  </label>
                  <textarea
                    {...register(`spots.${index}.description` as const)}
                    rows={2}
                    className="mt-1 block w-full rounded-md border-gray-300 shadow-sm"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700">
                    YouTube Link
                  </label>
                  <input
                    {...register(`spots.${index}.youtubeLink` as const)}
                    type="url"
                    className="mt-1 block w-full rounded-md border-gray-300 shadow-sm"
                  />
                </div>

                <div className="border-t pt-3">
                  <PlacesInput
                    control={control}
                    spotIndex={index}
                    register={register}
                  />
                </div>
              </div>
            </div>
          ))}
        </div>

        <div className="flex justify-end space-x-3">
          <button
            type="button"
            onClick={() => router.push('/sunreis')}
            className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={isSubmitting}
            className="px-4 py-2 text-sm font-medium text-white bg-indigo-600 rounded-md hover:bg-indigo-700 disabled:opacity-50"
          >
            {isSubmitting ? 'Creating...' : 'Create Sunrei'}
          </button>
        </div>
      </form>
    </div>
  );
}

function PlacesInput({ control, spotIndex, register }: any) {
  const { fields, append, remove } = useFieldArray({
    control,
    name: `spots.${spotIndex}.places`,
  });

  return (
    <div>
      <div className="flex justify-between items-center mb-2">
        <label className="block text-sm font-medium text-gray-700">Places</label>
        <button
          type="button"
          onClick={() => append({ name: '', address: '', latitude: null, longitude: null })}
          className="text-sm text-indigo-600 hover:text-indigo-500"
        >
          Add Place
        </button>
      </div>

      {fields.map((field, placeIndex) => (
        <div key={field.id} className="bg-gray-50 rounded p-3 mb-2">
          <div className="flex justify-end mb-1">
            <button
              type="button"
              onClick={() => remove(placeIndex)}
              className="text-xs text-red-600 hover:text-red-900"
            >
              Remove
            </button>
          </div>
          
          <div className="grid grid-cols-2 gap-2">
            <div>
              <input
                {...register(`spots.${spotIndex}.places.${placeIndex}.name` as const)}
                placeholder="Place name"
                className="w-full px-2 py-1 text-sm border rounded"
              />
            </div>
            <div>
              <input
                {...register(`spots.${spotIndex}.places.${placeIndex}.address` as const)}
                placeholder="Address"
                className="w-full px-2 py-1 text-sm border rounded"
              />
            </div>
            <div>
              <input
                {...register(`spots.${spotIndex}.places.${placeIndex}.latitude` as const, {
                  valueAsNumber: true,
                })}
                type="number"
                step="any"
                placeholder="Latitude"
                className="w-full px-2 py-1 text-sm border rounded"
              />
            </div>
            <div>
              <input
                {...register(`spots.${spotIndex}.places.${placeIndex}.longitude` as const, {
                  valueAsNumber: true,
                })}
                type="number"
                step="any"
                placeholder="Longitude"
                className="w-full px-2 py-1 text-sm border rounded"
              />
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}