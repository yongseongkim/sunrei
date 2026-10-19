'use client';

import { useState } from 'react';
import { TagDTO } from '@/api/admin';
import { useAllTags, useCreateTag } from '@/lib/hooks/use-tags';
import { useRouter } from 'next/navigation';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tag, AlertCircle, Loader2, Plus } from 'lucide-react';
import { cn } from '@/lib/utils';

const PAGE_SIZE = 18;

export default function TagsPage() {
  const router = useRouter();
  const [page, setPage] = useState(0);
  const [creating, setCreating] = useState(false);
  const { data, isLoading: loading, error: queryError } = useAllTags();

  const error = queryError?.message || null;
  const allTags = data?.tags ?? [];
  const spotCountByTagId = data?.spotCountByTagId ?? {};
  const pageCount = Math.max(1, Math.ceil(allTags.length / PAGE_SIZE));
  const current = Math.min(page, pageCount - 1);
  const tags = allTags.slice(current * PAGE_SIZE, (current + 1) * PAGE_SIZE);

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
          <h1 className="text-2xl font-bold tracking-tight">Tags</h1>
          <p className="mt-1 text-sm text-muted-foreground">Bilingual spot tags ({allTags.length} total)</p>
        </div>
        <Button onClick={() => setCreating(true)}>
          <Plus className="h-4 w-4" />
          New Tag
        </Button>
      </div>

      {error && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {allTags.length === 0 ? (
        <Card>
          <CardContent className="text-center py-12">
            <Tag className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
            <h3 className="text-lg font-medium mb-2">No tags yet</h3>
            <p className="text-muted-foreground">Create one here, or type a new tag in a spot form.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-3">
          {tags.map((tag) => (
            <TagCard
              key={tag.id}
              tag={tag}
              spotCount={spotCountByTagId[tag.id!] || 0}
              onClick={() => router.push(`/tags/${tag.id}`)}
            />
          ))}
        </div>
      )}

      {pageCount > 1 && (
        <div className="flex justify-center gap-1.5">
          <Button variant="ghost" size="sm" disabled={current === 0} onClick={() => setPage(current - 1)}>
            Previous
          </Button>
          {Array.from({ length: pageCount }).map((_, i) => (
            <Button
              key={i}
              variant={i === current ? 'outline' : 'ghost'}
              size="sm"
              className={cn('w-8', i === current && 'font-bold')}
              onClick={() => setPage(i)}
            >
              {i + 1}
            </Button>
          ))}
          <Button
            variant="ghost"
            size="sm"
            disabled={current === pageCount - 1}
            onClick={() => setPage(current + 1)}
          >
            Next
          </Button>
        </div>
      )}

      <NewTagDialog
        open={creating}
        onClose={() => setCreating(false)}
        onCreated={(tag) => router.push(`/tags/${tag.id}`)}
      />
    </div>
  );
}

function TagCard({ tag, spotCount, onClick }: { tag: TagDTO; spotCount: number; onClick: () => void }) {
  return (
    <Card className="cursor-pointer gap-0 p-4 transition-colors hover:bg-muted/50" onClick={onClick}>
      <div className="text-[15px] font-bold">{tag.labelKo}</div>
      <div className="mt-0.5 text-[12.5px] text-muted-foreground">{tag.labelEn}</div>
      <div className="mt-2.5">
        <Badge variant="secondary">
          {spotCount} Spot{spotCount !== 1 ? 's' : ''}
        </Badge>
      </div>
    </Card>
  );
}

/** 한국어와 영어 라벨을 함께 넣어 태그를 만든다. spot 폼에서 만들면 두 라벨이 같은 글자로 들어간다. */
function NewTagDialog({
  open,
  onClose,
  onCreated,
}: {
  open: boolean;
  onClose: () => void;
  onCreated: (tag: TagDTO) => void;
}) {
  const [labelKo, setLabelKo] = useState('');
  const [labelEn, setLabelEn] = useState('');
  const createTag = useCreateTag();
  const valid = labelKo.trim() !== '' && labelEn.trim() !== '';

  const close = () => {
    setLabelKo('');
    setLabelEn('');
    createTag.reset();
    onClose();
  };

  const submit = () => {
    if (!valid) return;
    createTag.mutate(
      { labelKo: labelKo.trim(), labelEn: labelEn.trim() },
      {
        onSuccess: (tag) => {
          close();
          if (tag.id) onCreated(tag);
        },
      }
    );
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && close()}>
      <DialogContent className="sm:max-w-[420px]">
        <DialogHeader>
          <DialogTitle>New Tag</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="tag-ko">한국어 (Korean)</Label>
            <Input id="tag-ko" value={labelKo} onChange={(e) => setLabelKo(e.target.value)} placeholder="노포" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="tag-en">English</Label>
            <Input id="tag-en" value={labelEn} onChange={(e) => setLabelEn(e.target.value)} placeholder="Old-school" />
          </div>
          {createTag.error && <p className="text-sm font-medium text-destructive">Failed to create the tag.</p>}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={close}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={!valid || createTag.isPending}>
            {createTag.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
            Create
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
