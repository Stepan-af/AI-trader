'use client';

import { PortfolioOverviewCard } from '@/components/portfolio/PortfolioOverviewCard';
import { PositionsTable } from '@/components/portfolio/PositionsTable';
import { Alert } from '@/components/ui/Alert';
import { Button } from '@/components/ui/Button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { EmptyState } from '@/components/ui/EmptyState';
import { PageLoading } from '@/components/ui/LoadingSpinner';
import { OverviewCardSkeleton, TableSkeleton } from '@/components/ui/Skeleton';
import { useAuth } from '@/hooks/useAuth';
import { useWebSocket } from '@/hooks/useWebSocket';
import { portfolioApi } from '@/lib/api/portfolio';
import { retryWithBackoff } from '@/lib/retry';
import type { WebSocketEvent } from '@/lib/websocket';
import type { PortfolioOverview, Position } from '@/types/portfolio';
import { TrendingUp, RefreshCw, AlertCircle } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';

export default function PortfolioPage() {
  const { auth } = useAuth();
  const { subscribe } = useWebSocket();
  const router = useRouter();

  const [overview, setOverview] = useState<PortfolioOverview | null>(null);
  const [positions, setPositions] = useState<Position[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [retryCount, setRetryCount] = useState(0);

  useEffect(() => {
    if (!auth.isLoading && !auth.isAuthenticated) {
      router.push('/login');
    }
  }, [auth.isAuthenticated, auth.isLoading, router]);

  useEffect(() => {
    if (auth.isAuthenticated) {
      void loadPortfolioData();
    }
  }, [auth.isAuthenticated]);

  // Subscribe to WebSocket events for real-time portfolio updates
  useEffect(() => {
    const handleWebSocketEvent = (event: WebSocketEvent) => {
      if (event.type === 'PORTFOLIO_UPDATED') {
        // Update overview with real-time data
        setOverview((prev) => {
          if (!prev) return prev;
          return {
            ...prev,
            balance: event.balance,
            unrealizedPnl: event.unrealized_pnl,
            dataAsOfTimestamp: event.data_as_of_timestamp,
            isStale: event.is_stale,
          };
        });
      }
    };

    const unsubscribe = subscribe(handleWebSocketEvent);
    return unsubscribe;
  }, [subscribe]);

  const loadPortfolioData = async () => {
    try {
      setIsLoading(true);
      setError(null);

      // Load with retry logic
      const [overviewData, positionsData] = await retryWithBackoff(
        async () => {
          return await Promise.all([portfolioApi.getOverview(), portfolioApi.getPositions()]);
        },
        {
          maxAttempts: 3,
          onRetry: (attempt) => {
            console.log(`Retrying portfolio data load (attempt ${attempt})`);
            setRetryCount(attempt);
          },
        }
      );

      setOverview(overviewData);
      setPositions(positionsData.positions);
      setRetryCount(0);
    } catch (err) {
      const errorMessage =
        err instanceof Error
          ? err.message
          : 'Unable to load portfolio data. Please check your connection and try again.';
      setError(errorMessage);
    } finally {
      setIsLoading(false);
    }
  };

  const handleRefresh = async () => {
    try {
      setIsRefreshing(true);
      setError(null);

      const [overviewData, positionsData] = await Promise.all([
        portfolioApi.getOverview(),
        portfolioApi.getPositions(),
      ]);

      setOverview(overviewData);
      setPositions(positionsData.positions);
    } catch (err) {
      const errorMessage =
        err instanceof Error
          ? err.message
          : 'Unable to refresh portfolio data. Please try again.';
      setError(errorMessage);
    } finally {
      setIsRefreshing(false);
    }
  };

  if (auth.isLoading || !auth.isAuthenticated) {
    return <PageLoading />;
  }

  if (isLoading) {
    return (
      <div className="container mx-auto py-8 px-4">
        <div className="mb-6">
          <h1 className="text-3xl font-bold mb-4">Portfolio</h1>
          {retryCount > 0 && (
            <Alert variant="default">
              <AlertCircle className="h-4 w-4" />
              Retrying connection (attempt {retryCount})...
            </Alert>
          )}
        </div>

        <div className="space-y-6">
          <Card>
            <CardContent className="pt-6">
              <OverviewCardSkeleton />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Open Positions</CardTitle>
            </CardHeader>
            <CardContent>
              <TableSkeleton rows={3} />
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  return (
    <div className="container mx-auto py-8 px-4">
      <div className="mb-6">
        <div className="flex justify-between items-center mb-4">
          <h1 className="text-3xl font-bold">Portfolio</h1>
          <Button onClick={handleRefresh} disabled={isRefreshing}>
            <RefreshCw className={`h-4 w-4 mr-2 ${isRefreshing ? 'animate-spin' : ''}`} />
            {isRefreshing ? 'Refreshing...' : 'Refresh'}
          </Button>
        </div>

        {error && (
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <div className="flex-1">{error}</div>
            <Button variant="outline" size="sm" onClick={() => void loadPortfolioData()}>
              Retry
            </Button>
          </Alert>
        )}
      </div>

      <div className="space-y-6">
        {/* Portfolio Overview */}
        {overview && <PortfolioOverviewCard overview={overview} />}

        {/* Positions Table */}
        <Card>
          <CardHeader>
            <CardTitle>Open Positions</CardTitle>
          </CardHeader>
          <CardContent>
            {positions.length > 0 ? (
              <PositionsTable positions={positions} />
            ) : (
              <EmptyState
                icon={TrendingUp}
                title="No open positions"
                description="You don't have any open positions yet. Start a strategy to begin trading."
              />
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
