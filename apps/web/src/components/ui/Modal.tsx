'use client';

import { cn } from '@/lib/utils';
import { X } from 'lucide-react';
import { useEffect, type ReactNode } from 'react';
import { Button } from './Button';

interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title?: string;
  children: ReactNode;
  size?: 'sm' | 'md' | 'lg' | 'xl';
}

export function Modal({ isOpen, onClose, title, children, size = 'md' }: ModalProps) {
  useEffect(() => {
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose();
      }
    };

    if (isOpen) {
      document.addEventListener('keydown', handleEscape);
      document.body.style.overflow = 'hidden';
    }

    return () => {
      document.removeEventListener('keydown', handleEscape);
      document.body.style.overflow = 'unset';
    };
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const sizeClasses = {
    sm: 'max-w-md',
    md: 'max-w-lg',
    lg: 'max-w-2xl',
    xl: 'max-w-4xl',
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6">
      {/* Backdrop */}
      <div className="fixed inset-0 bg-background/80 backdrop-blur-sm" onClick={onClose} />

      {/* Modal */}
      <div
        className={cn(
          'relative bg-card border rounded-lg shadow-lg w-full',
          sizeClasses[size],
          'max-h-[90vh] overflow-y-auto'
        )}
      >
        {title && (
          <div className="flex items-center justify-between p-4 sm:p-6 border-b sticky top-0 bg-card z-10">
            <h2 className="text-base sm:text-lg font-semibold pr-8">{title}</h2>
            <Button variant="ghost" size="sm" onClick={onClose} className="absolute right-2 top-2">
              <X className="h-4 w-4" />
            </Button>
          </div>
        )}

        {!title && (
          <div className="absolute right-2 top-2 z-10">
            <Button variant="ghost" size="sm" onClick={onClose}>
              <X className="h-4 w-4" />
            </Button>
          </div>
        )}

        <div className={cn('p-4 sm:p-6', !title && 'pt-12')}>{children}</div>
      </div>
    </div>
  );
}
