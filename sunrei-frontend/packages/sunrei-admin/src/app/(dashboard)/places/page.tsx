'use client';

import { usePlaces, useUpdatePlace } from '@/lib/hooks/use-places';
import { PlaceListItemDTO } from '@/api/admin';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { AlertCircle, Edit2, Loader2, MapPin } from 'lucide-react';
import { useState } from 'react';
import { PlaceEditSheet } from '@/components/PlaceEditSheet';

export default function PlacesPage() {
  const [q, setQ] = useState('');
  const { data: places = [], isLoading, error } = usePlaces(q);
  const [editing, setEditing] = useState<PlaceListItemDTO | null>(null);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Places</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Real-world locations, keyed by Google place_id (auto-deduped)
          </p>
        </div>
        <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search places…" className="w-[280px]" />
      </div>

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
        // 목록은 카드 하나에 행을 구분선으로 나눈다.
        <Card className="gap-0 divide-y py-0">
          {places.map((p) => (
            <PlaceRow key={p.id} place={p} onEdit={() => setEditing(p)} />
          ))}
        </Card>
      )}

      <PlaceEditSheet place={editing} onClose={() => setEditing(null)} />
    </div>
  );
}

function PlaceRow({ place, onEdit }: { place: PlaceListItemDTO; onEdit: () => void }) {
  const updatePlace = useUpdatePlace(place.id);
  return (
    <div className="flex items-center gap-3 px-4 py-3">
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="truncate text-sm font-semibold">{place.name}</span>
          {/* 폐업은 오류가 아니라 기록 상태라 앱과 같은 중립 외곽선으로 보인다. */}
          {place.isClosed && (
            <Badge variant="outline" className="rounded-full text-muted-foreground">
              Closed
            </Badge>
          )}
        </div>
        <p className="mt-0.5 truncate font-mono text-xs text-muted-foreground">
          {place.googleMapsId ?? '—'}
          {place.area && <span className="font-sans"> · {place.area}</span>}
        </p>
      </div>
      <Badge variant="secondary">{place.sourceCount} src</Badge>
      <Badge variant="secondary">{place.spotCount} spots</Badge>
      {/* 폐업은 장소 단위라 이 장소를 가리키는 모든 spot에 함께 보인다. */}
      <Button
        variant="outline"
        size="sm"
        className="w-24"
        disabled={updatePlace.isPending}
        onClick={() => updatePlace.mutate({ isClosed: !place.isClosed })}
      >
        {place.isClosed ? 'Reopen' : 'Mark closed'}
      </Button>
      <Button variant="ghost" size="sm" className="h-8 w-8 p-0 text-muted-foreground" onClick={onEdit} aria-label="Edit place">
        <Edit2 className="h-4 w-4" />
      </Button>
    </div>
  );
}
