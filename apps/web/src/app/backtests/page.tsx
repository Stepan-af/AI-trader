'use client';

import { BacktestForm } from '@/components/backtests/BacktestForm';
import { BacktestResults } from '@/components/backtests/BacktestResults';
import { Alert } from '@/components/ui/Alert';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { PageLoading } from '@/components/ui/LoadingSpinner';
import { Modal } from '@/components/ui/Modal';
import { useAuth } from '@/hooks/useAuth';
import { backtestApi } from '@/lib/api/backtests';
import { strategyApi } from '@/lib/api/strategies';
import type { BacktestFormData, BacktestResponse } from '@/types/backtest';
import type { Strategy } from '@/types/strategy';
import { Plus, RefreshCw } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';

export default function BacktestsPage() {
  const { auth } = useAuth();
  const router = useRouter();

  const [strategies, setStrategies] = useState<Strategy[]>([]);
  const [backtests, setBacktests] = useState<BacktestResponse[]>([]);
  const [selectedBacktest, setSelectedBacktest] = useState<BacktestResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingBacktest, setIsLoadingBacktest] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // Modal states
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [isResultsModalOpen, setIsResultsModalOpen] = useState(false);

  useEffect(() => {
    if (!auth.isLoading && !auth.isAuthenticated) {
      router.push('/login');
    }
  }, [auth.isAuthenticated, auth.isLoading, router]);

  useEffect(() => {
    if (auth.isAuthenticated) {
      void loadStrategies();
    }
  }, [auth.isAuthenticated]);

  const loadStrategies = async () => {
    try {
      setIsLoading(true);
      setError(null);
      const data = await strategyApi.list();
      setStrategies(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load strategies');
    } finally {
      setIsLoading(false);
    }
  };

  const handleCreateBacktest = async (formData: BacktestFormData) => {
    // Convert date strings to ISO 8601 datetime format
    const fromDateTime = new Date(formData.fromDate);
    fromDateTime.setHours(0, 0, 0, 0);

    const toDateTime = new Date(formData.toDate);
    toDateTime.setHours(23, 59, 59, 999);

    const payload = {
      strategyId: formData.strategyId,
      from: fromDateTime.toISOString(),
      to: toDateTime.toISOString(),
      initialBalance: parseFloat(formData.initialBalance),
    };

    const result = await backtestApi.create(payload);
    setBacktests((prev) => [result, ...prev]);
    setIsCreateModalOpen(false);
    setSuccessMessage('Backtest started successfully');
    setTimeout(() => setSuccessMessage(null), 3000);

    // Show results immediately
    setSelectedBacktest(result);
    setIsResultsModalOpen(true);
  };

  const handleViewBacktest = async (backtestId: string) => {
    try {
      setIsLoadingBacktest(true);
      setError(null);
      const result = await backtestApi.getById(backtestId);
      setSelectedBacktest(result);
      setIsResultsModalOpen(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load backtest');
    } finally {
      setIsLoadingBacktest(false);
    }
  };

  const handleRefreshBacktest = async () => {
    if (!selectedBacktest) return;

    try {
      setIsLoadingBacktest(true);
      const result = await backtestApi.getById(selectedBacktest.id);
      setSelectedBacktest(result);

      // Update in list if exists
      setBacktests((prev) => prev.map((bt) => (bt.id === result.id ? result : bt)));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to refresh backtest');
    } finally {
      setIsLoadingBacktest(false);
    }
  };

  if (auth.isLoading || !auth.isAuthenticated) {
    return <PageLoading />;
  }

  return (
    <div className="container mx-auto py-8 px-4">
      <div className="mb-6">
        <div className="flex justify-between items-center mb-4">
          <h1 className="text-3xl font-bold">Backtests</h1>
          <Button onClick={() => setIsCreateModalOpen(true)} disabled={strategies.length === 0}>
            <Plus className="h-4 w-4 mr-2" />
            Start Backtest
          </Button>
        </div>

        {successMessage && <Alert variant="success">{successMessage}</Alert>}
        {error && <Alert variant="destructive">{error}</Alert>}
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Your Backtests</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex justify-center py-12">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
            </div>
          ) : strategies.length === 0 ? (
            <div className="text-center py-12">
              <p className="text-gray-500 mb-4">
                No strategies available. Create a strategy first to run backtests.
              </p>
              <Button onClick={() => router.push('/strategies')}>Go to Strategies</Button>
            </div>
          ) : backtests.length === 0 ? (
            <div className="text-center py-12">
              <p className="text-gray-500 mb-4">No backtests yet</p>
              <Button onClick={() => setIsCreateModalOpen(true)}>
                <Plus className="h-4 w-4 mr-2" />
                Start Your First Backtest
              </Button>
            </div>
          ) : (
            <div className="space-y-4">
              {backtests.map((backtest) => (
                <div
                  key={backtest.id}
                  className="border rounded-lg p-4 hover:bg-gray-50 cursor-pointer"
                  onClick={() => void handleViewBacktest(backtest.id)}
                >
                  <div className="flex justify-between items-center">
                    <div>
                      <p className="font-medium">
                        Backtest {new Date(backtest.createdAt).toLocaleString()}
                      </p>
                      <p className="text-sm text-gray-500">
                        Initial Balance: ${backtest.initialBalance.toLocaleString()}
                      </p>
                    </div>
                    <div className="text-right">
                      <Badge
                        variant={
                          backtest.status === 'COMPLETED'
                            ? 'success'
                            : backtest.status === 'FAILED'
                              ? 'destructive'
                              : 'warning'
                        }
                      >
                        {backtest.status}
                      </Badge>
                      {backtest.status === 'COMPLETED' && backtest.metrics && (
                        <p className="text-sm mt-1">
                          Return:{' '}
                          <span
                            className={
                              backtest.metrics.totalReturn >= 0 ? 'text-green-600' : 'text-red-600'
                            }
                          >
                            {(backtest.metrics.totalReturn * 100).toFixed(2)}%
                          </span>
                        </p>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Create Backtest Modal */}
      <Modal
        isOpen={isCreateModalOpen}
        onClose={() => setIsCreateModalOpen(false)}
        title="Start New Backtest"
        size="lg"
      >
        <BacktestForm
          strategies={strategies}
          onSubmit={handleCreateBacktest}
          onCancel={() => setIsCreateModalOpen(false)}
        />
      </Modal>

      {/* Results Modal */}
      <Modal
        isOpen={isResultsModalOpen}
        onClose={() => {
          setIsResultsModalOpen(false);
          setSelectedBacktest(null);
        }}
        title="Backtest Results"
        size="lg"
      >
        {selectedBacktest && (
          <div className="space-y-4">
            <BacktestResults backtest={selectedBacktest} />

            {/* Refresh button for running/pending backtests */}
            {(selectedBacktest.status === 'RUNNING' || selectedBacktest.status === 'PENDING') && (
              <div className="flex justify-center">
                <Button onClick={handleRefreshBacktest} disabled={isLoadingBacktest}>
                  <RefreshCw
                    className={`h-4 w-4 mr-2 ${isLoadingBacktest ? 'animate-spin' : ''}`}
                  />
                  {isLoadingBacktest ? 'Refreshing...' : 'Refresh Status'}
                </Button>
              </div>
            )}
          </div>
        )}
      </Modal>
    </div>
  );
}
