'use client';

import { SunreiDTO, SourceType } from '@/api/admin';
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
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
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
  const [typeFilter, setTypeFilter] = useState<SourceType | undefined>(undefined);

  const {
    data: allSunreis = [],
    isLoading: loading,
    error: queryError,
  } = useSunreis({ q: q || undefined, published: publishedFilter });

  const sunreis =
    typeFilter === undefined
      ? allSunreis
      : allSunreis.filter((s) => s.source?.type === typeFilter);
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
      <div className="flex items-end justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Content</h1>
          <p className="mt-1 text-sm text-muted-foreground">Manage Sunreis (videos / works)</p>
        </div>
        <Button onClick={() => router.push('/sunreis/new')}>
          <Plus className="h-4 w-4 mr-2" />
          New Sunrei
        </Button>
      </div>

      <div className="flex flex-wrap items-center gap-2.5">
        <Input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search title or summary…"
          className="w-80"
        />
        <Select
          value={publishedFilter === undefined ? 'all' : publishedFilter ? 'published' : 'drafts'}
          onValueChange={(v) => setPublishedFilter(v === 'all' ? undefined : v === 'published')}
        >
          <SelectTrigger className="w-[150px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All</SelectItem>
            <SelectItem value="published">Published</SelectItem>
            <SelectItem value="drafts">Drafts</SelectItem>
          </SelectContent>
        </Select>
        <Select
          value={typeFilter ?? 'all'}
          onValueChange={(v) => setTypeFilter(v === 'all' ? undefined : (v as SourceType))}
        >
          <SelectTrigger className="w-[170px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All types</SelectItem>
            {Object.values(SourceType).map((t) => (
              <SelectItem key={t} value={t}>
                {t}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {error && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

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
        // 목록은 카드 하나에 행을 구분선으로 나눈다.
        <Card className="gap-0 divide-y py-0">
          {sunreis.map((sunrei) => (
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
          ))}
        </Card>
      )}
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
    <div className="flex items-center gap-3 px-4 py-3">
      <div className="h-10 w-10 shrink-0 overflow-hidden rounded-md bg-muted">
        {sunrei.images?.[0] && (
          <ResponsiveImage
            multiSizeImage={sunrei.images[0]}
            alt={sunrei.title}
            size="small"
            className="h-full w-full object-cover"
          />
        )}
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-semibold">{sunrei.title}</p>
        <p className="mt-0.5 truncate text-[12.5px] text-muted-foreground">
          {sunrei.source?.name ?? '—'} · {sunrei.spots?.length || 0} spots
        </p>
      </div>
      <Badge variant={published ? 'default' : 'secondary'}>{published ? 'Published' : 'Draft'}</Badge>
      <Button
        variant="ghost"
        size="sm"
        className="h-8 w-8 p-0 text-muted-foreground"
        onClick={onTogglePublish}
        disabled={toggling}
        title={published ? 'Unpublish' : 'Publish'}
      >
        {published ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
      </Button>
      <Button variant="outline" size="sm" onClick={onEdit}>
        <Edit2 className="h-3.5 w-3.5" />
        Edit
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
  );
}
