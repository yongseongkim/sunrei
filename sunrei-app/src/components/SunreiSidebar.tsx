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
import { Separator } from '@/components/ui/separator';
import { Skeleton } from '@/components/ui/skeleton';
import { ExternalLink, MapPin, Search } from 'lucide-react';

interface SunreiSidebarProps {
  sunreis: any[];
  filteredSunreis: any[];
  loading: boolean;
  selectedSunrei: string | null;
  searchQuery: string;
  totalPlaces: number;
  onSunreiClick: (sunreiId: string) => void;
  onSearchChange: (query: string) => void;
  onShowAllContent: () => void;
  onMarkerHover: (markerId: string | null) => void;
}

export const SunreiSidebar: React.FC<SunreiSidebarProps> = ({
  sunreis,
  filteredSunreis,
  loading,
  selectedSunrei,
  searchQuery,
  totalPlaces,
  onSunreiClick,
  onSearchChange,
  onShowAllContent,
  onMarkerHover,
}) => {
  return (
    <div className="w-96 h-full overflow-y-auto bg-white rounded-lg shadow-sm border flex flex-col">
      <div className="p-4 flex-1">
        {/* Featured Content Header */}
        <div className="mb-4">
          <h2 className="text-lg font-semibold mb-1">주요 콘텐츠</h2>
          <p className="text-sm text-muted-foreground">
            {totalPlaces}개 장소 • {sunreis.length}개 작품
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

        {/* Sunrei List */}
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
            {filteredSunreis.map((sunrei: any) => (
              <Card
                key={sunrei.id}
                className={`cursor-pointer transition-all ${
                  selectedSunrei === sunrei.id
                    ? 'border-primary'
                    : 'hover:border-muted-foreground/50'
                }`}
                onClick={() => onSunreiClick(sunrei.id)}
              >
                <CardHeader>
                  <CardTitle>{sunrei.title}</CardTitle>
                  <CardDescription>{sunrei.description}</CardDescription>
                  <div className="flex items-center justify-between pt-2">
                    <Badge
                      variant="secondary"
                      className="flex items-center gap-1"
                    >
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
                {(sunrei.images?.length > 0 ||
                  (selectedSunrei === sunrei.id && sunrei.spots)) && (
                  <CardContent>
                    {sunrei.images && sunrei.images.length > 0 && (
                      <div className="grid grid-cols-4 gap-1">
                        {sunrei.images
                          .slice(0, 4)
                          .map((image: any, index: number) => (
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
                            {sunrei.spots.map((spot: any) => (
                              <div key={spot.id} className="space-y-1">
                                <p className="text-xs font-medium">
                                  {spot.title}
                                </p>
                                <div
                                  className="text-xs text-muted-foreground flex items-center gap-2 hover:text-primary ml-2 cursor-pointer"
                                  onMouseEnter={() =>
                                    onMarkerHover(`${spot.id}-${spot.place.id}`)
                                  }
                                  onMouseLeave={() => onMarkerHover(null)}
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
  );
};

export default SunreiSidebar;
