'use client';

import React from 'react';
import { Badge } from '@/components/ui/Badge';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/Card';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/Table';
import type { OrderResponse, FillResponse } from '@/types/order';

interface OrderDetailsProps {
  order: OrderResponse;
  fills: FillResponse[];
}

export function OrderDetails({ order, fills }: OrderDetailsProps) {
  const formatCurrency = (value: number | null) => {
    if (value === null) return '-';
    return `$${value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  };

  const formatQuantity = (value: number) => {
    return value.toLocaleString(undefined, { minimumFractionDigits: 4, maximumFractionDigits: 8 });
  };

  const formatTimestamp = (isoString: string) => {
    return new Date(isoString).toLocaleString();
  };

  const getStatusVariant = (status: string) => {
    switch (status) {
      case 'FILLED':
        return 'success';
      case 'OPEN':
      case 'PARTIALLY_FILLED':
      case 'SUBMITTED':
        return 'warning';
      case 'CANCELED':
      case 'REJECTED':
      case 'EXPIRED':
        return 'secondary';
      default:
        return 'default';
    }
  };

  const getSideVariant = (side: string) => {
    return side === 'BUY' ? 'success' : 'destructive';
  };

  return (
    <div className="space-y-6">
      {/* Order Information */}
      <Card>
        <CardHeader>
          <CardTitle>Order Information</CardTitle>
        </CardHeader>
        <CardContent>
          <dl className="grid grid-cols-2 gap-4">
            <div>
              <dt className="text-sm font-medium text-gray-500">Symbol</dt>
              <dd className="mt-1 text-lg font-semibold">{order.symbol}</dd>
            </div>
            <div>
              <dt className="text-sm font-medium text-gray-500">Status</dt>
              <dd className="mt-1">
                <Badge variant={getStatusVariant(order.status)}>{order.status}</Badge>
              </dd>
            </div>
            <div>
              <dt className="text-sm font-medium text-gray-500">Side</dt>
              <dd className="mt-1">
                <Badge variant={getSideVariant(order.side)}>{order.side}</Badge>
              </dd>
            </div>
            <div>
              <dt className="text-sm font-medium text-gray-500">Type</dt>
              <dd className="mt-1">
                <Badge variant="outline">{order.type}</Badge>
              </dd>
            </div>
            <div>
              <dt className="text-sm font-medium text-gray-500">Quantity</dt>
              <dd className="mt-1 text-lg font-mono">{formatQuantity(order.quantity)}</dd>
            </div>
            <div>
              <dt className="text-sm font-medium text-gray-500">Price</dt>
              <dd className="mt-1 text-lg font-mono">{formatCurrency(order.price)}</dd>
            </div>
            <div>
              <dt className="text-sm font-medium text-gray-500">Filled Quantity</dt>
              <dd className="mt-1 text-lg font-mono">{formatQuantity(order.filledQuantity)}</dd>
            </div>
            <div>
              <dt className="text-sm font-medium text-gray-500">Avg Fill Price</dt>
              <dd className="mt-1 text-lg font-mono">{formatCurrency(order.avgFillPrice)}</dd>
            </div>
            <div>
              <dt className="text-sm font-medium text-gray-500">Created At</dt>
              <dd className="mt-1 text-sm">{formatTimestamp(order.createdAt)}</dd>
            </div>
            <div>
              <dt className="text-sm font-medium text-gray-500">Updated At</dt>
              <dd className="mt-1 text-sm">{formatTimestamp(order.updatedAt)}</dd>
            </div>
          </dl>
        </CardContent>
      </Card>

      {/* Fill History */}
      <Card>
        <CardHeader>
          <CardTitle>Fill History ({fills.length})</CardTitle>
        </CardHeader>
        <CardContent>
          {fills.length === 0 ? (
            <div className="text-center py-8 text-gray-500">No fills yet</div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Timestamp</TableHead>
                  <TableHead className="text-right">Price</TableHead>
                  <TableHead className="text-right">Quantity</TableHead>
                  <TableHead className="text-right">Fee</TableHead>
                  <TableHead>Source</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {fills.map((fill) => (
                  <TableRow key={fill.id}>
                    <TableCell>{formatTimestamp(fill.timestamp)}</TableCell>
                    <TableCell className="text-right font-mono">{formatCurrency(fill.price)}</TableCell>
                    <TableCell className="text-right font-mono">
                      {formatQuantity(fill.quantity)}
                    </TableCell>
                    <TableCell className="text-right font-mono">
                      {fill.fee.toFixed(6)} {fill.feeAsset}
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline">{fill.source}</Badge>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
