// WebSocket client for real-time updates

type WebSocketEventType =
  | 'ORDER_FILLED'
  | 'ORDER_PARTIALLY_FILLED'
  | 'PORTFOLIO_UPDATED'
  | 'KILL_SWITCH_ACTIVATED'
  | 'SYSTEM_RECOVERY_COMPLETE';

interface BaseWebSocketEvent {
  type: WebSocketEventType;
  timestamp: string;
}

export interface OrderFilledEvent extends BaseWebSocketEvent {
  type: 'ORDER_FILLED';
  order_id: string;
  fill_id: string;
  price: number;
  quantity: number;
}

export interface OrderPartiallyFilledEvent extends BaseWebSocketEvent {
  type: 'ORDER_PARTIALLY_FILLED';
  order_id: string;
  fill_id: string;
  filled_quantity: number;
  remaining_quantity: number;
}

export interface PortfolioUpdatedEvent extends BaseWebSocketEvent {
  type: 'PORTFOLIO_UPDATED';
  balance: number;
  unrealized_pnl: number;
  data_as_of_timestamp: string;
  is_stale: boolean;
}

export interface KillSwitchActivatedEvent extends BaseWebSocketEvent {
  type: 'KILL_SWITCH_ACTIVATED';
  reason: string;
  stopped_strategy_count: number;
  cancellation_status: string;
}

export interface SystemRecoveryCompleteEvent extends BaseWebSocketEvent {
  type: 'SYSTEM_RECOVERY_COMPLETE';
  recovery_duration_ms: number;
  stopped_strategies: Array<{ id: string; name: string; mode: string }>;
  reconciled_order_count: number;
  message: string;
}

export type WebSocketEvent =
  | OrderFilledEvent
  | OrderPartiallyFilledEvent
  | PortfolioUpdatedEvent
  | KillSwitchActivatedEvent
  | SystemRecoveryCompleteEvent;

export type WebSocketEventHandler = (event: WebSocketEvent) => void;

export class WebSocketClient {
  private ws: WebSocket | null = null;
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 5;
  private reconnectDelay = 1000; // Start with 1 second
  private eventHandlers: WebSocketEventHandler[] = [];
  private url: string;
  private shouldReconnect = true;

  constructor(token: string, baseUrl?: string) {
    // Use environment variable or default to relative path
    const wsBaseUrl = baseUrl || this.getWebSocketUrl();
    this.url = `${wsBaseUrl}/ws?token=${token}`;
  }

  private getWebSocketUrl(): string {
    // Convert http(s) to ws(s)
    const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api/v1';
    return apiUrl.replace('http://', 'ws://').replace('https://', 'wss://');
  }

  connect(): void {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      return; // Already connected
    }

    try {
      this.ws = new WebSocket(this.url);

      this.ws.onopen = () => {
        console.log('[WebSocket] Connected');
        this.reconnectAttempts = 0;
        this.reconnectDelay = 1000;
      };

      this.ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data) as WebSocketEvent;
          this.notifyHandlers(data);
        } catch (error) {
          console.error('[WebSocket] Failed to parse message:', error);
        }
      };

      this.ws.onerror = (error) => {
        console.error('[WebSocket] Error:', error);
      };

      this.ws.onclose = () => {
        console.log('[WebSocket] Disconnected');
        this.ws = null;

        if (this.shouldReconnect && this.reconnectAttempts < this.maxReconnectAttempts) {
          this.reconnectAttempts++;
          const delay = this.reconnectDelay * Math.pow(2, this.reconnectAttempts - 1);
          console.log(`[WebSocket] Reconnecting in ${delay}ms (attempt ${this.reconnectAttempts})`);
          setTimeout(() => this.connect(), delay);
        }
      };
    } catch (error) {
      console.error('[WebSocket] Failed to connect:', error);
    }
  }

  disconnect(): void {
    this.shouldReconnect = false;
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
  }

  subscribe(handler: WebSocketEventHandler): () => void {
    this.eventHandlers.push(handler);
    return () => {
      this.eventHandlers = this.eventHandlers.filter((h) => h !== handler);
    };
  }

  private notifyHandlers(event: WebSocketEvent): void {
    this.eventHandlers.forEach((handler) => {
      try {
        handler(event);
      } catch (error) {
        console.error('[WebSocket] Handler error:', error);
      }
    });
  }

  isConnected(): boolean {
    return this.ws !== null && this.ws.readyState === WebSocket.OPEN;
  }
}
