'use client';

import { useEffect, useState } from 'react';
import { AlertCircle, Loader2 } from 'lucide-react';
import { PlaceListItemDTO } from '@/api/admin';
import { useUpdatePlace } from '@/lib/hooks/use-places';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Sheet, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from '@/components/ui/sheet';

type Draft = {
  name: string;
  address: string;
  latitude: string;
  longitude: string;
  googleMapsId: string;
  isClosed: boolean;
  closedReason: string;
  notes: string;
};

function draftOf(place: PlaceListItemDTO): Draft {
  return {
    name: place.name,
    address: place.address ?? '',
    latitude: String(place.latitude),
    longitude: String(place.longitude),
    googleMapsId: place.googleMapsId ?? '',
    isClosed: place.isClosed,
    closedReason: place.closedReason ?? '',
    notes: place.notes ?? '',
  };
}

/** 중복 place ID(409)는 그 칸 아래에, 나머지 오류는 시트 아래에 보여 준다. */
function saveError(error: unknown): { duplicate: boolean; message: string } | null {
  if (!error) return null;
  const data = (error as { response?: { status?: number; data?: { error?: string } } }).response;
  if (data?.status === 409) return { duplicate: true, message: 'Another place already has this Google place ID.' };
  return { duplicate: false, message: data?.data?.error || 'Failed to save the place.' };
}

/**
 * 장소 하나를 고치는 시트다. 고친 값은 이 장소를 가리키는 모든 spot에 함께 보인다.
 * Google place ID를 비우면 지우지 않고 그대로 두며, 사유와 메모는 비우면 지운다.
 */
export function PlaceEditSheet({ place, onClose }: { place: PlaceListItemDTO | null; onClose: () => void }) {
  const [draft, setDraft] = useState<Draft | null>(null);
  const updatePlace = useUpdatePlace(place?.id ?? '');

  useEffect(() => {
    setDraft(place ? draftOf(place) : null);
    updatePlace.reset();
    // 다른 장소를 열 때만 초기화한다.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [place?.id]);

  const set = <K extends keyof Draft>(key: K, value: Draft[K]) => setDraft((d) => (d ? { ...d, [key]: value } : d));
  const error = saveError(updatePlace.error);
  const latitude = Number(draft?.latitude);
  const longitude = Number(draft?.longitude);
  const valid =
    !!draft && draft.name.trim() !== '' && Number.isFinite(latitude) && Number.isFinite(longitude) && draft.latitude !== '' && draft.longitude !== '';

  const save = () => {
    if (!draft || !valid) return;
    updatePlace.mutate(
      {
        name: draft.name.trim(),
        address: draft.address.trim(),
        latitude,
        longitude,
        googleMapsId: draft.googleMapsId.trim() || null,
        isClosed: draft.isClosed,
        closedReason: draft.isClosed ? draft.closedReason.trim() : null,
        notes: draft.notes.trim(),
      },
      { onSuccess: onClose }
    );
  };

  return (
    <Sheet open={!!place} onOpenChange={(open) => !open && onClose()}>
      <SheetContent className="w-[440px] sm:max-w-[440px] overflow-y-auto">
        <SheetHeader>
          <SheetTitle>Edit Place</SheetTitle>
          <SheetDescription>Changes apply to every spot that points to this place.</SheetDescription>
        </SheetHeader>
        {draft && (
          <div className="flex flex-col gap-4 px-4">
            <div className="space-y-1.5">
              <Label htmlFor="place-name">Name</Label>
              <Input id="place-name" value={draft.name} onChange={(e) => set('name', e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="place-address">Address</Label>
              <Input id="place-address" value={draft.address} onChange={(e) => set('address', e.target.value)} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="place-lat">Latitude</Label>
                <Input
                  id="place-lat"
                  type="number"
                  step="any"
                  className="font-mono"
                  value={draft.latitude}
                  onChange={(e) => set('latitude', e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="place-lng">Longitude</Label>
                <Input
                  id="place-lng"
                  type="number"
                  step="any"
                  className="font-mono"
                  value={draft.longitude}
                  onChange={(e) => set('longitude', e.target.value)}
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="place-google-id">Google place ID</Label>
              <Input
                id="place-google-id"
                className="font-mono text-xs"
                value={draft.googleMapsId}
                placeholder="Not linked"
                aria-invalid={error?.duplicate || undefined}
                onChange={(e) => set('googleMapsId', e.target.value)}
              />
              {error?.duplicate && (
                <p className="flex items-center gap-1.5 text-[11px] font-medium text-destructive">
                  <AlertCircle className="h-[11px] w-[11px]" />
                  {error.message}
                </p>
              )}
            </div>
            <div className="space-y-2.5">
              <label className="flex items-center gap-2 text-sm font-medium">
                <input
                  id="place-closed"
                  type="checkbox"
                  className="h-4 w-4 accent-primary"
                  checked={draft.isClosed}
                  onChange={(e) => set('isClosed', e.target.checked)}
                />
                Closed
                {place?.isClosed && place.closedAt && (
                  <span className="ml-auto text-xs font-normal text-muted-foreground">
                    Closed at {new Date(place.closedAt).toLocaleDateString()}
                  </span>
                )}
              </label>
              {draft.isClosed && (
                <div className="space-y-1.5">
                  <Label htmlFor="place-reason">Reason</Label>
                  <Input
                    id="place-reason"
                    value={draft.closedReason}
                    placeholder="e.g. Permanently closed on Google Maps"
                    onChange={(e) => set('closedReason', e.target.value)}
                  />
                </div>
              )}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="place-notes">Memo</Label>
              <Textarea id="place-notes" rows={3} value={draft.notes} onChange={(e) => set('notes', e.target.value)} />
            </div>
            {error && !error.duplicate && <p className="text-sm font-medium text-destructive">{error.message}</p>}
          </div>
        )}
        <SheetFooter className="flex-row justify-end gap-2">
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={save} disabled={!valid || updatePlace.isPending}>
            {updatePlace.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Save
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
