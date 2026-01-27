'use client';

import { useAuth } from '@/hooks/useAuth';
import { WebSocketClient, type WebSocketEvent } from '@/lib/websocket';
import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react';

interface WebSocketContextValue {
  isConnected: boolean;
  subscribe: (handler: (event: WebSocketEvent) => void) => () => void;
}

const WebSocketContext = createContext<WebSocketContextValue | null>(null);

export function WebSocketProvider({ children }: { children: ReactNode }) {
  const { auth } = useAuth();
  const clientRef = useRef<WebSocketClient | null>(null);
  const [isConnected, setIsConnected] = useState(false);

  useEffect(() => {
    if (!auth.isAuthenticated || !auth.accessToken) {
      // Disconnect when not authenticated
      if (clientRef.current) {
        clientRef.current.disconnect();
        clientRef.current = null;
      }
      setIsConnected(false);
      return;
    }

    // Create and connect WebSocket client
    const client = new WebSocketClient(auth.accessToken);
    clientRef.current = client;
    client.connect();

    // Check connection status periodically
    const checkInterval = setInterval(() => {
      setIsConnected(client.isConnected());
    }, 1000);

    return () => {
      clearInterval(checkInterval);
      client.disconnect();
      clientRef.current = null;
      setIsConnected(false);
    };
  }, [auth.isAuthenticated, auth.accessToken]);

  const subscribe = (handler: (event: WebSocketEvent) => void): (() => void) => {
    if (!clientRef.current) {
      return () => {}; // No-op unsubscribe
    }
    return clientRef.current.subscribe(handler);
  };

  const value: WebSocketContextValue = {
    isConnected,
    subscribe,
  };

  return <WebSocketContext.Provider value={value}>{children}</WebSocketContext.Provider>;
}

export function useWebSocket(): WebSocketContextValue {
  const context = useContext(WebSocketContext);

  if (!context) {
    throw new Error('useWebSocket must be used within WebSocketProvider');
  }

  return context;
}
