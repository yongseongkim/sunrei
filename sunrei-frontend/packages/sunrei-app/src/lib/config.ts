export const config = {
  api: {
    baseUrl: process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3030',
  },
  googleMaps: {
    apiKey: process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY || '',
  },
  googleAuth: {
    clientId: process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID || '',
  },
} as const;

if (typeof window !== 'undefined' && !config.googleMaps.apiKey) {
  console.warn('Google Maps API key is not configured. Map features will not work.');
}