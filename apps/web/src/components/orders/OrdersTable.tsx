'use client';

import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/Table';
import type { OrderResponse } from '@/types/order';
import { X } from 'lucide-react';

interface OrdersTableProps {
  orders: OrderResponse[];
  onCancel: (order: OrderResponse) => void;
  onViewDetails: (order: OrderResponse) => void;
}

export function OrdersTable({ orders, onCancel, onViewDetails }: OrdersTableProps) {
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
      case 'NEW':
        return 'default';
      default:
        return 'default';
    }
  };

  const getSideVariant = (side: string) => {
    return side === 'BUY' ? 'success' : 'destructive';
  };

  const formatCurrency = (value: number | null) => {
    if (value === null) return '-';
    return `$${value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  };

  const formatQuantity = (value: number) => {
    return value.toLocaleString(undefined, { minimumFractionDigits: 4, maximumFractionDigits: 8 });
  };

  const canCancelOrder = (status: string) => {
    return (
      status === 'NEW' ||
      status === 'SUBMITTED' ||
      status === 'OPEN' ||
      status === 'PARTIALLY_FILLED'
    );
  };

  if (orders.length === 0) {
    return (
      <div className="text-center py-12 text-gray-500">
        <p>No orders yet</p>
      </div>
    );
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Symbol</TableHead>
          <TableHead>Side</TableHead>
          <TableHead>Type</TableHead>
          <TableHead className="text-right">Quantity</TableHead>
          <TableHead className="text-right">Price</TableHead>
          <TableHead className="text-right">Filled</TableHead>
          <TableHead>Status</TableHead>
          <TableHead className="text-right">Actions</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {orders.map((order) => (
          <TableRow
            key={order.id}
            className="cursor-pointer hover:bg-gray-50"
            onClick={() => onViewDetails(order)}
          >
            <TableCell className="font-medium">{order.symbol}</TableCell>
            <TableCell>
              <Badge variant={getSideVariant(order.side)}>{order.side}</Badge>
            </TableCell>
            <TableCell>
              <Badge variant="outline">{order.type}</Badge>
            </TableCell>
            <TableCell className="text-right font-mono">{formatQuantity(order.quantity)}</TableCell>
            <TableCell className="text-right font-mono">{formatCurrency(order.price)}</TableCell>
            <TableCell className="text-right font-mono">
              {formatQuantity(order.filledQuantity)} / {formatQuantity(order.quantity)}
            </TableCell>
            <TableCell>
              <Badge variant={getStatusVariant(order.status)}>{order.status}</Badge>
            </TableCell>
            <TableCell className="text-right" onClick={(e) => e.stopPropagation()}>
              {canCancelOrder(order.status) && (
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={(e) => {
                    e.stopPropagation();
                    onCancel(order);
                  }}
                  title="Cancel order"
                >
                  <X className="h-4 w-4 text-red-600" />
                </Button>
              )}
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
