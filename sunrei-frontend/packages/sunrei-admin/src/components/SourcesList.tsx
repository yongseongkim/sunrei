'use client';

import { SourceRowDTO } from '@/api/admin';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Edit2, ExternalLink } from 'lucide-react';

const TYPE_BEHAVIOR: Record<string, string> = {
  YOUTUBE: 'links out ↗',
  TV: '✦ managed page',
  ANIME: '✦ managed page',
  OTHER: '✦ managed page',
};

export default function SourcesList({
  sources,
  onEdit,
}: {
  sources: SourceRowDTO[];
  onEdit: (id: string) => void;
}) {
  if (sources.length === 0) {
    return (
      <Card>
        <CardContent className="text-center py-12 text-muted-foreground">
          No sources yet. Create one to attach Sunreis to.
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-2">
      {sources.map((s) => (
        <Card key={s.id} className="py-3">
          <CardContent className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-3 min-w-0">
              <Badge variant="secondary">{s.type}</Badge>
              <div className="min-w-0">
                <p className="font-medium truncate">{s.name}</p>
                <p className="text-xs text-muted-foreground truncate">
                  {s.sunreiCount ?? 0} sunreis · {s.spotCount ?? 0} spots
                </p>
              </div>
            </div>
            <div className="flex items-center gap-3 shrink-0">
              <span className="text-xs text-muted-foreground hidden sm:inline">
                {s.type === 'YOUTUBE' ? <ExternalLink className="inline h-3 w-3" /> : '✦'}{' '}
                {TYPE_BEHAVIOR[s.type]}
              </span>
              <Button variant="ghost" size="sm" onClick={() => onEdit(s.id!)}>
                <Edit2 className="h-4 w-4" />
              </Button>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
