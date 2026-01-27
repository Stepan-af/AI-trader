'use client';

import { OrderDetails } from '@/components/orders/OrderDetails';
import { OrdersTable } from '@/components/orders/OrdersTable';
import { Alert } from '@/components/ui/Alert';
import { Button } from '@/components/ui/Button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { EmptyState } from '@/components/ui/EmptyState';
import { LoadingSpinner, PageLoading } from '@/components/ui/LoadingSpinner';
import { Modal } from '@/components/ui/Modal';
import { TableSkeleton } from '@/components/ui/Skeleton';
import { useAuth } from '@/hooks/useAuth';
import { useWebSocket } from '@/hooks/useWebSocket';
import { orderApi } from '@/lib/api/orders';
import { retryWithBackoff } from '@/lib/retry';
import type { WebSocketEvent } from '@/lib/websocket';
import type { FillResponse, OrderResponse } from '@/types/order';
import { RefreshCw, ShoppingCart, AlertCircle } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';

export default function OrdersPage() {
  const { auth } = useAuth();
  const { subscribe } = useWebSocket();
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
  const [retryCount, setRetryCount] = useState(0);

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

  // Subscribe to WebSocket events for real-time order updates
  useEffect(() => {
    const handleWebSocketEvent = (event: WebSocketEvent) => {
      if (event.type === 'ORDER_FILLED' || event.type === 'ORDER_PARTIALLY_FILLED') {
        // Refresh orders list when any order is filled
        void loadOrders();

        // Show success notification
        const message =
          event.type === 'ORDER_FILLED'
            ? `Order filled at ${event.price}`
            : `Order partially filled: ${event.filled_quantity} filled`;
        setSuccessMessage(message);
        setTimeout(() => setSuccessMessage(null), 5000);
      }
    };

    const unsubscribe = subscribe(handleWebSocketEvent);
    return unsubscribe;
  }, [subscribe]);

  const loadOrders = async () => {
    try {
      setIsLoading(true);
      setError(null);

      const data = await retryWithBackoff(
        async () => {
          return await orderApi.list();
        },
        {
          maxAttempts: 3,
          onRetry: (attempt) => {
            console.log(`Retrying orders load (attempt ${attempt})`);
            setRetryCount(attempt);
          },
        }
      );

      // Sort by createdAt descending (newest first)
      const sorted = data.sort(
        (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
      );
      setOrders(sorted);
      setRetryCount(0);
    } catch (err) {
      const errorMessage =
        err instanceof Error
          ? err.message
          : 'Unable to load orders. Please check your connection and try again.';
      setError(errorMessage);
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
      const errorMessage =
        err instanceof Error ? err.message : 'Unable to refresh orders. Please try again.';
      setError(errorMessage);
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
    return (
      <div className="container mx-auto py-8 px-4">
        <div className="mb-6">
          <h1 className="text-3xl font-bold mb-4">Orders</h1>
          {retryCount > 0 && (
            <Alert variant="default">
              <AlertCircle className="h-4 w-4" />
              Retrying connection (attempt {retryCount})...
            </Alert>
          )}
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Your Orders</CardTitle>
          </CardHeader>
          <CardContent>
            <TableSkeleton rows={5} />
          </CardContent>
        </Card>
      </div>
    );
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
        {error && (
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <div className="flex-1">{error}</div>
            <Button variant="outline" size="sm" onClick={() => void loadOrders()}>
              Retry
            </Button>
          </Alert>
        )}
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Your Orders</CardTitle>
        </CardHeader>
        <CardContent>
          {orders.length > 0 ? (
            <OrdersTable
              orders={orders}
              onCancel={handleCancelClick}
              onViewDetails={handleViewDetails}
            />
          ) : (
            <EmptyState
              icon={ShoppingCart}
              title="No orders yet"
              description="You haven't placed any orders yet. Orders will appear here once your strategies start executing."
            />
          )}
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
