'use client';

import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { ExternalLink, MapPin } from 'lucide-react';

interface Sunrei {
  id: string;
  title: string;
  description?: string;
  youtubeLink?: string;
  images?: any[];
  spots?: any[];
}

interface MobileSunreiDetailModalProps {
  sunrei: Sunrei | null;
  onClose: () => void;
  onSpotClick: (spot: any) => void;
}

export const MobileSunreiDetailModal: React.FC<
  MobileSunreiDetailModalProps
> = ({ sunrei, onClose, onSpotClick }) => {
  if (!sunrei) return null;

  // 첫 번째 이미지 가져오기
  const firstImage =
    sunrei.images?.[0]?.images?.[0]?.url ||
    sunrei.spots?.[0]?.images?.[0]?.images?.[0]?.url;

  return (
    <Dialog open={!!sunrei} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-lg max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-lg">{sunrei.title}</DialogTitle>
          {sunrei.description && (
            <DialogDescription className="text-sm">
              {sunrei.description}
            </DialogDescription>
          )}
        </DialogHeader>

        {/* 썸네일 */}
        {firstImage && (
          <div className="relative h-48 bg-muted rounded-lg overflow-hidden -mx-6 -mt-2">
            <img
              src={firstImage}
              alt={sunrei.title}
              className="w-full h-full object-cover"
            />
          </div>
        )}

        {/* YouTube 링크 */}
        {sunrei.youtubeLink && (
          <Button variant="outline" className="w-full" asChild>
            <a
              href={sunrei.youtubeLink}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-2"
            >
              <ExternalLink className="w-4 h-4" />
              YouTube에서 보기
            </a>
          </Button>
        )}

        {/* Spot 목록 */}
        {sunrei.spots && sunrei.spots.length > 0 && (
          <div className="space-y-2">
            <h3 className="font-semibold text-sm">
              장소 목록 ({sunrei.spots.length}개)
            </h3>
            <div className="space-y-2">
              {sunrei.spots.map((spot: any) => (
                <button
                  key={spot.id}
                  onClick={() => {
                    onClose();
                    onSpotClick({
                      id: spot.id,
                      title: spot.title,
                      description: spot.description,
                      youtubeLink: spot.youtubeLink,
                      images: spot.images,
                      placeId: spot.place.id,
                      placeName: spot.place.name,
                      placeAddress: spot.place.address,
                      lat: spot.place.latitude || 0,
                      lng: spot.place.longitude || 0,
                      sunreiId: sunrei.id,
                      sunreiTitle: sunrei.title,
                    });
                  }}
                  className="w-full text-left p-3 border rounded-lg hover:bg-muted/50 transition-colors"
                >
                  <div className="flex items-start gap-2">
                    <MapPin className="w-4 h-4 text-muted-foreground flex-shrink-0 mt-0.5" />
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-sm line-clamp-1">
                        {spot.place?.name || spot.title}
                      </p>
                      {spot.place?.address && (
                        <p className="text-xs text-muted-foreground line-clamp-1">
                          {spot.place.address}
                        </p>
                      )}
                      {spot.title && (
                        <p className="text-xs text-primary mt-1 line-clamp-1">
                          {spot.title}
                        </p>
                      )}
                    </div>
                  </div>
                </button>
              ))}
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
};

export default MobileSunreiDetailModal;
