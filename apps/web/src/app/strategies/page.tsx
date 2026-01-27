'use client';

import { StrategyForm } from '@/components/strategies/StrategyForm';
import { StrategyList } from '@/components/strategies/StrategyList';
import { Alert } from '@/components/ui/Alert';
import { Button } from '@/components/ui/Button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { LoadingSpinner, PageLoading } from '@/components/ui/LoadingSpinner';
import { Modal } from '@/components/ui/Modal';
import { useAuth } from '@/hooks/useAuth';
import { strategyApi } from '@/lib/api/strategies';
import type { CreateStrategyRequest, Strategy, StrategyFormData } from '@/types/strategy';
import { Plus } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';

export default function StrategiesPage() {
  const { auth } = useAuth();
  const router = useRouter();

  const [strategies, setStrategies] = useState<Strategy[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // Modal states
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [isStartModalOpen, setIsStartModalOpen] = useState(false);
  const [isStopModalOpen, setIsStopModalOpen] = useState(false);
  const [selectedStrategy, setSelectedStrategy] = useState<Strategy | null>(null);
  const [selectedMode, setSelectedMode] = useState<'PAPER' | 'LIVE'>('PAPER');
  const [isDeleting, setIsDeleting] = useState(false);
  const [isStarting, setIsStarting] = useState(false);
  const [isStopping, setIsStopping] = useState(false);

  useEffect(() => {
    if (!auth.isLoading && !auth.isAuthenticated) {
      router.push('/login');
    }
  }, [auth.isAuthenticated, auth.isLoading, router]);

  useEffect(() => {
    if (auth.isAuthenticated) {
      void loadStrategies();
    }
  }, [auth.isAuthenticated]);

  const loadStrategies = async () => {
    try {
      setIsLoading(true);
      setError(null);
      const data = await strategyApi.list();
      setStrategies(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load strategies');
    } finally {
      setIsLoading(false);
    }
  };

  const handleCreateStrategy = async (formData: StrategyFormData) => {
    const payload: CreateStrategyRequest = {
      name: formData.name,
      type: formData.type,
      symbol: formData.symbol,
      timeframe: formData.timeframe,
      risk: {
        maxPositionSize: parseFloat(formData.maxPositionSize),
      },
    };

    if (formData.type === 'DCA') {
      payload.dca = {
        intervalSeconds: parseInt(formData.intervalSeconds, 10),
        amountPerOrder: parseFloat(formData.amountPerOrder),
      };
    } else if (formData.type === 'GRID') {
      payload.grid = {
        lowerBound: parseFloat(formData.lowerBound),
        upperBound: parseFloat(formData.upperBound),
        gridLevels: parseInt(formData.gridLevels, 10),
      };
    } else if (formData.type === 'SWING') {
      payload.swing = {
        entryRule: formData.entryRule,
        exitRule: formData.exitRule,
      };
    }

    await strategyApi.create(payload);
    setIsCreateModalOpen(false);
    setSuccessMessage('Strategy created successfully');
    await loadStrategies();
    setTimeout(() => setSuccessMessage(null), 3000);
  };

  const handleUpdateStrategy = async (formData: StrategyFormData) => {
    if (!selectedStrategy) return;

    const payload: CreateStrategyRequest = {
      name: formData.name,
      type: formData.type,
      symbol: formData.symbol,
      timeframe: formData.timeframe,
      risk: {
        maxPositionSize: parseFloat(formData.maxPositionSize),
      },
    };

    if (formData.type === 'DCA') {
      payload.dca = {
        intervalSeconds: parseInt(formData.intervalSeconds, 10),
        amountPerOrder: parseFloat(formData.amountPerOrder),
      };
    } else if (formData.type === 'GRID') {
      payload.grid = {
        lowerBound: parseFloat(formData.lowerBound),
        upperBound: parseFloat(formData.upperBound),
        gridLevels: parseInt(formData.gridLevels, 10),
      };
    } else if (formData.type === 'SWING') {
      payload.swing = {
        entryRule: formData.entryRule,
        exitRule: formData.exitRule,
      };
    }

    await strategyApi.update(selectedStrategy.id, payload);
    setIsEditModalOpen(false);
    setSelectedStrategy(null);
    setSuccessMessage('Strategy updated successfully');
    await loadStrategies();
    setTimeout(() => setSuccessMessage(null), 3000);
  };

  const handleDeleteStrategy = async () => {
    if (!selectedStrategy) return;

    try {
      setIsDeleting(true);
      setError(null);
      await strategyApi.delete(selectedStrategy.id);
      setIsDeleteModalOpen(false);
      setSelectedStrategy(null);
      setSuccessMessage('Strategy deleted successfully');
      await loadStrategies();
      setTimeout(() => setSuccessMessage(null), 3000);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete strategy');
    } finally {
      setIsDeleting(false);
    }
  };

  const openEditModal = (strategy: Strategy) => {
    setSelectedStrategy(strategy);
    setIsEditModalOpen(true);
  };

  const openDeleteModal = (strategy: Strategy) => {
    setSelectedStrategy(strategy);
    setIsDeleteModalOpen(true);
  };

  const openStartModal = (strategy: Strategy) => {
    setSelectedStrategy(strategy);
    setSelectedMode('PAPER'); // Default to PAPER mode
    setIsStartModalOpen(true);
  };

  const openStopModal = (strategy: Strategy) => {
    setSelectedStrategy(strategy);
    setIsStopModalOpen(true);
  };

  const handleStartStrategy = async () => {
    if (!selectedStrategy) return;

    try {
      setIsStarting(true);
      setError(null);
      await strategyApi.start(selectedStrategy.id, selectedMode);
      setIsStartModalOpen(false);
      setSelectedStrategy(null);
      setSuccessMessage(`Strategy started in ${selectedMode} mode`);
      await loadStrategies();
      setTimeout(() => setSuccessMessage(null), 3000);
    } catch (err) {
      // Handle kill switch and service unavailable errors
      if (err instanceof Error) {
        setError(err.message);
      } else {
        setError('Failed to start strategy');
      }
    } finally {
      setIsStarting(false);
    }
  };

  const handleStopStrategy = async () => {
    if (!selectedStrategy) return;

    try {
      setIsStopping(true);
      setError(null);
      await strategyApi.stop(selectedStrategy.id);
      setIsStopModalOpen(false);
      setSelectedStrategy(null);
      setSuccessMessage('Strategy stopped successfully');
      await loadStrategies();
      setTimeout(() => setSuccessMessage(null), 3000);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to stop strategy');
    } finally {
      setIsStopping(false);
    }
  };

  if (auth.isLoading || !auth.isAuthenticated) {
    return <PageLoading />;
  }

  return (
    <div className="container mx-auto py-4 sm:py-8 px-4">
      <div className="mb-4 sm:mb-6">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-4">
          <h1 className="text-2xl sm:text-3xl font-bold">Strategies</h1>
          <Button onClick={() => setIsCreateModalOpen(true)} className="w-full sm:w-auto">
            <Plus className="h-4 w-4 mr-2" />
            <span className="sm:inline">Create Strategy</span>
          </Button>
        </div>

        {successMessage && <Alert variant="success">{successMessage}</Alert>}
        {error && <Alert variant="destructive">{error}</Alert>}
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg sm:text-xl">Your Strategies</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex justify-center py-12">
              <LoadingSpinner size="lg" />
            </div>
          ) : strategies.length === 0 ? (
            <div className="text-center py-12">
              <p className="text-gray-500 mb-4">No strategies yet</p>
              <Button onClick={() => setIsCreateModalOpen(true)}>
                <Plus className="h-4 w-4 mr-2" />
                Create Your First Strategy
              </Button>
            </div>
          ) : (
            <StrategyList
              strategies={strategies}
              onEdit={openEditModal}
              onDelete={openDeleteModal}
              onStart={openStartModal}
              onStop={openStopModal}
            />
          )}
        </CardContent>
      </Card>

      {/* Create Strategy Modal */}
      <Modal
        isOpen={isCreateModalOpen}
        onClose={() => setIsCreateModalOpen(false)}
        title="Create New Strategy"
        size="lg"
      >
        <StrategyForm
          onSubmit={handleCreateStrategy}
          onCancel={() => setIsCreateModalOpen(false)}
        />
      </Modal>

      {/* Edit Strategy Modal */}
      <Modal
        isOpen={isEditModalOpen}
        onClose={() => {
          setIsEditModalOpen(false);
          setSelectedStrategy(null);
        }}
        title="Edit Strategy"
        size="lg"
      >
        {selectedStrategy && (
          <StrategyForm
            strategy={selectedStrategy}
            onSubmit={handleUpdateStrategy}
            onCancel={() => {
              setIsEditModalOpen(false);
              setSelectedStrategy(null);
            }}
          />
        )}
      </Modal>

      {/* Delete Confirmation Modal */}
      <Modal
        isOpen={isDeleteModalOpen}
        onClose={() => {
          setIsDeleteModalOpen(false);
          setSelectedStrategy(null);
        }}
        title="Delete Strategy"
      >
        <div className="space-y-4">
          <p className="text-gray-700">
            Are you sure you want to delete{' '}
            <span className="font-semibold">{selectedStrategy?.config.name}</span>? This action
            cannot be undone.
          </p>
          <div className="flex gap-2 justify-end">
            <Button
              variant="outline"
              onClick={() => {
                setIsDeleteModalOpen(false);
                setSelectedStrategy(null);
              }}
              disabled={isDeleting}
            >
              Cancel
            </Button>
            <Button variant="destructive" onClick={handleDeleteStrategy} disabled={isDeleting}>
              {isDeleting ? 'Deleting...' : 'Delete'}
            </Button>
          </div>
        </div>
      </Modal>

      {/* Start Strategy Modal */}
      <Modal
        isOpen={isStartModalOpen}
        onClose={() => {
          setIsStartModalOpen(false);
          setSelectedStrategy(null);
        }}
        title="Start Strategy"
      >
        <div className="space-y-4">
          <p className="text-gray-700">
            Start strategy <span className="font-semibold">{selectedStrategy?.config.name}</span>?
          </p>
          <div className="space-y-2">
            <label className="block text-sm font-medium text-gray-700">Select Mode</label>
            <div className="flex gap-4">
              <label className="flex items-center">
                <input
                  type="radio"
                  name="mode"
                  value="PAPER"
                  checked={selectedMode === 'PAPER'}
                  onChange={(e) => setSelectedMode(e.target.value as 'PAPER' | 'LIVE')}
                  className="mr-2"
                />
                <span>PAPER (Simulation)</span>
              </label>
              <label className="flex items-center">
                <input
                  type="radio"
                  name="mode"
                  value="LIVE"
                  checked={selectedMode === 'LIVE'}
                  onChange={(e) => setSelectedMode(e.target.value as 'PAPER' | 'LIVE')}
                  className="mr-2"
                />
                <span className="text-orange-600 font-medium">LIVE (Real Trading)</span>
              </label>
            </div>
          </div>
          <div className="flex gap-2 justify-end">
            <Button
              variant="outline"
              onClick={() => {
                setIsStartModalOpen(false);
                setSelectedStrategy(null);
              }}
              disabled={isStarting}
            >
              Cancel
            </Button>
            <Button onClick={handleStartStrategy} disabled={isStarting}>
              {isStarting ? 'Starting...' : 'Start Strategy'}
            </Button>
          </div>
        </div>
      </Modal>

      {/* Stop Strategy Modal */}
      <Modal
        isOpen={isStopModalOpen}
        onClose={() => {
          setIsStopModalOpen(false);
          setSelectedStrategy(null);
        }}
        title="Stop Strategy"
      >
        <div className="space-y-4">
          <p className="text-gray-700">
            Are you sure you want to stop{' '}
            <span className="font-semibold">{selectedStrategy?.config.name}</span>?
          </p>
          <p className="text-sm text-gray-600">
            This will stop all automated trading for this strategy. Any open orders will remain
            open.
          </p>
          <div className="flex gap-2 justify-end">
            <Button
              variant="outline"
              onClick={() => {
                setIsStopModalOpen(false);
                setSelectedStrategy(null);
              }}
              disabled={isStopping}
            >
              Cancel
            </Button>
            <Button variant="destructive" onClick={handleStopStrategy} disabled={isStopping}>
              {isStopping ? 'Stopping...' : 'Stop Strategy'}
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
