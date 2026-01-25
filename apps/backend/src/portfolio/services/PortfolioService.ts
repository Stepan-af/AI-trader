/**
 * Portfolio Service
 * Core business logic for position tracking from fill events
 * Implements position updates with optimistic locking per ARCHITECTURE.md
 */

import type { PortfolioEventOutbox } from '@ai-trader/shared';
import type { Pool, PoolClient } from 'pg';
import { PortfolioEventOutboxRepository } from '../repositories/PortfolioEventOutboxRepository';
import { PositionRepository } from '../repositories/PositionRepository';

interface FillProcessedData {
  side: 'BUY' | 'SELL';
  quantity: number;
  price: number;
  fee: number;
  feeAsset: string;
}

export class PortfolioService {
  private readonly positionRepository: PositionRepository;
  private readonly outboxRepository: PortfolioEventOutboxRepository;

  constructor(private readonly pool: Pool) {
    this.positionRepository = new PositionRepository(pool);
    this.outboxRepository = new PortfolioEventOutboxRepository(pool);
  }

  /**
   * Process all unprocessed portfolio events from outbox
   * Called periodically to consume fill events
   *
   * @returns Number of events processed
   */
  async processOutboxEvents(): Promise<number> {
    const events = await this.outboxRepository.getUnprocessedEvents(100);

    for (const event of events) {
      await this.processEvent(event);
    }

    return events.length;
  }

  /**
   * Get all positions for a user with staleness check
   * Per API.md: data is stale if > 5 seconds old
   */
  async getPositions(userId: string): Promise<{
    positions: Array<{
      symbol: string;
      quantity: number;
      avgEntryPrice: number;
      realizedPnl: number;
      totalFees: number;
      unrealizedPnl: number;
      dataAsOfTimestamp: Date;
    }>;
    dataAsOfTimestamp: Date;
    isStale: boolean;
  }> {
    const positions = await this.positionRepository.findByUserId(userId);

    if (positions.length === 0) {
      return {
        positions: [],
        dataAsOfTimestamp: new Date(),
        isStale: false,
      };
    }

    // Calculate overall staleness based on oldest position update
    const oldestTimestamp = positions.reduce(
      (oldest, pos) => (pos.dataAsOfTimestamp < oldest ? pos.dataAsOfTimestamp : oldest),
      positions[0].dataAsOfTimestamp
    );

    const now = new Date();
    const ageSeconds = (now.getTime() - oldestTimestamp.getTime()) / 1000;
    const isStale = ageSeconds > 5;

    // For MVP: unrealized PnL requires current market price
    // Simplified: return 0 for now (will be implemented with price service)
    const positionsWithPnL = positions.map((pos) => ({
      symbol: pos.symbol,
      quantity: pos.quantity,
      avgEntryPrice: pos.avgEntryPrice,
      realizedPnl: pos.realizedPnl,
      totalFees: pos.totalFees,
      unrealizedPnl: 0, // TODO: Calculate from current market price
      dataAsOfTimestamp: pos.dataAsOfTimestamp,
    }));

    return {
      positions: positionsWithPnL,
      dataAsOfTimestamp: oldestTimestamp,
      isStale,
    };
  }

  /**
   * Get portfolio overview with total equity, PnL, and staleness
   */
  async getPortfolioOverview(userId: string): Promise<{
    balance: number;
    equity: number;
    unrealizedPnl: number;
    realizedPnl: number;
    dataAsOfTimestamp: Date;
    isStale: boolean;
  }> {
    const positionsData = await this.getPositions(userId);

    // Calculate total realized PnL and fees
    const totalRealizedPnl = positionsData.positions.reduce((sum, pos) => sum + pos.realizedPnl, 0);

    const totalUnrealizedPnl = positionsData.positions.reduce(
      (sum, pos) => sum + pos.unrealizedPnl,
      0
    );

    // For MVP: balance is simplified
    // In production, this would come from exchange balance sync
    const balance = 10000; // Placeholder
    const equity = balance + totalUnrealizedPnl;

    return {
      balance,
      equity,
      unrealizedPnl: totalUnrealizedPnl,
      realizedPnl: totalRealizedPnl,
      dataAsOfTimestamp: positionsData.dataAsOfTimestamp,
      isStale: positionsData.isStale,
    };
  }

  /**
   * Process a single portfolio event
   * Wrapped in transaction for atomicity
   */
  private async processEvent(event: PortfolioEventOutbox): Promise<void> {
    const client = await this.pool.connect();

    try {
      await client.query('BEGIN');

      if (event.eventType === 'FILL_PROCESSED') {
        await this.processFillEvent(event, client);
      } else if (event.eventType === 'ORDER_CANCELED') {
        // ORDER_CANCELED events don't affect positions in spot trading
        // Just mark as processed
      }

      // Mark event as processed
      await this.outboxRepository.markAsProcessed(event.id, client);

      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Process FILL_PROCESSED event
   * Updates position quantity, calculates realized PnL, tracks fees
   *
   * PnL Calculation (per ARCHITECTURE.md):
   * - SELL: Realized PnL = (sell_price - avg_entry_price) × quantity_sold
   * - BUY: No realized PnL (only updates position)
   * - Fees: Accumulated in total_fees
   */
  private async processFillEvent(event: PortfolioEventOutbox, client: PoolClient): Promise<void> {
    const fillData = event.data as unknown as FillProcessedData;

    // Get current position or create new one
    let position = await this.positionRepository.findByUserAndSymbol(
      event.userId,
      event.symbol,
      client
    );

    if (!position) {
      // No existing position - create new one
      position = await this.positionRepository.create(
        {
          userId: event.userId,
          symbol: event.symbol,
          quantity: fillData.side === 'BUY' ? fillData.quantity : -fillData.quantity,
          avgEntryPrice: fillData.price,
          realizedPnl: 0, // New position has no realized PnL yet
          totalFees: fillData.fee, // Start tracking fees
        },
        client
      );
    } else {
      // Update existing position
      const quantityDelta = fillData.side === 'BUY' ? fillData.quantity : -fillData.quantity;
      const newQuantity = position.quantity + quantityDelta;

      // Calculate new average entry price
      // For BUY: weighted average
      // For SELL: keep existing avg_entry_price (we're reducing position)
      let newAvgEntryPrice = position.avgEntryPrice;
      let realizedPnl = position.realizedPnl;

      if (fillData.side === 'BUY') {
        // Weighted average calculation
        const totalCost =
          position.quantity * position.avgEntryPrice + fillData.quantity * fillData.price;
        newAvgEntryPrice = totalCost / newQuantity;
      } else {
        // SELL: Calculate realized PnL
        // PnL = (sell_price - avg_entry_price) × quantity_sold
        const pnlFromThisFill = (fillData.price - position.avgEntryPrice) * fillData.quantity;
        realizedPnl += pnlFromThisFill;
      }

      // Accumulate fees
      const totalFees = position.totalFees + fillData.fee;

      // Update with optimistic locking
      position = await this.positionRepository.update(
        {
          id: position.id,
          quantity: newQuantity,
          avgEntryPrice: newAvgEntryPrice,
          realizedPnl,
          totalFees,
          expectedVersion: position.version,
        },
        client
      );
    }
  }
}
