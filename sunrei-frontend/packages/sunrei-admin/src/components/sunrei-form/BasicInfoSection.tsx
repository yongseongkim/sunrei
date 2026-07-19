import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { FieldErrors, UseFormRegister } from 'react-hook-form';
import { SunreiFormValue } from '@/lib/schemas';

interface BasicInfoSectionProps {
  register: UseFormRegister<SunreiFormValue>;
  errors: FieldErrors<SunreiFormValue>;
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
            {...register('title')}
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
        <Label htmlFor="description">Description</Label>
        <Textarea
          id="description"
          {...register('description')}
          rows={3}
          placeholder="Describe this Sunrei"
        />
      </div>
    </div>
  );
}
