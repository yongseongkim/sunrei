import { LoginRequest, LoginResponse } from '@/api';
import { adminApi } from './api-client';

export interface AuthUser {
  id: string;
  username: string;
  role: string;
}

export const auth = {
  async login(credentials: LoginRequest): Promise<LoginResponse> {
    const response = await adminApi.adminLogin(credentials);
    const data = response.data;
    
    if (data.token) {
      localStorage.setItem('adminToken', data.token);
      localStorage.setItem('adminUser', JSON.stringify(data.user));
    }
    
    return data;
  },

  logout(): void {
    localStorage.removeItem('adminToken');
    localStorage.removeItem('adminUser');
    window.location.href = '/login';
  },

  getToken(): string | null {
    if (typeof window !== 'undefined') {
      return localStorage.getItem('adminToken');
    }
    return null;
  },

  getUser(): AuthUser | null {
    if (typeof window !== 'undefined') {
      const userStr = localStorage.getItem('adminUser');
      if (userStr) {
        try {
          return JSON.parse(userStr);
        } catch {
          return null;
        }
      }
    }
    return null;
  },

  isAuthenticated(): boolean {
    return !!this.getToken();
  },
};