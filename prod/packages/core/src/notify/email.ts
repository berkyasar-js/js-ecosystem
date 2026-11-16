/**
 * E-posta sağlayıcı soyutlaması. Resend (`RESEND_API_KEY` + `EMAIL_FROM`) varsa gönderir; yoksa yalnızca günlüğe yazar ve 'skipped' döner.
 * Yalnızca sunucu (cron / yönetim rotaları). Sağlayıcı değişirse yalnızca bu dosya değişir.
 */
export interface EmailMessage { to: string; subject: string; html: string; text: string; /** List-Unsubscribe başlığı için. */ unsubscribeUrl?: string }
export interface EmailResult { status: 'sent' | 'skipped' | 'error'; provider: 'resend' | 'log'; provider_id?: string | null; error?: string | null }
export interface EmailProviderStatus { provider: 'resend' | 'log'; configured: boolean; from: string | null; reason?: string }

const RESEND_URL = 'https://api.resend.com/emails';
export function emailProviderStatus(env: NodeJS.ProcessEnv = process.env): EmailProviderStatus {
  const key = env.RESEND_API_KEY?.trim();
  const from = env.EMAIL_FROM?.trim() || null;
  if (key && from) return { provider: 'resend', configured: true, from };
  return { provider: 'log', configured: false, from, reason: !key && !from ? 'RESEND_API_KEY ve EMAIL_FROM tanımlı değil' : !key ? 'RESEND_API_KEY tanımlı değil' : 'EMAIL_FROM tanımlı değil' };
}

export interface SendDeps { env?: NodeJS.ProcessEnv; fetch?: typeof fetch; log?: (line: string) => void }
export async function sendEmail(m: EmailMessage, deps: SendDeps = {}): Promise<EmailResult> {
  const st = emailProviderStatus(deps.env ?? process.env);
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(m.to)) return { status: 'error', provider: st.provider, error: 'Geçersiz alıcı adresi' };
  if (!st.configured) {
    (deps.log ?? ((l) => console.info(l)))(`[email:skipped] to=${m.to} subject="${m.subject}" (${st.reason})`);
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
