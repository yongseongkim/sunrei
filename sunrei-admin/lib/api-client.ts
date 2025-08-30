import { AdminAPIApi, Configuration, PublicAPIApi } from '@/api';
import axios from 'axios';

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3030';

// Public API client (read-only)
const publicConfig = new Configuration({
  basePath: API_BASE,
});

export const publicApi = new PublicAPIApi(publicConfig);

// Admin API client (with auth)
const adminConfig = new Configuration({
  basePath: API_BASE,
  accessToken: () => {
    if (typeof window !== 'undefined') {
      return localStorage.getItem('adminToken') || '';
    }
    return '';
  },
});

export const adminApi = new AdminAPIApi(adminConfig);

// Axios instance for custom requests
export const axiosInstance = axios.create({
  baseURL: API_BASE,
});

// Add auth token to requests
axiosInstance.interceptors.request.use(
  (config) => {
    if (typeof window !== 'undefined') {
      const token = localStorage.getItem('adminToken');
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
      localStorage.removeItem('adminToken');
      window.location.href = '/login';
    }
    return Promise.reject(error);
  }
);