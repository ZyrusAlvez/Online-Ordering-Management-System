import { toast as sonnerToast } from 'sonner';

type Preset = 'done' | 'error' | 'none';

interface ToastOptions {
  title: string;
  preset?: Preset;
}

export function toast({ title, preset = 'none' }: ToastOptions) {
  if (preset === 'error') sonnerToast.error(title);
  else if (preset === 'done') sonnerToast.success(title);
  else sonnerToast(title);
}
