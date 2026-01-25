/**
 * Strategy Service
 * Business logic for strategy CRUD and validation
 * Per ARCHITECTURE.md: Strategy configuration, validation, DSL parsing
 */

import type { Strategy, StrategyConfig, StrategyStatus } from '@ai-trader/shared';
import type { Pool } from 'pg';
import { StrategyRepository } from '../repositories/StrategyRepository';

export interface CreateStrategyRequest {
  userId: string;
  config: StrategyConfig;
}

export interface UpdateStrategyRequest {
  id: string;
  config: StrategyConfig;
}

export class StrategyService {
  private readonly repository: StrategyRepository;

  constructor(pool: Pool) {
    this.repository = new StrategyRepository(pool);
  }

  /**
   * Create new strategy
   * Validates configuration before creation
   */
  async createStrategy(request: CreateStrategyRequest): Promise<Strategy> {
    // Validate configuration
    this.validateConfig(request.config);

    // Create with DRAFT status
    return await this.repository.create({
      userId: request.userId,
      config: request.config,
      status: 'DRAFT',
      mode: null,
    });
  }

  /**
   * Get strategy by ID
   */
  async getStrategy(id: string): Promise<Strategy | null> {
    return await this.repository.findById(id);
  }

  /**
   * List all strategies for a user
   */
  async listStrategies(userId: string): Promise<Strategy[]> {
    return await this.repository.findByUserId(userId);
  }

  /**
   * Update strategy configuration
   * Can only update strategies in DRAFT or STOPPED status
   */
  async updateStrategy(request: UpdateStrategyRequest): Promise<Strategy> {
    const strategy = await this.repository.findById(request.id);

    if (!strategy) {
      throw new Error(`Strategy not found: ${request.id}`);
    }

    // Only allow updates for DRAFT or STOPPED strategies
    if (strategy.status !== 'DRAFT' && strategy.status !== 'STOPPED') {
      throw new Error(
        `Cannot update strategy in ${strategy.status} status. Must be DRAFT or STOPPED.`
      );
    }

    // Validate new configuration
    this.validateConfig(request.config);

    return await this.repository.update({
      id: request.id,
      config: request.config,
    });
  }

  /**
   * Delete strategy
   * Can only delete strategies in DRAFT or STOPPED status
   */
  async deleteStrategy(id: string): Promise<void> {
    const strategy = await this.repository.findById(id);

    if (!strategy) {
      throw new Error(`Strategy not found: ${id}`);
    }

    // Only allow deletion for DRAFT or STOPPED strategies
    if (strategy.status !== 'DRAFT' && strategy.status !== 'STOPPED') {
      throw new Error(
        `Cannot delete strategy in ${strategy.status} status. Must be DRAFT or STOPPED.`
      );
    }

    await this.repository.delete(id);
  }

  /**
   * Update strategy status
   * Validates state transitions
   */
  async updateStatus(id: string, newStatus: StrategyStatus): Promise<Strategy> {
    const strategy = await this.repository.findById(id);

    if (!strategy) {
      throw new Error(`Strategy not found: ${id}`);
    }

    // Validate state transition
    this.validateStatusTransition(strategy.status, newStatus);

    return await this.repository.update({
      id,
      status: newStatus,
    });
  }

  /**
   * Validate strategy configuration
   * Ensures all required fields are present and valid
   */
  private validateConfig(config: StrategyConfig): void {
    // Base validation
    if (!config.name || config.name.trim().length === 0) {
      throw new Error('Strategy name is required');
    }

    if (!config.type) {
      throw new Error('Strategy type is required');
    }

    if (!['DCA', 'GRID', 'SWING'].includes(config.type)) {
      throw new Error(`Invalid strategy type: ${config.type}`);
    }

    if (!config.symbol || config.symbol.trim().length === 0) {
      throw new Error('Symbol is required');
    }

    if (!config.timeframe) {
      throw new Error('Timeframe is required');
    }

    if (!['1s', '1m', '5m', '15m', '1h', '4h', '1d'].includes(config.timeframe)) {
      throw new Error(`Invalid timeframe: ${config.timeframe}`);
    }

    // Risk limits validation
    if (!config.risk) {
      throw new Error('Risk limits are required');
    }

    if (!config.risk.maxPositionSize || config.risk.maxPositionSize <= 0) {
      throw new Error('maxPositionSize must be greater than 0');
    }

    // Type-specific validation
    this.validateTypeSpecificConfig(config);
  }

  /**
   * Validate type-specific configuration
   */
  private validateTypeSpecificConfig(config: StrategyConfig): void {
    switch (config.type) {
      case 'DCA':
        this.validateDcaConfig(config);
        break;
      case 'GRID':
        this.validateGridConfig(config);
        break;
      case 'SWING':
        this.validateSwingConfig(config);
        break;
    }
  }

  /**
   * Validate DCA strategy configuration
   */
  private validateDcaConfig(config: StrategyConfig): void {
    if (!config.dca) {
      throw new Error('DCA configuration is required for DCA strategy');
    }

    if (!config.dca.intervalSeconds || config.dca.intervalSeconds <= 0) {
      throw new Error('DCA intervalSeconds must be greater than 0');
    }

    if (!config.dca.amountPerOrder || config.dca.amountPerOrder <= 0) {
      throw new Error('DCA amountPerOrder must be greater than 0');
    }
  }

  /**
   * Validate Grid strategy configuration
   */
  private validateGridConfig(config: StrategyConfig): void {
    if (!config.grid) {
      throw new Error('Grid configuration is required for GRID strategy');
    }

    if (!config.grid.lowerBound || config.grid.lowerBound <= 0) {
      throw new Error('Grid lowerBound must be greater than 0');
    }

    if (!config.grid.upperBound || config.grid.upperBound <= 0) {
      throw new Error('Grid upperBound must be greater than 0');
    }

    if (config.grid.lowerBound >= config.grid.upperBound) {
      throw new Error('Grid lowerBound must be less than upperBound');
    }

    if (!config.grid.gridLevels || config.grid.gridLevels < 2) {
      throw new Error('Grid gridLevels must be at least 2');
    }
  }

  /**
   * Validate Swing strategy configuration
   */
  private validateSwingConfig(config: StrategyConfig): void {
    if (!config.swing) {
      throw new Error('Swing configuration is required for SWING strategy');
    }

    if (!config.swing.entryRule || config.swing.entryRule.trim().length === 0) {
      throw new Error('Swing entryRule is required');
    }

    if (!config.swing.exitRule || config.swing.exitRule.trim().length === 0) {
      throw new Error('Swing exitRule is required');
    }

    // Basic DSL syntax validation (MVP: just check not empty)
    // Full DSL parsing will be in execution engine
  }

  /**
   * Validate status transitions
   * Per ARCHITECTURE.md: DRAFT → STOPPED → STARTING → RUNNING → STOPPING → STOPPED
   */
  private validateStatusTransition(currentStatus: StrategyStatus, newStatus: StrategyStatus): void {
    const allowedTransitions: Record<StrategyStatus, StrategyStatus[]> = {
      DRAFT: ['STOPPED'],
      STOPPED: ['STARTING', 'DRAFT'],
      STARTING: ['RUNNING', 'ERROR', 'STOPPED'],
      RUNNING: ['STOPPING', 'ERROR'],
      STOPPING: ['STOPPED', 'ERROR'],
      ERROR: ['STOPPED', 'DRAFT'],
    };

    const allowed = allowedTransitions[currentStatus];

    if (!allowed || !allowed.includes(newStatus)) {
      throw new Error(
        `Invalid status transition: ${currentStatus} → ${newStatus}. Allowed: ${allowed?.join(', ') || 'none'}`
      );
    }
  }
}
