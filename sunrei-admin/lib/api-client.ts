import { Configuration, DefaultApi } from '@/api/admin';
import axios from 'axios';
import Cookies from 'js-cookie';

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3030';
const TOKEN_COOKIE = 'adminToken';

// Admin API client (with auth)
const adminConfig = new Configuration({
  basePath: API_BASE,
  accessToken: () => {
    if (typeof window !== 'undefined') {
      return Cookies.get(TOKEN_COOKIE) || '';
    }
    return '';
  },
});

export const adminApi = new DefaultApi(adminConfig);

// Axios instance for custom requests
export const axiosInstance = axios.create({
  baseURL: API_BASE,
});

// Add auth token to requests
axiosInstance.interceptors.request.use(
  (config) => {
    if (typeof window !== 'undefined') {
      const token = Cookies.get(TOKEN_COOKIE);
      if (token) {
        config.headers.Authorization = `Bearer ${token}`;
      }
    }
    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

// Handle auth errors
axiosInstance.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401 && typeof window !== 'undefined') {
      // Remove auth cookie
      Cookies.remove(TOKEN_COOKIE, { path: '/' });
      window.location.href = '/login';
    }
    return Promise.reject(error);
  }
);