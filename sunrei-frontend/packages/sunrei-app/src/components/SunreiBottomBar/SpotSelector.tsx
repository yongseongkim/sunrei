'use client';

import { Badge } from '@/components/ui/badge';
import { ChevronLeft, MapPin } from 'lucide-react';

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
function getYoutubeThumbnail(videoId: string) {
  return `https://img.youtube.com/vi/${videoId}/mqdefault.jpg`;
}

interface Spot {
  id: string;
  title: string;
  description?: string;
  youtubeLink?: string;
  images: any[];
  placeId: string;
  placeName: string;
  sunreiTitle: string;
}

interface SpotSelectorProps {
  placeName: string;
  placeAddress: string;
  spots: Spot[];
  onSpotClick: (spot: Spot) => void;
  onBack: () => void;
}

export const SpotSelector: React.FC<SpotSelectorProps> = ({
  placeName,
  placeAddress,
  spots,
  onSpotClick,
  onBack,
}) => {
  return (
    <div className="flex flex-col h-full">
      {/* Header with back button and place name */}
      <div className="px-3 py-2 border-b flex-shrink-0 flex items-center gap-2">
        <button
          onClick={onBack}
          className="flex items-center text-gray-600 hover:text-gray-900 transition-colors"
        >
          <ChevronLeft className="w-5 h-5" />
        </button>
        <div className="flex items-center gap-1.5 min-w-0">
          <MapPin className="w-3.5 h-3.5 flex-shrink-0 text-muted-foreground" />
          <span className="text-sm font-medium truncate">{placeName}</span>
        </div>
      </div>

      {/* Spots list */}
      <div className="flex-1 overflow-y-auto p-3 space-y-2">
        {spots.map((spot) => {
          let thumbnail: string | null = null;

          if (spot.youtubeLink) {
            const videoId = getYoutubeVideoId(spot.youtubeLink);
            if (videoId) {
              thumbnail = getYoutubeThumbnail(videoId);
            }
          }

          if (!thumbnail && spot.images?.[0]?.images?.[0]?.url) {
            thumbnail = spot.images[0].images[0].url;
          }

          return (
            <div
              key={spot.id}
              onClick={() => onSpotClick(spot)}
              className="flex gap-3 p-2 border rounded-lg cursor-pointer transition-all hover:border-muted-foreground/50 hover:shadow-md bg-white"
            >
              {/* Thumbnail */}
              {thumbnail ? (
                <div className="w-24 h-16 flex-shrink-0 bg-muted rounded overflow-hidden">
                  <img
                    src={thumbnail}
                    alt={spot.title}
                    className="w-full h-full object-cover"
                  />
                </div>
              ) : (
                <div className="w-24 h-16 flex-shrink-0 bg-gradient-to-br from-primary/10 to-primary/5 rounded flex items-center justify-center">
                  <span className="text-2xl">🗾</span>
                </div>
              )}

              {/* Content */}
              <div className="flex-1 min-w-0">
                <Badge variant="secondary" className="text-xs h-5 mb-1">
                  <span className="truncate">{spot.sunreiTitle}</span>
                </Badge>
                <h3 className="font-semibold text-sm line-clamp-2 leading-tight">
                  {spot.title}
                </h3>
                {spot.description && (
                  <p className="text-xs text-muted-foreground line-clamp-1 leading-relaxed mt-1">
                    {spot.description}
                  </p>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
