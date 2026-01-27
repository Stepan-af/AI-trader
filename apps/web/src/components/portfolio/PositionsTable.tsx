'use client';

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/Table';
import type { Position } from '@/types/portfolio';

interface PositionsTableProps {
  positions: Position[];
}

export function PositionsTable({ positions }: PositionsTableProps) {
  const formatCurrency = (value: number) => {
    return `$${value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  };

  const formatQuantity = (value: number) => {
    return value.toLocaleString(undefined, { minimumFractionDigits: 4, maximumFractionDigits: 8 });
  };

  if (positions.length === 0) {
    return (
      <div className="text-center py-12 text-gray-500">
        <p>No open positions</p>
      </div>
    );
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Symbol</TableHead>
          <TableHead className="text-right">Quantity</TableHead>
          <TableHead className="text-right">Avg Entry Price</TableHead>
          <TableHead className="text-right">Realized P&L</TableHead>
          <TableHead className="text-right">Total Fees</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {positions.map((position) => (
          <TableRow key={position.id}>
            <TableCell className="font-medium">{position.symbol}</TableCell>
            <TableCell className="text-right font-mono">
              {formatQuantity(position.quantity)}
            </TableCell>
            <TableCell className="text-right font-mono">
              {formatCurrency(position.avgEntryPrice)}
            </TableCell>
            <TableCell
              className={`text-right font-mono ${
                position.realizedPnl >= 0 ? 'text-green-600' : 'text-red-600'
              }`}
            >
              {formatCurrency(position.realizedPnl)}
            </TableCell>
            <TableCell className="text-right font-mono">
              {formatCurrency(position.totalFees)}
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
