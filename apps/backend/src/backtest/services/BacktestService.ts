/**
 * Backtest Service
 * Implements deterministic candle-based strategy backtesting
 * Per ARCHITECTURE.md: Candle-based simulation, deterministic execution
 */

import type { Candle, StrategyConfig } from '@ai-trader/shared';
import type { Pool } from 'pg';
import { CandleRepository } from '../../strategy/repositories/CandleRepository';
import { DCASignalGenerator } from '../../strategy/signals/DCASignalGenerator';
import { GridSignalGenerator } from '../../strategy/signals/GridSignalGenerator';
import type { SignalGenerator } from '../../strategy/signals/SignalGenerator';
import { SwingSignalGenerator } from '../../strategy/signals/SwingSignalGenerator';
import { BacktestRepository } from '../repositories/BacktestRepository';

interface SimulationState {
  balance: number;
  position: number; // Quantity held
  avgEntryPrice: number;
  trades: Trade[];
  equityCurve: number[]; // For drawdown calculation
}

interface Trade {
  type: 'BUY' | 'SELL';
  price: number;
  quantity: number;
  timestamp: Date;
  pnl: number; // 0 for BUY, calculated for SELL
}

export class BacktestService {
  private readonly backtestRepo: BacktestRepository;
  private readonly candleRepo: CandleRepository;
  private readonly signalGenerators: Map<string, SignalGenerator>;

  constructor(pool: Pool) {
    this.backtestRepo = new BacktestRepository(pool);
    this.candleRepo = new CandleRepository(pool);

    // Initialize signal generators
    this.signalGenerators = new Map([
      ['DCA', new DCASignalGenerator()],
      ['GRID', new GridSignalGenerator()],
      ['SWING', new SwingSignalGenerator()],
    ]);
  }

  /**
   * Start a backtest
   * Creates backtest run, executes simulation, stores results
   */
  async startBacktest(params: {
    userId: string;
    strategyConfig: StrategyConfig;
    startDate: Date;
    endDate: Date;
    initialBalance: number;
  }): Promise<string> {
    // Validate date range
    if (params.startDate >= params.endDate) {
      throw new Error('Start date must be before end date');
    }

    if (params.initialBalance <= 0) {
      throw new Error('Initial balance must be positive');
    }

    // Create backtest run record
    const backtestRun = await this.backtestRepo.createRun({
      userId: params.userId,
      strategyConfig: params.strategyConfig,
      symbol: params.strategyConfig.symbol,
      startDate: params.startDate,
      endDate: params.endDate,
      initialBalance: params.initialBalance,
    });

    // Execute backtest simulation
    try {
      // Update status to RUNNING
      await this.backtestRepo.updateRunStatus(backtestRun.id, 'RUNNING');

      // Run simulation
      const result = await this.runSimulation(
        backtestRun.id,
        params.strategyConfig,
        params.startDate,
        params.endDate,
        params.initialBalance
      );

      // Store results
      await this.backtestRepo.createResult(result);

      // Update status to COMPLETED
      await this.backtestRepo.updateRunStatus(backtestRun.id, 'COMPLETED');

      return backtestRun.id;
    } catch (error) {
      // Mark as FAILED
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      await this.backtestRepo.updateRunStatus(backtestRun.id, 'FAILED', errorMessage);
      throw error;
    }
  }

  /**
   * Get backtest run with results
   */
  async getBacktest(backtestId: string): Promise<{
    run: import('@ai-trader/shared').BacktestRun;
    result: import('@ai-trader/shared').BacktestResult | null;
  }> {
    const run = await this.backtestRepo.findRunById(backtestId);

    if (!run) {
      throw new Error('Backtest not found');
    }

    const result = await this.backtestRepo.findResultByRunId(backtestId);

    return { run, result };
  }

  /**
   * List backtests for a user
   */
  async listBacktests(userId: string, limit = 50, offset = 0): Promise<import('@ai-trader/shared').BacktestRun[]> {
    return await this.backtestRepo.findRunsByUserId(userId, limit, offset);
  }

  /**
   * Run backtest simulation
   * Deterministic candle-based execution per ARCHITECTURE.md
   */
  private async runSimulation(
    backtestRunId: string,
    strategyConfig: StrategyConfig,
    startDate: Date,
    endDate: Date,
    initialBalance: number
  ): Promise<{
    backtestRunId: string;
    finalBalance: number;
    totalTrades: number;
    winningTrades: number;
    losingTrades: number;
    totalPnl: number;
    maxDrawdown: number;
    sharpeRatio: number | null;
  }> {
    // Load historical candles (ordered ASC by timestamp)
    const candles = await this.candleRepo.getCandlesInRange(
      strategyConfig.symbol,
      strategyConfig.timeframe,
      startDate,
      endDate
    );

    if (candles.length === 0) {
      throw new Error('No historical candles found for specified date range');
    }

    // Get signal generator
    const generator = this.signalGenerators.get(strategyConfig.type);
    if (!generator) {
      throw new Error(`Unknown strategy type: ${strategyConfig.type}`);
    }

    // Initialize simulation state
    const state: SimulationState = {
      balance: initialBalance,
      position: 0,
      avgEntryPrice: 0,
      trades: [],
      equityCurve: [initialBalance],
    };

    // Simulate strategy execution candle by candle
    for (let i = 0; i < candles.length; i++) {
      const candle = candles[i];

      // Get historical candles (newest first, as expected by SignalGenerator)
      const historicalCandles = candles.slice(0, i + 1).reverse();

      // Generate signal
      const signal = generator.generateSignal(strategyConfig, historicalCandles, candle.timestamp);

      // Execute signal
      if (signal.type === 'BUY') {
        this.executeBuy(state, candle, strategyConfig);
      } else if (signal.type === 'SELL') {
        this.executeSell(state, candle);
      }

      // Record equity for drawdown calculation
      const currentEquity = this.calculateEquity(state, candle.close);
      state.equityCurve.push(currentEquity);
    }

    // Close any open position at final candle price
    if (state.position > 0) {
      const finalCandle = candles[candles.length - 1];
      this.executeSell(state, finalCandle);
    }

    // Calculate metrics
    const finalBalance = state.balance;
    const totalPnl = finalBalance - initialBalance;
    const maxDrawdown = this.calculateMaxDrawdown(state.equityCurve);
    const sharpeRatio = this.calculateSharpeRatio(state.trades, initialBalance);

    const winningTrades = state.trades.filter((t) => t.pnl > 0).length;
    const losingTrades = state.trades.filter((t) => t.pnl < 0).length;

    return {
      backtestRunId,
      finalBalance,
      totalTrades: state.trades.length,
      winningTrades,
      losingTrades,
      totalPnl,
      maxDrawdown,
      sharpeRatio,
    };
  }

  /**
   * Execute BUY signal
   * Simplified: Buy with all available balance
   */
  private executeBuy(state: SimulationState, candle: Candle, strategyConfig: StrategyConfig): void {
    const price = candle.close;
    const maxPositionSize = strategyConfig.risk.maxPositionSize;

    // Calculate quantity to buy (use all balance, respect max position size)
    let quantity = state.balance / price;
    quantity = Math.min(quantity, maxPositionSize - state.position);

    if (quantity <= 0) {
      return; // No capacity to buy
    }

    const cost = quantity * price;
    const fee = cost * 0.001; // 0.1% fee (Binance spot)

    if (state.balance < cost + fee) {
      return; // Insufficient balance
    }

    // Update state
    state.balance -= cost + fee;

    // Update position (weighted average entry price)
    if (state.position === 0) {
      state.avgEntryPrice = price;
    } else {
      state.avgEntryPrice =
        (state.position * state.avgEntryPrice + quantity * price) / (state.position + quantity);
    }

    state.position += quantity;

    state.trades.push({
      type: 'BUY',
      price,
      quantity,
      timestamp: candle.timestamp,
      pnl: 0, // No realized PnL on entry
    });
  }

  /**
   * Execute SELL signal
   * Simplified: Sell entire position
   */
  private executeSell(state: SimulationState, candle: Candle): void {
    if (state.position <= 0) {
      return; // No position to sell
    }

    const price = candle.close;
    const quantity = state.position;
    const revenue = quantity * price;
    const fee = revenue * 0.001; // 0.1% fee

    // Calculate realized PnL
    const pnl = (price - state.avgEntryPrice) * quantity - fee;

    // Update state
    state.balance += revenue - fee;
    state.position = 0;
    state.avgEntryPrice = 0;

    state.trades.push({
      type: 'SELL',
      price,
      quantity,
      timestamp: candle.timestamp,
      pnl,
    });
  }

  /**
   * Calculate current equity (balance + unrealized position value)
   */
  private calculateEquity(state: SimulationState, currentPrice: number): number {
    const positionValue = state.position * currentPrice;
    return state.balance + positionValue;
  }

  /**
   * Calculate maximum drawdown
   * Returns decimal (e.g., 0.15 = 15% drawdown)
   */
  private calculateMaxDrawdown(equityCurve: number[]): number {
    let maxDrawdown = 0;
    let peak = equityCurve[0];

    for (const equity of equityCurve) {
      if (equity > peak) {
        peak = equity;
      }

      const drawdown = (peak - equity) / peak;
      if (drawdown > maxDrawdown) {
        maxDrawdown = drawdown;
      }
    }

    return maxDrawdown;
  }

  /**
   * Calculate Sharpe Ratio
   * Simplified: Using trade PnL returns
   */
  private calculateSharpeRatio(trades: Trade[], initialBalance: number): number | null {
    const sellTrades = trades.filter((t) => t.type === 'SELL');

    if (sellTrades.length < 2) {
      return null; // Not enough data
    }

    // Calculate returns
    const returns = sellTrades.map((t) => t.pnl / initialBalance);

    // Mean return
    const meanReturn = returns.reduce((sum, r) => sum + r, 0) / returns.length;

    // Standard deviation
    const variance =
      returns.reduce((sum, r) => sum + Math.pow(r - meanReturn, 2), 0) / returns.length;
    const stdDev = Math.sqrt(variance);

    if (stdDev === 0) {
      return null; // No variation
    }

    // Sharpe ratio (assuming risk-free rate = 0 for simplicity)
    return meanReturn / stdDev;
  }
}
