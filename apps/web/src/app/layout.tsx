import { ErrorBoundary } from '@/components/ui/ErrorBoundary';
import { AuthProvider } from '@/hooks/useAuth';
import { KillSwitchProvider } from '@/hooks/useKillSwitch';
import { WebSocketProvider } from '@/hooks/useWebSocket';
import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import './globals.css';

const inter = Inter({ subsets: ['latin'] });

export const metadata: Metadata = {
  title: 'AI Trader - Trading Platform',
  description: 'Automated trading platform for strategies, backtesting, and portfolio management',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className={inter.className}>
        <ErrorBoundary>
          <AuthProvider>
            <KillSwitchProvider>
              <WebSocketProvider>{children}</WebSocketProvider>
            </KillSwitchProvider>
          </AuthProvider>
        </ErrorBoundary>
      </body>
    </html>
  );
}
