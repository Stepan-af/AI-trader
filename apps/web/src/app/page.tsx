'use client';

import { Header } from '@/components/layout/Header';
import { Button } from '@/components/ui/Button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/Alert';
import { PageLoading } from '@/components/ui/LoadingSpinner';
import { useAuth } from '@/hooks/useAuth';
import { useRouter } from 'next/navigation';
import { useEffect } from 'react';

export default function HomePage() {
  const { auth } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!auth.isLoading && !auth.isAuthenticated) {
      router.push('/login');
    }
  }, [auth.isLoading, auth.isAuthenticated, router]);

  if (auth.isLoading) {
    return <PageLoading text="Loading dashboard..." />;
  }

  if (!auth.isAuthenticated) {
    return null; // Will redirect to login
  }

  return (
    <div className="min-h-screen bg-background">
      <Header />
      <main className="container mx-auto px-4 py-8">
        <div className="max-w-6xl mx-auto space-y-8">
          {/* Welcome Section */}
          <div className="text-center space-y-4">
            <h1 className="text-4xl font-bold text-foreground">Welcome to AI Trader</h1>
            <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
              Your comprehensive platform for automated trading strategies, backtesting, and portfolio management.
            </p>
          </div>

          {/* Status Alert */}
          <Alert variant="success">
            <AlertTitle>System Status</AlertTitle>
            <AlertDescription>
              Authentication system is active. All UI components are loaded and ready for trading features.
            </AlertDescription>
          </Alert>

          {/* Feature Cards */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle className="text-xl">Strategies</CardTitle>
                  <Badge variant="outline">Coming Soon</Badge>
                </div>
                <CardDescription>
                  Create and manage DCA, Grid, and Rule-based trading strategies
                </CardDescription>
              </CardHeader>
              <CardContent>
                <Button variant="outline" className="w-full" disabled>
                  Manage Strategies
                </Button>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle className="text-xl">Backtesting</CardTitle>
                  <Badge variant="outline">Coming Soon</Badge>
                </div>
                <CardDescription>
                  Test strategies on historical data with comprehensive metrics
                </CardDescription>
              </CardHeader>
              <CardContent>
                <Button variant="outline" className="w-full" disabled>
                  Run Backtest
                </Button>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle className="text-xl">Portfolio</CardTitle>
                  <Badge variant="outline">Coming Soon</Badge>
                </div>
                <CardDescription>
                  Monitor positions, PnL, and trading performance in real-time
                </CardDescription>
              </CardHeader>
              <CardContent>
                <Button variant="outline" className="w-full" disabled>
                  View Portfolio
                </Button>
              </CardContent>
            </Card>
          </div>

          {/* Development Status */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg text-green-600">
                ✅ UI Component Library Complete
              </CardTitle>
              <CardDescription>
                All essential components are now available for building trading features
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div className="flex flex-col items-center space-y-2">
                  <Badge variant="success">Auth</Badge>
                  <span className="text-xs text-muted-foreground">Complete</span>
                </div>
                <div className="flex flex-col items-center space-y-2">
                  <Badge variant="success">UI Kit</Badge>
                  <span className="text-xs text-muted-foreground">Complete</span>
                </div>
                <div className="flex flex-col items-center space-y-2">
                  <Badge variant="warning">Features</Badge>
                  <span className="text-xs text-muted-foreground">Next Phase</span>
                </div>
                <div className="flex flex-col items-center space-y-2">
                  <Badge variant="outline">Trading</Badge>
                  <span className="text-xs text-muted-foreground">Upcoming</span>
                </div>
              </div>
              
              <div className="text-sm text-muted-foreground">
                <strong>User:</strong> {auth.user?.email} | <strong>Status:</strong> Authenticated
                <br />
                <strong>Phase:</strong> Foundation Complete - Ready for Feature Development
              </div>
            </CardContent>
          </Card>
        </div>
      </main>
    </div>
  );
}
