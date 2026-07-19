'use client';

import { sourceSchema, SourceFormValue } from '@/lib/schemas';
import { useCreateSource, useSource, useUpdateSource } from '@/lib/hooks/use-sources';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import ImageUpload from '@/components/ImageUpload';
import { zodResolver } from '@hookform/resolvers/zod';
import { AlertCircle, Loader2 } from 'lucide-react';
import { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { useRouter } from 'next/navigation';
import { CreateSourceRequest, UpdateSourceRequest } from '@/api/admin';

type SourceFormProps = {
  mode: 'create' | 'edit';
  sourceId?: string;
};

const TYPES: SourceFormValue['type'][] = ['YOUTUBE', 'TV', 'ANIME', 'OTHER'];

export default function SourceForm({ mode, sourceId }: SourceFormProps) {
  const router = useRouter();
  const { data: source, isLoading } = useSource(sourceId || '');
  const createMutation = useCreateSource();
  const updateMutation = useUpdateSource();

  const {
    register,
    handleSubmit,
    watch,
    setValue,
    reset,
    formState: { errors },
  } = useForm<SourceFormValue>({
    resolver: zodResolver(sourceSchema),
    defaultValues: {
      type: 'YOUTUBE',
      name: '',
      nameEn: '',
      nameKo: '',
      synopsis: '',
      externalUrl: '',
      posterImage: null,
    },
  });

  useEffect(() => {
    if (source) {
      reset({
        type: source.type,
        name: source.name,
        nameEn: source.nameEn ?? '',
        nameKo: source.nameKo ?? '',
        synopsis: source.synopsis ?? '',
        externalUrl: source.externalUrl ?? '',
        posterImage: source.posterImage ?? null,
      });
    }
  }, [source, reset]);

  const type = watch('type');
  const isYoutube = type === 'YOUTUBE';

  const onSubmit = (data: SourceFormValue) => {
    const payload: CreateSourceRequest = {
      type: data.type,
      name: data.name,
      nameEn: data.nameEn || null,
      nameKo: data.nameKo || null,
      synopsis: data.synopsis || null,
      externalUrl: data.externalUrl || null,
      posterImage: data.posterImage ?? null,
    };

    if (mode === 'edit' && sourceId) {
      updateMutation.mutate(
        { id: sourceId, data: payload as UpdateSourceRequest },
        { onSuccess: () => router.push('/sources') }
      );
    } else {
      createMutation.mutate(payload, {
        onSuccess: () => router.push('/sources'),
      });
    }
  };

  const error =
    (createMutation.error as { response?: { data?: { error?: string } } })?.response?.data
      ?.error ||
    (updateMutation.error as { response?: { data?: { error?: string } } })?.response?.data
      ?.error ||
    null;

  if (isLoading) {
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
          {mode === 'create' ? 'New Source' : 'Edit Source'}
        </h1>
        <p className="text-muted-foreground mt-2">
          {isYoutube
            ? 'YouTube source — provides the channel/watch link.'
            : 'Managed work (TV/Anime/Other) — renders a Sunrei info page.'}
        </p>
      </div>

      <Card>
        <CardContent className="pt-6">
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            {error && (
              <Alert variant="destructive">
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}

            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label>Type *</Label>
                <div className="flex gap-2 flex-wrap">
                  {TYPES.map((t) => (
                    <Button
                      key={t}
                      type="button"
                      variant={type === t ? 'default' : 'outline'}
                      size="sm"
                      onClick={() => setValue('type', t)}
                    >
                      {t}
                    </Button>
                  ))}
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="name">Name *</Label>
                <Input id="name" {...register('name')} placeholder="Source name" />
                {errors.name && (
                  <p className="text-sm text-destructive">{errors.name.message as string}</p>
                )}
              </div>
            </div>

            {!isYoutube && (
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="nameEn">Name (English)</Label>
                  <Input id="nameEn" {...register('nameEn')} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="nameKo">Name (한국어)</Label>
                  <Input id="nameKo" {...register('nameKo')} />
                </div>
                <div className="space-y-2 md:col-span-2">
                  <Label htmlFor="synopsis">Synopsis</Label>
                  <Textarea id="synopsis" {...register('synopsis')} rows={3} />
                </div>
                <div className="space-y-2 md:col-span-2">
                  <Label>Poster image</Label>
                  <ImageUpload
                    images={watch('posterImage') ? [watch('posterImage')!] : []}
                    onChange={(imgs) => setValue('posterImage', imgs[0] ?? null)}
                    label="Poster"
                    maxImages={1}
                  />
                </div>
              </div>
            )}

            <div className="space-y-2">
              <Label htmlFor="externalUrl">
                {isYoutube ? 'Channel / watch URL *' : 'Where to watch'}
              </Label>
              <Input
                id="externalUrl"
                {...register('externalUrl')}
                type="url"
                placeholder="https://..."
              />
              {errors.externalUrl && (
                <p className="text-sm text-destructive">
                  {errors.externalUrl.message as string}
                </p>
              )}
            </div>

            <div className="flex gap-2 justify-end">
              <Button type="button" variant="outline" onClick={() => router.push('/sources')}>
                Cancel
              </Button>
              <Button type="submit" disabled={createMutation.isPending || updateMutation.isPending}>
                {mode === 'create' ? 'Create' : 'Save'}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
