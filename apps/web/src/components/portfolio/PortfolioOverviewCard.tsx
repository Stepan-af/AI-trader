'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import type { PortfolioOverview } from '@/types/portfolio';
import { AlertTriangle } from 'lucide-react';

interface PortfolioOverviewCardProps {
  overview: PortfolioOverview;
}

export function PortfolioOverviewCard({ overview }: PortfolioOverviewCardProps) {
  const formatCurrency = (value: number) => {
    return `$${value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  };

  const formatTimestamp = (isoString: string) => {
    const date = new Date(isoString);
    return date.toLocaleString();
  };

  const getDataAge = (isoString: string) => {
    const dataTime = new Date(isoString).getTime();
    const now = Date.now();
    const ageSeconds = Math.floor((now - dataTime) / 1000);

    if (ageSeconds < 60) return `${ageSeconds}s ago`;
    if (ageSeconds < 3600) return `${Math.floor(ageSeconds / 60)}m ago`;
    return `${Math.floor(ageSeconds / 3600)}h ago`;
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex justify-between items-center">
          <CardTitle>Portfolio Overview</CardTitle>
          <div className="text-sm text-gray-500">
            <div>Last updated: {getDataAge(overview.data_as_of_timestamp)}</div>
            <div className="text-xs">{formatTimestamp(overview.data_as_of_timestamp)}</div>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {overview.is_stale && (
          <div className="mb-4 p-3 bg-yellow-50 border border-yellow-200 rounded flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-yellow-600" />
            <span className="text-sm text-yellow-800">
              Portfolio data is stale (older than 5 seconds). Refresh to get latest data.
            </span>
          </div>
        )}

        <dl className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div>
            <dt className="text-sm font-medium text-gray-500">Balance</dt>
            <dd className="mt-1 text-2xl font-bold">{formatCurrency(overview.balance)}</dd>
            <p className="text-xs text-gray-500 mt-1">Available cash</p>
          </div>

          <div>
            <dt className="text-sm font-medium text-gray-500">Equity</dt>
            <dd className="mt-1 text-2xl font-bold">{formatCurrency(overview.equity)}</dd>
            <p className="text-xs text-gray-500 mt-1">Total account value</p>
          </div>

          <div>
            <dt className="text-sm font-medium text-gray-500">Unrealized P&L</dt>
            <dd
              className={`mt-1 text-2xl font-bold ${
                overview.unrealized_pnl >= 0 ? 'text-green-600' : 'text-red-600'
              }`}
            >
              {formatCurrency(overview.unrealized_pnl)}
            </dd>
            <p className="text-xs text-gray-500 mt-1">
              {overview.unrealized_pnl >= 0 ? 'Profit' : 'Loss'} from open positions
            </p>
          </div>
        </dl>
      </CardContent>
    </Card>
  );
}
