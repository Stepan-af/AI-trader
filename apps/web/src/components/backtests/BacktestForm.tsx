'use client';

import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import type { BacktestFormData } from '@/types/backtest';
import type { Strategy } from '@/types/strategy';
import React, { useEffect, useState } from 'react';

interface BacktestFormProps {
  strategies: Strategy[];
  onSubmit: (data: BacktestFormData) => Promise<void>;
  onCancel: () => void;
}

export function BacktestForm({ strategies, onSubmit, onCancel }: BacktestFormProps) {
  // Default date range: last 6 months to now
  const getDefaultDates = () => {
    const now = new Date();
    const sixMonthsAgo = new Date();
    sixMonthsAgo.setMonth(now.getMonth() - 6);

    return {
      from: sixMonthsAgo.toISOString().split('T')[0],
      to: now.toISOString().split('T')[0],
    };
  };

  const defaultDates = getDefaultDates();

  const [formData, setFormData] = useState<BacktestFormData>({
    strategyId: strategies.length > 0 ? strategies[0].id : '',
    fromDate: defaultDates.from,
    toDate: defaultDates.to,
    initialBalance: '10000',
  });

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (strategies.length > 0 && !formData.strategyId) {
      setFormData((prev) => ({ ...prev, strategyId: strategies[0].id }));
    }
  }, [strategies, formData.strategyId]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    // Validation
    if (!formData.strategyId) {
      setError('Please select a strategy');
      return;
    }

    const fromDate = new Date(formData.fromDate);
    const toDate = new Date(formData.toDate);

    if (toDate <= fromDate) {
      setError('End date must be after start date');
      return;
    }

    if (toDate > new Date()) {
      setError('End date cannot be in the future');
      return;
    }

    const balance = parseFloat(formData.initialBalance);
    if (isNaN(balance) || balance <= 0) {
      setError('Initial balance must be greater than 0');
      return;
    }

    setIsSubmitting(true);

    try {
      await onSubmit(formData);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to start backtest');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleChange = (field: keyof BacktestFormData, value: string) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
  };

  if (strategies.length === 0) {
    return (
      <div className="text-center py-8">
        <p className="text-gray-600 mb-4">No strategies available. Create a strategy first.</p>
        <Button onClick={onCancel} variant="outline">
          Close
        </Button>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {error && (
        <div className="p-3 bg-red-50 border border-red-200 rounded text-red-700 text-sm">
          {error}
        </div>
      )}

      <div>
        <label className="block text-sm font-medium mb-1">Strategy</label>
        <select
          value={formData.strategyId}
          onChange={(e) => handleChange('strategyId', e.target.value)}
          className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
          required
        >
          {strategies.map((strategy) => (
            <option key={strategy.id} value={strategy.id}>
              {strategy.config.name} ({strategy.config.type} - {strategy.config.symbol})
            </option>
          ))}
        </select>
      </div>

      <div>
        <label className="block text-sm font-medium mb-1">Start Date</label>
        <Input
          type="date"
          value={formData.fromDate}
          onChange={(e) => handleChange('fromDate', e.target.value)}
          max={formData.toDate}
          required
        />
        <p className="text-xs text-gray-500 mt-1">Backtest from this date</p>
      </div>

      <div>
        <label className="block text-sm font-medium mb-1">End Date</label>
        <Input
          type="date"
          value={formData.toDate}
          onChange={(e) => handleChange('toDate', e.target.value)}
          min={formData.fromDate}
          max={new Date().toISOString().split('T')[0]}
          required
        />
        <p className="text-xs text-gray-500 mt-1">Backtest until this date</p>
      </div>

      <div>
        <label className="block text-sm font-medium mb-1">Initial Balance</label>
        <Input
          type="number"
          step="0.01"
          min="0"
          value={formData.initialBalance}
          onChange={(e) => handleChange('initialBalance', e.target.value)}
          placeholder="10000"
          required
        />
        <p className="text-xs text-gray-500 mt-1">Starting capital in quote currency</p>
      </div>

      <div className="flex gap-2 justify-end pt-4">
        <Button type="button" variant="outline" onClick={onCancel} disabled={isSubmitting}>
          Cancel
        </Button>
        <Button type="submit" disabled={isSubmitting}>
          {isSubmitting ? 'Starting...' : 'Start Backtest'}
        </Button>
      </div>
    </form>
  );
}
