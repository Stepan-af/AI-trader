/**
 * Execution Domain Exports
 * Public API for order state machine
 */

export { closeDatabasePool, createDatabasePool, testDatabaseConnection } from './database';
export { FillRepository } from './repositories/FillRepository';
export { OrderEventRepository } from './repositories/OrderEventRepository';
export { OrderRepository } from './repositories/OrderRepository';
export { KillSwitchActiveError, KillSwitchService } from './services/KillSwitchService';
export { OrderService } from './services/OrderService';
export { ReconciliationService } from './services/ReconciliationService';
export { RiskServiceMonitor } from './services/RiskServiceMonitor';

export type { CreateFillParams } from './repositories/FillRepository';
export type { CreateOrderEventParams } from './repositories/OrderEventRepository';
export type { CreateOrderParams, UpdateOrderStatusParams } from './repositories/OrderRepository';
export type { CreateOrderRequest, TransitionOrderRequest } from './services/OrderService';
export type { ReconciliationAction, ReconciliationResult } from './services/ReconciliationService';
export type { RiskServiceHealthCheck } from './services/RiskServiceMonitor';
