import { Configuration, DefaultApi } from '@/dto';

const configuration = new Configuration({
  basePath: process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3030',
});

export const apiClient = new DefaultApi(configuration);