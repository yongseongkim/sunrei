import axios from 'axios';
import Cookies from 'js-cookie';

const TOKEN_COOKIE = 'adminToken';
const COOKIE_EXPIRES = 7; // 7 days

export interface User {
  id: string;
  email: string;
  name: string | null;
  role: 'user' | 'admin';
}

export const auth = {
  async loginWithGoogle(idToken: string): Promise<User> {
    const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3030';

    const response = await axios.post(`${API_BASE}/api/auth/google`, {
      idToken,
    });

    const user: User = response.data.user;

    // Check if user is admin before storing token
    if (user.role !== 'admin') {
      // Redirect to forbidden page immediately
      if (typeof window !== 'undefined') {
        window.location.href = '/forbidden';
      }
      throw new Error('Access denied. Admin only.');
    }

    // Set token from response only for admin users
    const token = response.data.token;

    Cookies.set(TOKEN_COOKIE, token, {
      expires: COOKIE_EXPIRES,
      sameSite: 'Lax',
      path: '/',
    });

    return user;
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
