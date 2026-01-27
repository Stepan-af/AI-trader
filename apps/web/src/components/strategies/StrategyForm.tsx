'use client';

import React, { useState } from 'react';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import type { Strategy, StrategyType, Timeframe, StrategyFormData } from '@/types/strategy';

interface StrategyFormProps {
  strategy?: Strategy;
  onSubmit: (data: StrategyFormData) => Promise<void>;
  onCancel: () => void;
}

const STRATEGY_TYPES: StrategyType[] = ['DCA', 'GRID', 'SWING'];
const TIMEFRAMES: Timeframe[] = ['1s', '1m', '5m', '15m', '1h', '4h', '1d'];

export function StrategyForm({ strategy, onSubmit, onCancel }: StrategyFormProps) {
  const [formData, setFormData] = useState<StrategyFormData>({
    name: strategy?.config.name || '',
    type: strategy?.config.type || 'SWING',
    symbol: strategy?.config.symbol || 'BTCUSDT',
    timeframe: strategy?.config.timeframe || '1m',
    entryRule: strategy?.config.swing?.entryRule || '',
    exitRule: strategy?.config.swing?.exitRule || '',
    maxPositionSize: strategy?.config.risk.maxPositionSize.toString() || '0.01',
  });

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setIsSubmitting(true);

    try {
      await onSubmit(formData);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save strategy');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleChange = (field: keyof StrategyFormData, value: string) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {error && (
        <div className="p-3 bg-red-50 border border-red-200 rounded text-red-700 text-sm">
          {error}
        </div>
      )}

      <div>
        <label className="block text-sm font-medium mb-1">Name</label>
        <Input
          type="text"
          value={formData.name}
          onChange={(e) => handleChange('name', e.target.value)}
          placeholder="RSI Swing Strategy"
          required
        />
      </div>

      <div>
        <label className="block text-sm font-medium mb-1">Type</label>
        <select
          value={formData.type}
          onChange={(e) => handleChange('type', e.target.value as StrategyType)}
          className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
          required
        >
          {STRATEGY_TYPES.map((type) => (
            <option key={type} value={type}>
              {type}
            </option>
          ))}
        </select>
      </div>

      <div>
        <label className="block text-sm font-medium mb-1">Symbol</label>
        <Input
          type="text"
          value={formData.symbol}
          onChange={(e) => handleChange('symbol', e.target.value.toUpperCase())}
          placeholder="BTCUSDT"
          required
        />
      </div>

      <div>
        <label className="block text-sm font-medium mb-1">Timeframe</label>
        <select
          value={formData.timeframe}
          onChange={(e) => handleChange('timeframe', e.target.value as Timeframe)}
          className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
          required
        >
          {TIMEFRAMES.map((tf) => (
            <option key={tf} value={tf}>
              {tf}
            </option>
          ))}
        </select>
      </div>

      {formData.type === 'SWING' && (
        <>
          <div>
            <label className="block text-sm font-medium mb-1">Entry Rule</label>
            <Input
              type="text"
              value={formData.entryRule}
              onChange={(e) => handleChange('entryRule', e.target.value)}
              placeholder="RSI < 30 AND CLOSE > SMA(200)"
              required={formData.type === 'SWING'}
            />
            <p className="text-xs text-gray-500 mt-1">
              Example: RSI &lt; 30 AND CLOSE &gt; SMA(200)
            </p>
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">Exit Rule</label>
            <Input
              type="text"
              value={formData.exitRule}
              onChange={(e) => handleChange('exitRule', e.target.value)}
              placeholder="RSI > 60"
              required={formData.type === 'SWING'}
            />
            <p className="text-xs text-gray-500 mt-1">
              Example: RSI &gt; 60
            </p>
          </div>
        </>
      )}

      <div>
        <label className="block text-sm font-medium mb-1">Max Position Size</label>
        <Input
          type="number"
          step="0.001"
          value={formData.maxPositionSize}
          onChange={(e) => handleChange('maxPositionSize', e.target.value)}
          placeholder="0.01"
          required
        />
        <p className="text-xs text-gray-500 mt-1">
          Maximum position size in base currency
        </p>
      </div>

      <div className="flex gap-2 justify-end pt-4">
        <Button type="button" variant="outline" onClick={onCancel} disabled={isSubmitting}>
          Cancel
        </Button>
        <Button type="submit" disabled={isSubmitting}>
          {isSubmitting ? 'Saving...' : strategy ? 'Update Strategy' : 'Create Strategy'}
        </Button>
      </div>
    </form>
  );
}
