'use client';
import { Suspense, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { ROLE_LABELS } from '@jscore/contracts';
import { DEMO_ACCOUNTS } from '@/lib/demo-seed';
import { DEMO_COOKIE, ORG_COOKIE, isSupabaseConfigured } from '@/lib/env';
import { setCookie } from '@/lib/repo/client';
import { createBrowser } from '@/lib/supabase/browser';
import { Avatar } from '@/components/avatar';
import { ChevronRight } from 'lucide-react';

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
    <main className="login" id="main">
      <div className="login-card">
        <img className="orbit-art login-orbit" src="/brand/orbit-studio.svg" alt="" aria-hidden="true" />
        <img className="logo" src="/brand/jobs-logo-light.svg" alt="Jobs Studio" width={180} height={35} />
        <div className="eyebrow">{supa ? 'JS ECOSYSTEM · GİRİŞ' : 'JS ECOSYSTEM · DEMO GİRİŞ'}</div>
        <h1>{supa ? 'Ajansın işletim sistemine hoş geldin.' : 'Bir rol seç, ajansı o gözle gör.'}</h1>
        <p className="lead">{supa ? 'Gelen talepten faturaya tek akış, rol bazlı erişim ve yapay zekâ destekli kurul.' : 'Demo giriş — kimlik doğrulama değildir. Rol yalnızca menü, veri kapsamı ve ekran içeriğini değiştirir; veriler yalnızca bu tarayıcıda tutulur.'}</p>
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
          <div className="login-roles">
            {DEMO_ACCOUNTS.map((a) => (
              <button key={a.id} className="role-card" onClick={() => demo(a.id)}>
                <Avatar id={a.employee_id || a.id} name={a.name} size="md" />
                <span className="rc-text"><strong>{a.name}</strong><small>{a.title}</small><small>{a.hint}</small></span>
                <span className="chip chip-brand">{ROLE_LABELS[a.role]}</span>
                <ChevronRight size={16} aria-hidden />
              </button>
            ))}
          </div>
        )}
        {msg && <p role="alert" className="mt-4 text-sm text-magenta">{msg}</p>}
        {!supa && <p className="mt-5 text-xs text-[#9fa6cc]">Demo tarihi 14 Ekim 2026 · Tüm kayıtlar ve portreler kurgusaldır.</p>}
      </div>
    </main>
  );
}
export default function LoginPage() { return <Suspense><LoginInner /></Suspense>; }
