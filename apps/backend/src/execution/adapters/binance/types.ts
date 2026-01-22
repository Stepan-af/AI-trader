/**
 * Binance API Types
 * Type definitions for Binance Spot API requests and responses
 */

export interface BinanceCredentials {
  apiKey: string;
  apiSecret: string;
}

export interface BinanceOrderRequest {
  symbol: string;
  side: 'BUY' | 'SELL';
  type: 'MARKET' | 'LIMIT' | 'STOP_LOSS' | 'TAKE_PROFIT';
  quantity: number;
  price?: number;
  newClientOrderId?: string;
  timestamp: number;
  signature?: string;
}

export interface BinanceOrderResponse {
  orderId: number;
  symbol: string;
  status: string;
  clientOrderId: string;
  price: string;
  origQty: string;
  executedQty: string;
  cummulativeQuoteQty: string;
  timeInForce: string;
  type: string;
  side: string;
  fills?: BinanceFill[];
  transactTime: number;
}

export interface BinanceFill {
  price: string;
  qty: string;
  commission: string;
  commissionAsset: string;
  tradeId: number;
}

export interface BinanceOrderQueryResponse {
  symbol: string;
  orderId: number;
  clientOrderId: string;
  price: string;
  origQty: string;
  executedQty: string;
  cummulativeQuoteQty: string;
  status: string;
  timeInForce: string;
  type: string;
  side: string;
  stopPrice: string;
  time: number;
  updateTime: number;
  isWorking: boolean;
}

export interface BinanceCancelOrderResponse {
  symbol: string;
  orderId: number;
  clientOrderId: string;
  status: string;
}

export interface BinanceExecutionReport {
  e: string; // Event type
  E: number; // Event time
  s: string; // Symbol
  c: string; // Client order ID
  S: string; // Side
  o: string; // Order type
  f: string; // Time in force
  q: string; // Order quantity
  p: string; // Order price
  X: string; // Current order status
  i: number; // Order ID
  l: string; // Last executed quantity
  z: string; // Cumulative filled quantity
  L: string; // Last executed price
  n: string; // Commission amount
  N: string; // Commission asset
  T: number; // Transaction time
  t: number; // Trade ID
  w: boolean; // Is order on the book?
}

export interface BinanceListenKeyResponse {
  listenKey: string;
}

export interface BinanceServerTimeResponse {
  serverTime: number;
}

export interface BinanceTrade {
  symbol: string;
  id: number; // Trade ID
  orderId: number;
  price: string;
  qty: string;
  commission: string;
  commissionAsset: string;
  time: number;
  isBuyer: boolean;
  isMaker: boolean;
  isBestMatch: boolean;
}

export type BinanceOrderStatus =
  | 'NEW'
  | 'PARTIALLY_FILLED'
  | 'FILLED'
  | 'CANCELED'
  | 'PENDING_CANCEL'
  | 'REJECTED'
  | 'EXPIRED';

export interface CircuitBreakerState {
  state: 'CLOSED' | 'OPEN' | 'HALF_OPEN';
  failures: number;
  requests: number;
  lastFailureTime: number | null;
  testRequests: number;
}
