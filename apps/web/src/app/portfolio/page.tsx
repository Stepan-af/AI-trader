'use client';

import React, { useState, useEffect } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { useRouter } from 'next/navigation';
import { RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Alert } from '@/components/ui/Alert';
import { PageLoading } from '@/components/ui/LoadingSpinner';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/Card';
import { PortfolioOverviewCard } from '@/components/portfolio/PortfolioOverviewCard';
import { PositionsTable } from '@/components/portfolio/PositionsTable';
import { portfolioApi } from '@/lib/api/portfolio';
import type { PortfolioOverview, Position } from '@/types/portfolio';

export default function PortfolioPage() {
  const { auth } = useAuth();
  const router = useRouter();

  const [overview, setOverview] = useState<PortfolioOverview | null>(null);
  const [positions, setPositions] = useState<Position[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

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

  const loadPortfolioData = async () => {
    try {
      setIsLoading(true);
      setError(null);

      // Load overview and positions in parallel
      const [overviewData, positionsData] = await Promise.all([
        portfolioApi.getOverview(),
        portfolioApi.getPositions(),
      ]);

      setOverview(overviewData);
      setPositions(positionsData.positions);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load portfolio data');
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
      setError(err instanceof Error ? err.message : 'Failed to refresh portfolio data');
    } finally {
      setIsRefreshing(false);
    }
  };

  if (auth.isLoading || !auth.isAuthenticated) {
    return <PageLoading />;
  }

  if (isLoading) {
    return <PageLoading />;
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

        {error && <Alert variant="destructive">{error}</Alert>}
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
            <PositionsTable positions={positions} />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
