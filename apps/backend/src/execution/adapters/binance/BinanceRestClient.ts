/**
 * Binance REST API Client
 * Handles order placement, cancellation, and queries via Binance Spot REST API
 */

import crypto from 'node:crypto';
import type {
  BinanceCancelOrderResponse,
  BinanceCredentials,
  BinanceListenKeyResponse,
  BinanceOrderQueryResponse,
  BinanceOrderRequest,
  BinanceOrderResponse,
  BinanceServerTimeResponse,
} from './types';

export interface BinanceRestClientConfig {
  baseUrl?: string;
  timeout?: number;
}

export class BinanceRestClient {
  private readonly credentials: BinanceCredentials;
  private readonly baseUrl: string;
  private readonly timeout: number;

  constructor(credentials: BinanceCredentials, config: BinanceRestClientConfig = {}) {
    this.credentials = credentials;
    this.baseUrl = config.baseUrl || 'https://api.binance.com';
    this.timeout = config.timeout || 10000; // 10s default
  }

  /**
   * Create HMAC SHA256 signature for authenticated requests
   */
  private createSignature(queryString: string): string {
    return crypto.createHmac('sha256', this.credentials.apiSecret).update(queryString).digest('hex');
  }

  /**
   * Make authenticated API request
   */
  private async request<T>(
    method: 'GET' | 'POST' | 'DELETE' | 'PUT',
    endpoint: string,
    params: Record<string, unknown> = {},
    signed = true
  ): Promise<T> {
    // Add timestamp for signed requests
    if (signed) {
      params.timestamp = Date.now();
    }

    // Build query string
    const queryString = Object.entries(params)
      .filter(([, value]) => value !== undefined)
      .map(([key, value]) => `${key}=${encodeURIComponent(String(value))}`)
      .join('&');

    // Add signature for signed requests
    let url = `${this.baseUrl}${endpoint}`;
    if (signed && queryString) {
      const signature = this.createSignature(queryString);
      url += `?${queryString}&signature=${signature}`;
    } else if (queryString) {
      url += `?${queryString}`;
    }

    // Setup headers
    const headers: Record<string, string> = {
      'X-MBX-APIKEY': this.credentials.apiKey,
      'Content-Type': 'application/json',
    };

    // Make request
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.timeout);

    try {
      const response = await fetch(url, {
        method,
        headers,
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Binance API error: ${response.status} - ${errorText}`);
      }

      return (await response.json()) as T;
    } catch (error) {
      clearTimeout(timeoutId);

      if (error instanceof Error && error.name === 'AbortError') {
        throw new Error('Binance API timeout');
      }

      throw error;
    }
  }

  /**
   * Place new order
   */
  async placeOrder(params: BinanceOrderRequest): Promise<BinanceOrderResponse> {
    const endpoint = '/api/v3/order';

    const requestParams: Record<string, unknown> = {
      symbol: params.symbol,
      side: params.side,
      type: params.type,
      quantity: params.quantity,
    };

    if (params.price) {
      requestParams.price = params.price;
      requestParams.timeInForce = 'GTC'; // Good Till Cancel for LIMIT orders
    }

    if (params.newClientOrderId) {
      requestParams.newClientOrderId = params.newClientOrderId;
    }

    return this.request<BinanceOrderResponse>('POST', endpoint, requestParams, true);
  }

  /**
   * Cancel order
   */
  async cancelOrder(symbol: string, orderId: number): Promise<BinanceCancelOrderResponse> {
    const endpoint = '/api/v3/order';

    return this.request<BinanceCancelOrderResponse>(
      'DELETE',
      endpoint,
      {
        symbol,
        orderId,
      },
      true
    );
  }

  /**
   * Query order status
   */
  async queryOrder(symbol: string, orderId: number): Promise<BinanceOrderQueryResponse> {
    const endpoint = '/api/v3/order';

    return this.request<BinanceOrderQueryResponse>(
      'GET',
      endpoint,
      {
        symbol,
        orderId,
      },
      true
    );
  }

  /**
   * Get all open orders
   */
  async getOpenOrders(symbol?: string): Promise<BinanceOrderQueryResponse[]> {
    const endpoint = '/api/v3/openOrders';

    const params = symbol ? { symbol } : {};

    return this.request<BinanceOrderQueryResponse[]>('GET', endpoint, params, true);
  }

  /**
   * Get listen key for user data stream
   */
  async getListenKey(): Promise<string> {
    const endpoint = '/api/v3/userDataStream';

    const response = await this.request<BinanceListenKeyResponse>('POST', endpoint, {}, false);

    return response.listenKey;
  }

  /**
   * Refresh listen key (must be called every 30 minutes)
   */
  async refreshListenKey(listenKey: string): Promise<void> {
    const endpoint = '/api/v3/userDataStream';

    await this.request('PUT', endpoint, { listenKey }, false);
  }

  /**
   * Get server time
   */
  async getServerTime(): Promise<number> {
    const endpoint = '/api/v3/time';

    const response = await this.request<BinanceServerTimeResponse>('GET', endpoint, {}, false);

    return response.serverTime;
  }
}
