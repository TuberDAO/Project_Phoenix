// Simplified toast hook for demo
// In production, use sonner or a full toast library

import { useState, useEffect } from 'react';

interface Toast {
  title: string;
  description?: string;
  variant?: 'default' | 'destructive';
}

let toastCallback: ((toast: Toast) => void) | null = null;

export function useToast() {
  const [toasts, setToasts] = useState<Toast[]>([]);

  useEffect(() => {
    toastCallback = (toast: Toast) => {
      setToasts(prev => [...prev, toast]);
      setTimeout(() => {
        setToasts(prev => prev.slice(1));
      }, 3000);
    };

    return () => {
      toastCallback = null;
    };
  }, []);

  return {
    toast: (toast: Toast) => {
      if (toastCallback) {
        toastCallback(toast);
      } else {
        // Fallback to console
        console.log('[Toast]', toast.title, toast.description);
      }
    },
    toasts,
  };
}

