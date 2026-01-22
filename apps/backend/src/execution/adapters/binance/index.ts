/**
 * Binance Adapter Module
 * Export all Binance adapter components
 */

export { BinanceAdapter } from './BinanceAdapter';
export type {
  BinanceAdapterConfig,
  ConnectionHealth,
  OrderPlacementRequest,
} from './BinanceAdapter';
export { BinanceRestClient } from './BinanceRestClient';
export { BinanceWebSocketClient } from './BinanceWebSocketClient';
export { CircuitBreaker, createBinanceCircuitBreaker } from './CircuitBreaker';
export { RateLimiter, createBinanceRateLimiter } from './RateLimiter';
export type {
  BinanceCredentials,
  BinanceExecutionReport,
  BinanceOrderQueryResponse,
  BinanceOrderRequest,
  BinanceOrderResponse,
} from './types';
