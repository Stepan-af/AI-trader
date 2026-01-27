'use client';

import { Alert } from '@/components/ui/Alert';
import { useKillSwitch } from '@/hooks/useKillSwitch';
import { AlertTriangle } from 'lucide-react';

export function KillSwitchBanner() {
  const { isActive, reason, activatedAt, isLoading } = useKillSwitch();

  if (isLoading || !isActive) {
    return null;
  }

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleString();
  };

  const getReasonText = (reason?: string) => {
    switch (reason) {
      case 'manual':
        return 'Manual activation';
      case 'risk_service_down':
        return 'Risk service unavailable';
      case 'system_error':
        return 'System error detected';
      default:
        return reason || 'Unknown reason';
    }
  };

  return (
    <Alert variant="destructive" className="mb-4 border-red-600">
      <div className="flex items-start gap-3">
        <AlertTriangle className="h-5 w-5 mt-0.5 flex-shrink-0" />
        <div className="flex-1">
          <div className="font-bold text-lg">⛔ Emergency Stop Active - No Trading Allowed</div>
          <div className="mt-1 text-sm">
            <div>
              <strong>Reason:</strong> {getReasonText(reason)}
            </div>
            {activatedAt && (
              <div>
                <strong>Activated:</strong> {formatDate(activatedAt)}
              </div>
            )}
            <div className="mt-2">
              All trading is currently disabled. Contact your administrator for more information.
            </div>
          </div>
        </div>
      </div>
    </Alert>
  );
}
