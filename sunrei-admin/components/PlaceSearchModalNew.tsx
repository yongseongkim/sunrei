'use client';

import { PlaceInput } from '@/api';
import { config } from '@/lib/config';
import { useEffect, useRef, useState } from 'react';
import GoogleMap from './GoogleMap';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { MapPin, Search } from 'lucide-react';

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
      latitude: undefined,
      longitude: undefined,
    }
  );
  const [mapCenter, setMapCenter] = useState({ lat: 35.6762, lng: 139.6503 }); // Tokyo
  const [mapZoom, setMapZoom] = useState(12);
  const [searchInput, setSearchInput] = useState('');
  const [map, setMap] = useState<google.maps.Map | null>(null);
  const [searchBox, setSearchBox] = useState<google.maps.places.SearchBox | null>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const geocoder = useRef<google.maps.Geocoder | null>(null);

  useEffect(() => {
    if (initialPlace?.latitude && initialPlace?.longitude) {
      setMapCenter({ lat: initialPlace.latitude, lng: initialPlace.longitude });
      setSelectedPlace(initialPlace);
    }
  }, [initialPlace]);

  useEffect(() => {
    if (map && searchInputRef.current && !searchBox) {
      const box = new google.maps.places.SearchBox(searchInputRef.current);
      setSearchBox(box);

      box.addListener('places_changed', () => {
        const places = box.getPlaces();
        if (!places || places.length === 0) return;

        const place = places[0];
        if (!place.geometry || !place.geometry.location) return;

        const lat = place.geometry.location.lat();
        const lng = place.geometry.location.lng();

        setSelectedPlace({
          name: place.name || '',
          address: place.formatted_address || '',
          latitude: lat,
          longitude: lng,
        });

        setMapCenter({ lat, lng });
        if (map) {
          map.setCenter({ lat, lng });
          map.setZoom(16);
        }
      });
    }
  }, [map, searchBox]);

  const handleMapClick = (e: google.maps.MapMouseEvent) => {
    if (!e.latLng) return;

    const lat = e.latLng.lat();
    const lng = e.latLng.lng();

    // Reverse geocoding to get address
    if (!geocoder.current) {
      geocoder.current = new google.maps.Geocoder();
    }

    geocoder.current.geocode(
      { location: { lat, lng } },
      (results, status) => {
        if (status === 'OK' && results && results[0]) {
          setSelectedPlace({
            name: results[0].name || 'Selected Location',
            address: results[0].formatted_address || '',
            latitude: lat,
            longitude: lng,
          });
        } else {
          setSelectedPlace({
            name: 'Selected Location',
            address: '',
            latitude: lat,
            longitude: lng,
          });
        }
      }
    );
  };

  const handleCoordinateSearch = () => {
    const coords = searchInput.match(/(-?\d+\.?\d*),\s*(-?\d+\.?\d*)/);
    if (coords) {
      const lat = parseFloat(coords[1]);
      const lng = parseFloat(coords[2]);
      
      setSelectedPlace({
        name: 'Custom Location',
        address: `${lat}, ${lng}`,
        latitude: lat,
        longitude: lng,
      });
      
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

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle className="text-xl flex items-center gap-2">
            <MapPin className="h-5 w-5" />
            Search Location
          </DialogTitle>
        </DialogHeader>
        
        <div className="flex-1 overflow-y-auto space-y-4">
          <div className="space-y-2">
            <Label htmlFor="search">Search for a place or enter coordinates</Label>
            <div className="flex gap-2">
              <Input
                ref={searchInputRef}
                id="search"
                type="text"
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                placeholder="Search place or enter coordinates (lat, lng)"
                className="flex-1"
              />
              <Button
                onClick={handleCoordinateSearch}
                variant="secondary"
                size="default"
              >
                <Search className="h-4 w-4 mr-2" />
                Search Coords
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              Enter address to search or coordinates like: 35.6762, 139.6503
            </p>
          </div>

          <div className="h-96 border rounded-lg overflow-hidden">
            <GoogleMap
              apiKey={config.googleMaps.apiKey}
              center={mapCenter}
              zoom={mapZoom}
              onClick={handleMapClick}
              onLoad={setMap}
              markers={
                selectedPlace.latitude && selectedPlace.longitude
                  ? [{ position: { lat: selectedPlace.latitude, lng: selectedPlace.longitude } }]
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
                  onChange={(e) => setSelectedPlace({ ...selectedPlace, name: e.target.value })}
                  placeholder="Enter place name"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="address">Address</Label>
                <Input
                  id="address"
                  type="text"
                  value={selectedPlace.address || ''}
                  onChange={(e) => setSelectedPlace({ ...selectedPlace, address: e.target.value })}
                  placeholder="Enter address"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="latitude">Latitude</Label>
                <Input
                  id="latitude"
                  type="number"
                  value={selectedPlace.latitude || ''}
                  onChange={(e) => setSelectedPlace({ 
                    ...selectedPlace, 
                    latitude: parseFloat(e.target.value) 
                  })}
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
                  onChange={(e) => setSelectedPlace({ 
                    ...selectedPlace, 
                    longitude: parseFloat(e.target.value) 
                  })}
                  placeholder="0.000000"
                  step="any"
                />
              </div>
            </div>
          </Card>
        </div>

        <Separator className="my-4" />
        
        <div className="flex justify-end gap-2">
          <Button
            onClick={onClose}
            variant="outline"
          >
            Cancel
          </Button>
          <Button
            onClick={handleSave}
            disabled={!selectedPlace.latitude || !selectedPlace.longitude}
          >
            Add Location
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}