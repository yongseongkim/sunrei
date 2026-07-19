'use client';

import { use, useState } from 'react';
import { useTag, useUpdateTag, useDetachSpotFromTag } from '@/lib/hooks/use-tags';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Tag, AlertCircle, Loader2, ArrowLeft, Edit2, Save, X, Trash2 } from 'lucide-react';

export default function TagDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const { data: tag, isLoading, error: queryError } = useTag(id);
  const updateTagMutation = useUpdateTag(id);
  const detachMutation = useDetachSpotFromTag(id);

  const [isEditing, setIsEditing] = useState(false);
  const [editLabelEn, setEditLabelEn] = useState('');
  const [editLabelKo, setEditLabelKo] = useState('');
  const [editDescription, setEditDescription] = useState('');
  const [spotToRemove, setSpotToRemove] = useState<{ id: string; title: string } | null>(null);

  const error = queryError?.message || null;

  const handleEdit = () => {
    if (tag) {
      setEditLabelEn(tag.labelEn || '');
      setEditLabelKo(tag.labelKo || '');
      setEditDescription(tag.description || '');
      setIsEditing(true);
    }
  };

  const handleSave = async () => {
    try {
      await updateTagMutation.mutateAsync({
        labelEn: editLabelEn,
        labelKo: editLabelKo,
        description: editDescription || null,
      });
      setIsEditing(false);
    } catch {
      // surfaced via mutation error
    }
  };

  const confirmDetach = async () => {
    if (!spotToRemove) return;
    try {
      await detachMutation.mutateAsync(spotToRemove.id);
      setSpotToRemove(null);
    } catch {
      // surfaced via mutation error
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (error || !tag) {
    return (
      <div className="space-y-6">
        <Button variant="ghost" onClick={() => router.push('/tags')}>
          <ArrowLeft className="h-4 w-4 mr-2" />
          Back to Tags
        </Button>
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>{error || 'Tag not found'}</AlertDescription>
        </Alert>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <Button variant="ghost" onClick={() => router.push('/tags')}>
          <ArrowLeft className="h-4 w-4 mr-2" />
          Back to Tags
        </Button>
        {!isEditing ? (
          <Button onClick={handleEdit}>
            <Edit2 className="h-4 w-4 mr-2" />
            Edit Tag
          </Button>
        ) : (
          <div className="flex gap-2">
            <Button onClick={handleSave} disabled={updateTagMutation.isPending}>
              <Save className="h-4 w-4 mr-2" />
              Save
            </Button>
            <Button variant="outline" onClick={() => setIsEditing(false)}>
              <X className="h-4 w-4 mr-2" />
              Cancel
            </Button>
          </div>
        )}
      </div>

      {updateTagMutation.isError && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>
            {updateTagMutation.error?.message || 'Failed to update tag'}
          </AlertDescription>
        </Alert>
      )}

      <Card>
        <CardHeader>
          <div className="flex items-center gap-3">
            <Tag className="h-6 w-6" />
            <div className="flex-1">
              {isEditing ? (
                <div className="space-y-3">
                  <div>
                    <Label className="text-sm font-medium">한국어 (Korean)</Label>
                    <Input
                      value={editLabelKo}
                      onChange={(e) => setEditLabelKo(e.target.value)}
                      className="mt-1"
                    />
                  </div>
                  <div>
                    <Label className="text-sm font-medium">English</Label>
                    <Input
                      value={editLabelEn}
                      onChange={(e) => setEditLabelEn(e.target.value)}
                      className="mt-1"
                    />
                  </div>
                  <div>
                    <Label className="text-sm font-medium">Description</Label>
                    <Textarea
                      value={editDescription}
                      onChange={(e) => setEditDescription(e.target.value)}
                      className="mt-1"
                      rows={3}
                    />
                  </div>
                </div>
              ) : (
                <>
                  <CardTitle className="text-2xl">{tag.labelKo}</CardTitle>
                  {tag.labelEn && tag.labelEn !== tag.labelKo && (
                    <CardDescription className="mt-2">{tag.labelEn}</CardDescription>
                  )}
                  {tag.description && (
                    <CardDescription className="mt-2">{tag.description}</CardDescription>
                  )}
                </>
              )}
            </div>
          </div>
        </CardHeader>
      </Card>

      <div>
        <h2 className="text-lg font-semibold mb-3">
          Associated Spots ({tag.spots?.length || 0})
        </h2>
        {tag.spots && tag.spots.length > 0 ? (
          <div className="space-y-2">
            {tag.spots.map((spot) => (
              <div
                key={spot.id}
                className="flex items-center justify-between p-3 rounded-md border bg-card"
              >
                <div className="flex flex-col">
                  <span className="text-sm font-medium">{spot.title}</span>
                  <span className="text-xs text-muted-foreground">{spot.sunreiTitle}</span>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-8 w-8 p-0 text-destructive hover:text-destructive"
                  onClick={() => setSpotToRemove({ id: spot.id!, title: spot.title! })}
                  disabled={detachMutation.isPending}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
            ))}
          </div>
        ) : (
          <div className="text-center py-8 border rounded-md">
            <p className="text-sm text-muted-foreground">No spots use this tag yet.</p>
          </div>
        )}
      </div>

      <AlertDialog open={!!spotToRemove} onOpenChange={(open) => !open && setSpotToRemove(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Detach Spot from Tag</AlertDialogTitle>
            <AlertDialogDescription>
              Detach <strong>{spotToRemove?.title}</strong> from this tag? The spot itself is not deleted.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmDetach}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Detach
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
