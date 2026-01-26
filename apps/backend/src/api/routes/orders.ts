/**
 * Order Routes
 * HTTP endpoints for order history and fills
 */

import type { Request, Response } from 'express';
import type { FillRepository } from '../../execution/repositories/FillRepository';
import type { OrderRepository } from '../../execution/repositories/OrderRepository';
import type { KillSwitchService } from '../../execution/services/KillSwitchService';
import type { OrderService } from '../../execution/services/OrderService';
import { RiskService } from '../../risk/services/RiskService';

/**
 * POST /orders
 * Place a new order with Risk Service validation
 * Per API.md: Requires Idempotency-Key header
 */
export async function placeOrder(
  req: Request,
  res: Response,
  orderService: OrderService,
  killSwitchService: KillSwitchService,
  riskService: RiskService
): Promise<void> {
  const userId = req.user!.userId;

  const { strategyId, symbol, side, type, quantity, price, mode } = req.body as {
    strategyId?: string;
    symbol?: string;
    side?: string;
    type?: string;
    quantity?: number;
    price?: number;
    mode?: string;
  };

  // Validate required fields
  if (!symbol || !side || !type || !quantity) {
    res.status(400).json({
      error: 'VALIDATION_ERROR',
      message: 'Missing required fields: symbol, side, type, quantity',
    });
    return;
  }

  if (!['BUY', 'SELL'].includes(side)) {
    res.status(400).json({
      error: 'VALIDATION_ERROR',
      message: 'side must be BUY or SELL',
    });
    return;
  }

  if (!['MARKET', 'LIMIT', 'STOP_LOSS', 'TAKE_PROFIT'].includes(type)) {
    res.status(400).json({
      error: 'VALIDATION_ERROR',
      message: 'type must be MARKET, LIMIT, STOP_LOSS, or TAKE_PROFIT',
    });
    return;
  }

  if (type === 'LIMIT' && !price) {
    res.status(400).json({
      error: 'VALIDATION_ERROR',
      message: 'price is required for LIMIT orders',
    });
    return;
  }

  if (!mode || !['PAPER', 'LIVE'].includes(mode)) {
    res.status(400).json({
      error: 'VALIDATION_ERROR',
      message: 'mode must be PAPER or LIVE',
    });
    return;
  }

  try {
    // Check kill switch before accepting order
    const killSwitchActive = await killSwitchService.isActive();
    if (killSwitchActive) {
      res.status(503).json({
        error: 'KILL_SWITCH_ACTIVE',
        message: 'Emergency stop is active. Cannot place orders.',
      });
      return;
    }

    // Risk Service validation before creating order
    // Note: For MVP, we assume position = 0 (no position tracking yet)
    // In production, query Portfolio Service for current position
    try {
      await riskService.validateRisk({
        userId,
        symbol,
        side: side as 'BUY' | 'SELL',
        quantity,
        currentPosition: 0, // MVP: Simplified, no position tracking
        positionVersion: 1, // MVP: Simplified
      });
    } catch (riskError) {
      if (riskError instanceof Error) {
        res.status(403).json({
          error: 'RISK_LIMIT_EXCEEDED',
          message: riskError.message,
        });
        return;
      }
      throw riskError;
    }

    // TODO: Integrate with exchange adapter for actual order placement
    // For now, create order in NEW status
    const order = await orderService.createOrder({
      userId,
      strategyId,
      symbol,
      side: side as 'BUY' | 'SELL',
      type: type as 'MARKET' | 'LIMIT' | 'STOP_LOSS' | 'TAKE_PROFIT',
      quantity,
      price,
    });

    res.status(201).json({
      id: order.id,
      user_id: order.userId,
      strategy_id: order.strategyId,
      symbol: order.symbol,
      side: order.side,
      type: order.type,
      quantity: order.quantity,
      price: order.price,
      status: order.status,
      created_at: order.createdAt.toISOString(),
    });
  } catch (error) {
    if (error instanceof Error) {
      res.status(400).json({
        error: 'ORDER_REJECTED',
        message: error.message,
      });
      return;
    }
    throw error;
  }
}

/**
 * POST /orders/:id/cancel
 * Cancel an open order
 */
export async function cancelOrder(
  req: Request,
  res: Response,
  orderService: OrderService,
  orderRepository: OrderRepository
): Promise<void> {
  const { id } = req.params;
  const userId = req.user!.userId;

  // Verify order exists and belongs to user
  const order = await orderRepository.findById(id);

  if (!order) {
    res.status(404).json({
      error: 'NOT_FOUND',
      message: 'Order not found',
    });
    return;
  }

  if (order.userId !== userId) {
    res.status(403).json({
      error: 'FORBIDDEN',
      message: 'Cannot cancel order belonging to another user',
    });
    return;
  }

  // Can only cancel OPEN or PARTIALLY_FILLED orders
  if (!['OPEN', 'PARTIALLY_FILLED'].includes(order.status)) {
    res.status(400).json({
      error: 'INVALID_STATE',
      message: `Cannot cancel order in ${order.status} status. Only OPEN or PARTIALLY_FILLED orders can be canceled.`,
    });
    return;
  }

  try {
    // Transition to CANCELING status
    // TODO: Call exchange adapter to cancel order
    // TODO: Handle exchange cancellation failures per reconciliation rules
    const updatedOrder = await orderService.transitionOrder({
      orderId: id,
      newStatus: 'CANCELED',
      metadata: { canceledBy: userId, reason: 'USER_REQUESTED' },
    });

    res.json({
      id: updatedOrder.id,
      status: updatedOrder.status,
      message: 'Order canceled successfully',
    });
  } catch (error) {
    if (error instanceof Error) {
      res.status(400).json({
        error: 'CANCELLATION_FAILED',
        message: error.message,
      });
      return;
    }
    throw error;
  }
}

/**
 * GET /orders
 * List orders for authenticated user with pagination
 */
export async function listOrders(
  req: Request,
  res: Response,
  orderRepository: OrderRepository
): Promise<void> {
  // User ID extracted from JWT by authenticateJWT middleware
  const userId = req.user!.userId;

  // Parse pagination params
  const limit = parseInt((req.query.limit as string) || '50', 10);
  const offset = parseInt((req.query.offset as string) || '0', 10);

  // Get orders (for now, get all and slice - future: add pagination to repository)
  const allOrders = await orderRepository.findByUserId(userId);

  const paginatedOrders = allOrders.slice(offset, offset + limit);

  res.json({
    items: paginatedOrders.map((order) => ({
      id: order.id,
      strategy_id: order.strategyId,
      symbol: order.symbol,
      side: order.side,
      type: order.type,
      quantity: order.quantity,
      price: order.price,
      status: order.status,
      filled_quantity: order.filledQuantity,
      avg_fill_price: order.avgFillPrice,
      exchange_order_id: order.exchangeOrderId,
      created_at: order.createdAt.toISOString(),
      updated_at: order.updatedAt.toISOString(),
    })),
    meta: {
      total: allOrders.length,
      limit,
      offset,
    },
  });
}

/**
 * GET /orders/:id
 * Get single order details
 */
export async function getOrder(
  req: Request,
  res: Response,
  orderRepository: OrderRepository
): Promise<void> {
  const { id } = req.params;
  const userId = req.user!.userId;

  const order = await orderRepository.findById(id);

  if (!order) {
    res.status(404).json({
      error: 'NOT_FOUND',
      message: 'Order not found',
    });
    return;
  }

  // Verify order belongs to authenticated user
  if (order.userId !== userId) {
    res.status(403).json({
      error: 'FORBIDDEN',
      message: 'Cannot access order belonging to another user',
    });
    return;
  }

  res.json({
    id: order.id,
    user_id: order.userId,
    strategy_id: order.strategyId,
    symbol: order.symbol,
    side: order.side,
    type: order.type,
    quantity: order.quantity,
    price: order.price,
    status: order.status,
    filled_quantity: order.filledQuantity,
    avg_fill_price: order.avgFillPrice,
    exchange_order_id: order.exchangeOrderId,
    created_at: order.createdAt.toISOString(),
    updated_at: order.updatedAt.toISOString(),
  });
}

/**
 * GET /orders/:id/fills
 * Get all fills for an order
 */
export async function getOrderFills(
  req: Request,
  res: Response,
  fillRepository: FillRepository,
  orderRepository: OrderRepository
): Promise<void> {
  const { id } = req.params;

  const userId = req.user!.userId;

  // Verify order exists
  const order = await orderRepository.findById(id);

  if (!order) {
    res.status(404).json({
      error: 'NOT_FOUND',
      message: 'Order not found',
    });
    return;
  }

  // Verify order belongs to authenticated user
  if (order.userId !== userId) {
    res.status(403).json({
      error: 'FORBIDDEN',
      message: 'Cannot access fills for order belonging to another user',
    });
    return;
  }

  const fills = await fillRepository.findByOrderId(id);

  res.json({
    items: fills.map((fill) => ({
      id: fill.id,
      order_id: fill.orderId,
      exchange_fill_id: fill.exchangeFillId,
      price: fill.price,
      quantity: fill.quantity,
      fee: fill.fee,
      fee_asset: fill.feeAsset,
      timestamp: fill.timestamp.toISOString(),
      source: fill.source,
    })),
    meta: {
      total: fills.length,
    },
  });
}
