import { Configuration, PublicAPIApi } from '@/dto';
import { config } from '@/lib/config';

const configuration = new Configuration({
  basePath: config.api.baseUrl,
});

export const apiClient = new PublicAPIApi(configuration);