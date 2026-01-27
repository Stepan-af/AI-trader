'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/hooks/useAuth';
import { Header } from '@/components/layout/Header';
import { Button } from '@/components/ui/Button';

export default function HomePage() {
  const { auth } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!auth.isLoading && !auth.isAuthenticated) {
      router.push('/login');
    }
  }, [auth.isLoading, auth.isAuthenticated, router]);

  if (auth.isLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center">
          <div className="animate-pulse text-lg">Loading...</div>
        </div>
      </div>
    );
  }

  if (!auth.isAuthenticated) {
    return null; // Will redirect to login
  }

  return (
    <div className="min-h-screen bg-background">
      <Header />
      <main className="container mx-auto px-4 py-8">
        <div className="max-w-4xl mx-auto">
          <header className="text-center mb-12">
            <h1 className="text-4xl font-bold text-foreground mb-4">
              Welcome to AI Trader
            </h1>
            <p className="text-lg text-muted-foreground">
              Automated trading strategies, backtesting, and portfolio management
            </p>
          </header>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            <div className="bg-card p-6 rounded-lg border">
              <h3 className="text-xl font-semibold mb-3">Strategy Management</h3>
              <p className="text-muted-foreground mb-4">
                Create and manage DCA, Grid, and Rule-based trading strategies
              </p>
              <Button variant="outline" className="w-full" disabled>
                Coming Soon
              </Button>
            </div>

            <div className="bg-card p-6 rounded-lg border">
              <h3 className="text-xl font-semibold mb-3">Backtesting</h3>
              <p className="text-muted-foreground mb-4">
                Test strategies on historical data with detailed metrics
              </p>
              <Button variant="outline" className="w-full" disabled>
                Coming Soon
              </Button>
            </div>

            <div className="bg-card p-6 rounded-lg border">
              <h3 className="text-xl font-semibold mb-3">Portfolio</h3>
              <p className="text-muted-foreground mb-4">
                Monitor positions, PnL, and trading performance
              </p>
              <Button variant="outline" className="w-full" disabled>
                Coming Soon
              </Button>
            </div>
          </div>

          <div className="mt-12 text-center">
            <div className="bg-card p-6 rounded-lg border">
              <h3 className="text-lg font-semibold mb-3 text-green-600">
                ✅ Authentication System Active
              </h3>
              <p className="text-sm text-muted-foreground">
                User: {auth.user?.email} | Status: Authenticated
              </p>
              <p className="text-xs text-muted-foreground mt-2">
                MVP Development Phase - Auth and API client implemented
              </p>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
