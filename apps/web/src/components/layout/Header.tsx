'use client';

import { useAuth } from '@/hooks/useAuth';
import { Button } from '@/components/ui/Button';
import { LogOut } from 'lucide-react';

export function Header() {
  const { auth, logout } = useAuth();

  if (!auth.isAuthenticated) {
    return null;
  }

  return (
    <header className="border-b bg-card">
      <div className="container mx-auto px-4 h-16 flex items-center justify-between">
        <div className="flex items-center space-x-4">
          <h1 className="text-xl font-bold">AI Trader</h1>
        </div>
        
        <div className="flex items-center space-x-4">
          <span className="text-sm text-muted-foreground">
            {auth.user?.email}
          </span>
          <Button
            variant="ghost"
            size="sm"
            onClick={logout}
            className="flex items-center space-x-2"
          >
            <LogOut className="h-4 w-4" />
            <span>Logout</span>
          </Button>
        </div>
      </div>
    </header>
  );
}
