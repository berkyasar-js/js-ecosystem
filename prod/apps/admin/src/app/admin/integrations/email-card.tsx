'use client';
import { useState } from 'react';
import { Mail } from 'lucide-react';
import { EMAIL_PROVIDERS, EMAIL_PROVIDER_LABELS, type EmailProviderChoice } from '@jscore/contracts';
import { fmtDate } from '@/components/ui';
import { api, useApi } from '@/lib/client';

interface LogRow { id: string; kind: string; to_email: string; subject: string; status: 'sent' | 'skipped' | 'error'; provider_id: string | null; error: string | null; created_at: string }
interface Status { provider: 'gmail' | 'resend' | 'log'; configured: boolean; from: string | null; reason?: string; choice: EmailProviderChoice | null; gmail_connected: boolean; gmail_from: string | null }
interface EmailInfo { status: Status; log: LogRow[]; demo: boolean }
const STATUS: Record<LogRow['status'], [string, string]> = { sent: ['Gönderildi', 'chip-ok'], skipped: ['Atlandı', 'chip-warn'], error: ['Hata', 'chip-bad'] };
const KIND = (k: string) => (k === 'digest_daily' ? 'Günlük özet' : k === 'digest_weekly' ? 'Haftalık özet' : k === 'test' ? 'Deneme' : k === 'reply' ? 'Gelen kutusu yanıtı' : k.startsWith('instant:') ? `Anlık · ${k.slice(8)}` : k);
const PROVIDER_CHIP = (s: Status) => (s.provider === 'gmail' ? `Gmail · ${s.from}` : s.provider === 'resend' ? `Resend · ${s.from}` : s.choice === 'off' ? 'Kapalı' : 'Yalnızca günlük (sağlayıcı yok)');

/** Entegrasyonlar → E-posta: sağlayıcı seçimi (Gmail / Resend / Kapalı), bağlı posta kutusu, deneme gönderimi, son 20 kayıt (email_log). */
export function EmailCard() {
  const q = useApi<EmailInfo>('/api/admin/email');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const test = async () => {
    setBusy(true); setMsg(null);
    try {
      const r = await api<{ result: { status: string; error?: string | null; provider: string; provider_id?: string | null } }>('/api/admin/email', { method: 'POST' });
      setMsg(r.result.status === 'sent' ? { ok: true, text: `Deneme e-postası gönderildi (${r.result.provider === 'gmail' ? 'Gmail' : 'Resend'}${r.result.provider_id ? ` · ${r.result.provider_id}` : ''}).` } : r.result.status === 'skipped' ? { ok: true, text: `Gönderim atlandı: ${r.result.error ?? 'sağlayıcı tanımlı değil'} — yalnızca günlüğe yazıldı.` } : { ok: false, text: `Hata: ${r.result.error ?? 'bilinmiyor'}` });
      q.reload();
    } catch (e) { setMsg({ ok: false, text: e instanceof Error ? e.message : 'Hata' }); } finally { setBusy(false); }
  };
  const setProvider = async (provider: EmailProviderChoice) => {
    setBusy(true); setMsg(null);
    try { await api('/api/admin/email', { method: 'PUT', body: JSON.stringify({ provider }) }); setMsg({ ok: true, text: `Sağlayıcı: ${EMAIL_PROVIDER_LABELS[provider]}` }); q.reload(); }
    catch (e) { setMsg({ ok: false, text: e instanceof Error ? e.message : 'Hata' }); } finally { setBusy(false); }
  };
  const d = q.data;
  const s = d?.status;
  const effectiveChoice: EmailProviderChoice = s?.choice ?? (s?.gmail_connected ? 'gmail' : 'resend');
  return (
    <article className="card mb-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="flex items-center gap-2 font-bold"><Mail size={16} aria-hidden /> E-posta bildirimleri</h2>
        {s && <span className={`chip ${s.configured ? 'chip-ok' : 'chip-warn'}`}>{PROVIDER_CHIP(s)}</span>}
      </div>
      <p className="mt-1 text-sm text-muted">Anlık (onay isteği, anma, görev ataması), günlük 08:30 ve haftalık Pazartesi özetleri <code>/api/jobs/notify</code> cron’u ile gider. <b>Gmail</b>: Google Workspace kartındaki posta kutusu (<code>users.messages.send</code>; From/Reply-To = bağlı adres). <b>Resend</b>: <code>RESEND_API_KEY</code> + <code>EMAIL_FROM</code>. Seçim yoksa Gmail bağlıysa Gmail, değilse Resend/günlük.{s && !s.configured && s.reason ? ` (${s.reason})` : ''}</p>
      {q.error && <p role="alert" className="mt-2 text-sm text-magenta">{q.error}</p>}
      {d && !d.demo && (
        <fieldset className="mt-3 flex flex-wrap items-center gap-3" disabled={busy}>
          <legend className="label">Sağlayıcı</legend>
          {EMAIL_PROVIDERS.map((p) => (
            <label key={p} className="flex items-center gap-2 text-sm">
              <input type="radio" name="email-provider" value={p} checked={effectiveChoice === p} onChange={() => void setProvider(p)} /> {EMAIL_PROVIDER_LABELS[p]}
              {p === 'gmail' && <span className={`chip ${s?.gmail_connected ? 'chip-ok' : 'chip-warn'}`}>{s?.gmail_connected ? s.gmail_from : 'posta kutusu bağlı değil'}</span>}
            </label>
          ))}
          {s && s.choice === null && <span className="text-xs text-muted">(otomatik)</span>}
        </fieldset>
      )}
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <button className="btn btn-sm" disabled={busy || !!d?.demo} onClick={() => void test()}>Deneme e-postası gönder (kendime)</button>
        {d?.demo && <span className="text-xs text-muted">Demo modu: e-posta gönderilmez.</span>}
        {msg && <span className={`text-sm ${msg.ok ? 'text-muted' : 'text-magenta'}`} role="status">{msg.text}</span>}
      </div>
      {d && d.log.length > 0 && (
        <div className="mt-4 overflow-x-auto">
          <table className="table"><thead><tr><th>Tarih</th><th>Tür</th><th>Alıcı</th><th>Konu</th><th>Durum</th></tr></thead><tbody>
            {d.log.map((r) => <tr key={r.id}><td className="whitespace-nowrap">{fmtDate(r.created_at)} {r.created_at.slice(11, 16)}</td><td>{KIND(r.kind)}</td><td>{r.to_email || '—'}</td><td className="max-w-[280px] truncate" title={r.subject}>{r.subject}</td><td><span className={`chip ${STATUS[r.status][1]}`} title={r.error ?? r.provider_id ?? ''}>{STATUS[r.status][0]}</span></td></tr>)}
          </tbody></table>
        </div>
      )}
    </article>
  );
}
