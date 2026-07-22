export type ToastVariant = 'success' | 'error' | 'info';

export interface Toast {
  id: string;
  message: string;
  variant: ToastVariant;
}

const DEFAULT_DURATION_MS = 3000;

export const toasts = $state<Toast[]>([]);

export function pushToast(message: string, variant: ToastVariant = 'success', durationMs = DEFAULT_DURATION_MS): void {
  const toast: Toast = { id: crypto.randomUUID(), message, variant };
  toasts.push(toast);
  setTimeout(() => dismissToast(toast.id), durationMs);
}

export function dismissToast(id: string): void {
  const index = toasts.findIndex((toast) => toast.id === id);
  if (index !== -1) toasts.splice(index, 1);
}
