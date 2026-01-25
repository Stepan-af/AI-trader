/**
 * Order Routes
 * HTTP endpoints for order history and fills
 */

import type { Request, Response } from 'express';
import type { OrderRepository } from '../../execution/repositories/OrderRepository';
import type { FillRepository } from '../../execution/repositories/FillRepository';

/**
 * GET /orders
 * List orders for authenticated user with pagination
 */
export async function listOrders(
  req: Request,
  res: Response,
  orderRepository: OrderRepository
): Promise<void> {
  // TODO: Extract userId from JWT token
  const userId = 'default-user';

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

  const order = await orderRepository.findById(id);

  if (!order) {
    res.status(404).json({
      error: 'NOT_FOUND',
      message: 'Order not found',
    });
    return;
  }

  // TODO: Verify order belongs to authenticated user

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

  // Verify order exists
  const order = await orderRepository.findById(id);

  if (!order) {
    res.status(404).json({
      error: 'NOT_FOUND',
      message: 'Order not found',
    });
    return;
  }

  // TODO: Verify order belongs to authenticated user

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
