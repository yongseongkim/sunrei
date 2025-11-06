'use client';

import { Input } from '@/components/ui/input';
import { Search } from 'lucide-react';

interface Sunrei {
  id: string;
  title: string;
  description?: string;
  youtubeLink?: string;
  images?: any[];
  spots?: any[];
}

interface MobileSunreiCarouselProps {
  sunreis: Sunrei[];
  searchQuery: string;
  onSearchChange: (query: string) => void;
  onSunreiClick: (sunreiId: string) => void;
  loading?: boolean;
}

export const MobileSunreiCarousel: React.FC<MobileSunreiCarouselProps> = ({
  sunreis,
  searchQuery,
  onSearchChange,
  onSunreiClick,
  loading,
}) => {
  // 검색 필터링
  const filteredSunreis = searchQuery.trim()
    ? sunreis.filter(
        (sunrei) =>
          sunrei.title?.toLowerCase().includes(searchQuery.toLowerCase()) ||
          sunrei.description
            ?.toLowerCase()
            .includes(searchQuery.toLowerCase()),
      )
    : sunreis;

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
        <div className="flex gap-3 p-3 min-w-max">
          {loading ? (
            // 로딩 스켈레톤
            <>
              {[...Array(3)].map((_, i) => (
                <div
                  key={i}
                  className="w-64 h-32 bg-muted rounded-lg animate-pulse flex-shrink-0"
                />
              ))}
            </>
          ) : filteredSunreis.length === 0 ? (
            <div className="w-full text-center py-8 text-muted-foreground">
              검색 결과가 없습니다
            </div>
          ) : (
            filteredSunreis.map((sunrei) => {
              // 첫 번째 이미지 가져오기
              const firstImage =
                sunrei.images?.[0]?.images?.[0]?.url ||
                sunrei.spots?.[0]?.images?.[0]?.images?.[0]?.url;

              // 장소 개수 계산
              const placeCount = new Set(
                sunrei.spots?.map((spot: any) => spot.place?.id),
              ).size;

              return (
                <div
                  key={sunrei.id}
                  onClick={() => onSunreiClick(sunrei.id)}
                  className="w-64 flex-shrink-0 bg-white rounded-lg border shadow-sm overflow-hidden cursor-pointer hover:shadow-md transition-shadow snap-start"
                >
                  {/* 썸네일 */}
                  {firstImage ? (
                    <div className="relative h-24 bg-muted">
                      <img
                        src={firstImage}
                        alt={sunrei.title}
                        className="w-full h-full object-cover"
                      />
                    </div>
                  ) : (
                    <div className="h-24 bg-gradient-to-br from-primary/10 to-primary/5 flex items-center justify-center">
                      <span className="text-4xl">🗾</span>
                    </div>
                  )}

                  {/* 카드 내용 */}
                  <div className="p-3">
                    <h3 className="font-semibold text-sm line-clamp-1 mb-1">
                      {sunrei.title}
                    </h3>
                    <p className="text-xs text-muted-foreground">
                      {placeCount}개 장소
                    </p>
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
