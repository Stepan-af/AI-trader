'use client';

import React, { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { authApi, TokenManager } from '@/lib/api';
import type { User, AuthState, LoginCredentials } from '@/types/auth';

// Local API error type
interface ApiErrorResponse {
  error: string;
  message: string;
}

// Auth Context
interface AuthContextType {
  auth: AuthState;
  login: (credentials: LoginCredentials) => Promise<void>;
  logout: () => void;
  error: string | null;
  clearError: () => void;
}

const AuthContext = createContext<AuthContextType | null>(null);

// Auth Provider
interface AuthProviderProps {
  children: ReactNode;
}

export function AuthProvider({ children }: AuthProviderProps) {
  const [auth, setAuth] = useState<AuthState>({
    user: null,
    accessToken: null,
    isAuthenticated: false,
    isLoading: true,
  });
  const [error, setError] = useState<string | null>(null);

  // Initialize auth state on mount
  useEffect(() => {
    const token = TokenManager.getAccessToken();
    if (token && !TokenManager.isTokenExpired()) {
      // TODO: In a real app, decode JWT to get user info
      // For MVP, we'll use placeholder values
      setAuth({
        user: { userId: 'current-user', email: 'user@example.com' },
        accessToken: token,
        isAuthenticated: true,
        isLoading: false,
      });
    } else {
      setAuth({
        user: null,
        accessToken: null,
        isAuthenticated: false,
        isLoading: false,
      });
    }
  }, []);

  const login = async (credentials: LoginCredentials): Promise<void> => {
    try {
      setError(null);
      setAuth(prev => ({ ...prev, isLoading: true }));

      const response = await authApi.login(credentials);

      // Store tokens
      TokenManager.setTokens(response.accessToken, response.refreshToken, response.expiresIn);

      // TODO: In a real app, decode JWT to get user info
      // For MVP, we'll use placeholder values
      const user: User = {
        userId: 'current-user',
        email: credentials.email,
      };

      setAuth({
        user,
        accessToken: response.accessToken,
        isAuthenticated: true,
        isLoading: false,
      });
    } catch (err) {
      const apiError = err as { response?: { data?: ApiErrorResponse } };
      const errorMessage = apiError.response?.data?.message || 'Login failed';
      setError(errorMessage);
      setAuth({
        user: null,
        accessToken: null,
        isAuthenticated: false,
        isLoading: false,
      });
    }
  };

  const logout = (): void => {
    TokenManager.clearTokens();
    setAuth({
      user: null,
      accessToken: null,
      isAuthenticated: false,
      isLoading: false,
    });
    setError(null);
  };

  const clearError = (): void => {
    setError(null);
  };

  const value: AuthContextType = {
    auth,
    login,
    logout,
    error,
    clearError,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

// Auth Hook
export function useAuth(): AuthContextType {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
