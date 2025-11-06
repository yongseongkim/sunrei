'use client';

import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Separator } from '@/components/ui/separator';
import { ExternalLink } from 'lucide-react';
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
  // Sunrei별로 spot 그룹화
  const groupedBySunrei = useMemo(() => {
    const groups = new Map<
      string,
      { sunreiId: string; sunreiTitle: string; spots: PlaceSpot[] }
    >();

    spots.forEach((spot) => {
      if (groups.has(spot.sunreiId)) {
        groups.get(spot.sunreiId)!.spots.push(spot);
      } else {
        groups.set(spot.sunreiId, {
          sunreiId: spot.sunreiId,
          sunreiTitle: spot.sunreiTitle,
          spots: [spot],
        });
      }
    });

    return Array.from(groups.values());
  }, [spots]);

  return (
    <Dialog open={spots.length > 0} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{placeName}</DialogTitle>
          <DialogDescription>{placeAddress}</DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Google Maps 링크 */}
          <Button variant="outline" className="w-full" asChild>
            <a
              href={`https://www.google.com/maps/search/?api=1&query=${lat},${lng}`}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-2"
            >
              <ExternalLink className="w-4 h-4" />
              Google Maps에서 보기
            </a>
          </Button>

          <Separator />

          {/* Sunrei별 spot 목록 */}
          <div className="space-y-4">
            <h3 className="font-semibold text-sm">
              Featured in {groupedBySunrei.length}개 작품
            </h3>

            {groupedBySunrei.map((group) => (
              <div
                key={group.sunreiId}
                className="border rounded-lg p-4 space-y-2"
              >
                {/* Sunrei 제목 */}
                <h4 className="font-semibold text-sm text-primary">
                  {group.sunreiTitle}
                </h4>

                {/* Spot 목록 */}
                <div className="space-y-2">
                  {group.spots.map((spot) => (
                    <button
                      key={spot.id}
                      onClick={() => {
                        onClose();
                        onSpotClick(spot);
                      }}
                      className="w-full text-left p-3 border rounded-md hover:bg-muted/50 transition-colors"
                    >
                      <div className="flex gap-3">
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
                          <p className="font-medium text-sm line-clamp-1">
                            {spot.title}
                          </p>
                          {spot.description && (
                            <p className="text-xs text-muted-foreground line-clamp-2 mt-1">
                              {spot.description}
                            </p>
                          )}
                        </div>
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default PlaceDetailDialog;
