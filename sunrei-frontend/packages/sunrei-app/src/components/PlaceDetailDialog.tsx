'use client';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Separator } from '@/components/ui/separator';
import { ExternalLink, MapPin, ChevronRight } from 'lucide-react';
import { useMemo } from 'react';

interface PlaceSpot {
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
  sunreiTags: string[];
}

interface PlaceDetailDialogProps {
  placeName: string;
  placeAddress: string;
  lat: number;
  lng: number;
  spots: PlaceSpot[];
  onClose: () => void;
  onSpotClick: (spot: PlaceSpot) => void;
}

export const PlaceDetailDialog: React.FC<PlaceDetailDialogProps> = ({
  placeName,
  placeAddress,
  lat,
  lng,
  spots,
  onClose,
  onSpotClick,
}) => {
  // Sunrei별로 그룹화하고 태그 정보 포함
  const groupedBySunrei = useMemo(() => {
    const groups = new Map<
      string,
      {
        sunreiId: string;
        sunreiTitle: string;
        sunreiTags: string[];
        spots: PlaceSpot[];
      }
    >();

    spots.forEach((spot) => {
      if (groups.has(spot.sunreiId)) {
        groups.get(spot.sunreiId)!.spots.push(spot);
      } else {
        groups.set(spot.sunreiId, {
          sunreiId: spot.sunreiId,
          sunreiTitle: spot.sunreiTitle,
          sunreiTags: spot.sunreiTags || [],
          spots: [spot],
        });
      }
    });

    return Array.from(groups.values());
  }, [spots]);

  // 모든 태그 수집 (중복 제거)
  const allTags = useMemo(() => {
    const tags = new Set<string>();
    spots.forEach((spot) => {
      spot.sunreiTags?.forEach((tag) => tags.add(tag));
    });
    return Array.from(tags);
  }, [spots]);

  // 타입에 따른 색상 매핑
  const getTypeColor = (tags: string[]) => {
    const lowerTags = tags.map((t) => t.toLowerCase());
    if (lowerTags.includes('drama')) return '#EC4899'; // Pink
    if (lowerTags.includes('anime')) return '#9370DB'; // Purple
    if (
      lowerTags.includes('youtube') ||
      lowerTags.includes('video') ||
      lowerTags.includes('유튜브')
    )
      return '#EF4444'; // Red
    return '#6495ED'; // Blue (default)
  };

  // 주요 타입 추출 (첫 번째 매칭되는 타입)
  const getPrimaryType = (tags: string[]) => {
    const lowerTags = tags.map((t) => t.toLowerCase());
    if (lowerTags.includes('drama')) return 'Drama';
    if (lowerTags.includes('anime')) return 'Anime';
    if (
      lowerTags.includes('youtube') ||
      lowerTags.includes('video') ||
      lowerTags.includes('유튜브')
    )
      return 'YouTube';
    return tags[0] || 'Other';
  };

  return (
    <Dialog open={spots.length > 0} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
        {/* 헤더 */}
        <DialogHeader className="space-y-3">
          <div className="flex items-start gap-3">
            <div className="w-8 h-8 rounded-full bg-red-500 flex items-center justify-center flex-shrink-0 mt-1">
              <MapPin className="w-5 h-5 text-white" />
            </div>
            <div className="flex-1 min-w-0">
              <DialogTitle className="text-xl font-bold">
                {placeName}
              </DialogTitle>
              <DialogDescription className="text-sm mt-1">
                {placeAddress}
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <div className="space-y-4">
          {/* 설명 (임시) */}
          <p className="text-sm text-muted-foreground leading-relaxed">
            A location featured in {groupedBySunrei.length} different{' '}
            {groupedBySunrei.length === 1 ? 'work' : 'works'}.
          </p>

          {/* 태그 */}
          {allTags.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {allTags.slice(0, 5).map((tag) => (
                <Badge
                  key={tag}
                  variant="secondary"
                  className="text-xs font-normal"
                >
                  {tag}
                </Badge>
              ))}
            </div>
          )}

          <Separator />

          {/* Featured In 섹션 */}
          <div className="space-y-3">
            <h3 className="font-semibold text-sm">
              Featured In ({groupedBySunrei.length})
            </h3>

            <div className="space-y-3">
              {groupedBySunrei.map((group) => {
                const color = getTypeColor(group.sunreiTags);
                const primaryType = getPrimaryType(group.sunreiTags);

                return (
                  <div
                    key={group.sunreiId}
                    className="border rounded-lg overflow-hidden relative"
                  >
                    {/* 왼쪽 색상 바 */}
                    <div
                      className="absolute left-0 top-0 bottom-0 w-1"
                      style={{ background: color }}
                    />

                    {/* Sunrei 헤더 */}
                    <div className="p-4 pl-5 bg-muted/30">
                      <p className="font-semibold text-sm">
                        {group.sunreiTitle}
                      </p>
                      <p className="text-xs text-muted-foreground mt-1">
                        {primaryType}
                      </p>
                    </div>

                    {/* Spots 목록 */}
                    <div className="divide-y">
                      {group.spots.map((spot) => (
                        <button
                          key={spot.id}
                          onClick={() => {
                            onSpotClick(spot);
                          }}
                          className="w-full text-left p-3 pl-5 hover:bg-muted/50 transition-all hover:shadow-sm cursor-pointer group"
                        >
                          <div className="flex gap-3 items-center">
                            {/* 썸네일 */}
                            {spot.images?.[0]?.images?.[0]?.url && (
                              <div className="w-16 h-16 flex-shrink-0 rounded overflow-hidden bg-muted">
                                <img
                                  src={spot.images[0].images[0].url}
                                  alt={spot.title}
                                  className="w-full h-full object-cover"
                                />
                              </div>
                            )}

                            {/* 정보 */}
                            <div className="flex-1 min-w-0">
                              <p className="font-medium text-sm line-clamp-1 group-hover:text-primary transition-colors">
                                {spot.title}
                              </p>
                              {spot.description && (
                                <p className="text-xs text-muted-foreground line-clamp-2 mt-1">
                                  {spot.description}
                                </p>
                              )}
                            </div>

                            {/* Chevron icon */}
                            <ChevronRight className="w-5 h-5 text-muted-foreground group-hover:text-foreground group-hover:translate-x-0.5 transition-all flex-shrink-0" />
                          </div>
                        </button>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default PlaceDetailDialog;
