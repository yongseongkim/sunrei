'use client';

import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { MapPin, Search } from 'lucide-react';

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

interface CarouselViewProps {
  spots: Spot[];
  loading?: boolean;
  onSpotClick: (spot: Spot) => void;
  searchQuery: string;
  onSearchChange: (query: string) => void;
}

export const CarouselView: React.FC<CarouselViewProps> = ({
  spots,
  loading,
  onSpotClick,
  searchQuery,
  onSearchChange,
}) => {
  return (
    <div className="flex flex-col h-full">
      {/* Header with search */}
      <div className="p-3 border-b flex-shrink-0">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            type="text"
            placeholder="Search content..."
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
            className="pl-10"
          />
        </div>
      </div>

      {/* Carousel content */}
      <div className="overflow-x-auto overflow-y-hidden scrollbar-hide flex-1">
        <div className="flex gap-2 p-3 min-w-max h-full items-center">
          {loading ? (
            <>
              {[...Array(3)].map((_, i) => (
                <div
                  key={i}
                  className="w-64 flex-shrink-0 border rounded-lg overflow-hidden bg-white"
                >
                  <div className="w-full aspect-[2/1] bg-muted animate-pulse" />
                  <div className="p-2 space-y-1">
                    <div className="h-3 w-2/3 bg-muted rounded animate-pulse" />
                    <div className="h-3 w-full bg-muted rounded animate-pulse" />
                    <div className="h-2.5 w-full bg-muted rounded animate-pulse" />
                    <div className="h-2.5 w-3/4 bg-muted rounded animate-pulse" />
                  </div>
                </div>
              ))}
            </>
          ) : spots.length === 0 ? (
            <div className="w-full text-center py-8 text-muted-foreground">
              검색 결과가 없습니다
            </div>
          ) : (
            spots.map((spot) => {
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
                  className="w-64 flex-shrink-0 border rounded-lg overflow-hidden bg-white cursor-pointer transition-all hover:border-muted-foreground/50 hover:shadow-md snap-start"
                >
                  {thumbnail ? (
                    <div className="w-full aspect-[2/1] bg-muted">
                      <img
                        src={thumbnail}
                        alt={spot.title}
                        className="w-full h-full object-cover"
                      />
                    </div>
                  ) : (
                    <div className="w-full aspect-[2/1] bg-gradient-to-br from-primary/10 to-primary/5 flex items-center justify-center">
                      <span className="text-3xl">🗾</span>
                    </div>
                  )}

                  <div className="p-2 space-y-1">
                    <Badge variant="secondary" className="text-xs h-5">
                      <span className="truncate">{spot.sunreiTitle}</span>
                    </Badge>

                    <h3 className="font-semibold text-sm line-clamp-1 leading-tight">
                      {spot.title}
                    </h3>

                    {spot.description && (
                      <p className="text-xs text-muted-foreground line-clamp-1 leading-relaxed">
                        {spot.description}
                      </p>
                    )}

                    <div className="flex items-start gap-1 text-xs text-muted-foreground">
                      <MapPin className="w-3 h-3 flex-shrink-0 mt-0.5" />
                      <span className="line-clamp-1">{spot.placeName}</span>
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
};
