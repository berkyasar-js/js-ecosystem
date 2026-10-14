'use client';
import { Suspense, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { ROLE_LABELS } from '@jscore/contracts';
import { DEMO_ACCOUNTS } from '@/lib/demo-seed';
import { DEMO_COOKIE, ORG_COOKIE, isSupabaseConfigured } from '@/lib/env';
import { setCookie } from '@/lib/repo/client';
import { createBrowser } from '@/lib/supabase/browser';

function LoginInner() {
  const router = useRouter();
  const sp = useSearchParams();
  const next = sp.get('next')?.startsWith('/app') ? (sp.get('next') as string) : '/app/overview';
  const supa = isSupabaseConfigured();
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [sent, setSent] = useState(false);
  const [msg, setMsg] = useState<string | null>(sp.get('error') ? 'Giriş tamamlanamadı, tekrar dene.' : null);
  const [busy, setBusy] = useState(false);

  const google = async () => {
    setBusy(true);
    const { error } = await createBrowser().auth.signInWithOAuth({ provider: 'google', options: { redirectTo: `${location.origin}/auth/callback?next=${encodeURIComponent(next)}` } });
    if (error) { setMsg(error.message); setBusy(false); }
  };
  const sendOtp = async (e: React.FormEvent) => {
    e.preventDefault(); setBusy(true); setMsg(null);
    const { error } = await createBrowser().auth.signInWithOtp({ email, options: { shouldCreateUser: false } });
    setBusy(false);
    if (error) setMsg(error.message); else { setSent(true); setMsg('Kod e-postana gönderildi.'); }
  };
  const verify = async (e: React.FormEvent) => {
    e.preventDefault(); setBusy(true); setMsg(null);
    const { error } = await createBrowser().auth.verifyOtp({ email, token: code.trim(), type: 'email' });
    setBusy(false);
    if (error) setMsg(error.message); else router.replace(next);
  };
  const demo = (id: string) => { setCookie(DEMO_COOKIE, id); setCookie(ORG_COOKIE, 'org_jobs'); router.replace(next); };

  return (
    <main className="mx-auto grid min-h-screen max-w-5xl content-center gap-8 p-6 lg:grid-cols-[1fr_1.2fr]">
      <section>
        <h1 className="text-4xl font-extrabold tracking-tight">JS <span className="text-accent">Ecosystem</span></h1>
        <p className="mt-3 max-w-sm text-muted">Jobs Studio’nun ajans işletim sistemi: gelen talepten faturaya tek akış, rol bazlı erişim ve yapay zekâ destekli kurul.</p>
      </section>
      <section className="card">
        {supa ? (
          <div className="grid gap-4">
            <button className="btn btn-primary" onClick={google} disabled={busy}>Google ile devam et</button>
            <div className="text-center text-xs text-muted">veya</div>
            {!sent ? (
              <form onSubmit={sendOtp} className="grid gap-3">
                <label className="label" htmlFor="em">E-posta</label>
                <input id="em" className="input" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="ad@sirket.com" autoComplete="email" />
                <button className="btn" disabled={busy}>E-posta kodu gönder</button>
              </form>
            ) : (
              <form onSubmit={verify} className="grid gap-3">
                <label className="label" htmlFor="cd">6 haneli kod</label>
                <input id="cd" className="input" inputMode="numeric" autoComplete="one-time-code" required value={code} onChange={(e) => setCode(e.target.value)} />
                <button className="btn btn-primary" disabled={busy}>Doğrula ve gir</button>
              </form>
            )}
          </div>
        ) : (
          <div>
            <div role="status" className="mb-4 rounded-control border border-[#ffb020]/50 bg-[#ffb020]/10 p-3 text-xs text-[#ffb020]">Demo modu — veritabanı bağlı değil. Bir rol seçerek devam et; veriler yalnızca bu tarayıcıda tutulur.</div>
            <div className="grid gap-2 sm:grid-cols-2">
              {DEMO_ACCOUNTS.map((a) => (
                <button key={a.id} className="nested text-left transition hover:brightness-125" onClick={() => demo(a.id)}>
                  <div className="flex items-center justify-between gap-2"><strong>{a.name}</strong><span className="chip chip-brand">{ROLE_LABELS[a.role]}</span></div>
                  <div className="mt-1 text-xs text-muted">{a.hint}</div>
                </button>
              ))}
            </div>
          </div>
        )}
        {msg && <p role="alert" className="mt-4 text-sm text-magenta">{msg}</p>}
      </section>
    </main>
  );
}
export default function LoginPage() { return <Suspense><LoginInner /></Suspense>; }
