'use client';

import { SourceRowDTO } from '@/api/admin';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Edit2 } from 'lucide-react';

const TYPE_BEHAVIOR: Record<string, string> = {
  YOUTUBE: 'Links out ↗',
  INSTAGRAM: 'Links out ↗',
  TV: 'Managed page',
  ANIME: 'Managed page',
  OTHER: 'Managed page',
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

  // 목록은 카드 하나에 행을 구분선으로 나눈다.
  return (
    <Card className="gap-0 divide-y py-0">
      {sources.map((s) => (
        <div key={s.id} className="flex items-center gap-3 px-4 py-3">
          <span className="w-24 shrink-0">
            <Badge variant="outline">{s.type}</Badge>
          </span>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold">{s.name}</p>
            <p className="mt-0.5 truncate text-[12.5px] text-muted-foreground">
              {s.sunreiCount ?? 0} sunreis · {s.spotCount ?? 0} spots
            </p>
          </div>
          <span className="hidden text-[12.5px] text-muted-foreground sm:inline">{TYPE_BEHAVIOR[s.type]}</span>
          <Button variant="outline" size="sm" onClick={() => onEdit(s.id!)}>
            <Edit2 className="h-3.5 w-3.5" />
            Edit
          </Button>
        </div>
      ))}
    </Card>
  );
}
