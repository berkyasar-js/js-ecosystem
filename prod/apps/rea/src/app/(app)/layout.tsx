import { redirect } from 'next/navigation';
import { Shell } from '@/components/shell';
import { access } from '@/lib/data';

export const dynamic = 'force-dynamic';

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const a = await access();
  if (!a.ok && a.reason === 'unauth') redirect('/login');
  if (!a.ok) {
    return (
      <main className="login" id="main">
        <div className="login-card">
          <img className="logo" src="/brand/jobs-logo-light.svg" alt="Jobs Studio" width={180} height={35} />
          <div className="eyebrow">TERS MÜHENDİSLİK STÜDYOSU</div>
          <h1>{a.reason === 'forbidden' ? 'Bu alana erişimin yok.' : 'Bir sorun oluştu.'}</h1>
          <p className="lead">{a.message}</p>
          <p className="mt-5"><a className="btn" href="/login">Başka hesapla gir</a></p>
        </div>
      </main>
    );
  }
  return <Shell email={a.actor.email} demo={a.actor.mode === 'demo'}>{children}</Shell>;
}
