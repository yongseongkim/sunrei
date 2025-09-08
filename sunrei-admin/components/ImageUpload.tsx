'use client';

import { useState, useRef } from 'react';
import { ImageInput } from '@/api/admin';
import { adminApi } from '@/lib/api-client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { 
  Upload, Link, X, Loader2, Image as ImageIcon, 
  AlertCircle, Plus 
} from 'lucide-react';

interface ImageUploadProps {
  images: ImageInput[];
  onChange: (images: ImageInput[]) => void;
  maxImages?: number;
  label?: string;
}

export default function ImageUpload({ 
  images, 
  onChange, 
  maxImages = 10,
  label = "Images"
}: ImageUploadProps) {
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [urlInput, setUrlInput] = useState('');
  const [uploadMode, setUploadMode] = useState<'file' | 'url'>('file');
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    setUploading(true);
    setError(null);

    try {
      const uploadPromises = Array.from(files).map(async (file) => {
        // Check file size (max 5MB)
        if (file.size > 5 * 1024 * 1024) {
          throw new Error(`File ${file.name} is too large. Max size is 5MB.`);
        }

        // Check file type
        if (!file.type.startsWith('image/')) {
          throw new Error(`File ${file.name} is not an image.`);
        }

        // Create FormData for upload
        const formData = new FormData();
        formData.append('file', file);

        // Upload to S3 via API
        const response = await adminApi.uploadImage(file);
        
        return {
          url: response.data.url,
          width: response.data.width,
          height: response.data.height,
        } as ImageInput;
      });

      const uploadedImages = await Promise.all(uploadPromises);
      const newImages = [...images, ...uploadedImages].slice(0, maxImages);
      onChange(newImages);
    } catch (err: any) {
      setError(err.message || 'Failed to upload image');
    } finally {
      setUploading(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  const handleUrlAdd = async () => {
    if (!urlInput.trim()) return;

    setUploading(true);
    setError(null);

    try {
      // Validate URL
      const url = new URL(urlInput);
      if (!url.protocol.startsWith('http')) {
        throw new Error('Invalid URL. Must start with http:// or https://');
      }

      // Upload URL to S3 via API (server will download and store)
      const response = await adminApi.uploadImageFromUrl({ url: urlInput });
      
      const newImage: ImageInput = {
        url: response.data.url,
        width: response.data.width,
        height: response.data.height,
      };

      const newImages = [...images, newImage].slice(0, maxImages);
      onChange(newImages);
      setUrlInput('');
    } catch (err: any) {
      setError(err.message || 'Failed to upload image from URL');
    } finally {
      setUploading(false);
    }
  };

  const handleRemoveImage = (index: number) => {
    const newImages = images.filter((_, i) => i !== index);
    onChange(newImages);
  };

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
        <Card>
          <CardContent className="pt-6">
            <div className="space-y-4">
              <div className="flex gap-2">
                <Button
                  type="button"
                  variant={uploadMode === 'file' ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => setUploadMode('file')}
                >
                  <Upload className="h-4 w-4 mr-2" />
                  Upload File
                </Button>
                <Button
                  type="button"
                  variant={uploadMode === 'url' ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => setUploadMode('url')}
                >
                  <Link className="h-4 w-4 mr-2" />
                  From URL
                </Button>
              </div>

              {uploadMode === 'file' ? (
                <div className="space-y-2">
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*"
                    multiple
                    onChange={handleFileUpload}
                    disabled={uploading}
                    className="hidden"
                  />
                  <Button
                    type="button"
                    variant="outline"
                    className="w-full"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={uploading}
                  >
                    {uploading ? (
                      <>
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                        Uploading...
                      </>
                    ) : (
                      <>
                        <Plus className="h-4 w-4 mr-2" />
                        Choose Images
                      </>
                    )}
                  </Button>
                  <p className="text-xs text-muted-foreground text-center">
                    Max file size: 5MB. Supported formats: JPG, PNG, GIF, WebP
                  </p>
                </div>
              ) : (
                <div className="space-y-2">
                  <div className="flex gap-2">
                    <Input
                      type="url"
                      placeholder="https://example.com/image.jpg"
                      value={urlInput}
                      onChange={(e) => setUrlInput(e.target.value)}
                      disabled={uploading}
                    />
                    <Button
                      type="button"
                      onClick={handleUrlAdd}
                      disabled={uploading || !urlInput.trim()}
                    >
                      {uploading ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        'Add'
                      )}
                    </Button>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Enter a direct link to an image. The image will be downloaded and stored.
                  </p>
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {images.length > 0 && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {images.map((image, index) => (
            <div key={index} className="relative group">
              <Card className="overflow-hidden">
                <div className="aspect-square relative">
                  {image.url ? (
                    <img
                      src={image.url}
                      alt={`Image ${index + 1}`}
                      className="w-full h-full object-cover"
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
                    <X className="h-4 w-4" />
                  </Button>
                </div>
                {image.width && image.height && (
                  <div className="p-2 text-xs text-muted-foreground text-center">
                    {image.width} × {image.height}
                  </div>
                )}
              </Card>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}