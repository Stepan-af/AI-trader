'use client';

import { monitoringApi, type HealthCheckResponse } from '@/lib/api/monitoring';
import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';

interface KillSwitchContextValue {
  isActive: boolean;
  reason: string | undefined;
  activatedAt: string | undefined;
  isLoading: boolean;
}

const KillSwitchContext = createContext<KillSwitchContextValue | null>(null);

export function KillSwitchProvider({ children }: { children: ReactNode }) {
  const [killSwitchState, setKillSwitchState] = useState<HealthCheckResponse['killSwitch'] | null>(
    null
  );
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const checkKillSwitch = async () => {
      try {
        const health = await monitoringApi.getHealth();
        setKillSwitchState(health.killSwitch);
      } catch (error) {
        // Silently fail - keep previous state
        console.error('Failed to check kill switch status:', error);
      } finally {
        setIsLoading(false);
      }
    };

    // Check immediately on mount
    void checkKillSwitch();

    // Poll every 30 seconds
    const interval = setInterval(() => {
      void checkKillSwitch();
    }, 30000);

    return () => clearInterval(interval);
  }, []);

  const value: KillSwitchContextValue = {
    isActive: killSwitchState?.active ?? false,
    reason: killSwitchState?.reason,
    activatedAt: killSwitchState?.activatedAt,
    isLoading,
  };

  return <KillSwitchContext.Provider value={value}>{children}</KillSwitchContext.Provider>;
}

export function useKillSwitch(): KillSwitchContextValue {
  const context = useContext(KillSwitchContext);

  if (!context) {
    throw new Error('useKillSwitch must be used within KillSwitchProvider');
  }

  return context;
}
