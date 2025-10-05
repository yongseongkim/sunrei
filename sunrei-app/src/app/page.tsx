'use client';

import { config } from '@/lib/config';
import { useCallback, useEffect, useRef, useState } from 'react';
import { GoogleMap, Marker } from '../components/Map';
import { MarkerInfoWindow } from '../components/MarkerInfoWindow';
import { boundsToWKTPolygon } from '../utils/map-utils';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Button } from '@/components/ui/button';
import { MapPin, Image as ImageIcon, ExternalLink } from 'lucide-react';
import { useUIStore } from '@/stores/ui-store';
import { useMapStore } from '@/stores/map-store';
import { useSunreis } from '@/hooks/useSunreis';

const center = {
  lat: 35.6762,
  lng: 139.6503,
};

// YouTube video ID 추출 함수
function getYoutubeVideoId(url: string): string | null {
  if (!url) return null;

  // https://www.youtube.com/watch?v=VIDEO_ID
  // https://youtu.be/VIDEO_ID
  // https://www.youtube.com/embed/VIDEO_ID
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

export default function Home() {
  // Zustand stores
  const { selectedSunrei, hoveredMarker, modalSpot, setSelectedSunrei, setHoveredMarker, setModalSpot } =
    useUIStore();
  const { isLoaded, setIsLoaded } = useMapStore();

  // Local state
  const [selectedSpot, setSelectedSpot] = useState<string | null>(null);
  const [currentPolygon, setCurrentPolygon] = useState<string | undefined>(undefined);
  const debounceTimerRef = useRef<NodeJS.Timeout | null>(null);

  // React Query
  const { data: sunreis = [], isLoading: loading } = useSunreis(currentPolygon);

  const onLoad = useCallback(() => {
    setIsLoaded(true);
  }, [setIsLoaded]);

  const handleBoundsChanged = useCallback((bounds: google.maps.LatLngBounds) => {
    // Clear existing timer
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }

    // Set new timer with 500ms delay
    debounceTimerRef.current = setTimeout(() => {
      const polygon = boundsToWKTPolygon(bounds);
      setCurrentPolygon(polygon);
    }, 500);
  }, []);

  const allSpots = sunreis.flatMap(
    (sunrei) =>
      sunrei.spots?.map((spot) => ({
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
      })) || [],
  );

  const handleSunreiClick = (sunreiId: string) => {
    setSelectedSunrei(sunreiId);
    setSelectedSpot(null);
  };

  return (
    <div className="flex h-screen">
      <div className="w-96 h-full overflow-y-auto border-r">
        <div className="p-4">
          <h1 className="text-2xl font-bold mb-6">성지순례</h1>
          {loading ? (
            <div className="space-y-4">
              {[...Array(3)].map((_, i) => (
                <Card key={i}>
                  <CardHeader>
                    <Skeleton className="h-6 w-3/4" />
                    <Skeleton className="h-4 w-full" />
                  </CardHeader>
                  <CardContent>
                    <div className="grid grid-cols-4 gap-1">
                      {[...Array(4)].map((_, j) => (
                        <Skeleton key={j} className="aspect-square" />
                      ))}
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          ) : (
            <div className="space-y-4">
              {sunreis.map((sunrei: any) => (
                <Card
                  key={sunrei.id}
                  className={`cursor-pointer transition-all ${
                    selectedSunrei === sunrei.id
                      ? 'border-primary'
                      : 'hover:border-muted-foreground/50'
                  }`}
                  onClick={() => handleSunreiClick(sunrei.id)}
                >
                  <CardHeader>
                    <CardTitle>{sunrei.title}</CardTitle>
                    <CardDescription>{sunrei.description}</CardDescription>
                    <div className="flex items-center justify-between pt-2">
                      <Badge variant="secondary" className="flex items-center gap-1">
                        <MapPin className="w-3 h-3" />
                        {sunrei.spots?.length || 0}개 장소
                      </Badge>
                      {sunrei.link && (
                        <a
                          href={sunrei.link}
                          target="_blank"
                          rel="noopener noreferrer"
                          onClick={(e) => e.stopPropagation()}
                          className="text-xs text-primary hover:underline flex items-center gap-1"
                        >
                          보러가기
                          <ExternalLink className="w-3 h-3" />
                        </a>
                      )}
                    </div>
                  </CardHeader>
                  {(sunrei.images?.length > 0 || (selectedSunrei === sunrei.id && sunrei.spots)) && (
                    <CardContent>
                      {sunrei.images && sunrei.images.length > 0 && (
                        <div className="grid grid-cols-4 gap-1">
                          {sunrei.images.slice(0, 4).map((image, index) => (
                            <div
                              key={index}
                              className="relative aspect-square rounded overflow-hidden"
                            >
                              <img
                                src={image.url || ''}
                                alt={sunrei.title || ''}
                                className="w-full h-full object-cover hover:scale-110 transition-transform cursor-pointer"
                              />
                              {sunrei.images &&
                                sunrei.images.length > 4 &&
                                index === 3 && (
                                  <div className="absolute inset-0 bg-black/60 flex items-center justify-center">
                                    <span className="text-white text-sm font-medium">
                                      +{sunrei.images.length - 4}
                                    </span>
                                  </div>
                                )}
                            </div>
                          ))}
                        </div>
                      )}
                      {selectedSunrei === sunrei.id && sunrei.spots && (
                      <>
                        {sunrei.images && sunrei.images.length > 0 && (
                          <Separator className="my-4" />
                        )}
                        <div>
                          <p className="text-xs font-medium text-muted-foreground mb-2">
                            방문 가능한 장소:
                          </p>
                          <div className="space-y-2">
                            {sunrei.spots.map((spot) => (
                              <div key={spot.id} className="space-y-1">
                                <p className="text-xs font-medium">{spot.title}</p>
                                <div
                                  className="text-xs text-muted-foreground flex items-center gap-2 hover:text-primary ml-2 cursor-pointer"
                                  onMouseEnter={() =>
                                    setHoveredMarker(`${spot.id}-${spot.place.id}`)
                                  }
                                  onMouseLeave={() => setHoveredMarker(null)}
                                >
                                  <span className="w-1 h-1 bg-muted-foreground rounded-full"></span>
                                  <span>
                                    {spot.place.name} - {spot.place.address}
                                  </span>
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      </>
                      )}
                    </CardContent>
                  )}
                </Card>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="flex-1 relative">
        <GoogleMap
          apiKey={config.googleMaps.apiKey}
          center={center}
          zoom={12}
          onMapLoad={onLoad}
          onBoundsChanged={handleBoundsChanged}
        >
          {allSpots.map((spot) => {
            const markerId = `${spot.id}-${spot.placeId}`;

            // 마커 상태 결정
            let markerState: 'selected' | 'related' | 'default';
            if (modalSpot && markerId === `${modalSpot.id}-${modalSpot.placeId}`) {
              // A: 선택된 마커 (다이얼로그가 보이는 마커)
              markerState = 'selected';
            } else if (modalSpot && spot.sunreiId === modalSpot.sunreiId) {
              // B: 같은 Sunrei의 마커들
              markerState = 'related';
            } else if (selectedSunrei === spot.sunreiId || hoveredMarker === markerId) {
              // hover나 선택된 sunrei도 related로 처리
              markerState = 'related';
            } else {
              // C: 선택되지 않은 마커
              markerState = 'default';
            }

            return (
              <Marker
                key={markerId}
                position={{ lat: spot.lat, lng: spot.lng }}
                title={`${spot.sunreiTitle} - ${spot.title} - ${spot.placeName}`}
                markerState={markerState}
                onClick={() => {
                  setSelectedSunrei(spot.sunreiId);
                  setModalSpot(spot);
                }}
              />
            );
          })}
          {allSpots.map((spot) => {
            const markerId = `${spot.id}-${spot.placeId}`;

            // 마커 상태 결정 (동일한 로직)
            let markerState: 'selected' | 'related' | 'default';
            if (modalSpot && markerId === `${modalSpot.id}-${modalSpot.placeId}`) {
              markerState = 'selected';
            } else if (modalSpot && spot.sunreiId === modalSpot.sunreiId) {
              markerState = 'related';
            } else if (selectedSunrei === spot.sunreiId || hoveredMarker === markerId) {
              markerState = 'related';
            } else {
              markerState = 'default';
            }

            return (
              <MarkerInfoWindow
                key={`info-${markerId}`}
                position={{ lat: spot.lat, lng: spot.lng }}
                sunreiTitle={spot.sunreiTitle}
                placeName={spot.placeName}
                markerState={markerState}
                onClick={() => {
                  setSelectedSunrei(spot.sunreiId);
                  setModalSpot(spot);
                }}
              />
            );
          })}
        </GoogleMap>
      </div>

      <Dialog open={!!modalSpot} onOpenChange={(open) => !open && useUIStore.getState().closeModal()}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>{modalSpot?.placeName}</DialogTitle>
            <DialogDescription>
              {modalSpot?.placeAddress}
            </DialogDescription>
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

            // 둘 다 없으면 이미지 영역 표시하지 않음
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
    </div>
  );
}
