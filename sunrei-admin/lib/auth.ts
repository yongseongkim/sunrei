import { LoginRequest } from '@/api/admin';
import axios from 'axios';
import Cookies from 'js-cookie';

const TOKEN_COOKIE = 'adminToken';
const COOKIE_EXPIRES = 7; // 7 days

export const auth = {
  async login(credentials: LoginRequest): Promise<void> {
    const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3030';

    // Use axios directly to access response headers
    const response = await axios.post(
      `${API_BASE}/admin/auth/login`,
      credentials,
    );

    // Get token from Authorization header
    const authHeader = response.headers['authorization'] || response.headers['Authorization'];

    if (authHeader && authHeader.startsWith('Bearer ')) {
      const token = authHeader.substring(7); // Remove 'Bearer ' prefix

      // Set cookie with 7 day expiration
      Cookies.set(TOKEN_COOKIE, token, {
        expires: COOKIE_EXPIRES,
        sameSite: 'Lax',
        path: '/',
      });
    } else {
      throw new Error('No authorization token in response');
    }
  },

  logout(): void {
    Cookies.remove(TOKEN_COOKIE, { path: '/' });
    window.location.href = '/login';
  },

  getToken(): string | null {
    if (typeof window !== 'undefined') {
      return Cookies.get(TOKEN_COOKIE) || null;
    }
    return null;
  },

  isAuthenticated(): boolean {
    return !!this.getToken();
  },
};