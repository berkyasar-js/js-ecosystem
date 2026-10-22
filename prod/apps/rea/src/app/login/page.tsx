'use client';
import { Suspense, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { isSupabaseConfigured } from '@/lib/env';
import { createBrowser } from '@/lib/supabase/browser';

function LoginInner() {
  const router = useRouter();
  const sp = useSearchParams();
  const rawNext = sp.get('next');
  const next = rawNext && rawNext.startsWith('/') && !rawNext.startsWith('//') ? rawNext : '/projeler';
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

  return (
    <main className="login" id="main">
      <div className="login-card">
        <img className="orbit-art login-orbit" src="/brand/orbit-studio.svg" alt="" aria-hidden="true" />
        <img className="logo" src="/brand/jobs-logo-light.svg" alt="Jobs Studio" width={180} height={35} />
        <div className="eyebrow">{supa ? 'TERS MÜHENDİSLİK STÜDYOSU · GİRİŞ' : 'TERS MÜHENDİSLİK STÜDYOSU · DEMO'}</div>
        <h1>Bir uygulamanın içini kanıtıyla aç.</h1>
        <p className="lead">{supa ? 'Yalnızca owner ve org_admin rolleri girebilir. JS Ecosystem hesabınla giriş yap.' : 'Supabase bağlı değil: uygulama demo modunda, giriş gerekmeden çalışıyor.'}</p>
        {supa ? (
          <div className="mt-6 grid gap-4">
            <button className="btn btn-primary" onClick={google} disabled={busy}>Google ile devam et</button>
            <div className="text-center text-xs text-[#9fa6cc]">veya</div>
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
          <div className="mt-6"><Link className="btn btn-primary" href="/projeler">Demo&apos;yu aç</Link></div>
        )}
        {msg && <p role="alert" className="mt-4 text-sm text-magenta">{msg}</p>}
      </div>
    </main>
  );
}
export default function LoginPage() { return <Suspense><LoginInner /></Suspense>; }
