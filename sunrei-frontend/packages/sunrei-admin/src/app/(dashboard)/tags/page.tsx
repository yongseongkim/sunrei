'use client';

import { useState } from 'react';
import { TagDTO } from '@/api/admin';
import { useTags } from '@/lib/hooks/use-tags';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Tag, AlertCircle, Loader2, Edit2, ChevronLeft, ChevronRight } from 'lucide-react';

export default function TagsPage() {
  const router = useRouter();
  const [nextToken, setNextToken] = useState<string | undefined>(undefined);
  const { data: result, isLoading: loading, error: queryError } = useTags(nextToken, 20);

  const error = queryError?.message || null;
  const tags = result?.data || [];
  const totalElements = result?.totalElements || 0;
  const spotCountByTagId = result?.spotCountByTagId || {};

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
          <h1 className="text-3xl font-bold tracking-tight">Tags</h1>
          <p className="text-muted-foreground mt-2">
            Bilingual spot tags ({totalElements} total)
          </p>
        </div>
      </div>

      {error && (
        <Alert variant="destructive" className="mb-6">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {tags.length === 0 ? (
          <Card className="col-span-full">
            <CardContent className="text-center py-12">
              <Tag className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
              <h3 className="text-lg font-medium mb-2">No tags yet</h3>
              <p className="text-muted-foreground">
                Tags are created on the fly from spot forms.
              </p>
            </CardContent>
          </Card>
        ) : (
          tags.map((tag) => (
            <TagCard
              key={tag.id}
              tag={tag}
              spotCount={spotCountByTagId[tag.id!] || 0}
              onClick={() => router.push(`/tags/${tag.id}`)}
            />
          ))
        )}
      </div>

      {totalElements > 0 && (
        <div className="flex items-center justify-between">
          <p className="text-sm text-muted-foreground">
            Showing {tags.length} of {totalElements} tags
          </p>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setNextToken(undefined)}
              disabled={!nextToken}
            >
              <ChevronLeft className="h-4 w-4 mr-1" />
              Previous
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setNextToken(result?.nextToken || undefined)}
              disabled={!result?.nextToken}
            >
              Next
              <ChevronRight className="h-4 w-4 ml-1" />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

function TagCard({
  tag,
  spotCount,
  onClick,
}: {
  tag: TagDTO;
  spotCount: number;
  onClick: () => void;
}) {
  return (
    <Card className="cursor-pointer hover:bg-accent transition-colors" onClick={onClick}>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg flex items-center gap-2">
            <Tag className="h-4 w-4" />
            {tag.labelKo}
          </CardTitle>
          <div className="flex items-center gap-2">
            <span className="text-sm text-muted-foreground">
              {spotCount} Spot{spotCount !== 1 ? 's' : ''}
            </span>
            <Button
              variant="ghost"
              size="sm"
              onClick={(e) => {
                e.stopPropagation();
                onClick();
              }}
            >
              <Edit2 className="h-4 w-4" />
            </Button>
          </div>
        </div>
        {tag.labelEn && tag.labelEn !== tag.labelKo && (
          <CardDescription className="line-clamp-2">{tag.labelEn}</CardDescription>
        )}
      </CardHeader>
    </Card>
  );
}
