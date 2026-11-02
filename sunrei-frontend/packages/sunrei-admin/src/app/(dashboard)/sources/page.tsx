'use client';

import SourcesList from '@/components/SourcesList';
import { useSources } from '@/lib/hooks/use-sources';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { AlertCircle, Loader2, Plus } from 'lucide-react';
import { useListNavigation } from '@/lib/hooks/use-list-navigation';

export default function SourcesPage() {
  const { params, setParam, openDetail } = useListNavigation('/sources');
  const q = params.get('q') ?? '';
  const { data: sources = [], isLoading, error } = useSources(q);

  return (
    <div className="space-y-6">
      <div className="flex items-end justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Channels / Sources</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Content sources (YouTube / Instagram / TV / Anime / Other)
          </p>
        </div>
        <Button onClick={() => openDetail('/sources/new')}>
          <Plus className="h-4 w-4 mr-2" />
          New Source
        </Button>
      </div>

      <Input value={q} onChange={(e) => setParam('q', e.target.value)} placeholder="Search sources…" className="w-80" />

      {error && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>{error.message}</AlertDescription>
        </Alert>
      )}

      {isLoading ? (
        <div role="status" aria-label="Loading sources" className="flex min-h-[400px] items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <SourcesList sources={sources} onEdit={(id) => openDetail(`/sources/${id}/edit`)} />
      )}
    </div>
  );
}
