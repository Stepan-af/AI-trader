'use client';

import { Button } from '@/components/ui/Button';
import { useAuth } from '@/hooks/useAuth';
import { LogOut, Menu } from 'lucide-react';
import { useState } from 'react';
import { Navigation } from './Navigation';
import { Sidebar } from './Sidebar';

export function Header() {
  const { auth, logout } = useAuth();
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);

  if (!auth.isAuthenticated) {
    return null;
  }

  return (
    <>
      <header className="border-b bg-card sticky top-0 z-40">
        <div className="container mx-auto px-4 h-16 flex items-center justify-between">
          <div className="flex items-center space-x-6">
            {/* Mobile menu button */}
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setIsSidebarOpen(true)}
              className="md:hidden"
            >
              <Menu className="h-4 w-4" />
            </Button>

            {/* Logo */}
            <div className="flex items-center space-x-4">
              <h1 className="text-xl font-bold">AI Trader</h1>
            </div>

            {/* Desktop Navigation */}
            <div className="hidden md:block">
              <Navigation />
            </div>
          </div>

          {/* User menu */}
          <div className="flex items-center space-x-4">
            <span className="text-sm text-muted-foreground hidden sm:block">
              {auth.user?.email}
            </span>
            <Button
              variant="ghost"
              size="sm"
              onClick={logout}
              className="flex items-center space-x-2"
            >
              <LogOut className="h-4 w-4" />
              <span className="hidden sm:inline">Logout</span>
            </Button>
          </div>
        </div>
      </header>

      {/* Mobile Sidebar */}
      <Sidebar
        isOpen={isSidebarOpen}
        onClose={() => setIsSidebarOpen(false)}
        className="md:hidden"
      />
    </>
  );
}
