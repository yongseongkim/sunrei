'use client';

import SourcesList from '@/components/SourcesList';
import { useSources } from '@/lib/hooks/use-sources';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { AlertCircle, Loader2, Plus } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState } from 'react';

export default function SourcesPage() {
  const router = useRouter();
  const [q, setQ] = useState('');
  const { data: sources = [], isLoading, error } = useSources(q);

  if (isLoading) {
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
          <h1 className="text-2xl font-bold tracking-tight">Channels / Sources</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Content sources (YouTube / Instagram / TV / Anime / Other)
          </p>
        </div>
        <Button onClick={() => router.push('/sources/new')}>
          <Plus className="h-4 w-4 mr-2" />
          New Source
        </Button>
      </div>

      <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search sources…" className="w-80" />

      {error && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>{error.message}</AlertDescription>
        </Alert>
      )}

      <SourcesList
        sources={sources}
        onEdit={(id) => router.push(`/sources/${id}/edit`)}
      />
    </div>
  );
}
