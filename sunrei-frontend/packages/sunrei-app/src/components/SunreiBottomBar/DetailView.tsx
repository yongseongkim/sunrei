'use client';

import { Badge } from '@/components/ui/badge';
import { MapPin, ExternalLink, ChevronLeft } from 'lucide-react';

// YouTube video ID 추출 함수
function getYoutubeVideoId(url: string): string | null {
  if (!url) return null;

  const patterns = [
    /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([^&\s]+)/,
    /youtube\.com\/watch\?.*v=([^&\s]+)/,
  ];

  for (const pattern of patterns) {
    const match = url.match(pattern);
    if (match && match[1]) {
      return match[1];
    }
  }

  return null;
}

// YouTube 썸네일 URL 생성
function getYoutubeThumbnail(videoId: string, quality: 'mq' | 'max' = 'mq') {
  const qualityMap = {
    mq: 'mqdefault',
    max: 'maxresdefault',
  };
  return `https://img.youtube.com/vi/${videoId}/${qualityMap[quality]}.jpg`;
}

interface Spot {
  id: string;
  title: string;
  description?: string;
  youtubeLink?: string;
  images: any[];
  placeName: string;
  placeAddress: string;
  lat: number;
  lng: number;
  sunreiTitle: string;
}

interface DetailViewProps {
  spot: Spot;
  onClose: () => void;
}

export const DetailView: React.FC<DetailViewProps> = ({ spot, onClose }) => {
  return (
    <div className="flex flex-col h-full">
      {/* Header with back button and title */}
      <div className="px-3 py-2 border-b flex-shrink-0 flex items-center gap-2">
        <button
          onClick={onClose}
          className="flex items-center text-gray-600 hover:text-gray-900 transition-colors"
        >
          <ChevronLeft className="w-5 h-5" />
        </button>
        <h3 className="font-semibold text-sm truncate">{spot.title}</h3>
      </div>

      {/* Detail content */}
      <div className="p-3 overflow-y-auto flex-1">
      {/* Thumbnail */}
      <div className="w-40 h-24 bg-muted rounded-lg overflow-hidden mb-3 flex-shrink-0">
        {(() => {
          const videoId = getYoutubeVideoId(spot.youtubeLink || '');
          if (videoId) {
            return (
              <a
                href={spot.youtubeLink}
                target="_blank"
                rel="noopener noreferrer"
                className="block w-full h-full relative group"
              >
                <img
                  src={getYoutubeThumbnail(videoId, 'mq')}
                  alt={spot.title}
                  className="w-full h-full object-cover"
                />
                <div className="absolute inset-0 bg-black/30 flex items-center justify-center group-hover:bg-black/40 transition-colors">
                  <div className="w-8 h-8 bg-red-600 rounded-full flex items-center justify-center">
                    <div className="w-0 h-0 border-l-[10px] border-l-white border-t-[6px] border-t-transparent border-b-[6px] border-b-transparent ml-0.5"></div>
                  </div>
                </div>
              </a>
            );
          }
          const firstImage = spot.images?.[0]?.images?.[0];
          if (firstImage?.url) {
            return (
              <img
                src={firstImage.url}
                alt={spot.title}
                className="w-full h-full object-cover"
              />
            );
          }
          return (
            <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-primary/10 to-primary/5">
              <span className="text-2xl">🗾</span>
            </div>
          );
        })()}
      </div>

      {/* Badge */}
      <Badge variant="secondary" className="text-xs mb-2">
        {spot.sunreiTitle}
      </Badge>

      {/* Place Info */}
      <div className="flex items-start gap-2 text-sm text-muted-foreground mb-3">
        <MapPin className="w-4 h-4 flex-shrink-0 mt-0.5" />
        <div>
          <div className="font-medium text-foreground">{spot.placeName}</div>
          <div className="text-xs">{spot.placeAddress}</div>
        </div>
      </div>

      {/* Description */}
      {spot.description && (
        <div className="mb-3">
          <p className="text-sm leading-relaxed text-gray-700 whitespace-pre-wrap">
            {spot.description}
          </p>
        </div>
      )}

      {/* Google Maps Link */}
      <a
        href={`https://www.google.com/maps/search/?api=1&query=${spot.lat},${spot.lng}`}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex items-center gap-2 text-sm text-blue-600 hover:underline"
      >
        <ExternalLink className="w-4 h-4" />
        Google Maps에서 보기
      </a>
    </div>
    </div>
  );
};
