'use client';

import { Badge } from '@/components/ui/Badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import type { BacktestResponse } from '@/types/backtest';

interface BacktestResultsProps {
  backtest: BacktestResponse;
}

export function BacktestResults({ backtest }: BacktestResultsProps) {
  const getStatusVariant = (status: string) => {
    switch (status) {
      case 'COMPLETED':
        return 'success';
      case 'RUNNING':
        return 'warning';
      case 'PENDING':
        return 'default';
      case 'FAILED':
        return 'destructive';
      default:
        return 'secondary';
    }
  };

  const formatPercent = (value: number) => {
    return `${(value * 100).toFixed(2)}%`;
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString();
  };

  return (
    <div className="space-y-6">
      {/* Status Header */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold">Backtest Status</h3>
          <p className="text-sm text-gray-500">
            {formatDate(backtest.from)} - {formatDate(backtest.to)}
          </p>
        </div>
        <Badge variant={getStatusVariant(backtest.status)} className="text-base px-4 py-2">
          {backtest.status}
        </Badge>
      </div>

      {/* Configuration */}
      <Card>
        <CardHeader>
          <CardTitle>Configuration</CardTitle>
        </CardHeader>
        <CardContent>
          <dl className="grid grid-cols-2 gap-4">
            <div>
              <dt className="text-sm font-medium text-gray-500">Initial Balance</dt>
              <dd className="mt-1 text-lg font-semibold">
                ${backtest.initialBalance.toLocaleString()}
              </dd>
            </div>
            <div>
              <dt className="text-sm font-medium text-gray-500">Date Range</dt>
              <dd className="mt-1 text-lg">
                {formatDate(backtest.from)} - {formatDate(backtest.to)}
              </dd>
            </div>
          </dl>
        </CardContent>
      </Card>

      {/* Metrics - Only show when COMPLETED */}
      {backtest.status === 'COMPLETED' && backtest.metrics && (
        <Card>
          <CardHeader>
            <CardTitle>Performance Metrics</CardTitle>
          </CardHeader>
          <CardContent>
            <dl className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <div>
                <dt className="text-sm font-medium text-gray-500">Total Return</dt>
                <dd
                  className={`mt-1 text-2xl font-bold ${
                    backtest.metrics.totalReturn >= 0 ? 'text-green-600' : 'text-red-600'
                  }`}
                >
                  {formatPercent(backtest.metrics.totalReturn)}
                </dd>
              </div>
              <div>
                <dt className="text-sm font-medium text-gray-500">Max Drawdown</dt>
                <dd className="mt-1 text-2xl font-bold text-red-600">
                  {formatPercent(backtest.metrics.maxDrawdown)}
                </dd>
              </div>
              <div>
                <dt className="text-sm font-medium text-gray-500">Sharpe Ratio</dt>
                <dd className="mt-1 text-2xl font-bold">{backtest.metrics.sharpe.toFixed(2)}</dd>
              </div>
            </dl>
          </CardContent>
        </Card>
      )}

      {/* Loading state */}
      {(backtest.status === 'RUNNING' || backtest.status === 'PENDING') && (
        <Card>
          <CardContent className="text-center py-12">
            <div className="flex flex-col items-center gap-4">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
              <p className="text-gray-600">
                {backtest.status === 'PENDING'
                  ? 'Backtest is queued and will start soon...'
                  : 'Backtest is running...'}
              </p>
              <p className="text-sm text-gray-500">This may take a few minutes</p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Error state */}
      {backtest.status === 'FAILED' && (
        <Card>
          <CardContent className="text-center py-12">
            <p className="text-red-600">Backtest failed. Please try again or contact support.</p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
