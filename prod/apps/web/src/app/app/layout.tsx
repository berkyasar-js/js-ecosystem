import { Suspense } from 'react';
import { SessionProvider } from '@/components/session';
import { Shell } from '@/components/shell';
import { ToastProvider } from '@/components/toasts';
import { Loading } from '@/components/ui';

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <SessionProvider><ToastProvider>
      <Suspense fallback={<div className="mx-auto max-w-3xl p-8"><Loading rows={4} /></div>}><Shell>{children}</Shell></Suspense>
    </ToastProvider></SessionProvider>
  );
}
