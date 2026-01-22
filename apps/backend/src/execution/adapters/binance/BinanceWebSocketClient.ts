/**
 * Binance WebSocket Client
 * Handles execution reports via Binance User Data Stream
 * Implements auto-reconnection with exponential backoff
 */

/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable @typescript-eslint/no-unsafe-call */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */

import WebSocket from 'ws';
import type { BinanceExecutionReport } from './types';

export interface WebSocketClientConfig {
  baseUrl?: string;
  pingInterval?: number;
  reconnectBaseDelay?: number;
  maxReconnectDelay?: number;
}

type WebSocketState = 'DISCONNECTED' | 'CONNECTING' | 'CONNECTED' | 'RECONNECTING';

export class BinanceWebSocketClient {
  private ws: WebSocket | null = null;
  private listenKey: string | null = null;
  private state: WebSocketState = 'DISCONNECTED';
  private reconnectAttempts = 0;
  private reconnectTimeout: NodeJS.Timeout | null = null;
  private pingInterval: NodeJS.Timeout | null = null;

  private readonly baseUrl: string;
  private readonly pingIntervalMs: number;
  private readonly reconnectBaseDelay: number;
  private readonly maxReconnectDelay: number;

  // Event handlers
  private onExecutionReportHandler?: (report: BinanceExecutionReport) => void;
  private onConnectedHandler?: () => void;
  private onDisconnectedHandler?: () => void;
  private onErrorHandler?: (error: Error) => void;

  constructor(config: WebSocketClientConfig = {}) {
    this.baseUrl = config.baseUrl || 'wss://stream.binance.com:9443';
    this.pingIntervalMs = config.pingInterval || 10000; // 10s
    this.reconnectBaseDelay = config.reconnectBaseDelay || 1000; // 1s
    this.maxReconnectDelay = config.maxReconnectDelay || 32000; // 32s
  }

  /**
   * Connect to user data stream
   */
  async connect(listenKey: string): Promise<void> {
    if (this.state === 'CONNECTED' || this.state === 'CONNECTING') {
      return;
    }

    this.listenKey = listenKey;
    this.state = 'CONNECTING';

    const url = `${this.baseUrl}/ws/${listenKey}`;

    return new Promise((resolve, reject) => {
      try {
        this.ws = new WebSocket(url);

        this.ws.on('open', () => {
          this.state = 'CONNECTED';
          this.reconnectAttempts = 0;
          this.startPingInterval();

          if (this.onConnectedHandler) {
            this.onConnectedHandler();
          }

          resolve();
        });

        this.ws.on('message', (data: Buffer) => {
          this.handleMessage(data);
        });

        this.ws.on('error', (error: Error) => {
          if (this.onErrorHandler) {
            this.onErrorHandler(error);
          }
        });

        this.ws.on('close', () => {
          this.handleDisconnect();
        });

        this.ws.on('pong', () => {
          // Connection alive
        });

        // Connection timeout
        setTimeout(() => {
          if (this.state === 'CONNECTING') {
            reject(new Error('WebSocket connection timeout'));
            this.handleDisconnect();
          }
        }, 30000); // 30s timeout
      } catch (error) {
        this.state = 'DISCONNECTED';
        reject(error);
      }
    });
  }

  /**
   * Disconnect from WebSocket
   */
  disconnect(): void {
    this.stopPingInterval();

    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout);
      this.reconnectTimeout = null;
    }

    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }

    this.state = 'DISCONNECTED';
  }

  /**
   * Get current connection state
   */
  getState(): WebSocketState {
    return this.state;
  }

  /**
   * Check if connected
   */
  isConnected(): boolean {
    return this.state === 'CONNECTED';
  }

  /**
   * Set execution report handler
   */
  onExecutionReport(handler: (report: BinanceExecutionReport) => void): void {
    this.onExecutionReportHandler = handler;
  }

  /**
   * Set connected handler
   */
  onConnected(handler: () => void): void {
    this.onConnectedHandler = handler;
  }

  /**
   * Set disconnected handler
   */
  onDisconnected(handler: () => void): void {
    this.onDisconnectedHandler = handler;
  }

  /**
   * Set error handler
   */
  onError(handler: (error: Error) => void): void {
    this.onErrorHandler = handler;
  }

  /**
   * Handle incoming WebSocket message
   */
  private handleMessage(data: Buffer): void {
    try {
      const message = JSON.parse(data.toString()) as BinanceExecutionReport;

      // Check if it's an execution report
      if (message.e === 'executionReport' && this.onExecutionReportHandler) {
        this.onExecutionReportHandler(message);
      }
    } catch (error) {
      if (this.onErrorHandler) {
        this.onErrorHandler(error as Error);
      }
    }
  }

  /**
   * Handle disconnect and initiate reconnection
   */
  private handleDisconnect(): void {
    const wasConnected = this.state === 'CONNECTED';

    this.state = 'DISCONNECTED';
    this.stopPingInterval();

    if (this.ws) {
      this.ws.removeAllListeners();
      this.ws = null;
    }

    if (wasConnected && this.onDisconnectedHandler) {
      this.onDisconnectedHandler();
    }

    // Initiate reconnection
    this.scheduleReconnect();
  }

  /**
   * Schedule reconnection with exponential backoff
   */
  private scheduleReconnect(): void {
    if (this.reconnectTimeout || !this.listenKey) {
      return;
    }

    this.state = 'RECONNECTING';

    // Calculate delay with exponential backoff
    const baseDelay = Math.min(
      this.reconnectBaseDelay * Math.pow(2, this.reconnectAttempts),
      this.maxReconnectDelay
    );

    // Add jitter (±20%)
    const jitter = baseDelay * (0.8 + Math.random() * 0.4);
    const delay = Math.floor(jitter);

    this.reconnectAttempts++;

    this.reconnectTimeout = setTimeout(() => {
      void (async (): Promise<void> => {
        this.reconnectTimeout = null;

        try {
          await this.connect(this.listenKey!);
        } catch (error) {
          // Connection failed, will retry
          if (this.onErrorHandler) {
            this.onErrorHandler(error as Error);
          }
        }
      })();
    }, delay);
  }

  /**
   * Start ping interval to keep connection alive
   */
  private startPingInterval(): void {
    this.stopPingInterval();

    this.pingInterval = setInterval(() => {
      if (this.ws && this.state === 'CONNECTED') {
        this.ws.ping();
      }
    }, this.pingIntervalMs);
  }

  /**
   * Stop ping interval
   */
  private stopPingInterval(): void {
    if (this.pingInterval) {
      clearInterval(this.pingInterval);
      this.pingInterval = null;
    }
  }
}
