import { CreateSunreiRequest, UpdateSunreiRequest } from '@/api/admin';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { FieldErrors, UseFormRegister } from 'react-hook-form';

type FormData = CreateSunreiRequest | UpdateSunreiRequest;

interface BasicInfoSectionProps {
  register: UseFormRegister<FormData>;
  errors: FieldErrors<FormData>;
}

export default function BasicInfoSection({
  register,
  errors,
}: BasicInfoSectionProps) {
  return (
    <div className="space-y-4">
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
              {errors.title.message as string}
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
            {errors.description.message as string}
          </p>
        )}
      </div>
    </div>
  );
}
