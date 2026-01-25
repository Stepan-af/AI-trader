/**
 * Portfolio Service
 * Core business logic for position tracking from fill events
 * Implements position updates with optimistic locking per ARCHITECTURE.md
 */

import type { PortfolioEventOutbox } from '@ai-trader/shared';
import type { Pool, PoolClient } from 'pg';
import { PositionRepository } from '../repositories/PositionRepository';
import { PortfolioEventOutboxRepository } from '../repositories/PortfolioEventOutboxRepository';

interface FillProcessedData {
  side: 'BUY' | 'SELL';
  quantity: number;
  price: number;
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
   * Updates position quantity based on fill side
   */
  private async processFillEvent(
    event: PortfolioEventOutbox,
    client: PoolClient
  ): Promise<void> {
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

      if (fillData.side === 'BUY') {
        const totalCost =
          position.quantity * position.avgEntryPrice + fillData.quantity * fillData.price;
        newAvgEntryPrice = totalCost / newQuantity;
      }

      // Update with optimistic locking
      position = await this.positionRepository.update(
        {
          id: position.id,
          quantity: newQuantity,
          avgEntryPrice: newAvgEntryPrice,
          expectedVersion: position.version,
        },
        client
      );
    }
  }
}
