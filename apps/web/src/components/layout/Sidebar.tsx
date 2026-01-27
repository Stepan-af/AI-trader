'use client';

import { Button } from '@/components/ui/Button';
import { cn } from '@/lib/utils';
import { X } from 'lucide-react';
import { MobileNavigation } from './Navigation';

interface SidebarProps {
  isOpen: boolean;
  onClose: () => void;
  className?: string;
}

export function Sidebar({ isOpen, onClose, className }: SidebarProps) {
  return (
    <>
      {/* Mobile overlay */}
      {isOpen && (
        <div
          className="fixed inset-0 z-40 bg-background/80 backdrop-blur-sm md:hidden"
          onClick={onClose}
        />
      )}

      {/* Sidebar */}
      <div
        className={cn(
          'fixed inset-y-0 left-0 z-50 w-64 bg-card border-r transform transition-transform duration-200 ease-in-out md:relative md:transform-none',
          isOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0',
          className
        )}
      >
        <div className="flex flex-col h-full">
          {/* Header */}
          <div className="flex items-center justify-between p-6 border-b">
            <h2 className="text-lg font-semibold">AI Trader</h2>
            <Button variant="ghost" size="sm" onClick={onClose} className="md:hidden">
              <X className="h-4 w-4" />
            </Button>
          </div>

          {/* Navigation */}
          <div className="flex-1 p-6">
            <MobileNavigation />
          </div>

          {/* Footer */}
          <div className="p-6 border-t">
            <div className="text-xs text-muted-foreground">Trading Platform v0.1</div>
          </div>
        </div>
      </div>
    </>
  );
}
