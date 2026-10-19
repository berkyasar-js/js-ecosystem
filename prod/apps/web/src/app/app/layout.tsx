import { SessionProvider } from '@/components/session';
import { Shell } from '@/components/shell';
import { ToastProvider } from '@/components/toasts';

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return <SessionProvider><ToastProvider><Shell>{children}</Shell></ToastProvider></SessionProvider>;
}
