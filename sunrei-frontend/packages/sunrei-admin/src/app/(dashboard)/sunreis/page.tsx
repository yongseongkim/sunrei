'use client';

import { SunreiDTO, SourceType, SunreiSort } from '@/api/admin';
import { useMemo } from 'react';
import {
  useSunreis,
  useDeleteSunrei,
  useSetSunreiPublished,
} from '@/lib/hooks/use-sunreis';
import { useListNavigation } from '@/lib/hooks/use-list-navigation';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { SunreiThumbnail } from '@/components/SunreiThumbnail';
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
  const { params, setParam, openDetail } = useListNavigation('/sunreis');
  const q = params.get('q') ?? '';
  const publishedFilter = params.get('status') === 'published' ? true : params.get('status') === 'drafts' ? false : undefined;
  const typeFilter = Object.values(SourceType).includes(params.get('type') as SourceType)
    ? params.get('type') as SourceType : undefined;
  const sort = Object.values(SunreiSort).includes(params.get('sort') as SunreiSort)
    ? params.get('sort') as SunreiSort : SunreiSort.CreatedDesc;

  const {
    data,
    isLoading: loading,
    error: queryError,
    hasNextPage,
    fetchNextPage,
    isFetchingNextPage,
  } = useSunreis({ q: q || undefined, published: publishedFilter, sourceType: typeFilter, sort });

  const sunreis = useMemo(() => data?.pages.flatMap(page => page.data ?? []) ?? [], [data]);
  const total = data?.pages[0]?.totalElements ?? sunreis.length;
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

  return (
    <div className="space-y-6">
      <div className="flex items-end justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Content</h1>
          <p className="mt-1 text-sm text-muted-foreground">Manage Sunreis (videos / works) · {sunreis.length} of {total}</p>
        </div>
        <Button onClick={() => openDetail('/sunreis/new')}>
          <Plus className="h-4 w-4 mr-2" />
          New Sunrei
        </Button>
      </div>

      <div className="flex flex-wrap items-center gap-2.5">
        <Input
          value={q}
          onChange={(e) => setParam('q', e.target.value)}
          placeholder="Search title or summary…"
          className="w-80"
        />
        <Select
          value={publishedFilter === undefined ? 'all' : publishedFilter ? 'published' : 'drafts'}
          onValueChange={(v) => setParam('status', v === 'all' ? '' : v)}
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
          onValueChange={(v) => setParam('type', v === 'all' ? '' : v)}
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
        <Select value={sort} onValueChange={(value) => setParam('sort', value === SunreiSort.CreatedDesc ? '' : value)}>
          <SelectTrigger aria-label="Sort content" className="ml-auto w-[180px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={SunreiSort.CreatedDesc}>Recently added</SelectItem>
            <SelectItem value={SunreiSort.UpdatedDesc}>Recently updated</SelectItem>
            <SelectItem value={SunreiSort.TitleAsc}>Title A–Z</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {error && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {loading ? (
        <div role="status" aria-label="Loading content" className="flex min-h-[400px] items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      ) : sunreis.length === 0 ? (
        <Card>
          <CardContent className="text-center py-12">
            <MapPin className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
            <h3 className="text-lg font-medium mb-2">No Sunreis yet</h3>
            <Button onClick={() => openDetail('/sunreis/new')}>
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
              showUpdated={sort === SunreiSort.UpdatedDesc}
              onEdit={() => openDetail(`/sunreis/${sunrei.id}/edit`)}
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
      {hasNextPage && (
        <div className="flex justify-center">
          <Button variant="outline" disabled={isFetchingNextPage} onClick={() => fetchNextPage()}>
            {isFetchingNextPage && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {isFetchingNextPage ? 'Loading…' : 'Load more'}
          </Button>
        </div>
      )}
    </div>
  );
}

function SunreiRow({
  sunrei,
  showUpdated,
  onEdit,
  onDelete,
  onTogglePublish,
  toggling,
}: {
  sunrei: SunreiDTO;
  showUpdated: boolean;
  onEdit: () => void;
  onDelete: () => void;
  onTogglePublish: () => void;
  toggling: boolean;
}) {
  const published = sunrei.publishedAt != null;
  const timestamp = showUpdated ? sunrei.updatedAt : sunrei.createdAt;
  const date = timestamp ? new Date(timestamp) : null;
  const validDate = date && !Number.isNaN(date.getTime());
  return (
    <div data-sunrei-id={sunrei.id} className="flex items-center gap-3 px-4 py-3">
      <SunreiThumbnail sunrei={sunrei} />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-semibold">{sunrei.title}</p>
        <p className="mt-0.5 truncate text-[12.5px] text-muted-foreground">
          {sunrei.source?.name ?? '—'} · {sunrei.spots?.length || 0} spots
        </p>
        {validDate && (
          <p className="mt-0.5 text-xs text-muted-foreground">
            {showUpdated ? 'Updated' : 'Added'}{' '}
            <time dateTime={timestamp} title={date.toLocaleString()}>
              {date.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })}
            </time>
          </p>
        )}
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
