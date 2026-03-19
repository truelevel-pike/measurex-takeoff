'use client';

import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { CheckCircle, XCircle, AlertTriangle, Info, X } from 'lucide-react';

export type ToastType = 'success' | 'error' | 'warning' | 'info';

export interface Toast {
  id: string;
  type: ToastType;
  message: string;
  duration?: number;
}

interface ToastContextValue {
  toasts: Toast[];
  addToast: (message: string, type: ToastType, duration?: number) => void;
  removeToast: (id: string) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

const iconMap: Record<ToastType, typeof CheckCircle> = {
  success: CheckCircle,
  error: XCircle,
  warning: AlertTriangle,
  info: Info,
};

const borderColorMap: Record<ToastType, string> = {
  success: 'border-l-green-500',
  error: 'border-l-red-500',
  warning: 'border-l-yellow-500',
  info: 'border-l-blue-500',
};

const iconColorMap: Record<ToastType, string> = {
  success: 'text-green-400',
  error: 'text-red-400',
  warning: 'text-yellow-400',
  info: 'text-blue-400',
};

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const removeToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const addToast = useCallback((message: string, type: ToastType, duration?: number) => {
    const id = crypto.randomUUID();
    setToasts((prev) => [...prev, { id, type, message, duration: duration ?? 4000 }]);
  }, []);

  return (
    <ToastContext.Provider value={{ toasts, addToast, removeToast }}>
      {children}
      {/* Toast container — each toast offset vertically by index to prevent overlap */}
      <div className="fixed right-4 z-50 pointer-events-none" style={{ bottom: 0 }}>
        {toasts.map((toast, index) => (
          <ToastItem key={toast.id} toast={toast} index={index} onRemove={removeToast} />
        ))}
      </div>
    </ToastContext.Provider>
  );
}

function ToastItem({ toast, index, onRemove }: { toast: Toast; index: number; onRemove: (id: string) => void }) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    // Trigger opacity transition
    const raf = requestAnimationFrame(() => setVisible(true));
    return () => cancelAnimationFrame(raf);
  }, []);

  useEffect(() => {
    const duration = toast.duration ?? 4000;
    const timer = setTimeout(() => onRemove(toast.id), duration);
    return () => clearTimeout(timer);
  }, [toast.id, toast.duration, onRemove]);

  const Icon = iconMap[toast.type];

  return (
    <div
      style={{ position: 'absolute', right: 0, bottom: 16 + index * 72, transition: 'bottom 0.3s ease, opacity 0.3s ease' }}
      className={`pointer-events-auto flex items-center gap-3 bg-zinc-800 border border-zinc-700 border-l-4 ${borderColorMap[toast.type]} rounded-lg px-4 py-3 shadow-lg min-w-[280px] max-w-[400px] ${visible ? 'opacity-100' : 'opacity-0'}`}
    >
      <Icon size={18} className={`shrink-0 ${iconColorMap[toast.type]}`} />
      <span className="text-sm text-zinc-100 flex-1">{toast.message}</span>
      <button
        aria-label="Dismiss toast"
        onClick={() => onRemove(toast.id)}
        className="text-zinc-400 hover:text-white shrink-0 transition-colors"
      >
        <X size={14} />
      </button>
    </div>
  );
}

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used within a ToastProvider');
  return ctx;
}
