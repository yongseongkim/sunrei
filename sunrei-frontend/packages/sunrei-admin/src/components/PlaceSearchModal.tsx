'use client';

import { PlaceInput } from '@/api/admin';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { config } from '@/lib/config';
import { MapPin, Navigation, Search } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import GoogleMap from './GoogleMap';

interface PlaceSearchModalProps {
  isOpen: boolean;
  onClose: () => void;
  onPlaceSelect: (place: PlaceInput) => void;
  initialPlace?: PlaceInput;
}

export default function PlaceSearchModal({
  isOpen,
  onClose,
  onPlaceSelect,
  initialPlace,
}: PlaceSearchModalProps) {
  const [selectedPlace, setSelectedPlace] = useState<PlaceInput>(
    initialPlace || {
      name: '',
      address: '',
      latitude: 0,
      longitude: 0,
      googleMapsId: null,
    },
  );
  const [mapCenter, setMapCenter] = useState({ lat: 35.6762, lng: 139.6503 }); // 도쿄
  const [mapZoom, setMapZoom] = useState(14);
  const [addressSearchInput, setAddressSearchInput] = useState('');
  const [coordinateSearchInput, setCoordinateSearchInput] = useState('');
  const [map, setMap] = useState<google.maps.Map | null>(null);
  const searchBoxRef = useRef<google.maps.places.SearchBox | null>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const geocoder = useRef<google.maps.Geocoder | null>(null);
  const initialPlaceRef = useRef<PlaceInput | undefined>(undefined);

  useEffect(() => {
    initialPlaceRef.current = initialPlace;
  }, [initialPlace]);

  useEffect(() => {
    if (isOpen) {
      setAddressSearchInput('');
      setCoordinateSearchInput('');

      if (searchInputRef.current) {
        searchInputRef.current.value = '';
      }

      const initial = initialPlaceRef.current;
      if (initial?.latitude && initial?.longitude) {
        setMapCenter({
          lat: initial.latitude,
          lng: initial.longitude,
        });
        setSelectedPlace(initial);
        setMapZoom(16);
      } else {
        setSelectedPlace({
          name: '',
          address: '',
          latitude: 0,
          longitude: 0,
          googleMapsId: null,
        });
        setMapCenter({ lat: 35.6762, lng: 139.6503 }); // 도쿄
        setMapZoom(14);
      }
    }
  }, [isOpen]);

  useEffect(() => {
    if (map && searchInputRef.current && isOpen) {
      if (searchBoxRef.current) {
        google.maps.event.clearInstanceListeners(searchBoxRef.current);
      }

      const box = new google.maps.places.SearchBox(searchInputRef.current);
      searchBoxRef.current = box;

      const listener = box.addListener('places_changed', () => {
        const places = box.getPlaces();
        if (!places || places.length === 0) return;

        const place = places[0];
        if (!place.geometry || !place.geometry.location) return;

        const lat = place.geometry.location.lat();
        const lng = place.geometry.location.lng();

        // Google place ID는 서버가 같은 장소를 하나로 묶는 기준이고, 앱의 Google 정보 카드도 이 값으로 불러온다.
        setSelectedPlace({
          name: place.name || '',
          address: place.formatted_address || '',
          latitude: lat,
          longitude: lng,
          googleMapsId: place.place_id ?? null,
        });

        setMapCenter({ lat, lng });
        if (map) {
          map.setCenter({ lat, lng });
          map.setZoom(16);
        }
      });

      return () => {
        google.maps.event.removeListener(listener);
      };
    }
  }, [map, isOpen]);

  const handleMapClick = (e: google.maps.MapMouseEvent) => {
    if (!e.latLng) return;

    const lat = e.latLng.lat();
    const lng = e.latLng.lng();

    // 지도의 가게 아이콘을 누르면 그 장소의 Google place ID까지 가져오고, 빈 곳을 누르면 주소만 찾는다.
    const placeId = 'placeId' in e ? (e as google.maps.IconMouseEvent).placeId : null;
    if (placeId && map) {
      e.stop();
      new google.maps.places.PlacesService(map).getDetails(
        { placeId, fields: ['name', 'formatted_address', 'geometry', 'place_id'] },
        (place, status) => {
          if (status !== google.maps.places.PlacesServiceStatus.OK || !place) return;
          const location = place.geometry?.location;
          setSelectedPlace({
            name: place.name || 'Selected Location',
            address: place.formatted_address || '',
            latitude: location ? location.lat() : lat,
            longitude: location ? location.lng() : lng,
            googleMapsId: place.place_id ?? placeId,
          });
        },
      );
      return;
    }

    if (!geocoder.current) {
      geocoder.current = new google.maps.Geocoder();
    }

    geocoder.current.geocode(
      { location: { lat, lng }, language: 'ko' },
      (results, status) => {
        if (status === 'OK' && results && results[0]) {
          const result = results[0];
          let placeName = 'Selected Location';

          if (result.address_components) {
            const pointOfInterest = result.address_components.find(
              (comp) =>
                comp.types.includes('point_of_interest') ||
                comp.types.includes('establishment'),
            );
            const locality = result.address_components.find(
              (comp) =>
                comp.types.includes('locality') ||
                comp.types.includes('sublocality'),
            );

            if (pointOfInterest) {
              placeName = pointOfInterest.long_name;
            } else if (locality) {
              placeName = locality.long_name;
            }
          }

          setSelectedPlace({
            name: placeName,
            address: result.formatted_address || '',
            latitude: lat,
            longitude: lng,
            googleMapsId: null,
          });
        } else {
          setSelectedPlace({
            name: 'Selected Location',
            address: '',
            latitude: lat,
            longitude: lng,
            googleMapsId: null,
          });
        }
      },
    );
  };

  const handleCoordinateSearch = () => {
    const coords = coordinateSearchInput.match(
      /(-?\d+\.?\d*)[,\s]+(-?\d+\.?\d*)/,
    );
    if (coords) {
      const lat = parseFloat(coords[1]);
      const lng = parseFloat(coords[2]);

      if (!geocoder.current) {
        geocoder.current = new google.maps.Geocoder();
      }

      geocoder.current.geocode(
        { location: { lat, lng }, language: 'ko' },
        (results, status) => {
          if (status === 'OK' && results && results[0]) {
            const result = results[0];
            let placeName = 'Custom Location';

            if (result.address_components) {
              const pointOfInterest = result.address_components.find(
                (comp) =>
                  comp.types.includes('point_of_interest') ||
                  comp.types.includes('establishment'),
              );
              const locality = result.address_components.find(
                (comp) =>
                  comp.types.includes('locality') ||
                  comp.types.includes('sublocality'),
              );

              if (pointOfInterest) {
                placeName = pointOfInterest.long_name;
              } else if (locality) {
                placeName = locality.long_name;
              }
            }

            setSelectedPlace({
              name: placeName,
              address: result.formatted_address || `${lat}, ${lng}`,
              latitude: lat,
              longitude: lng,
              googleMapsId: null,
            });
          } else {
            setSelectedPlace({
              name: 'Custom Location',
              address: `${lat}, ${lng}`,
              latitude: lat,
              longitude: lng,
              googleMapsId: null,
            });
          }
        },
      );

      setMapCenter({ lat, lng });
      if (map) {
        map.setCenter({ lat, lng });
        map.setZoom(16);
      }
    }
  };

  const handleSave = () => {
    if (selectedPlace.latitude && selectedPlace.longitude) {
      onPlaceSelect(selectedPlace);
      onClose();
    }
  };

  const handleClose = () => {
    setAddressSearchInput('');
    setCoordinateSearchInput('');
    if (searchInputRef.current) {
      searchInputRef.current.value = '';
    }
    onClose();
  };

  return (
    <Dialog open={isOpen} onOpenChange={handleClose}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle className="text-xl flex items-center gap-2">
            <MapPin className="h-5 w-5" />
            Search Location
          </DialogTitle>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto space-y-4">
          <Tabs defaultValue="address" className="w-full">
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="address">
                <MapPin className="h-4 w-4 mr-2" />
                Search by Address
              </TabsTrigger>
              <TabsTrigger value="coordinates">
                <Navigation className="h-4 w-4 mr-2" />
                Search by Coordinates
              </TabsTrigger>
            </TabsList>

            <TabsContent value="address" className="mt-4 space-y-2">
              <Label htmlFor="address-search">Address or Place Name</Label>
              <Input
                id="address-search"
                ref={searchInputRef}
                type="text"
                value={addressSearchInput}
                onChange={(e) => setAddressSearchInput(e.target.value)}
                placeholder="Enter address or place name (e.g., Tokyo Tower, Shibuya Station)"
                className="w-full"
              />
              <p className="text-xs text-muted-foreground">
                Start typing to search for places. Select from suggestions or
                click on the map.
              </p>
            </TabsContent>

            <TabsContent value="coordinates" className="mt-4 space-y-2">
              <Label htmlFor="coord-search">GPS Coordinates</Label>
              <div className="flex gap-2">
                <Input
                  id="coord-search"
                  type="text"
                  value={coordinateSearchInput}
                  onChange={(e) => setCoordinateSearchInput(e.target.value)}
                  placeholder="35.6762, 139.6503"
                  className="flex-1"
                  onKeyPress={(e) => {
                    if (e.key === 'Enter') {
                      handleCoordinateSearch();
                    }
                  }}
                />
                <Button
                  onClick={handleCoordinateSearch}
                  variant="default"
                  size="default"
                  className="min-w-[100px]"
                >
                  <Search className="h-4 w-4 mr-2" />
                  Search
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">
                Enter coordinates in format: latitude, longitude (e.g., 35.6762,
                139.6503)
              </p>
            </TabsContent>
          </Tabs>

          <div className="h-96 border rounded-lg overflow-hidden">
            <GoogleMap
              apiKey={config.googleMaps.apiKey}
              center={mapCenter}
              zoom={mapZoom}
              onClick={handleMapClick}
              onLoad={setMap}
              markers={
                selectedPlace.latitude && selectedPlace.longitude
                  ? [
                      {
                        position: {
                          lat: selectedPlace.latitude,
                          lng: selectedPlace.longitude,
                        },
                      },
                    ]
                  : []
              }
            />
          </div>

          <Card className="p-4">
            <h3 className="font-medium mb-3">Selected Location</h3>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="name">Name</Label>
                <Input
                  id="name"
                  type="text"
                  value={selectedPlace.name || ''}
                  onChange={(e) =>
                    setSelectedPlace({ ...selectedPlace, name: e.target.value })
                  }
                  placeholder="Enter place name"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="address">Address</Label>
                <Input
                  id="address"
                  type="text"
                  value={selectedPlace.address || ''}
                  onChange={(e) =>
                    setSelectedPlace({
                      ...selectedPlace,
                      address: e.target.value,
                    })
                  }
                  placeholder="Enter address"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="latitude">Latitude</Label>
                <Input
                  id="latitude"
                  type="number"
                  value={selectedPlace.latitude || ''}
                  onChange={(e) =>
                    setSelectedPlace({
                      ...selectedPlace,
                      latitude: parseFloat(e.target.value),
                    })
                  }
                  placeholder="0.000000"
                  step="any"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="longitude">Longitude</Label>
                <Input
                  id="longitude"
                  type="number"
                  value={selectedPlace.longitude || ''}
                  onChange={(e) =>
                    setSelectedPlace({
                      ...selectedPlace,
                      longitude: parseFloat(e.target.value),
                    })
                  }
                  placeholder="0.000000"
                  step="any"
                />
              </div>
              <div className="col-span-2 space-y-2">
                <Label htmlFor="google-place-id">Google place ID</Label>
                <Input
                  id="google-place-id"
                  readOnly
                  value={selectedPlace.googleMapsId ?? ''}
                  placeholder="Not linked: pick a search result or a place icon on the map"
                  className="font-mono text-xs bg-muted/40"
                />
              </div>
            </div>
          </Card>
        </div>

        <Separator className="my-4" />

        <div className="flex justify-end gap-2">
          <Button onClick={handleClose} variant="outline">
            Cancel
          </Button>
          <Button
            onClick={handleSave}
            disabled={
              !selectedPlace.name ||
              !selectedPlace.address ||
              selectedPlace.latitude === 0 ||
              selectedPlace.longitude === 0
            }
          >
            Add Location
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
