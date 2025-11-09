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
function getYoutubeThumbnail(videoId: string): string {
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
  placeAddress: string;
  lat: number;
  lng: number;
  sunreiId: string;
  sunreiTitle: string;
}

interface MobileSunreiCarouselProps {
  spots: Spot[];
  searchQuery: string;
  onSearchChange: (query: string) => void;
  onSpotClick: (spot: Spot) => void;
  loading?: boolean;
}

export const MobileSunreiCarousel: React.FC<MobileSunreiCarouselProps> = ({
  spots,
  searchQuery,
  onSearchChange,
  onSpotClick,
  loading,
}) => {
  // 검색 필터링
  const filteredSpots = searchQuery.trim()
    ? spots.filter(
        (spot) =>
          spot.title?.toLowerCase().includes(searchQuery.toLowerCase()) ||
          spot.description?.toLowerCase().includes(searchQuery.toLowerCase()) ||
          spot.sunreiTitle?.toLowerCase().includes(searchQuery.toLowerCase()) ||
          spot.placeName?.toLowerCase().includes(searchQuery.toLowerCase()),
      )
    : spots;

  return (
    <div className="fixed bottom-0 left-0 right-0 bg-white border-t shadow-lg z-10">
      {/* 검색창 */}
      <div className="p-3 border-b">
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

      {/* 가로 스크롤 카드 */}
      <div className="overflow-x-auto overflow-y-hidden scrollbar-hide">
        <div className="flex gap-2 p-3 min-w-max">
          {loading ? (
            // 로딩 스켈레톤
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
          ) : filteredSpots.length === 0 ? (
            <div className="w-full text-center py-8 text-muted-foreground">
              검색 결과가 없습니다
            </div>
          ) : (
            filteredSpots.map((spot) => {
              // 썸네일 가져오기
              let thumbnail: string | null = null;

              // 1. YouTube 썸네일
              if (spot.youtubeLink) {
                const videoId = getYoutubeVideoId(spot.youtubeLink);
                if (videoId) {
                  thumbnail = getYoutubeThumbnail(videoId);
                }
              }

              // 2. 이미지
              if (!thumbnail && spot.images?.[0]?.images?.[0]?.url) {
                thumbnail = spot.images[0].images[0].url;
              }

              return (
                <div
                  key={spot.id}
                  onClick={() => onSpotClick(spot)}
                  className="w-64 flex-shrink-0 border rounded-lg overflow-hidden bg-white cursor-pointer transition-all hover:border-muted-foreground/50 hover:shadow-md snap-start"
                >
                  {/* 썸네일 - 2:1 비율 */}
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

                  {/* 정보 */}
                  <div className="p-2 space-y-1">
                    {/* Sunrei 제목 */}
                    <Badge variant="secondary" className="text-xs h-5">
                      <span className="truncate">{spot.sunreiTitle}</span>
                    </Badge>

                    {/* Spot 제목 */}
                    <h3 className="font-semibold text-sm line-clamp-1 leading-tight">
                      {spot.title}
                    </h3>

                    {/* Description */}
                    {spot.description && (
                      <p className="text-xs text-muted-foreground line-clamp-1 leading-relaxed">
                        {spot.description}
                      </p>
                    )}

                    {/* 장소 */}
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

export default MobileSunreiCarousel;
