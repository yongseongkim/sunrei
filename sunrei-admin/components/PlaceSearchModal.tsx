'use client';

import { PlaceInput } from '@/api';
import { config } from '@/lib/config';
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

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 flex items-center justify-center z-50 p-4"
      style={{ backgroundColor: 'rgba(0, 0, 0, 0.3)' }}
      onClick={onClose}
    >
      <div
        className="bg-white rounded-lg max-w-4xl w-full max-h-[90vh] overflow-hidden shadow-2xl flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="p-6 overflow-y-auto">
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-xl font-bold text-gray-900">Search Location</h2>
            <button
              onClick={onClose}
              className="text-gray-500 hover:text-gray-700 p-1"
            >
              <svg
                className="w-6 h-6"
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
          
          <div className="mb-4">
            <div className="flex gap-2">
              <input
                ref={searchInputRef}
                type="text"
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                placeholder="Search place or enter coordinates (lat, lng)"
                className="flex-1 px-3 py-2 border border-gray-300 rounded-md text-gray-900 placeholder-gray-600"
              />
              <button
                onClick={handleCoordinateSearch}
                className="px-4 py-2 bg-gray-200 text-gray-700 rounded-md hover:bg-gray-300"
              >
                Search Coords
              </button>
            </div>
            <p className="text-xs text-gray-600 mt-1">
              Enter address to search or coordinates like: 35.6762, 139.6503
            </p>
          </div>

          <div className="h-96 mb-4 border rounded-lg overflow-hidden">
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

          <div className="bg-gray-50 p-3 rounded-lg mb-4">
            <h3 className="font-medium text-gray-900 mb-2">Selected Location</h3>
            <div className="grid grid-cols-2 gap-2 text-sm">
              <div>
                <label className="text-gray-700">Name:</label>
                <input
                  type="text"
                  value={selectedPlace.name || ''}
                  onChange={(e) => setSelectedPlace({ ...selectedPlace, name: e.target.value })}
                  placeholder="Enter place name"
                  className="w-full mt-1 px-2 py-1 border rounded text-gray-900 placeholder-gray-600"
                />
              </div>
              <div>
                <label className="text-gray-700">Address:</label>
                <input
                  type="text"
                  value={selectedPlace.address || ''}
                  onChange={(e) => setSelectedPlace({ ...selectedPlace, address: e.target.value })}
                  placeholder="Enter address"
                  className="w-full mt-1 px-2 py-1 border rounded text-gray-900 placeholder-gray-600"
                />
              </div>
              <div>
                <label className="text-gray-700">Latitude:</label>
                <input
                  type="number"
                  value={selectedPlace.latitude || ''}
                  onChange={(e) => setSelectedPlace({ 
                    ...selectedPlace, 
                    latitude: parseFloat(e.target.value) 
                  })}
                  placeholder="0.000000"
                  className="w-full mt-1 px-2 py-1 border rounded text-gray-900 placeholder-gray-600"
                  step="any"
                />
              </div>
              <div>
                <label className="text-gray-700">Longitude:</label>
                <input
                  type="number"
                  value={selectedPlace.longitude || ''}
                  onChange={(e) => setSelectedPlace({ 
                    ...selectedPlace, 
                    longitude: parseFloat(e.target.value) 
                  })}
                  placeholder="0.000000"
                  className="w-full mt-1 px-2 py-1 border rounded text-gray-900 placeholder-gray-600"
                  step="any"
                />
              </div>
            </div>
          </div>

          <div className="flex justify-end gap-2">
            <button
              onClick={onClose}
              className="px-4 py-2 text-gray-700 bg-gray-200 rounded-md hover:bg-gray-300"
            >
              Cancel
            </button>
            <button
              onClick={handleSave}
              disabled={!selectedPlace.latitude || !selectedPlace.longitude}
              className="px-4 py-2 bg-indigo-600 text-white rounded-md hover:bg-indigo-700 disabled:opacity-50"
            >
              Add Location
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}