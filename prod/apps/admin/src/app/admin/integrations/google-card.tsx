'use client';
import { useCallback, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { CalendarDays, Mail, RefreshCw } from 'lucide-react';
import { TOKEN_ADMIN_ROLES, googleScopeLabel, type GooglePublicState } from '@jscore/contracts';
import { fmtTime } from '@/components/ui';
import { useSession } from '@/components/session';
import { api } from '@/lib/client';
import { SyncLogList } from './hubspot-card';

interface SyncRes { mode: string; fetched: number; messages: number; threads: number; matched: number; errors: string[]; skipped?: string }
const CRON: Record<GooglePublicState['cron'], [string, string]> = { ok: ['Cron çalışıyor', 'chip-ok'], stale: ['Cron gecikti', 'chip-warn'], never: ['Henüz eşitlenmedi', ''] };

/** Entegrasyonlar → Google Workspace: org posta kutusu (hello@) OAuth ile bağlanır; Gmail gönderimi, Gelen kutusu → CRM eşitlemesi, ajans takvimi. */
export function GoogleCard() {
  const { me, mode, bump } = useSession();
  const qs = useSearchParams();
  const demo = mode === 'demo';
  const can = !!me && TOKEN_ADMIN_ROLES.includes(me.role);
  const [st, setSt] = useState<GooglePublicState | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(qs.get('google') === 'error' ? `Google bağlantısı başarısız: ${qs.get('msg') ?? ''}` : null);
  const [note, setNote] = useState<string | null>(qs.get('google') === 'ok' ? `Bağlandı: ${qs.get('email') ?? 'posta kutusu'}` : null);
  const [name, setName] = useState('');
  const [hint, setHint] = useState('hello@jobsstudio.co');
  const load = useCallback(async () => {
    if (!can || demo) return;
    try { const s = await api<GooglePublicState>('/api/admin/integrations/google'); setSt(s); setName(s.display_name ?? ''); } catch (e) { setErr(e instanceof Error ? e.message : 'Google durumu alınamadı'); }
  }, [can, demo]);
  useEffect(() => { void load(); }, [load]);
  const run = async (label: string, fn: () => Promise<void>) => { setBusy(label); setErr(null); setNote(null); try { await fn(); } catch (e) { setErr(e instanceof Error ? e.message : 'Hata'); } finally { setBusy(null); } };
  const connect = () => run('connect', async () => { const r = await api<{ url: string }>('/api/admin/integrations/google/connect', { method: 'POST', body: JSON.stringify({ login_hint: hint.trim() }) }); window.location.assign(r.url); });
  const disconnect = () => run('disconnect', async () => {
    if (!window.confirm('Google posta kutusu bağlantısı kaldırılsın mı? Token Google’da iptal edilir; gelen kutusu kayıtları korunur. E-posta gönderimi Resend/günlüğe düşer.')) return;
    setSt(await api<GooglePublicState>('/api/admin/integrations/google', { method: 'DELETE' })); bump();
  });
  const sync = () => run('sync', async () => {
    const r = await api<SyncRes>('/api/admin/integrations/google/sync', { method: 'POST' });
    setNote(r.skipped ? `Eşitleme atlandı: ${r.skipped === 'no_scope' ? 'gmail.readonly kapsamı yok' : 'bağlı değil'}` : `Eşitlendi (${r.mode}) · ${r.messages} ileti · ${r.threads} konu · ${r.matched} eşleşti${r.errors.length ? ` · ${r.errors.length} hata: ${r.errors[0]}` : ''}`);
    await load();
  });
  const saveName = () => run('name', async () => { setSt(await api<GooglePublicState>('/api/admin/integrations/google', { method: 'PUT', body: JSON.stringify({ display_name: name }) })); setNote('Görünen ad kaydedildi.'); });
  if (!can) return null;
  const connected = !!st?.connected;
  return (
    <section className="card mb-4" aria-labelledby="gw-h" data-testid="google-card">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 id="gw-h" className="flex items-center gap-2 font-bold"><Mail size={16} aria-hidden /> Google Workspace (Gmail + Takvim)</h2>
        <span className={`chip ${connected ? 'chip-ok' : ''}`}>{connected ? `Bağlı · ${st?.email}` : 'Bağlı değil'}</span>
      </div>
      <p className="mt-1 text-sm text-muted">Ajansın posta kutusu (<code>hello@jobsstudio.co</code>) bağlanır: bildirim e-postaları Gmail API ile gider (Resend gerekmez), gelen e-postalar müşteri / kişi ile eşlenip Gelen Kutusu → E-posta sekmesine düşer, ajans takvimi Ajanda’da görünür. Çalışanlar kendi takvimlerini Profil → Google’dan bağlar.</p>
      {demo && <p className="mt-3 text-sm text-muted">Demo modu: Google yalnızca Supabase ile bağlanır (token sunucuda şifreli saklanır).</p>}
      {err && <p role="alert" className="mt-3 text-sm text-magenta">{err}</p>}
      {note && <p role="status" className="mt-3 text-sm text-muted">{note}</p>}
      {!demo && st && (!st.env_ready || !st.enc_ready) && (
        <p className="mt-3 text-sm text-magenta" role="alert">{!st.env_ready ? 'GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET tanımlı değil. ' : ''}{!st.enc_ready ? 'INTEGRATIONS_ENC_KEY tanımlı değil (token’lar şifrelenmeden saklanmaz). ' : ''}Vercel → Environment Variables; bkz. README “Google Workspace”.</p>
      )}
      {!demo && !connected && (
        <form className="mt-4 grid gap-3 sm:grid-cols-[1fr_auto]" onSubmit={(e) => { e.preventDefault(); void connect(); }}>
          <div><label className="label" htmlFor="gw-hint">Bağlanacak posta kutusu</label><input id="gw-hint" className="input" type="email" value={hint} onChange={(e) => setHint(e.target.value)} placeholder="hello@jobsstudio.co" /></div>
          <div className="flex items-end"><button className="btn btn-primary" disabled={!!busy || !st?.env_ready || !st?.enc_ready}>{busy === 'connect' ? 'Yönlendiriliyor…' : 'Google ile bağla'}</button></div>
          <p className="text-xs text-muted sm:col-span-2">Google onay ekranında <b>bu hesapla</b> giriş yap; kapsamlar: Gmail gönder / oku / etiket, Takvim oku. Refresh token sunucuda AES-GCM ile şifrelenir, bir daha gösterilmez.</p>
        </form>
      )}
      {!demo && connected && st && (
        <div className="mt-4 grid gap-4">
          <div className="flex flex-wrap items-center gap-2 text-xs text-muted">
            <span>Bağlandı {st.connected_at ? fmtTime(st.connected_at) : ''}</span>
            <span className={`chip ${CRON[st.cron][1]}`}>{CRON[st.cron][0]}{st.last_sync_at ? ` · ${fmtTime(st.last_sync_at)}` : ''}</span>
            {st.counts && <span className="chip">{st.counts.threads} konu · {st.counts.messages} ileti · {st.counts.matched} eşleşen</span>}
            {st.last_sync_error && <span className="chip chip-bad" title={st.last_sync_error}>Son hata</span>}
          </div>
          <div className="flex flex-wrap gap-1.5" aria-label="Kapsamlar">{st.scopes.map((s) => <span key={s} className="chip" title={s}>{googleScopeLabel(s)}</span>)}</div>
          <div className="flex flex-wrap items-center gap-2">
            <button className="btn btn-sm" disabled={!!busy} onClick={() => void sync()}><RefreshCw size={14} aria-hidden /> {busy === 'sync' ? 'Eşitleniyor…' : 'Şimdi eşitle'}</button>
            <button className="btn btn-sm" disabled={!!busy} onClick={() => void connect()}>Yeniden yetkilendir</button>
            <button className="btn btn-ghost btn-sm" disabled={!!busy} onClick={() => void disconnect()}>Bağlantıyı kaldır</button>
          </div>
          <form className="flex flex-wrap items-end gap-2" onSubmit={(e) => { e.preventDefault(); void saveName(); }}>
            <div><label className="label" htmlFor="gw-name">Gönderen adı</label><input id="gw-name" className="input w-auto min-w-56" value={name} onChange={(e) => setName(e.target.value)} maxLength={80} /></div>
            <button className="btn btn-sm" disabled={!!busy || !name.trim()}>Kaydet</button>
            <span className="text-xs text-muted">E-postalar “{name || st.display_name} &lt;{st.email}&gt;” olarak gider.</span>
          </form>
          <p className="text-xs text-muted"><CalendarDays size={12} aria-hidden className="mr-1 inline" />Ajans takvimi: <code>{st.calendar_id ?? 'primary'}</code> — Ajanda’da “Ajans takvimi” etiketiyle. Gmail eşitlemesi <code>/api/integrations/google/gmail-sync</code> cron’u ile 10 dakikada bir (history API; ilk eşitleme son 14 gün).</p>
          <SyncLogList log={st.sync_log ?? []} lastSyncAt={st.last_sync_at} testId="google-sync-log" />
        </div>
      )}
    </section>
  );
}
