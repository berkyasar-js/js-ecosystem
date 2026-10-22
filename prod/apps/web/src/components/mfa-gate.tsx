'use client';
import { useCallback, useEffect, useState } from 'react';
import { createBrowser } from '@jscore/core/supabase/browser';
import { mfaStep, type MfaStep } from '@/lib/mfa';
import { Loading } from './ui';

/**
 * Org ayarı security.require_mfa açıkken, kullanıcı TOTP faktörü kaydedip (QR) kodu girene kadar uygulamayı göstermez.
 * Faktör zaten varsa yalnızca kod sorar (aal1 → aal2). Çıkış her zaman mümkündür.
 */
export function MfaGate({ children, onLogout }: { children: React.ReactNode; onLogout: () => void }) {
  const [step, setStep] = useState<MfaStep | 'checking'>('checking');
  const [factorId, setFactorId] = useState<string | null>(null);
  const [qr, setQr] = useState<{ svg: string; secret: string } | null>(null);
  const [code, setCode] = useState('');
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const check = useCallback(async () => {
    const sb = createBrowser();
    const { data, error } = await sb.auth.mfa.getAuthenticatorAssuranceLevel();
    if (error) { setMsg(error.message); setStep('enroll'); return; }
    const s = mfaStep(data.currentLevel, data.nextLevel);
    const { data: f } = await sb.auth.mfa.listFactors();
    if (s === 'challenge') setFactorId(f?.totp?.[0]?.id ?? null);
    if (s === 'enroll') {
      // Yarım kalmış (doğrulanmamış) kayıtları temizle, yeni TOTP başlat.
      for (const x of f?.all ?? []) if (x.factor_type === 'totp' && x.status === 'unverified') await sb.auth.mfa.unenroll({ factorId: x.id });
      const en = await sb.auth.mfa.enroll({ factorType: 'totp', friendlyName: `JS Ecosystem ${new Date().toISOString().slice(0, 10)}` });
      if (en.error) setMsg(`MFA başlatılamadı: ${en.error.message}`);
      else { setFactorId(en.data.id); setQr({ svg: en.data.totp.qr_code, secret: en.data.totp.secret }); }
    }
    setStep(s);
  }, []);
  useEffect(() => { void check(); }, [check]);

  const verify = async (e: React.FormEvent) => {
    e.preventDefault(); if (!factorId) return;
    setBusy(true); setMsg(null);
    const sb = createBrowser();
    const ch = await sb.auth.mfa.challenge({ factorId });
    if (ch.error) { setMsg(ch.error.message); setBusy(false); return; }
    const v = await sb.auth.mfa.verify({ factorId, challengeId: ch.data.id, code: code.trim() });
    setBusy(false);
    if (v.error) { setMsg('Kod doğrulanamadı — saat senkronunu ve kodu kontrol et.'); return; }
    setCode(''); setStep('ok');
  };

  if (step === 'ok') return <>{children}</>;
  if (step === 'checking') return <div className="mx-auto max-w-md p-8"><Loading rows={2} /></div>;
  return (
    <main className="login" id="main">
      <div className="login-card">
        <div className="eyebrow">GÜVENLİK · İKİ ADIMLI DOĞRULAMA</div>
        <h1>{step === 'enroll' ? 'İki adımlı doğrulamayı kur' : 'Doğrulama kodunu gir'}</h1>
        <p className="lead">{step === 'enroll' ? 'Yöneticin bu organizasyon için MFA’yı zorunlu kıldı. Doğrulayıcı uygulamanla (Google Authenticator, 1Password…) QR kodu tara ve üretilen 6 haneli kodu gir.' : 'Doğrulayıcı uygulamandaki 6 haneli kodu gir.'}</p>
        {step === 'enroll' && qr && (
          <div className="mt-4 grid gap-2">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={qr.svg} alt="MFA QR kodu" width={176} height={176} className="rounded bg-white p-2" />
            <p className="text-xs text-[#9fa6cc]">QR okunmazsa anahtarı elle gir: <code className="break-all">{qr.secret}</code></p>
          </div>
        )}
        <form onSubmit={verify} className="mt-5 grid gap-3">
          <label className="label" htmlFor="mfa-code">6 haneli kod</label>
          <input id="mfa-code" className="input" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" maxLength={6} required value={code} onChange={(e) => setCode(e.target.value)} />
          <button className="btn btn-primary" disabled={busy || !factorId || code.trim().length !== 6}>{busy ? 'Doğrulanıyor…' : 'Doğrula ve devam et'}</button>
        </form>
        {msg && <p role="alert" className="mt-4 text-sm text-magenta">{msg}</p>}
        <button className="btn btn-ghost mt-4" onClick={onLogout}>Çıkış yap</button>
      </div>
    </main>
  );
}
