'use client';

import { MultiSizeImageDTO, ImageDTO } from '@/api/admin';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { adminApi } from '@/lib/api-client';
import { cn } from '@/lib/utils';
import {
  AlertCircle,
  Image as ImageIcon,
  Link,
  Loader2,
  Plus,
  Upload,
  X,
} from 'lucide-react';
import { useRef, useState } from 'react';

interface ImageUploadProps {
  images: MultiSizeImageDTO[];
  onChange: (images: MultiSizeImageDTO[]) => void;
  maxImages?: number;
  label?: string;
  /** 작은 칸과 "+" 칸만 보여 준다. Sunrei 폼과 spot 카드가 쓴다. */
  compact?: boolean;
  /** compact 칸 크기다. spot 카드는 52px, Sunrei 이미지는 64px이다. */
  tileSize?: 52 | 64;
}

interface UploadingImage {
  id: string;
  preview: string;
  progress: number;
}

export default function ImageUpload({
  images,
  onChange,
  maxImages = 10,
  label = 'Images',
  compact = false,
  tileSize = 52,
}: ImageUploadProps) {
  const [uploadingImages, setUploadingImages] = useState<UploadingImage[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [urlInput, setUrlInput] = useState('');
  const [showUrl, setShowUrl] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    setError(null);
    const filesToUpload = Array.from(files).slice(0, maxImages - images.length);

    const newUploadingImages: UploadingImage[] = filesToUpload.map((file) => ({
      id: `uploading-${Date.now()}-${Math.random()}`,
      preview: URL.createObjectURL(file),
      progress: 0,
    }));

    setUploadingImages((prev) => [...prev, ...newUploadingImages]);

    try {
      const uploadPromises = filesToUpload.map(async (file, index) => {
        if (file.size > 5 * 1024 * 1024) {
          throw new Error(`File ${file.name} is too large. Max size is 5MB.`);
        }

        if (!file.type.startsWith('image/')) {
          throw new Error(`File ${file.name} is not an image.`);
        }

        setUploadingImages((prev) =>
          prev.map((img) =>
            img.id === newUploadingImages[index].id
              ? { ...img, progress: 50 }
              : img,
          ),
        );

        const response = await adminApi.uploadImage(file);

        setUploadingImages((prev) =>
          prev.filter((img) => img.id !== newUploadingImages[index].id),
        );
        URL.revokeObjectURL(newUploadingImages[index].preview);

        const multiSizeImage = response.data;
        if (
          !multiSizeImage ||
          !multiSizeImage.images ||
          multiSizeImage.images.length === 0
        ) {
          throw new Error('No image data returned from server');
        }

        return multiSizeImage;
      });

      const uploadedImages = await Promise.all(uploadPromises);
      const newImages = [...images, ...uploadedImages].slice(0, maxImages);
      onChange(newImages);
    } catch (err: any) {
      setError(err.message || 'Failed to upload image');
      setUploadingImages([]);
      newUploadingImages.forEach((img) => URL.revokeObjectURL(img.preview));
    } finally {
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  const handleUrlAdd = async () => {
    if (!urlInput.trim()) return;

    setError(null);

    const uploadingId = `uploading-url-${Date.now()}`;
    const uploadingImage: UploadingImage = {
      id: uploadingId,
      preview: urlInput,
      progress: 0,
    };

    setUploadingImages((prev) => [...prev, uploadingImage]);

    try {
      const url = new URL(urlInput);
      if (!url.protocol.startsWith('http')) {
        throw new Error('Invalid URL. Must start with http:// or https://');
      }

      setUploadingImages((prev) =>
        prev.map((img) =>
          img.id === uploadingId ? { ...img, progress: 50 } : img,
        ),
      );

      const response = await adminApi.uploadImageFromUrl({ url: urlInput });

      setUploadingImages((prev) =>
        prev.filter((img) => img.id !== uploadingId),
      );

      const multiSizeImage = response.data;
      if (
        !multiSizeImage ||
        !multiSizeImage.images ||
        multiSizeImage.images.length === 0
      ) {
        throw new Error('No image data returned from server');
      }

      const newImages = [...images, multiSizeImage].slice(0, maxImages);
      onChange(newImages);
      setUrlInput('');
    } catch (err: any) {
      setError(err.message || 'Failed to upload image from URL');
      setUploadingImages((prev) =>
        prev.filter((img) => img.id !== uploadingId),
      );
    }
  };

  const handleRemoveImage = (index: number) => {
    const newImages = images.filter((_, i) => i !== index);
    onChange(newImages);
  };

  if (compact) {
    const full = images.length + uploadingImages.length >= maxImages;
    const tile = { width: tileSize, height: tileSize };
    const radius = tileSize > 52 ? 'rounded-lg' : 'rounded-md';
    return (
      <div className="space-y-1.5">
        <div className="flex items-center gap-2">
          <Label className="text-[13px] font-semibold">{`${label} (${images.length}/${maxImages})`}</Label>
          {!full && (
            <button
              type="button"
              onClick={() => setShowUrl((v) => !v)}
              className="ml-auto text-xs text-muted-foreground hover:text-foreground"
            >
              From URL
            </button>
          )}
        </div>
        <div className={cn('flex flex-wrap', tileSize > 52 ? 'gap-2' : 'gap-1.5')}>
          {images.map((multiSizeImage, index) => {
            // 서버는 큰 것부터 담으므로 마지막이 작은 칸에 맞는 가장 작은 크기다.
            const smallest =
              multiSizeImage.images[multiSizeImage.images.length - 1];
            return (
              <div
                key={`${smallest?.url || index}-${index}`}
                className={cn('group relative overflow-hidden border bg-muted', radius)}
                style={tile}
              >
                {smallest?.url && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={smallest.url}
                    alt={`Image ${index + 1}`}
                    className="h-full w-full object-cover"
                  />
                )}
                <button
                  type="button"
                  onClick={() => handleRemoveImage(index)}
                  aria-label="Remove image"
                  className="absolute right-0.5 top-0.5 hidden h-4 w-4 place-items-center rounded-full bg-destructive text-white group-hover:grid"
                >
                  <X className="h-2.5 w-2.5" />
                </button>
              </div>
            );
          })}
          {uploadingImages.map((u) => (
            <div
              key={u.id}
              className={cn('grid place-items-center border bg-muted', radius)}
              style={tile}
            >
              <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
            </div>
          ))}
          {!full && (
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              aria-label="Add images"
              className={cn('grid place-items-center border border-dashed text-muted-foreground hover:bg-muted', radius)}
              style={tile}
            >
              <Plus className={tileSize > 52 ? 'h-4 w-4' : 'h-3.5 w-3.5'} />
            </button>
          )}
        </div>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          multiple
          className="hidden"
          onChange={handleFileUpload}
        />
        {showUrl && !full && (
          <div className="flex gap-1.5">
            <Input
              value={urlInput}
              onChange={(e) => setUrlInput(e.target.value)}
              placeholder="https://example.com/image.jpg"
              className="h-8 text-xs"
            />
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={handleUrlAdd}
              disabled={!urlInput.trim()}
            >
              Add
            </Button>
          </div>
        )}
        {error && (
          <p className="text-[11px] font-medium text-destructive">{error}</p>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <Label>{label}</Label>
        <Badge variant="outline">
          {images.length} / {maxImages} images
        </Badge>
      </div>

      {error && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {images.length < maxImages && (
        <Tabs defaultValue="file" className="w-full">
          <TabsList className={'grid w-full grid-cols-2'}>
            <TabsTrigger className={''} value="file">
              <Upload className={'h-4 w-4 mr-2'} />
              {'Upload File'}
            </TabsTrigger>
            <TabsTrigger className={''} value="url">
              <Link className={'h-4 w-4 mr-2'} />
              {'From URL'}
            </TabsTrigger>
          </TabsList>

          <TabsContent value="file" className={'mt-4'}>
            <Card className={''}>
              <CardContent className={'pt-6'}>
                <div className="space-y-1">
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*"
                    multiple
                    onChange={handleFileUpload}
                    disabled={uploadingImages.length > 0}
                    className="hidden"
                  />
                  <Button
                    type="button"
                    variant="outline"
                    className={'w-full'}
                    onClick={() => fileInputRef.current?.click()}
                    disabled={uploadingImages.length > 0}
                  >
                    {uploadingImages.length > 0 ? (
                      <>
                        <Loader2 className={'h-4 w-4 mr-2 animate-spin'} />
                        Uploading...
                      </>
                    ) : (
                      <>
                        <Plus className={'h-4 w-4 mr-2'} />
                        Choose Images
                      </>
                    )}
                  </Button>
                  <p className="text-xs text-muted-foreground text-center">
                    Max file size: 5MB. Supported formats: JPG, PNG, GIF, WebP
                  </p>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="url" className={'mt-4'}>
            <Card className={''}>
              <CardContent className={'pt-6'}>
                <div className="space-y-1">
                  <div className={'flex gap-2'}>
                    <Input
                      type="url"
                      placeholder="https://example.com/image.jpg"
                      value={urlInput}
                      onChange={(e) => setUrlInput(e.target.value)}
                      disabled={uploadingImages.length > 0}
                      className={''}
                    />
                    <Button
                      type="button"
                      onClick={handleUrlAdd}
                      disabled={uploadingImages.length > 0 || !urlInput.trim()}
                      className={''}
                    >
                      {uploadingImages.length > 0 ? (
                        <Loader2 className={'h-4 w-4 animate-spin'} />
                      ) : (
                        'Add'
                      )}
                    </Button>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Enter a direct link to an image. The image will be
                    downloaded and stored.
                  </p>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      )}

      {(images.length > 0 || uploadingImages.length > 0) && (
        <div className={'grid grid-cols-2 md:grid-cols-4 gap-4'}>
          {uploadingImages.map((uploadingImg) => (
            <div key={uploadingImg.id} className="relative">
              <Card className={'overflow-hidden'}>
                <div className="aspect-square relative">
                  <img
                    src={uploadingImg.preview}
                    alt="Uploading..."
                    className="w-full h-full object-cover opacity-50"
                    onError={(e) => {
                      (e.target as HTMLImageElement).src =
                        'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" width="100" height="100"%3E%3Crect width="100" height="100" fill="%23cccccc"/%3E%3C/svg%3E';
                    }}
                  />
                  <div className="absolute inset-0 flex items-center justify-center bg-black/30">
                    <div className="text-center">
                      <Loader2 className="h-8 w-8 animate-spin text-white mb-2 mx-auto" />
                      <p className="text-xs text-white">Uploading...</p>
                    </div>
                  </div>
                </div>
              </Card>
            </div>
          ))}

          {images.map((multiSizeImage, index) => {
            const largestImage =
              multiSizeImage.images[multiSizeImage.images.length - 1];

            return (
              <div
                key={`${largestImage?.url || index}-${index}`}
                className="relative group"
              >
                <Card className={'overflow-hidden'}>
                  <div className="aspect-square relative">
                    {largestImage?.url ? (
                      <img
                        src={largestImage.url}
                        alt={`Image ${index + 1}`}
                        className="w-full h-full object-cover"
                        onError={(e) => {
                          (e.target as HTMLImageElement).src =
                            'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" width="100" height="100"%3E%3Crect width="100" height="100" fill="%23cccccc"/%3E%3C/svg%3E';
                        }}
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center bg-muted">
                        <ImageIcon className="h-8 w-8 text-muted-foreground" />
                      </div>
                    )}
                    <Button
                      type="button"
                      variant="destructive"
                      size="sm"
                      className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity"
                      onClick={() => handleRemoveImage(index)}
                    >
                      <X className={'h-4 w-4'} />
                    </Button>
                  </div>
                  {largestImage?.width && largestImage?.height && (
                    <div className="p-2 text-xs text-muted-foreground text-center">
                      {largestImage.width} × {largestImage.height}
                    </div>
                  )}
                </Card>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
