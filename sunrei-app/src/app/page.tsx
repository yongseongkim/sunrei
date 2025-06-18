'use client';

import { SunreiDTO } from '@/dto';
import { apiClient } from '@/lib/api-client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { GoogleMap, Marker } from '../components/Map';
import { boundsToWKTPolygon } from '../utils/map-utils';

const center = {
  lat: 35.6762,
  lng: 139.6503,
};

export default function Home() {
  const [selectedSunrei, setSelectedSunrei] = useState<string | null>(null);
  const [hoveredMarker, setHoveredMarker] = useState<string | null>(null);
  const [selectedSpot, setSelectedSpot] = useState<string | null>(null);
  const [isLoaded, setIsLoaded] = useState(false);
  const [modalSpot, setModalSpot] = useState<any>(null);
  const [sunreis, setSunreis] = useState<SunreiDTO[]>([]);
  const [loading, setLoading] = useState(true);
  const debounceTimerRef = useRef<NodeJS.Timeout | null>(null);

  const onLoad = useCallback(() => {
    setIsLoaded(true);
  }, []);

  const fetchSunreis = useCallback(async (polygon?: string) => {
    try {
      const response = await apiClient.sunreisGet(polygon);
      const result = response.data;
      setSunreis(result.sunreis || []);
    } catch (error) {
      console.error('Failed to fetch sunreis:', error);
      setSunreis([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    // Initial load without polygon
    fetchSunreis();
  }, [fetchSunreis]);

  const handleBoundsChanged = useCallback(
    (bounds: google.maps.LatLngBounds) => {
      // Clear existing timer
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }

      // Set new timer with 500ms delay
      debounceTimerRef.current = setTimeout(() => {
        const polygon = boundsToWKTPolygon(bounds);
        setLoading(true);
        fetchSunreis(polygon);
      }, 500);
    },
    [fetchSunreis],
  );

  const allSpots = sunreis.flatMap(
    (sunrei) =>
      sunrei.spots?.flatMap(
        (spot) =>
          spot.places?.map((place) => ({
            id: spot.id,
            title: spot.title,
            description: spot.description,
            placeId: place.id,
            placeName: place.name,
            placeAddress: place.address,
            lat: place.latitude || 0,
            lng: place.longitude || 0,
            sunreiId: sunrei.id,
            sunreiTitle: sunrei.title,
          })) || [],
      ) || [],
  );

  const handleSunreiClick = (sunreiId: string) => {
    setSelectedSunrei(sunreiId);
    setSelectedSpot(null);
  };

  return (
    <div className="flex h-screen">
      <div className="w-96 h-full overflow-y-auto border-r border-gray-200">
        <div className="p-4">
          <h1 className="text-2xl font-bold mb-6">성지순례</h1>
          {loading ? (
            <div className="flex justify-center items-center h-64">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500"></div>
            </div>
          ) : (
            <div className="space-y-4">
              {sunreis.map((sunrei: any) => (
                <div
                  key={sunrei.id}
                  className={`p-4 border rounded-lg cursor-pointer transition-all ${
                    selectedSunrei === sunrei.id
                      ? 'border-blue-500 bg-blue-50'
                      : 'border-gray-200 hover:border-gray-300 hover:bg-gray-50'
                  }`}
                  onClick={() => handleSunreiClick(sunrei.id)}
                >
                  <div className="space-y-3">
                    <div>
                      <h3 className="font-semibold text-lg mb-1">
                        {sunrei.title}
                      </h3>
                      <p className="text-sm text-gray-600 mb-2">
                        {sunrei.description}
                      </p>
                      <div className="flex items-center gap-3 text-xs text-gray-500">
                        <span className="flex items-center gap-1">
                          <svg
                            className="w-4 h-4"
                            fill="none"
                            stroke="currentColor"
                            viewBox="0 0 24 24"
                          >
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              strokeWidth={2}
                              d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z"
                            />
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              strokeWidth={2}
                              d="M15 11a3 3 0 11-6 0 3 3 0 016 0z"
                            />
                          </svg>
                          {sunrei.spots?.length || 0}개 장소
                        </span>
                      </div>
                    </div>
                    <div className="grid grid-cols-4 gap-1">
                      {sunrei.images && sunrei.images.length > 0 ? (
                        sunrei.images.slice(0, 4).map((image, index) => (
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
                                <div className="absolute inset-0 bg-black bg-opacity-60 flex items-center justify-center">
                                  <span className="text-white text-sm font-medium">
                                    +{sunrei.images.length - 4}
                                  </span>
                                </div>
                              )}
                          </div>
                        ))
                      ) : (
                        <div className="aspect-square rounded bg-gray-100 flex items-center justify-center">
                          <svg
                            className="w-6 h-6 text-gray-400"
                            fill="none"
                            stroke="currentColor"
                            viewBox="0 0 24 24"
                          >
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              strokeWidth={2}
                              d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"
                            />
                          </svg>
                        </div>
                      )}
                    </div>
                  </div>
                  {selectedSunrei === sunrei.id && sunrei.spots && (
                    <div className="mt-3 pt-3 border-t border-gray-200">
                      <p className="text-xs font-medium text-gray-700 mb-2">
                        방문 가능한 장소:
                      </p>
                      <div className="space-y-1">
                        {sunrei.spots.map((spot) => (
                          <div key={spot.id} className="space-y-1">
                            <p className="text-xs font-medium text-gray-700">
                              {spot.title}
                            </p>
                            {spot.places?.map((place) => (
                              <div
                                key={place.id}
                                className="text-xs text-gray-600 flex items-center gap-2 hover:text-blue-600 ml-2"
                                onMouseEnter={() =>
                                  setHoveredMarker(`${spot.id}-${place.id}`)
                                }
                                onMouseLeave={() => setHoveredMarker(null)}
                              >
                                <span className="w-1 h-1 bg-gray-400 rounded-full"></span>
                                <span>
                                  {place.name} - {place.address}
                                </span>
                              </div>
                            ))}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="flex-1 relative">
        <GoogleMap
          apiKey={process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY || ''}
          center={center}
          zoom={12}
          onMapLoad={onLoad}
          onBoundsChanged={handleBoundsChanged}
        >
          {allSpots.map((spot) => {
            const markerId = `${spot.id}-${spot.placeId}`;
            const isHighlighted =
              selectedSunrei === spot.sunreiId || hoveredMarker === markerId;
            return (
              <Marker
                key={markerId}
                position={{ lat: spot.lat, lng: spot.lng }}
                title={`${spot.sunreiTitle} - ${spot.title} - ${spot.placeName}`}
                isHighlighted={isHighlighted}
                onClick={() => {
                  setSelectedSunrei(spot.sunreiId);
                  setModalSpot(spot);
                }}
              />
            );
          })}
        </GoogleMap>
      </div>

      {modalSpot && (
        <div
          className="fixed inset-0 flex items-center justify-center z-50 p-4"
          style={{ backgroundColor: 'rgba(0, 0, 0, 0.3)' }}
          onClick={() => setModalSpot(null)}
        >
          <div
            className="bg-white rounded-lg max-w-2xl w-full max-h-[90vh] overflow-hidden shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="relative h-64 bg-gray-200 flex items-center justify-center">
              <svg
                className="w-12 h-12 text-gray-400"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"
                />
              </svg>
              <button
                className="absolute top-4 right-4 bg-white rounded-full p-2 shadow-lg hover:bg-gray-100"
                onClick={() => setModalSpot(null)}
              >
                <svg
                  className="w-5 h-5"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M6 18L18 6M6 6l12 12"
                  />
                </svg>
              </button>
            </div>
            <div className="p-6">
              <h2 className="text-2xl font-bold mb-2">{modalSpot.placeName}</h2>
              <p className="text-gray-600 mb-1">{modalSpot.placeAddress}</p>
              <p className="text-gray-500 text-sm mb-4">
                {modalSpot.sunreiTitle} - {modalSpot.title}
              </p>
              <div className="space-y-4">
                <div>
                  <h3 className="font-semibold text-sm text-gray-700 mb-1">
                    설명
                  </h3>
                  <p className="text-gray-800 leading-relaxed">
                    {modalSpot.description}
                  </p>
                </div>
                <div className="pt-4 border-t">
                  <a
                    href={`https://www.google.com/maps/search/?api=1&query=${modalSpot.lat},${modalSpot.lng}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-blue-600 hover:text-blue-800 font-medium text-sm flex items-center gap-1"
                  >
                    <svg
                      className="w-4 h-4"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z"
                      />
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M15 11a3 3 0 11-6 0 3 3 0 016 0z"
                      />
                    </svg>
                    Google Maps에서 보기
                  </a>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
