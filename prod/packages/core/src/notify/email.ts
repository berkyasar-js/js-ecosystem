/**
 * E-posta sağlayıcı soyutlaması. Sıra: `deps.gmail` (org Google posta kutusu, bkz. email-gmail.ts) → Resend (`RESEND_API_KEY` + `EMAIL_FROM`) → yalnızca günlük ('skipped').
 * Yalnızca sunucu (cron / yönetim rotaları). Sağlayıcı değişirse yalnızca bu dosya (+ email-gmail.ts) değişir.
 */
export interface EmailMessage { to: string; subject: string; html: string; text: string; /** List-Unsubscribe başlığı için. */ unsubscribeUrl?: string }
export type EmailProvider = 'gmail' | 'resend' | 'log';
export interface EmailResult { status: 'sent' | 'skipped' | 'error'; provider: EmailProvider; provider_id?: string | null; error?: string | null }
export interface EmailProviderStatus { provider: EmailProvider; configured: boolean; from: string | null; reason?: string }
/** Gmail (ya da başka org bağlı) gönderici: `from` görünen adres; `send` tek ileti gönderir. */
export interface MailSender { provider: EmailProvider; from: string; send(m: EmailMessage): Promise<EmailResult> }

const RESEND_URL = 'https://api.resend.com/emails';
export function emailProviderStatus(env: NodeJS.ProcessEnv = process.env): EmailProviderStatus {
  const key = env.RESEND_API_KEY?.trim();
  const from = env.EMAIL_FROM?.trim() || null;
  if (key && from) return { provider: 'resend', configured: true, from };
  return { provider: 'log', configured: false, from, reason: !key && !from ? 'RESEND_API_KEY ve EMAIL_FROM tanımlı değil' : !key ? 'RESEND_API_KEY tanımlı değil' : 'EMAIL_FROM tanımlı değil' };
}
export const isValidEmail = (s: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s);

export interface SendDeps { env?: NodeJS.ProcessEnv; fetch?: typeof fetch; log?: (line: string) => void; /** Org bağlı gönderici (Gmail); verilirse Resend'e bakılmaz. */ gmail?: MailSender | null; /** 'off': sağlayıcı kapalı — yalnızca günlük. */ off?: boolean }
export async function sendEmail(m: EmailMessage, deps: SendDeps = {}): Promise<EmailResult> {
  const st = emailProviderStatus(deps.env ?? process.env);
  const log = deps.log ?? ((l) => console.info(l));
  if (!isValidEmail(m.to)) return { status: 'error', provider: deps.gmail?.provider ?? st.provider, error: 'Geçersiz alıcı adresi' };
  if (deps.off) { log(`[email:skipped] to=${m.to} subject="${m.subject}" (e-posta sağlayıcısı kapalı)`); return { status: 'skipped', provider: 'log', error: 'E-posta sağlayıcısı kapalı (ayarlar)' }; }
  if (deps.gmail) {
    try { return await deps.gmail.send(m); }
    catch (e) { return { status: 'error', provider: deps.gmail.provider, error: e instanceof Error ? e.message : 'Gmail gönderim hatası' }; }
  }
  if (!st.configured) {
    log(`[email:skipped] to=${m.to} subject="${m.subject}" (${st.reason})`);
    return { status: 'skipped', provider: 'log', error: st.reason ?? null };
  }
  try {
    const res = await (deps.fetch ?? fetch)(RESEND_URL, {
      method: 'POST', signal: AbortSignal.timeout(10000),
      headers: { authorization: `Bearer ${(deps.env ?? process.env).RESEND_API_KEY}`, 'content-type': 'application/json' },
      body: JSON.stringify({ from: st.from, to: [m.to], subject: m.subject, html: m.html, text: m.text, headers: m.unsubscribeUrl ? { 'List-Unsubscribe': `<${m.unsubscribeUrl}>`, 'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click' } : undefined }),
    });
    const j = (await res.json().catch(() => ({}))) as { id?: string; message?: string; name?: string };
    if (!res.ok) return { status: 'error', provider: 'resend', error: j.message ?? `Resend ${res.status}` };
    return { status: 'sent', provider: 'resend', provider_id: j.id ?? null };
  } catch (e) { return { status: 'error', provider: 'resend', error: e instanceof Error ? e.message : 'Gönderim hatası' }; }
}
