import { redirect } from 'next/navigation';
import { AdminShell } from '@/components/admin-shell';
import { Forbidden } from '@/components/forbidden';
import { SessionProvider } from '@/components/session';
import { ToastProvider } from '@/components/toasts';
import { getAdminContext } from '@/lib/admin-ctx';

export const dynamic = 'force-dynamic';

/** Sunucu tarafı kapı: owner/org_admin dışındaki herkes “Yetkiniz yok” görür (menü/veri hiç render edilmez). */
export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const r = await getAdminContext();
  if (!r.ok) {
    if (r.reason === 'no_session') redirect('/login');
    return <Forbidden reason={r.reason} appUrl={process.env.NEXT_PUBLIC_APP_URL ?? ''} />;
  }
  return <SessionProvider><ToastProvider><AdminShell>{children}</AdminShell></ToastProvider></SessionProvider>;
}
