/**
 * Risk Service Health Monitor
 * Auto-triggers kill switch if Risk Service is down > 30 seconds
 * Per ADR-012: "If Risk Service down > 30 seconds continuously: Trigger automatic kill switch"
 */

import type { KillSwitchService } from './KillSwitchService';

export interface RiskServiceHealthCheck {
  healthy: boolean;
  lastCheckAt: Date;
  errorMessage?: string;
}

/**
 * RiskServiceMonitor
 * Background monitor that checks Risk Service health and auto-triggers kill switch
 */
export class RiskServiceMonitor {
  private intervalId: NodeJS.Timeout | null = null;
  private firstFailureAt: Date | null = null;
  private readonly CHECK_INTERVAL_MS = 5000; // Check every 5 seconds
  private readonly DOWNTIME_THRESHOLD_MS = 30000; // 30 seconds
  private isKillSwitchTriggered = false;

  constructor(
    private readonly killSwitchService: KillSwitchService,
    private readonly checkRiskServiceHealth: () => Promise<RiskServiceHealthCheck>
  ) {}

  /**
   * Start monitoring Risk Service health
   * Runs background checks every 5 seconds
   */
  start(): void {
    if (this.intervalId) {
      console.warn('RiskServiceMonitor already started');
      return;
    }

    console.log('Starting Risk Service health monitor...');
    this.intervalId = setInterval(() => {
      void this.checkHealthAndMaybeActivateKillSwitch();
    }, this.CHECK_INTERVAL_MS);
  }

  /**
   * Stop monitoring
   */
  stop(): void {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
      console.log('Stopped Risk Service health monitor');
    }
  }

  /**
   * Check Risk Service health and activate kill switch if down > 30s
   */
  private async checkHealthAndMaybeActivateKillSwitch(): Promise<void> {
    try {
      const healthCheck = await this.checkRiskServiceHealth();

      if (healthCheck.healthy) {
        // Risk Service is healthy - reset failure tracking
        if (this.firstFailureAt) {
          console.log('Risk Service recovered');
          this.firstFailureAt = null;
          this.isKillSwitchTriggered = false;
        }
        return;
      }

      // Risk Service is unhealthy
      if (!this.firstFailureAt) {
        // First failure detected
        this.firstFailureAt = new Date();
        console.warn(
          `Risk Service health check failed: ${healthCheck.errorMessage || 'unknown error'}`
        );
        return;
      }

      // Check if downtime exceeds threshold
      const downtimeMs = Date.now() - this.firstFailureAt.getTime();

      if (downtimeMs >= this.DOWNTIME_THRESHOLD_MS && !this.isKillSwitchTriggered) {
        // Threshold exceeded - activate kill switch
        console.error(
          `Risk Service down for ${Math.floor(downtimeMs / 1000)}s - activating kill switch`
        );

        await this.killSwitchService.activate('risk_service_down', 'system');
        this.isKillSwitchTriggered = true;

        console.error('Kill switch activated due to Risk Service downtime > 30s');
      }
    } catch (error) {
      console.error('Error in Risk Service health monitor:', error);
    }
  }

  /**
   * Get current monitoring status
   */
  getStatus(): {
    running: boolean;
    firstFailureAt: Date | null;
    killSwitchTriggered: boolean;
  } {
    return {
      running: this.intervalId !== null,
      firstFailureAt: this.firstFailureAt,
      killSwitchTriggered: this.isKillSwitchTriggered,
    };
  }
}
