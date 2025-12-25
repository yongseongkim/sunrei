'use client';

import { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { googleOAuthPopup, TokenResponse } from '@/lib/google-oauth-popup';
import { api } from '@/lib/api';

export interface User {
  id: string;
  email: string;
  name: string | null;
  role: 'user' | 'admin';
}

interface AuthContextType {
  user: User | null;
  isLoading: boolean;
  signIn: () => Promise<void>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    checkAuthStatus();
    return () => {};
  }, []);

  const checkAuthStatus = async () => {
    try {
      const storedUser = sessionStorage.getItem('user');
      const token = getAccessToken();

      if (storedUser && token) {
        const parsedUser = JSON.parse(storedUser);
        setUser(parsedUser);
        setAccessToken(token);
      }
    } catch (error) {
      console.error('Auth status check failed:', error);
      clearSession();
    } finally {
      setIsLoading(false);
    }
  };

  const clearSession = () => {
    setUser(null);
    setAccessToken(null);
    sessionStorage.removeItem('access_token');
    sessionStorage.removeItem('user');
  };

  const signIn = async () => {
    try {
      // Get Google token
      const tokenResponse: TokenResponse = await googleOAuthPopup.signIn();

      if (!tokenResponse.access_token) {
        throw new Error('No access token received');
      }

      // Call backend to authenticate and get user data + JWT
      const response = await api.post('/api/auth/google', {
        idToken: tokenResponse.access_token
      });

      const { token, user: backendUser } = response.data;

      setAccessToken(token);
      setUser(backendUser);
      sessionStorage.setItem('access_token', token);
      sessionStorage.setItem('user', JSON.stringify(backendUser));

    } catch (error) {
      console.error('Sign in error:', error);
      clearSession();
      throw error;
    }
  };

  const signOut = async () => {
    try {
      await googleOAuthPopup.signOut();
    } catch (error) {
      console.error('Sign out error:', error);
    } finally {
      clearSession();
    }
  };

  return (
    <AuthContext.Provider value={{
      user,
      isLoading,
      signIn,
      signOut
    }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within AuthProvider');
  }
  return context;
};

function getAccessToken(): string | null {
  if (typeof window === 'undefined') return null;
  return sessionStorage.getItem('access_token');
}
