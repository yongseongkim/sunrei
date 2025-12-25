import { useQuery } from '@tanstack/react-query';
import { apiClient } from '@/lib/api-client';
import { MapSunreiSpotDTO } from '@/dto';

export function useMapSpots(polygon?: string) {
  return useQuery({
    queryKey: ['mapSpots', polygon],
    queryFn: async () => {
      const response = await apiClient.getMapData(polygon);
      return response.data.spots || [];
    },
    enabled: true,
  });
}
