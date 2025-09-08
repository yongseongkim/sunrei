'use client';

import { SunreiDTO } from '@/api/admin';
import { adminApi } from '@/lib/api-client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Separator } from '@/components/ui/separator';
import { 
  Plus, Edit2, Trash2, MapPin, AlertCircle, Loader2, 
  ChevronDown, ChevronRight
} from 'lucide-react';

export default function SunreisPage() {
  const router = useRouter();
  const [sunreis, setSunreis] = useState<SunreiDTO[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    fetchSunreis();
  }, []);

  const fetchSunreis = async () => {
    try {
      setLoading(true);
      setError(null);
      // Using page 1 with large size to get all items for now
      const response = await adminApi.listSunreis(1, 100);
      setSunreis(response.data.data || []);
    } catch (err: any) {
      setError(err.response?.data?.message || 'Failed to fetch Sunreis');
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (typeof window !== 'undefined' && !confirm('Are you sure you want to delete this Sunrei?')) return;
    
    try {
      await adminApi.deleteSunrei(id);
      await fetchSunreis();
    } catch (err: any) {
      setError(err.response?.data?.message || 'Failed to delete Sunrei');
    }
  };

  if (!mounted || loading) {
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
          <h1 className="text-3xl font-bold tracking-tight">Sunreis</h1>
          <p className="text-muted-foreground mt-2">Manage all Sunrei locations</p>
        </div>
        <Button onClick={() => router.push('/sunreis/new')}>
          <Plus className="h-4 w-4 mr-2" />
          New Sunrei
        </Button>
      </div>

      {error && (
        <Alert variant="destructive" className="mb-6">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      <div className="space-y-4">
        {sunreis.length === 0 ? (
          <Card>
            <CardContent className="text-center py-12">
              <MapPin className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
              <h3 className="text-lg font-medium mb-2">No Sunreis yet</h3>
              <p className="text-muted-foreground mb-4">
                Get started by creating your first Sunrei location.
              </p>
              <Button onClick={() => router.push('/sunreis/new')}>
                <Plus className="h-4 w-4 mr-2" />
                Create First Sunrei
              </Button>
            </CardContent>
          </Card>
        ) : (
          sunreis.map((sunrei) => (
            <SunreiCard
              key={sunrei.id}
              sunrei={sunrei}
              isExpanded={expandedId === sunrei.id}
              onEdit={() => router.push(`/sunreis/${sunrei.id}/edit`)}
              onToggleExpand={() => setExpandedId(expandedId === sunrei.id ? null : sunrei.id)}
              onDelete={() => handleDelete(sunrei.id!)}
            />
          ))
        )}
      </div>
    </div>
  );
}

function SunreiCard({ 
  sunrei, 
  isExpanded,
  onEdit, 
  onToggleExpand,
  onDelete
}: {
  sunrei: SunreiDTO;
  isExpanded: boolean;
  onEdit: () => void;
  onToggleExpand: () => void;
  onDelete: () => void;
}) {

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={onToggleExpand}
              className="p-0 h-auto"
            >
              {isExpanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
            </Button>
            <div>
              <CardTitle className="text-lg">{sunrei.title}</CardTitle>
              <CardDescription className="line-clamp-1">{sunrei.description}</CardDescription>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant="secondary">{sunrei.spots?.length || 0} spots</Badge>
            <Button variant="ghost" size="sm" onClick={onEdit}>
              <Edit2 className="h-4 w-4" />
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={onDelete}
              className="text-destructive hover:text-destructive"
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </CardHeader>
      {isExpanded && (
        <CardContent>
          <div className="space-y-3">
            <div>
              <p className="text-sm text-muted-foreground">{sunrei.description}</p>
              {sunrei.link && (
                <a href={sunrei.link} target="_blank" rel="noopener noreferrer" 
                   className="text-sm text-primary hover:underline">
                  {sunrei.link}
                </a>
              )}
            </div>
            {sunrei.images && sunrei.images.length > 0 && (
              <>
                <Separator />
                <div className="space-y-2">
                  <p className="text-sm font-medium">Images:</p>
                  <div className="flex gap-2">
                    {sunrei.images.slice(0, 6).map((image, index) => (
                      <div key={image.id || index} className="w-16 h-16 rounded-md overflow-hidden bg-muted flex-shrink-0">
                        <img
                          src={image.url}
                          alt={`Sunrei image ${index + 1}`}
                          className="w-full h-full object-cover"
                        />
                      </div>
                    ))}
                    {sunrei.images.length > 6 && (
                      <div className="w-16 h-16 rounded-md bg-muted flex items-center justify-center flex-shrink-0">
                        <span className="text-xs text-muted-foreground">+{sunrei.images.length - 6}</span>
                      </div>
                    )}
                  </div>
                </div>
              </>
            )}
            {sunrei.spots && sunrei.spots.length > 0 && (
              <>
                <Separator />
                <div className="space-y-2">
                  <p className="text-sm font-medium">Spots:</p>
                  {sunrei.spots.map((spot, index) => (
                    <div key={spot.id} className="pl-4 space-y-1">
                      <p className="text-sm font-medium">{index + 1}. {spot.title}</p>
                      {spot.description && (
                        <p className="text-sm text-muted-foreground pl-4">{spot.description}</p>
                      )}
                      {spot.place && (
                        <div className="pl-4 flex items-center gap-2">
                          <MapPin className="h-3 w-3" />
                          <span className="text-xs text-muted-foreground">
                            {spot.place.name} - {spot.place.address}
                          </span>
                        </div>
                      )}
                      {spot.images && spot.images.length > 0 && (
                        <div className="pl-4 mt-2">
                          <div className="flex gap-1">
                            {spot.images.slice(0, 4).map((image, imgIndex) => (
                              <div key={image.id || imgIndex} className="w-10 h-10 rounded overflow-hidden bg-muted">
                                <img
                                  src={image.url}
                                  alt={`Spot image ${imgIndex + 1}`}
                                  className="w-full h-full object-cover"
                                />
                              </div>
                            ))}
                            {spot.images.length > 4 && (
                              <div className="w-10 h-10 rounded bg-muted flex items-center justify-center">
                                <span className="text-xs text-muted-foreground">+{spot.images.length - 4}</span>
                              </div>
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>
        </CardContent>
      )}
    </Card>
  );
}

