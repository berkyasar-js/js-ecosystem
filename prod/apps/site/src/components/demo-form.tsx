'use client';
import { useState } from 'react';
import { SITE } from '@/content/site';

type State = { kind: 'idle' } | { kind: 'busy' } | { kind: 'ok'; forwarded: boolean } | { kind: 'err'; message: string };

export function DemoForm({ plan }: { plan?: string }) {
  const [state, setState] = useState<State>({ kind: 'idle' });

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const fd = new FormData(form);
    const payload = Object.fromEntries(fd.entries());
    if (payload.website) return; // honeypot
    setState({ kind: 'busy' });
    try {
      const r = await fetch('/api/demo', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(payload) });
      const j = (await r.json().catch(() => ({}))) as { ok?: boolean; forwarded?: boolean; error?: string };
      if (!r.ok || !j.ok) throw new Error(j.error ?? 'Gönderilemedi');
      setState({ kind: 'ok', forwarded: !!j.forwarded });
      form.reset();
    } catch (err) {
      setState({ kind: 'err', message: err instanceof Error ? err.message : 'Gönderilemedi' });
    }
  }

  if (state.kind === 'ok') {
    return (
      <div className="card" role="status" aria-live="polite">
        <h2 className="text-xl">Teşekkürler, talebiniz alındı.</h2>
        <p className="mt-2 text-sm text-muted">1 iş günü içinde e-posta ile dönüyoruz. {state.forwarded ? '' : 'Acele ediyorsanız '}<a className="text-brand-ink underline" href={`mailto:${SITE.email}?subject=JS%20Workspace%20demo`}>{SITE.email}</a>{state.forwarded ? ' adresinden de ulaşabilirsiniz.' : ' adresine doğrudan yazabilirsiniz.'}</p>
        <a href={SITE.loginUrl} className="btn mt-4" rel="noopener">Beklerken demo modunu deneyin</a>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} className="card grid gap-4" aria-describedby="demo-note">
      <input type="hidden" name="plan" value={plan ?? ''} />
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="field">Ad Soyad<input className="input" name="name" required minLength={2} maxLength={120} autoComplete="name" /></label>
        <label className="field">E-posta<input className="input" name="email" type="email" required maxLength={200} autoComplete="email" /></label>
        <label className="field">Ajans / şirket<input className="input" name="company" required maxLength={120} autoComplete="organization" /></label>
        <label className="field">Koltuk sayısı
          <select className="select" name="seats" defaultValue="5-10">
            {['1-4', '5-10', '11-25', '26-50', '50+'].map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
        </label>
      </div>
      <label className="field">Mesaj <span className="font-normal text-muted">(isteğe bağlı: Trello kullanıyor musunuz, hangi modüller öncelikli?)</span><textarea className="textarea" name="message" maxLength={2000} /></label>
      <label className="sr-only" aria-hidden="true">Web sitesi<input name="website" tabIndex={-1} autoComplete="off" /></label>
      <label className="flex items-start gap-2 text-xs text-muted"><input type="checkbox" name="consent" required className="mt-0.5" /> <span>Demo talebimle ilgili iletişim için verilerimin işlenmesini kabul ediyorum (<a href="/gizlilik" className="underline">gizlilik</a>).</span></label>
      {state.kind === 'err' && <p className="rounded-xl border border-[#ff3366]/40 bg-[#ff3366]/10 p-3 text-sm" role="alert">{state.message}. Dilerseniz <a className="underline" href={`mailto:${SITE.email}?subject=JS%20Workspace%20demo`}>e-posta ile</a> yazın.</p>}
      <div className="flex flex-wrap items-center gap-3">
        <button type="submit" className="btn btn-primary btn-lg" disabled={state.kind === 'busy'}>{state.kind === 'busy' ? 'Gönderiliyor…' : 'Demo talep et'}</button>
        <p id="demo-note" className="text-xs text-muted">30 dakika · çevrim içi · kendi Trello panonuzla</p>
      </div>
    </form>
  );
}
