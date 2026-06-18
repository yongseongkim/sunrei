'use client';

import { SunreiDTO } from '@/api/admin';
import {
  useSunreis,
  useDeleteSunrei,
  useSetSunreiPublished,
} from '@/lib/hooks/use-sunreis';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import ResponsiveImage from '@/components/ResponsiveImage';
import {
  Plus,
  Edit2,
  Trash2,
  MapPin,
  AlertCircle,
  Loader2,
  Eye,
  EyeOff,
} from 'lucide-react';

export default function SunreisPage() {
  const router = useRouter();
  const [q, setQ] = useState('');
  const [publishedFilter, setPublishedFilter] = useState<boolean | undefined>(undefined);

  const {
    data: sunreis = [],
    isLoading: loading,
    error: queryError,
  } = useSunreis({ q: q || undefined, published: publishedFilter });
  const deleteMutation = useDeleteSunrei();
  const publishMutation = useSetSunreiPublished();

  const error =
    queryError?.message ||
    (deleteMutation.error as any)?.response?.data?.error ||
    null;

  const handleDelete = (id: string) => {
    if (typeof window !== 'undefined' && !confirm('Delete this Sunrei?')) return;
    deleteMutation.mutate(id);
  };

  const togglePublish = (s: SunreiDTO) => {
    publishMutation.mutate({ id: s.id, published: s.publishedAt == null });
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Content</h1>
          <p className="text-muted-foreground mt-2">Manage Sunreis (videos / works)</p>
        </div>
        <Button onClick={() => router.push('/sunreis/new')}>
          <Plus className="h-4 w-4 mr-2" />
          New Sunrei
        </Button>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search by title/summary..."
          className="flex-1 min-w-[200px] max-w-sm rounded-md border bg-background px-3 py-2 text-sm"
        />
        <div className="flex gap-1">
          {([undefined, true, false] as const).map((p) => (
            <Button
              key={String(p)}
              variant={publishedFilter === p ? 'default' : 'outline'}
              size="sm"
              onClick={() => setPublishedFilter(p)}
            >
              {p === undefined ? 'All' : p === true ? 'Published' : 'Drafts'}
            </Button>
          ))}
        </div>
      </div>

      {error && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      <div className="space-y-2">
        {sunreis.length === 0 ? (
          <Card>
            <CardContent className="text-center py-12">
              <MapPin className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
              <h3 className="text-lg font-medium mb-2">No Sunreis yet</h3>
              <Button onClick={() => router.push('/sunreis/new')}>
                <Plus className="h-4 w-4 mr-2" />
                Create First Sunrei
              </Button>
            </CardContent>
          </Card>
        ) : (
          sunreis.map((sunrei) => (
            <SunreiRow
              key={sunrei.id}
              sunrei={sunrei}
              onEdit={() => router.push(`/sunreis/${sunrei.id}/edit`)}
              onDelete={() => handleDelete(sunrei.id)}
              onTogglePublish={() => togglePublish(sunrei)}
              toggling={
                publishMutation.isPending &&
                publishMutation.variables?.id === sunrei.id
              }
            />
          ))
        )}
      </div>
    </div>
  );
}

function SunreiRow({
  sunrei,
  onEdit,
  onDelete,
  onTogglePublish,
  toggling,
}: {
  sunrei: SunreiDTO;
  onEdit: () => void;
  onDelete: () => void;
  onTogglePublish: () => void;
  toggling: boolean;
}) {
  const published = sunrei.publishedAt != null;
  return (
    <Card className="py-3">
      <CardContent className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-3 min-w-0">
          {sunrei.images?.[0] ? (
            <div className="h-10 w-10 rounded-md overflow-hidden bg-muted shrink-0">
              <ResponsiveImage
                multiSizeImage={sunrei.images[0]}
                alt={sunrei.title}
                size="small"
                className="h-full w-full object-cover"
              />
            </div>
          ) : null}
          <div className="min-w-0">
            <p className="font-medium truncate">{sunrei.title}</p>
            <p className="text-xs text-muted-foreground truncate">
              {sunrei.source?.name ?? '—'} · {sunrei.spots?.length || 0} spots
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <Badge variant={published ? 'default' : 'secondary'}>
            {published ? 'Published' : 'Draft'}
          </Badge>
          <Button
            variant="ghost"
            size="sm"
            className="h-8 w-8 p-0"
            onClick={onTogglePublish}
            disabled={toggling}
            title={published ? 'Unpublish' : 'Publish'}
          >
            {published ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
          </Button>
          <Button variant="ghost" size="sm" className="h-8 w-8 p-0" onClick={onEdit}>
            <Edit2 className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="h-8 w-8 p-0 text-destructive hover:text-destructive"
            onClick={onDelete}
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
