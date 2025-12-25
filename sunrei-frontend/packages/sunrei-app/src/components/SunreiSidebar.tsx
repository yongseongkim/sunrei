'use client';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { ExternalLink, MapPin, Search } from 'lucide-react';

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

interface SunreiSidebarProps {
  spots: Spot[];
  loading: boolean;
  searchQuery: string;
  totalPlaces: number;
  totalSunreis: number;
  onSpotClick: (spot: Spot) => void;
  onSearchChange: (query: string) => void;
  onShowAllContent: () => void;
}

export const SunreiSidebar: React.FC<SunreiSidebarProps> = ({
  spots,
  loading,
  searchQuery,
  totalPlaces,
  totalSunreis,
  onSpotClick,
  onSearchChange,
  onShowAllContent,
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
    <div className="w-96 h-full overflow-y-auto bg-white rounded-lg shadow-sm border flex flex-col">
      <div className="p-4 flex-1">
        {/* Featured Content Header */}
        <div className="mb-4">
          <h2 className="text-lg font-semibold mb-1">주요 콘텐츠</h2>
          <p className="text-sm text-muted-foreground">
            {totalPlaces}개 장소 • {totalSunreis}개 작품
          </p>
        </div>

        {/* Search */}
        <div className="relative mb-4">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Search content..."
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
            className="pl-9"
          />
        </div>

        {/* Show All Content Button */}
        <Button
          variant="outline"
          className="w-full mb-4 justify-start"
          onClick={onShowAllContent}
        >
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded bg-primary/10 flex items-center justify-center">
              <MapPin className="w-4 h-4 text-primary" />
            </div>
            <div className="flex flex-col items-start">
              <span className="text-sm font-medium">모든 콘텐츠 보기</span>
              <span className="text-xs text-muted-foreground">
                지도의 모든 {totalPlaces}개 장소 보기
              </span>
            </div>
          </div>
        </Button>

        {/* Spot List */}
        {loading ? (
          <div className="space-y-2">
            {[...Array(5)].map((_, i) => (
              <div key={i} className="border rounded-lg overflow-hidden bg-white">
                <Skeleton className="w-full aspect-[2/1]" />
                <div className="p-2 space-y-1">
                  <Skeleton className="h-3 w-2/3" />
                  <Skeleton className="h-3 w-full" />
                  <Skeleton className="h-2.5 w-full" />
                  <Skeleton className="h-2.5 w-3/4" />
                </div>
              </div>
            ))}
          </div>
        ) : filteredSpots.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground text-sm">
            검색 결과가 없습니다
          </div>
        ) : (
          <div className="space-y-2">
            {filteredSpots.map((spot) => {
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
                  className="border rounded-lg overflow-hidden bg-white cursor-pointer transition-all hover:border-muted-foreground/50 hover:shadow-md"
                  onClick={() => onSpotClick(spot)}
                >
                  {/* 썸네일 - 2:1 비율로 높이 감소 */}
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
            })}
          </div>
        )}
      </div>
    </div>
  );
};

export default SunreiSidebar;
