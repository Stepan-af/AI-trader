'use client';

import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card, CardContent } from '@/components/ui/Card';
import type { Strategy } from '@/types/strategy';
import { Edit, Play, Square, Trash2 } from 'lucide-react';

interface StrategyCardProps {
  strategy: Strategy;
  onEdit: (strategy: Strategy) => void;
  onDelete: (strategy: Strategy) => void;
  onStart: (strategy: Strategy) => void;
  onStop: (strategy: Strategy) => void;
  killSwitchActive: boolean;
}

export function StrategyCard({
  strategy,
  onEdit,
  onDelete,
  onStart,
  onStop,
  killSwitchActive,
}: StrategyCardProps) {
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

  const canStart = () => {
    return !killSwitchActive && (strategy.status === 'STOPPED' || strategy.status === 'DRAFT');
  };

  const canStop = () => {
    return strategy.status === 'RUNNING';
  };

  const canEdit = () => {
    return strategy.status !== 'RUNNING' && strategy.status !== 'STARTING';
  };

  const canDelete = () => {
    return strategy.status !== 'RUNNING' && strategy.status !== 'STARTING';
  };

  return (
    <Card className="hover:shadow-md transition-shadow">
      <CardContent className="p-4 space-y-4">
        {/* Header */}
        <div className="flex items-start justify-between">
          <div className="space-y-1">
            <h3 className="font-semibold text-lg">{strategy.config.name}</h3>
            <div className="flex items-center gap-2">
              <Badge variant="outline" className="text-xs">
                {strategy.config.type}
              </Badge>
              <Badge variant={getStatusVariant(strategy.status)} className="text-xs">
                {strategy.status}
              </Badge>
            </div>
          </div>
        </div>

        {/* Details */}
        <div className="grid grid-cols-2 gap-2 text-sm">
          <div>
            <span className="text-muted-foreground">Symbol:</span>
            <p className="font-medium">{strategy.config.symbol}</p>
          </div>
          <div>
            <span className="text-muted-foreground">Timeframe:</span>
            <p className="font-medium">{strategy.config.timeframe}</p>
          </div>
          <div>
            <span className="text-muted-foreground">Mode:</span>
            <p className="font-medium">
              {strategy.mode ? (
                <Badge
                  variant={strategy.mode === 'LIVE' ? 'warning' : 'default'}
                  className="text-xs"
                >
                  {strategy.mode}
                </Badge>
              ) : (
                <span className="text-muted-foreground">-</span>
              )}
            </p>
          </div>
        </div>

        {/* Actions */}
        <div className="flex flex-wrap gap-2">
          {(strategy.status === 'STOPPED' || strategy.status === 'DRAFT') && (
            <Button
              size="sm"
              variant="default"
              onClick={() => onStart(strategy)}
              disabled={!canStart()}
              className="flex-1 min-w-[100px]"
            >
              <Play className="h-3 w-3 mr-1" />
              Start
            </Button>
          )}
          {strategy.status === 'RUNNING' && (
            <Button
              size="sm"
              variant="destructive"
              onClick={() => onStop(strategy)}
              disabled={!canStop()}
              className="flex-1 min-w-[100px]"
            >
              <Square className="h-3 w-3 mr-1" />
              Stop
            </Button>
          )}
          <Button
            size="sm"
            variant="outline"
            onClick={() => onEdit(strategy)}
            disabled={!canEdit()}
            className="flex-1 min-w-[100px]"
          >
            <Edit className="h-3 w-3 mr-1" />
            Edit
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => onDelete(strategy)}
            disabled={!canDelete()}
          >
            <Trash2 className="h-3 w-3" />
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
