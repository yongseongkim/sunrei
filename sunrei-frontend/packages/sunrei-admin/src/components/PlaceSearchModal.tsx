'use client';

import { PlaceInput } from '@/api/admin';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { config } from '@/lib/config';
import { MapPin, Search } from 'lucide-react';
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
  const [latInput, setLatInput] = useState('');
  const [lngInput, setLngInput] = useState('');
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
      setLatInput('');
      setLngInput('');

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

  // 검색창에서 제안을 고르지 않고 Search를 누르면 입력한 말로 찾아 첫 결과를 고른다.
  const handleAddressSearch = () => {
    const query = addressSearchInput.trim();
    if (!query || !map) return;
    new google.maps.places.PlacesService(map).textSearch({ query }, (results, status) => {
      const place = results?.[0];
      const location = place?.geometry?.location;
      if (status !== google.maps.places.PlacesServiceStatus.OK || !place || !location) return;
      const lat = location.lat();
      const lng = location.lng();
      setSelectedPlace({
        name: place.name || '',
        address: place.formatted_address || '',
        latitude: lat,
        longitude: lng,
        googleMapsId: place.place_id ?? null,
      });
      setMapCenter({ lat, lng });
      map.setCenter({ lat, lng });
      map.setZoom(16);
    });
  };

  const handleCoordinateSearch = () => {
    const lat = parseFloat(latInput);
    const lng = parseFloat(lngInput);
    if (Number.isFinite(lat) && Number.isFinite(lng)) {

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
    setLatInput('');
    setLngInput('');
    if (searchInputRef.current) {
      searchInputRef.current.value = '';
    }
    onClose();
  };

  const hasPoint = !!selectedPlace.latitude && !!selectedPlace.longitude;

  return (
    <Dialog open={isOpen} onOpenChange={handleClose}>
      <DialogContent className="flex max-h-[90vh] flex-col overflow-hidden sm:max-w-[640px]">
        <DialogHeader>
          <DialogTitle className="text-[17px]">Select Location</DialogTitle>
        </DialogHeader>

        <div className="flex-1 space-y-3 overflow-y-auto">
          <Tabs defaultValue="address" className="w-full">
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="address">Search by Address</TabsTrigger>
              <TabsTrigger value="coordinates">Search by Coordinates</TabsTrigger>
            </TabsList>

            <TabsContent value="address" className="mt-3">
              <div className="flex gap-2">
                <Input
                  id="address-search"
                  ref={searchInputRef}
                  type="text"
                  value={addressSearchInput}
                  onChange={(e) => setAddressSearchInput(e.target.value)}
                  placeholder="Address or place name (e.g., Tokyo Tower, Shibuya Station)"
                  className="flex-1"
                />
                <Button type="button" variant="outline" onClick={handleAddressSearch}>
                  <Search className="h-3.5 w-3.5" />
                  Search
                </Button>
              </div>
            </TabsContent>

            <TabsContent value="coordinates" className="mt-3">
              <div className="grid grid-cols-[1fr_1fr_auto] gap-2">
                <Input
                  id="coord-lat"
                  value={latInput}
                  onChange={(e) => setLatInput(e.target.value)}
                  placeholder="Latitude (35.6762)"
                  className="font-mono"
                  onKeyDown={(e) => e.key === 'Enter' && handleCoordinateSearch()}
                />
                <Input
                  id="coord-lng"
                  value={lngInput}
                  onChange={(e) => setLngInput(e.target.value)}
                  placeholder="Longitude (139.6503)"
                  className="font-mono"
                  onKeyDown={(e) => e.key === 'Enter' && handleCoordinateSearch()}
                />
                <Button type="button" variant="outline" onClick={handleCoordinateSearch}>
                  Go
                </Button>
              </div>
            </TabsContent>
          </Tabs>

          <div className="h-96 overflow-hidden rounded-lg border">
            <GoogleMap
              apiKey={config.googleMaps.apiKey}
              center={mapCenter}
              zoom={mapZoom}
              onClick={handleMapClick}
              onLoad={setMap}
              markers={
                hasPoint
                  ? [{ position: { lat: selectedPlace.latitude, lng: selectedPlace.longitude } }]
                  : []
              }
            />
          </div>

          <div className="space-y-2.5 rounded-lg bg-muted p-3">
            <div className="flex items-center gap-1.5 text-[11px] font-semibold text-muted-foreground">
              <MapPin className="h-3.5 w-3.5 text-primary" />
              Selected Location
              {hasPoint && (
                <span className="ml-auto font-mono">
                  {selectedPlace.latitude.toFixed(5)}, {selectedPlace.longitude.toFixed(5)}
                </span>
              )}
            </div>
            <div className="grid grid-cols-[1fr_1.4fr] gap-2.5">
              <div className="space-y-1.5">
                <Label htmlFor="name">Name</Label>
                <Input
                  id="name"
                  value={selectedPlace.name || ''}
                  onChange={(e) => setSelectedPlace({ ...selectedPlace, name: e.target.value })}
                  placeholder="Place name"
                  className="bg-background"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="address">Address</Label>
                <Input
                  id="address"
                  value={selectedPlace.address || ''}
                  onChange={(e) => setSelectedPlace({ ...selectedPlace, address: e.target.value })}
                  placeholder="Address"
                  className="bg-background"
                />
              </div>
            </div>
            {selectedPlace.googleMapsId && (
              <p className="text-xs text-muted-foreground">
                Results follow the browser language — fix the name/address here before adding.
              </p>
            )}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="google-place-id">Google place ID</Label>
            <Input
              id="google-place-id"
              readOnly
              value={selectedPlace.googleMapsId ?? ''}
              placeholder="Not linked: pick a search result or a place icon on the map"
              className="bg-muted font-mono text-xs shadow-none"
            />
          </div>
        </div>

        <div className="flex justify-end gap-2 pt-2">
          <Button onClick={handleClose} variant="outline">
            Cancel
          </Button>
          <Button
            onClick={handleSave}
            disabled={!selectedPlace.name || !selectedPlace.address || !hasPoint}
          >
            Add Location
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
