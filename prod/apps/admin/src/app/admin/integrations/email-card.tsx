'use client';
import { useState } from 'react';
import { Mail } from 'lucide-react';
import { fmtDate } from '@/components/ui';
import { api, useApi } from '@/lib/client';

interface LogRow { id: string; kind: string; to_email: string; subject: string; status: 'sent' | 'skipped' | 'error'; provider_id: string | null; error: string | null; created_at: string }
interface EmailInfo { status: { provider: 'resend' | 'log'; configured: boolean; from: string | null; reason?: string }; log: LogRow[]; demo: boolean }
const STATUS: Record<LogRow['status'], [string, string]> = { sent: ['Gönderildi', 'chip-ok'], skipped: ['Atlandı', 'chip-warn'], error: ['Hata', 'chip-bad'] };
const KIND = (k: string) => (k === 'digest_daily' ? 'Günlük özet' : k === 'digest_weekly' ? 'Haftalık özet' : k === 'test' ? 'Deneme' : k.startsWith('instant:') ? `Anlık · ${k.slice(8)}` : k);

/** Entegrasyonlar → E-posta: sağlayıcı durumu (Resend / yalnızca günlük), deneme gönderimi, son 20 kayıt (email_log). */
export function EmailCard() {
  const q = useApi<EmailInfo>('/api/admin/email');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const test = async () => {
    setBusy(true); setMsg(null);
    try {
      const r = await api<{ result: { status: string; error?: string | null; provider: string } }>('/api/admin/email', { method: 'POST' });
      setMsg(r.result.status === 'sent' ? { ok: true, text: 'Deneme e-postası gönderildi (Resend).' } : r.result.status === 'skipped' ? { ok: true, text: `Gönderim atlandı: ${r.result.error ?? 'sağlayıcı tanımlı değil'} — yalnızca günlüğe yazıldı.` } : { ok: false, text: `Hata: ${r.result.error ?? 'bilinmiyor'}` });
      q.reload();
    } catch (e) { setMsg({ ok: false, text: e instanceof Error ? e.message : 'Hata' }); } finally { setBusy(false); }
  };
  const d = q.data;
  return (
    <article className="card mb-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="flex items-center gap-2 font-bold"><Mail size={16} aria-hidden /> E-posta bildirimleri</h2>
        {d && <span className={`chip ${d.status.configured ? 'chip-ok' : 'chip-warn'}`}>{d.status.configured ? `Resend · ${d.status.from}` : 'Yalnızca günlük (sağlayıcı yok)'}</span>}
      </div>
      <p className="mt-1 text-sm text-muted">Anlık (onay isteği, anma, görev ataması), günlük 08:30 ve haftalık Pazartesi özetleri <code>/api/jobs/notify</code> cron’u ile gider. Sağlayıcı: <code>RESEND_API_KEY</code> + <code>EMAIL_FROM</code>; yoksa gönderim atlanır ve günlüğe <em>Atlandı</em> yazılır.{d && !d.status.configured && d.status.reason ? ` (${d.status.reason})` : ''}</p>
      {q.error && <p role="alert" className="mt-2 text-sm text-magenta">{q.error}</p>}
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
