'use client';

import { OrderDetails } from '@/components/orders/OrderDetails';
import { OrdersTable } from '@/components/orders/OrdersTable';
import { Alert } from '@/components/ui/Alert';
import { Button } from '@/components/ui/Button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { LoadingSpinner, PageLoading } from '@/components/ui/LoadingSpinner';
import { Modal } from '@/components/ui/Modal';
import { useAuth } from '@/hooks/useAuth';
import { orderApi } from '@/lib/api/orders';
import type { FillResponse, OrderResponse } from '@/types/order';
import { RefreshCw } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';

export default function OrdersPage() {
  const { auth } = useAuth();
  const router = useRouter();

  const [orders, setOrders] = useState<OrderResponse[]>([]);
  const [selectedOrder, setSelectedOrder] = useState<OrderResponse | null>(null);
  const [fills, setFills] = useState<FillResponse[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingFills, setIsLoadingFills] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isCanceling, setIsCanceling] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // Modal states
  const [isDetailsModalOpen, setIsDetailsModalOpen] = useState(false);
  const [isCancelModalOpen, setIsCancelModalOpen] = useState(false);
  const [orderToCancel, setOrderToCancel] = useState<OrderResponse | null>(null);

  useEffect(() => {
    if (!auth.isLoading && !auth.isAuthenticated) {
      router.push('/login');
    }
  }, [auth.isAuthenticated, auth.isLoading, router]);

  useEffect(() => {
    if (auth.isAuthenticated) {
      void loadOrders();
    }
  }, [auth.isAuthenticated]);

  const loadOrders = async () => {
    try {
      setIsLoading(true);
      setError(null);
      const data = await orderApi.list();
      // Sort by createdAt descending (newest first)
      const sorted = data.sort(
        (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
      );
      setOrders(sorted);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load orders');
    } finally {
      setIsLoading(false);
    }
  };

  const handleRefresh = async () => {
    try {
      setIsRefreshing(true);
      setError(null);
      const data = await orderApi.list();
      const sorted = data.sort(
        (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
      );
      setOrders(sorted);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to refresh orders');
    } finally {
      setIsRefreshing(false);
    }
  };

  const handleViewDetails = async (order: OrderResponse) => {
    setSelectedOrder(order);
    setIsDetailsModalOpen(true);
    setIsLoadingFills(true);
    setFills([]);

    try {
      const fillsData = await orderApi.getFills(order.id);
      setFills(fillsData);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load fills');
    } finally {
      setIsLoadingFills(false);
    }
  };

  const handleCancelClick = (order: OrderResponse) => {
    setOrderToCancel(order);
    setIsCancelModalOpen(true);
  };

  const handleCancelConfirm = async () => {
    if (!orderToCancel) return;

    try {
      setIsCanceling(true);
      setError(null);
      await orderApi.cancel(orderToCancel.id);
      setIsCancelModalOpen(false);
      setOrderToCancel(null);
      setSuccessMessage(`Order ${orderToCancel.symbol} canceled successfully`);
      setTimeout(() => setSuccessMessage(null), 3000);

      // Refresh orders list
      await loadOrders();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to cancel order');
    } finally {
      setIsCanceling(false);
    }
  };

  if (auth.isLoading || !auth.isAuthenticated) {
    return <PageLoading />;
  }

  if (isLoading) {
    return <PageLoading />;
  }

  return (
    <div className="container mx-auto py-8 px-4">
      <div className="mb-6">
        <div className="flex justify-between items-center mb-4">
          <h1 className="text-3xl font-bold">Orders</h1>
          <Button onClick={handleRefresh} disabled={isRefreshing}>
            <RefreshCw className={`h-4 w-4 mr-2 ${isRefreshing ? 'animate-spin' : ''}`} />
            {isRefreshing ? 'Refreshing...' : 'Refresh'}
          </Button>
        </div>

        {successMessage && <Alert variant="success">{successMessage}</Alert>}
        {error && <Alert variant="destructive">{error}</Alert>}
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Your Orders</CardTitle>
        </CardHeader>
        <CardContent>
          <OrdersTable
            orders={orders}
            onCancel={handleCancelClick}
            onViewDetails={handleViewDetails}
          />
        </CardContent>
      </Card>

      {/* Order Details Modal */}
      <Modal
        isOpen={isDetailsModalOpen}
        onClose={() => {
          setIsDetailsModalOpen(false);
          setSelectedOrder(null);
          setFills([]);
        }}
        title="Order Details"
        size="lg"
      >
        {selectedOrder && (
          <>
            {isLoadingFills ? (
              <div className="flex justify-center py-12">
                <LoadingSpinner size="lg" />
              </div>
            ) : (
              <OrderDetails order={selectedOrder} fills={fills} />
            )}
          </>
        )}
      </Modal>

      {/* Cancel Confirmation Modal */}
      <Modal
        isOpen={isCancelModalOpen}
        onClose={() => {
          setIsCancelModalOpen(false);
          setOrderToCancel(null);
        }}
        title="Cancel Order"
      >
        <div className="space-y-4">
          <p className="text-gray-700">Are you sure you want to cancel this order?</p>
          {orderToCancel && (
            <div className="p-4 bg-gray-50 rounded">
              <dl className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <dt className="font-medium text-gray-500">Symbol:</dt>
                  <dd className="font-semibold">{orderToCancel.symbol}</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="font-medium text-gray-500">Side:</dt>
                  <dd>{orderToCancel.side}</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="font-medium text-gray-500">Quantity:</dt>
                  <dd>{orderToCancel.quantity}</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="font-medium text-gray-500">Status:</dt>
                  <dd>{orderToCancel.status}</dd>
                </div>
              </dl>
            </div>
          )}
          <div className="flex gap-2 justify-end">
            <Button
              variant="outline"
              onClick={() => {
                setIsCancelModalOpen(false);
                setOrderToCancel(null);
              }}
              disabled={isCanceling}
            >
              No, Keep Order
            </Button>
            <Button variant="destructive" onClick={handleCancelConfirm} disabled={isCanceling}>
              {isCanceling ? 'Canceling...' : 'Yes, Cancel Order'}
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
