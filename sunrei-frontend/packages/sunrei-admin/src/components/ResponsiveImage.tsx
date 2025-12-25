'use client';

import { useEffect, useState } from 'react';
import { MultiSizeImageDTO, ImageDTO } from '@/api/admin';
import { cn } from '@/lib/utils';

interface ResponsiveImageProps {
  multiSizeImage?: MultiSizeImageDTO;
  alt: string;
  className?: string;
  size?: 'small' | 'medium' | 'large' | 'original' | 'auto';
  fallbackSrc?: string;
  priority?: boolean;
  onError?: () => void;
  onClick?: () => void;
}

/**
 * ResponsiveImage component that automatically selects the appropriate image size
 * based on the specified size prop or container size
 */
export default function ResponsiveImage({
  multiSizeImage,
  alt,
  className,
  size = 'auto',
  fallbackSrc = 'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" width="100" height="100"%3E%3Crect width="100" height="100" fill="%23e5e7eb"/%3E%3C/svg%3E',
  priority = false,
  onError,
  onClick,
}: ResponsiveImageProps) {
  const [selectedImage, setSelectedImage] = useState<ImageDTO | null>(null);
  const [imageSrc, setImageSrc] = useState<string>(fallbackSrc);
  const [containerWidth, setContainerWidth] = useState<number>(0);
  const [imgError, setImgError] = useState(false);

  // Select the appropriate image based on size
  useEffect(() => {
    if (!multiSizeImage?.images || multiSizeImage.images.length === 0) {
      setSelectedImage(null);
      setImageSrc(fallbackSrc);
      return;
    }

    const images = multiSizeImage.images;
    let selected: ImageDTO | null = null;

    if (size === 'auto') {
      // Auto-select based on container width
      // Default to medium size when container width is not yet measured
      if (containerWidth === 0) {
        selected = images[1] || images[0]; // Default to medium or first available
      } else if (containerWidth > 800) {
        selected = images[0]; // Original
      } else if (containerWidth > 400) {
        selected =
          images.find((img) => img.width && img.width <= 800) ||
          images[1] ||
          images[0];
      } else if (containerWidth > 150) {
        selected =
          images.find((img) => img.width && img.width <= 400) ||
          images[2] ||
          images[1] ||
          images[0];
      } else {
        selected =
          images.find((img) => img.width && img.width <= 150) ||
          images[images.length - 1];
      }
    } else {
      // Manual size selection
      switch (size) {
        case 'original':
          selected = images[0];
          break;
        case 'large':
          // Find image around 800px or fallback
          selected =
            images.find(
              (img) => img.width && img.width > 600 && img.width <= 1000,
            ) ||
            images[1] ||
            images[0];
          break;
        case 'medium':
          // Find image around 400px or fallback
          selected =
            images.find(
              (img) => img.width && img.width > 300 && img.width <= 600,
            ) ||
            images[2] ||
            images[1] ||
            images[0];
          break;
        case 'small':
          // Find smallest image or around 150px
          selected =
            images.find((img) => img.width && img.width <= 200) ||
            images[images.length - 1];
          break;
      }
    }

    if (selected) {
      setSelectedImage(selected);
      setImageSrc(selected.url);
    }
  }, [multiSizeImage, size, containerWidth, fallbackSrc]);

  // Measure container width for auto sizing
  useEffect(() => {
    if (size !== 'auto') return;

    const measureContainer = () => {
      const img = document.getElementById(`responsive-img-${alt}`);
      if (img && img.parentElement) {
        setContainerWidth(img.parentElement.clientWidth);
      }
    };

    measureContainer();
    window.addEventListener('resize', measureContainer);

    // Initial measurement after mount
    const timer = setTimeout(measureContainer, 100);

    return () => {
      window.removeEventListener('resize', measureContainer);
      clearTimeout(timer);
    };
  }, [size, alt]);

  const handleError = () => {
    setImgError(true);
    setImageSrc(fallbackSrc);
    onError?.();
  };

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      id={`responsive-img-${alt}`}
      src={imageSrc}
      alt={alt}
      className={cn('transition-opacity duration-200', className, {
        'cursor-pointer': onClick,
      })}
      loading={priority ? 'eager' : 'lazy'}
      onError={handleError}
      onClick={onClick}
      width={selectedImage?.width}
      height={selectedImage?.height}
    />
  );
}

/**
 * Helper hook to get the first image from MultiSizeImageDTO array
 */
export function useFirstImage(
  images?: MultiSizeImageDTO[],
): MultiSizeImageDTO | undefined {
  return images && images.length > 0 ? images[0] : undefined;
}

/**
 * Helper function to get image URL by size from MultiSizeImageDTO
 */
export function getImageUrl(
  multiSizeImage?: MultiSizeImageDTO,
  size: 'small' | 'medium' | 'large' | 'original' = 'medium',
): string {
  if (!multiSizeImage?.images || multiSizeImage.images.length === 0) {
    return '';
  }

  const images = multiSizeImage.images;

  // Get the appropriate size from images array
  switch (size) {
    case 'small':
      // Get smallest image
      return images[images.length - 1]?.url || '';
    case 'medium':
      // Get middle image
      return images[Math.floor(images.length / 2)]?.url || '';
    case 'large':
      // Get second image (if exists)
      return (images[1] || images[0])?.url || '';
    case 'original':
      return images[0]?.url || '';
    default:
      return images[0]?.url || '';
  }
}
