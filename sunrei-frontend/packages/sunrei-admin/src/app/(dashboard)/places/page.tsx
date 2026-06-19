'use client';

import { usePlaces } from '@/lib/hooks/use-places';
import { PlaceListItemDTO } from '@/api/admin';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { AlertCircle, Loader2, MapPin } from 'lucide-react';
import { useState } from 'react';

export default function PlacesPage() {
  const [q, setQ] = useState('');
  const { data: places = [], isLoading, error } = usePlaces(q);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Places</h1>
        <p className="text-muted-foreground mt-2">
          Real-world locations, keyed by Google place_id (auto-deduped)
        </p>
      </div>

      <input
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="Search places..."
        className="w-full max-w-sm rounded-md border bg-background px-3 py-2 text-sm"
      />

      {error && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>{error.message}</AlertDescription>
        </Alert>
      )}

      {places.length === 0 ? (
        <Card>
          <CardContent className="text-center py-12 text-muted-foreground">
            <MapPin className="h-10 w-10 mx-auto mb-3 opacity-50" />
            No places yet. Places are created from spot forms.
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {places.map((p) => (
            <PlaceRow key={p.id} place={p} />
          ))}
        </div>
      )}
    </div>
  );
}

function PlaceRow({ place }: { place: PlaceListItemDTO }) {
  return (
    <Card className="py-3">
      <CardContent className="flex items-center justify-between gap-4">
        <div className="min-w-0">
          <p className="font-medium truncate">{place.name}</p>
          <p className="text-xs text-muted-foreground truncate">
            {place.googleMapsId ?? '—'}
          </p>
        </div>
        <div className="min-w-0 flex-1 text-xs text-muted-foreground truncate">
          {place.area ?? '—'}
        </div>
        <div className="flex items-center gap-2 shrink-0 text-xs text-muted-foreground">
          <Badge variant="outline">{place.sourceCount} src</Badge>
          <Badge variant="outline">{place.spotCount} spots</Badge>
        </div>
      </CardContent>
    </Card>
  );
}
