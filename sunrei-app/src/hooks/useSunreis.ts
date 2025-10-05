import { useQuery } from '@tanstack/react-query';
import { apiClient } from '@/lib/api-client';
import { SunreiDTO } from '@/dto';

export function useSunreis(polygon?: string) {
  return useQuery({
    queryKey: ['sunreis', polygon],
    queryFn: async () => {
      const response = await apiClient.listSunreis(polygon);
      return response.data.sunreis || [];
    },
    enabled: true,
  });
}
