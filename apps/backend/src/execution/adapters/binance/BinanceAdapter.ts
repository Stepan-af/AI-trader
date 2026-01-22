/**
 * Binance Spot Adapter
 * Main facade for Binance integration
 * Combines REST API, WebSocket, rate limiting, and circuit breaker
 */

import type { Fill } from '@ai-trader/shared';
import { BinanceRestClient } from './BinanceRestClient';
import { BinanceWebSocketClient } from './BinanceWebSocketClient';
import { CircuitBreaker, createBinanceCircuitBreaker } from './CircuitBreaker';
import { RateLimiter, createBinanceRateLimiter } from './RateLimiter';
import type {
  BinanceCredentials,
  BinanceExecutionReport,
  BinanceOrderQueryResponse,
  BinanceOrderRequest,
  BinanceOrderResponse,
} from './types';

export interface BinanceAdapterConfig {
  credentials: BinanceCredentials;
  rateLimiter?: RateLimiter;
  circuitBreaker?: CircuitBreaker;
}

export interface OrderPlacementRequest {
  symbol: string;
  side: 'BUY' | 'SELL';
  type: 'MARKET' | 'LIMIT' | 'STOP_LOSS' | 'TAKE_PROFIT';
  quantity: number;
  price?: number;
  clientOrderId?: string;
}

export interface ConnectionHealth {
  rest: 'up' | 'down';
  websocket: 'connected' | 'disconnected' | 'reconnecting';
  circuitBreakerState: 'CLOSED' | 'OPEN' | 'HALF_OPEN';
  rateLimitTokens: number;
  rateLimitQueueDepth: number;
}

export class BinanceAdapter {
  private readonly restClient: BinanceRestClient;
  private readonly wsClient: BinanceWebSocketClient;
  private readonly rateLimiter: RateLimiter;
  private readonly circuitBreaker: CircuitBreaker;
  private listenKeyRefreshInterval: NodeJS.Timeout | null = null;
  private currentListenKey: string | null = null;

  // Event handlers
  private onExecutionReportHandler?: (report: BinanceExecutionReport) => void;
  private onWebSocketConnectedHandler?: () => void;
  private onWebSocketDisconnectedHandler?: () => void;
  private onErrorHandler?: (error: Error) => void;

  constructor(config: BinanceAdapterConfig) {
    this.restClient = new BinanceRestClient(config.credentials);
    this.wsClient = new BinanceWebSocketClient();
    this.rateLimiter = config.rateLimiter || createBinanceRateLimiter();
    this.circuitBreaker = config.circuitBreaker || createBinanceCircuitBreaker();

    // Setup WebSocket event handlers
    this.wsClient.onExecutionReport((report) => {
      if (this.onExecutionReportHandler) {
        this.onExecutionReportHandler(report);
      }
    });

    this.wsClient.onConnected(() => {
      if (this.onWebSocketConnectedHandler) {
        this.onWebSocketConnectedHandler();
      }
    });

    this.wsClient.onDisconnected(() => {
      if (this.onWebSocketDisconnectedHandler) {
        this.onWebSocketDisconnectedHandler();
      }
    });

    this.wsClient.onError((error) => {
      if (this.onErrorHandler) {
        this.onErrorHandler(error);
      }
    });
  }

  /**
   * Initialize adapter (connect WebSocket)
   */
  async initialize(): Promise<void> {
    // Get listen key for user data stream
    this.currentListenKey = await this.executeWithProtection(() => this.restClient.getListenKey());

    // Connect WebSocket
    await this.wsClient.connect(this.currentListenKey);

    // Start listen key refresh (every 30 minutes)
    this.startListenKeyRefresh();
  }

  /**
   * Shutdown adapter
   */
  shutdown(): void {
    this.stopListenKeyRefresh();
    this.wsClient.disconnect();
    this.rateLimiter.stop();
  }

  /**
   * Place order with rate limiting and circuit breaker
   */
  async placeOrder(request: OrderPlacementRequest): Promise<BinanceOrderResponse> {
    // Rate limit check
    await this.rateLimiter.acquire();

    // Build Binance request
    const binanceRequest: BinanceOrderRequest = {
      symbol: request.symbol,
      side: request.side,
      type: request.type,
      quantity: request.quantity,
      price: request.price,
      newClientOrderId: request.clientOrderId,
      timestamp: Date.now(),
    };

    // Execute with circuit breaker
    return this.executeWithProtection(() => this.restClient.placeOrder(binanceRequest));
  }

  /**
   * Cancel order
   */
  async cancelOrder(symbol: string, orderId: number): Promise<void> {
    await this.executeWithProtection(() => this.restClient.cancelOrder(symbol, orderId));
  }

  /**
   * Query order status
   */
  async queryOrder(symbol: string, orderId: number): Promise<BinanceOrderQueryResponse> {
    return this.executeWithProtection(() => this.restClient.queryOrder(symbol, orderId));
  }

  /**
   * Get all open orders
   */
  async getOpenOrders(symbol?: string): Promise<BinanceOrderQueryResponse[]> {
    return this.executeWithProtection(() => this.restClient.getOpenOrders(symbol));
  }

  /**
   * Get server time for drift detection
   */
  async getServerTime(): Promise<number> {
    return this.executeWithProtection(() => this.restClient.getServerTime());
  }

  /**
   * Get connection health status
   */
  getHealth(): ConnectionHealth {
    return {
      rest: this.circuitBreaker.getState() === 'OPEN' ? 'down' : 'up',
      websocket: this.wsClient.getState().toLowerCase() as
        | 'connected'
        | 'disconnected'
        | 'reconnecting',
      circuitBreakerState: this.circuitBreaker.getState(),
      rateLimitTokens: this.rateLimiter.getAvailableTokens(),
      rateLimitQueueDepth: this.rateLimiter.getQueueDepth(),
    };
  }

  /**
   * Set execution report handler
   */
  onExecutionReport(handler: (report: BinanceExecutionReport) => void): void {
    this.onExecutionReportHandler = handler;
  }

  /**
   * Set WebSocket connected handler
   */
  onWebSocketConnected(handler: () => void): void {
    this.onWebSocketConnectedHandler = handler;
  }

  /**
   * Set WebSocket disconnected handler
   */
  onWebSocketDisconnected(handler: () => void): void {
    this.onWebSocketDisconnectedHandler = handler;
  }

  /**
   * Set error handler
   */
  onError(handler: (error: Error) => void): void {
    this.onErrorHandler = handler;
  }

  /**
   * Map Binance execution report to Fill
   */
  mapExecutionReportToFill(report: BinanceExecutionReport): Fill | null {
    // Only process if there's an actual fill (trade occurred)
    if (!report.l || parseFloat(report.l) === 0) {
      return null;
    }

    return {
      id: '', // Will be generated by FillRepository
      orderId: '', // Will be filled by OrderService
      exchangeFillId: report.t.toString(),
      price: parseFloat(report.L),
      quantity: parseFloat(report.l),
      fee: parseFloat(report.n),
      feeAsset: report.N,
      timestamp: new Date(report.T),
      source: 'WEBSOCKET',
    };
  }

  /**
   * Execute function with circuit breaker protection
   */
  private async executeWithProtection<T>(fn: () => Promise<T>): Promise<T> {
    return this.circuitBreaker.execute(fn);
  }

  /**
   * Start listen key refresh interval (every 30 minutes)
   */
  private startListenKeyRefresh(): void {
    this.stopListenKeyRefresh();

    this.listenKeyRefreshInterval = setInterval(() => {
      void (async (): Promise<void> => {
        try {
          if (this.currentListenKey) {
            await this.restClient.refreshListenKey(this.currentListenKey);
          }
        } catch (error) {
          if (this.onErrorHandler) {
            this.onErrorHandler(error as Error);
          }
        }
      })();
    }, 30 * 60 * 1000); // 30 minutes
  }

  /**
   * Stop listen key refresh interval
   */
  private stopListenKeyRefresh(): void {
    if (this.listenKeyRefreshInterval) {
      clearInterval(this.listenKeyRefreshInterval);
      this.listenKeyRefreshInterval = null;
    }
  }
}
