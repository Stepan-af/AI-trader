'use client';

import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { useAuth } from '@/hooks/useAuth';
import type { LoginCredentials } from '@/types/auth';
import { useState } from 'react';

export function LoginForm() {
  const { login, error, clearError, auth } = useAuth();
  const [credentials, setCredentials] = useState<LoginCredentials>({
    email: '',
    password: '',
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    clearError();

    if (!credentials.email || !credentials.password) {
      return;
    }

    await login(credentials);
  };

  const handleInputChange =
    (field: keyof LoginCredentials) => (e: React.ChangeEvent<HTMLInputElement>) => {
      setCredentials((prev) => ({
        ...prev,
        [field]: e.target.value,
      }));
      if (error) {
        clearError();
      }
    };

  return (
    <div className="max-w-md mx-auto mt-8">
      <div className="bg-card p-8 rounded-lg border">
        <h2 className="text-2xl font-bold text-center mb-6">Login to AI Trader</h2>

        {error && (
          <div className="bg-destructive/15 border border-destructive text-destructive px-4 py-3 rounded mb-4">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label htmlFor="email" className="block text-sm font-medium mb-2">
              Email
            </label>
            <Input
              id="email"
              type="email"
              value={credentials.email}
              onChange={handleInputChange('email')}
              placeholder="Enter your email"
              required
              disabled={auth.isLoading}
            />
          </div>

          <div>
            <label htmlFor="password" className="block text-sm font-medium mb-2">
              Password
            </label>
            <Input
              id="password"
              type="password"
              value={credentials.password}
              onChange={handleInputChange('password')}
              placeholder="Enter your password"
              required
              disabled={auth.isLoading}
            />
          </div>

          <Button
            type="submit"
            className="w-full"
            disabled={auth.isLoading || !credentials.email || !credentials.password}
          >
            {auth.isLoading ? 'Signing in...' : 'Sign In'}
          </Button>
        </form>

        <div className="mt-6 text-center text-sm text-muted-foreground">
          Demo credentials will be provided in development
        </div>
      </div>
    </div>
  );
}
