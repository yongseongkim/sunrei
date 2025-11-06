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

interface ModalSpot {
  id: string;
  title: string;
  description?: string;
  youtubeLink?: string | null;
  images: any[];
  placeId: string;
  placeName: string;
  placeAddress: string;
  lat: number;
  lng: number;
  sunreiId: string;
  sunreiTitle: string;
}

interface SunreiDetailDialogProps {
  modalSpot: ModalSpot | null;
  onClose: () => void;
}

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
  return `https://img.youtube.com/vi/${videoId}/maxresdefault.jpg`;
}

export const SunreiDetailDialog: React.FC<SunreiDetailDialogProps> = ({
  modalSpot,
  onClose,
}) => {
  return (
    <Dialog open={!!modalSpot} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>{modalSpot?.placeName}</DialogTitle>
          <DialogDescription>{modalSpot?.placeAddress}</DialogDescription>
          <p className="text-sm text-muted-foreground">
            {modalSpot?.sunreiTitle} - {modalSpot?.title}
          </p>
        </DialogHeader>
        {(() => {
          // 이미지가 있으면 첫 번째 이미지 표시
          const firstImage = modalSpot?.images?.[0]?.images?.[0];
          if (firstImage?.url) {
            return (
              <div className="relative h-64 bg-muted rounded-lg overflow-hidden">
                <img
                  src={firstImage.url}
                  alt={modalSpot?.title || ''}
                  className="w-full h-full object-cover"
                />
              </div>
            );
          }

          // 이미지가 없고 YouTube 링크가 있으면 썸네일 표시
          if (modalSpot?.youtubeLink) {
            const videoId = getYoutubeVideoId(modalSpot.youtubeLink);
            if (videoId) {
              return (
                <a
                  href={modalSpot.youtubeLink}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="relative h-64 bg-muted rounded-lg overflow-hidden block group cursor-pointer"
                >
                  <img
                    src={getYoutubeThumbnail(videoId)}
                    alt={modalSpot?.title || ''}
                    className="w-full h-full object-cover"
                  />
                  <div className="absolute inset-0 bg-black/40 flex items-center justify-center group-hover:bg-black/50 transition-colors">
                    <div className="w-16 h-16 bg-red-600 rounded-full flex items-center justify-center">
                      <div className="w-0 h-0 border-l-[20px] border-l-white border-t-[12px] border-t-transparent border-b-[12px] border-b-transparent ml-1"></div>
                    </div>
                  </div>
                </a>
              );
            }
          }

          return null;
        })()}
        <div className="space-y-4">
          <div>
            <h3 className="font-semibold text-sm mb-1">설명</h3>
            <p className="text-sm leading-relaxed">{modalSpot?.description}</p>
          </div>
          <Separator />
          <Button variant="outline" className="w-full" asChild>
            <a
              href={`https://www.google.com/maps/search/?api=1&query=${modalSpot?.lat},${modalSpot?.lng}`}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-2"
            >
              <ExternalLink className="w-4 h-4" />
              Google Maps에서 보기
            </a>
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default SunreiDetailDialog;
