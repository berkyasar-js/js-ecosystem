import type { SupabaseClient } from '@supabase/supabase-js';
import { resolveEmailProviderChoice, type EmailProviderChoice } from '@jscore/contracts';
import { GmailClient } from '../integrations/gmail';
import { buildMime, formatAddress, toBase64Url } from '../integrations/gmail-mime';
import { getAccessToken, loadGoogleOrgConfig, type OAuthDeps } from '../integrations/google-oauth';
import { emailProviderStatus, sendEmail, type EmailMessage, type EmailProviderStatus, type EmailResult, type MailSender } from './email';

/**
 * Org'un e-posta göndericisi: `settings.notifications.email_provider` + Google posta kutusu bağlantısına göre Gmail / Resend / günlük.
 * Gmail: `users.messages.send` (RFC 2822; From/Reply-To = "Jobs Studio <hello@…>"; List-Unsubscribe başlığı korunur). provider_id = Gmail ileti id'si.
 */
export function gmailSender(o: { token: string; email: string; displayName: string; fetchImpl?: typeof fetch; sleep?: (ms: number) => Promise<unknown> }): MailSender {
  const from = formatAddress(o.email, o.displayName);
  const g = new GmailClient(o.token, { fetchImpl: o.fetchImpl, sleep: o.sleep });
  return {
    provider: 'gmail', from,
    async send(m: EmailMessage): Promise<EmailResult> {
      const raw = buildMime({ from, to: [m.to], replyTo: from, subject: m.subject, text: m.text, html: m.html, headers: m.unsubscribeUrl ? { 'List-Unsubscribe': `<${m.unsubscribeUrl}>`, 'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click' } : undefined });
      const r = await g.send(toBase64Url(raw));
      return { status: 'sent', provider: 'gmail', provider_id: r.id };
    },
  };
}
/** Org posta kutusu bağlı ve gmail.send kapsamı varsa gönderici; değilse null. */
export async function createGmailSender(admin: SupabaseClient, orgId: string, deps: OAuthDeps = {}): Promise<MailSender | null> {
  const cfg = await loadGoogleOrgConfig(admin, orgId);
  if (!cfg || !cfg.scopes.includes('https://www.googleapis.com/auth/gmail.send')) return null;
  const tok = await getAccessToken(admin, { kind: 'org', orgId }, deps);
  if (!tok) return null;
  return gmailSender({ token: tok.token, email: cfg.email, displayName: cfg.display_name, fetchImpl: deps.fetchImpl, sleep: deps.sleep });
}

export interface OrgEmailStatus extends EmailProviderStatus { choice: EmailProviderChoice | null; gmail_connected: boolean; gmail_from: string | null }
/** Org için etkin sağlayıcı durumu (panel kartı). */
export async function orgEmailStatus(admin: SupabaseClient, orgId: string, env: NodeJS.ProcessEnv = process.env): Promise<OrgEmailStatus> {
  const [{ data: org }, cfg] = await Promise.all([admin.from('organizations').select('settings').eq('id', orgId).maybeSingle(), loadGoogleOrgConfig(admin, orgId).catch(() => null)]);
  const choice = ((org as { settings?: { notifications?: { email_provider?: EmailProviderChoice } } } | null)?.settings?.notifications?.email_provider) ?? null;
  const resend = emailProviderStatus(env);
  const gmailConnected = !!cfg && cfg.scopes.includes('https://www.googleapis.com/auth/gmail.send');
  const eff = resolveEmailProviderChoice(choice, { gmailConnected, resendConfigured: resend.configured });
  const gmail_from = cfg ? formatAddress(cfg.email, cfg.display_name) : null;
  if (eff === 'gmail') return { provider: 'gmail', configured: true, from: gmail_from, choice, gmail_connected: gmailConnected, gmail_from };
  if (eff === 'resend') return { ...resend, choice, gmail_connected: gmailConnected, gmail_from };
  if (eff === 'off') return { provider: 'log', configured: false, from: null, reason: 'E-posta sağlayıcısı ayarlardan kapatıldı', choice, gmail_connected: gmailConnected, gmail_from };
  return { ...resend, reason: choice === 'gmail' ? `Gmail seçili ama posta kutusu bağlı değil; ${resend.reason}` : resend.reason, choice, gmail_connected: gmailConnected, gmail_from };
}
/** Org'a bağlı `send` işlevi: bildirim işleri ve deneme gönderimi aynı kapıdan. */
export async function resolveOrgSender(admin: SupabaseClient, orgId: string, deps: OAuthDeps & { env?: NodeJS.ProcessEnv } = {}): Promise<{ status: OrgEmailStatus; send: (m: EmailMessage) => Promise<EmailResult> }> {
  const status = await orgEmailStatus(admin, orgId, deps.env);
  if (status.provider === 'gmail') {
    const gmail = await createGmailSender(admin, orgId, deps).catch((e: unknown) => { status.reason = e instanceof Error ? e.message : 'Gmail token alınamadı'; return null; });
    if (gmail) return { status, send: (m) => sendEmail(m, { env: deps.env, fetch: deps.fetchImpl, gmail }) };
    const fallback = emailProviderStatus(deps.env);
    return { status: { ...status, provider: fallback.provider, configured: fallback.configured, from: fallback.from, reason: `Gmail gönderici kurulamadı (${status.reason ?? 'token'}); ${fallback.reason ?? 'Resend'}` }, send: (m) => sendEmail(m, { env: deps.env, fetch: deps.fetchImpl }) };
  }
  if (status.choice === 'off') return { status, send: (m) => sendEmail(m, { env: deps.env, off: true }) };
  return { status, send: (m) => sendEmail(m, { env: deps.env, fetch: deps.fetchImpl }) };
}
