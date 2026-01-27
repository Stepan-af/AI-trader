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
import type { Strategy } from '@/types/strategy';
import { Edit, Trash2 } from 'lucide-react';

interface StrategyListProps {
  strategies: Strategy[];
  onEdit: (strategy: Strategy) => void;
  onDelete: (strategy: Strategy) => void;
}

export function StrategyList({ strategies, onEdit, onDelete }: StrategyListProps) {
  const getStatusVariant = (status: string) => {
    switch (status) {
      case 'RUNNING':
        return 'success';
      case 'STOPPED':
      case 'DRAFT':
        return 'secondary';
      case 'ERROR':
        return 'destructive';
      case 'STARTING':
      case 'STOPPING':
        return 'warning';
      default:
        return 'default';
    }
  };

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Name</TableHead>
          <TableHead>Type</TableHead>
          <TableHead>Symbol</TableHead>
          <TableHead>Timeframe</TableHead>
          <TableHead>Status</TableHead>
          <TableHead>Mode</TableHead>
          <TableHead className="text-right">Actions</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {strategies.map((strategy) => (
          <TableRow key={strategy.id}>
            <TableCell className="font-medium">{strategy.config.name}</TableCell>
            <TableCell>
              <Badge variant="outline">{strategy.config.type}</Badge>
            </TableCell>
            <TableCell>{strategy.config.symbol}</TableCell>
            <TableCell>{strategy.config.timeframe}</TableCell>
            <TableCell>
              <Badge variant={getStatusVariant(strategy.status)}>{strategy.status}</Badge>
            </TableCell>
            <TableCell>
              {strategy.mode ? (
                <Badge variant={strategy.mode === 'LIVE' ? 'warning' : 'default'}>
                  {strategy.mode}
                </Badge>
              ) : (
                <span className="text-gray-400">-</span>
              )}
            </TableCell>
            <TableCell className="text-right">
              <div className="flex gap-2 justify-end">
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => onEdit(strategy)}
                  title="Edit strategy"
                >
                  <Edit className="h-4 w-4" />
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => onDelete(strategy)}
                  title="Delete strategy"
                >
                  <Trash2 className="h-4 w-4 text-red-600" />
                </Button>
              </div>
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
