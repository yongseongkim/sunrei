'use client';

import { use, useState } from 'react';
import { useTag, useUpdateTag, useRemoveSunreiFromTag } from '@/lib/hooks/use-tags';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Input } from '@/components/ui/input';
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
import { Tag, AlertCircle, Loader2, ArrowLeft, ExternalLink, Edit2, Save, X, Trash2 } from 'lucide-react';
import Link from 'next/link';

export default function TagDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const { data: tag, isLoading, error: queryError } = useTag(id);
  const updateTagMutation = useUpdateTag(id);
  const removeSunreiMutation = useRemoveSunreiFromTag(id);

  const [isEditing, setIsEditing] = useState(false);
  const [editName, setEditName] = useState('');
  const [editDescription, setEditDescription] = useState('');
  const [sunreiToRemove, setSunreiToRemove] = useState<{ id: string; title: string } | null>(null);

  const error = queryError?.message || null;

  const handleEdit = () => {
    if (tag) {
      setEditName(tag.name || '');
      setEditDescription(tag.description || '');
      setIsEditing(true);
    }
  };

  const handleSave = async () => {
    try {
      await updateTagMutation.mutateAsync({
        name: editName,
        description: editDescription || null,
      });
      setIsEditing(false);
    } catch (err) {
      // Error handling
    }
  };

  const handleCancel = () => {
    setIsEditing(false);
  };

  const handleRemoveSunrei = (sunreiId: string, sunreiTitle: string) => {
    setSunreiToRemove({ id: sunreiId, title: sunreiTitle });
  };

  const confirmRemoveSunrei = async () => {
    if (!sunreiToRemove) return;

    try {
      await removeSunreiMutation.mutateAsync(sunreiToRemove.id);
      setSunreiToRemove(null);
    } catch (err) {
      // Error handling
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
            <Button variant="outline" onClick={handleCancel}>
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
                    <label className="text-sm font-medium">Name</label>
                    <Input
                      value={editName}
                      onChange={(e) => setEditName(e.target.value)}
                      placeholder="Tag name"
                      className="mt-1"
                    />
                  </div>
                  <div>
                    <label className="text-sm font-medium">Description</label>
                    <Textarea
                      value={editDescription}
                      onChange={(e) => setEditDescription(e.target.value)}
                      placeholder="Tag description (optional)"
                      className="mt-1"
                      rows={3}
                    />
                  </div>
                </div>
              ) : (
                <>
                  <CardTitle className="text-2xl">{tag.name}</CardTitle>
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
          Associated Sunreis ({tag.sunreis?.length || 0})
        </h2>
        {tag.sunreis && tag.sunreis.length > 0 ? (
          <div className="space-y-2">
            {tag.sunreis.map((sunrei) => (
              <div
                key={sunrei.id}
                className="flex items-center justify-between p-3 rounded-md border bg-card hover:bg-accent transition-colors"
              >
                <span className="text-sm font-medium">{sunrei.title}</span>
                <div className="flex items-center gap-1">
                  <Link href={`/sunreis/${sunrei.id}`}>
                    <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
                      <ExternalLink className="h-3.5 w-3.5" />
                    </Button>
                  </Link>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-8 w-8 p-0 text-destructive hover:text-destructive"
                    onClick={() => handleRemoveSunrei(sunrei.id!, sunrei.title!)}
                    disabled={removeSunreiMutation.isPending}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="text-center py-8 border rounded-md">
            <p className="text-sm text-muted-foreground">
              No Sunreis associated with this tag yet.
            </p>
          </div>
        )}
      </div>

      <AlertDialog open={!!sunreiToRemove} onOpenChange={(open) => !open && setSunreiToRemove(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove Sunrei from Tag</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to remove <strong>{sunreiToRemove?.title}</strong> from this tag?
              This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmRemoveSunrei}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Remove
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
