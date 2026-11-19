import { z } from 'zod';
import type { SyncLogEntry } from './index';
import type { AgendaItem } from './workspace';

/* ───────── Google Workspace (Gmail + Takvim) — 0021 ─────────
 * Org posta kutusu (hello@…) Ana Yönetim Paneli'nden OAuth ile bağlanır: e-posta gönderimi (Gmail API), Gelen kutusu → CRM, ajans takvimi.
 * Kişisel bağlantı (Profil → Google): yalnızca takvim (isteğe bağlı gmail.readonly). Token'lar AES-GCM ile şifreli saklanır (INTEGRATIONS_ENC_KEY). */

export const GOOGLE_SCOPE = {
  gmail_send: 'https://www.googleapis.com/auth/gmail.send',
  gmail_readonly: 'https://www.googleapis.com/auth/gmail.readonly',
  gmail_modify: 'https://www.googleapis.com/auth/gmail.modify',
  calendar_readonly: 'https://www.googleapis.com/auth/calendar.readonly',
  userinfo_email: 'https://www.googleapis.com/auth/userinfo.email',
} as const;
/** Org posta kutusu (owner bağlar): gönder + oku + etiket (arşiv) + takvim oku. */
export const GOOGLE_ORG_SCOPES: string[] = [GOOGLE_SCOPE.gmail_send, GOOGLE_SCOPE.gmail_readonly, GOOGLE_SCOPE.gmail_modify, GOOGLE_SCOPE.calendar_readonly, GOOGLE_SCOPE.userinfo_email];
/** Kişisel bağlantı: takvim oku (+ isteğe bağlı gmail.readonly). */
export const GOOGLE_USER_SCOPES_BASE: string[] = [GOOGLE_SCOPE.calendar_readonly, GOOGLE_SCOPE.userinfo_email];
export const GOOGLE_USER_SCOPE_GMAIL = GOOGLE_SCOPE.gmail_readonly;
/** Kapsam → kısa Türkçe etiket (panel/profil rozetleri). */
export const GOOGLE_SCOPE_LABELS: Record<string, string> = {
  [GOOGLE_SCOPE.gmail_send]: 'Gmail gönder', [GOOGLE_SCOPE.gmail_readonly]: 'Gmail oku', [GOOGLE_SCOPE.gmail_modify]: 'Gmail etiket', [GOOGLE_SCOPE.calendar_readonly]: 'Takvim oku', [GOOGLE_SCOPE.userinfo_email]: 'E-posta adresi',
};
export const googleScopeLabel = (s: string) => GOOGLE_SCOPE_LABELS[s] ?? s.replace('https://www.googleapis.com/auth/', '');
export const hasScope = (scopes: string[] | null | undefined, s: string) => !!scopes?.includes(s);

/** Google token yükü (şifreli olarak config.tokens_enc içinde saklanır; istemciye hiç inmez). */
export const googleTokensSchema = z.object({
  access_token: z.string().min(1),
  refresh_token: z.string().min(1),
  /** Erişim token'ının bitişi (ISO). */
  expires_at: z.string(),
  scope: z.string().default(''),
  token_type: z.string().default('Bearer'),
});
export type GoogleTokens = z.infer<typeof googleTokensSchema>;

/** integrations.config (provider='google'): org posta kutusu. */
export const googleOrgConfigSchema = z.object({
  email: z.string().email(),
  display_name: z.string().default('Jobs Studio'),
  /** AES-GCM şifreli GoogleTokens JSON'u (enc:v1:<iv>:<tag>:<ct>). */
  tokens_enc: z.string().min(10),
  scopes: z.array(z.string()).default([]),
  connected_at: z.string(),
  connected_by: z.string().optional(),
  /** Gmail history API imleci; yoksa ilk eşitleme `newer_than:` listesiyle yapılır. */
  history_id: z.string().optional(),
  last_sync_at: z.string().optional(),
  last_sync_error: z.string().optional(),
  counts: z.object({ threads: z.number().int(), messages: z.number().int(), matched: z.number().int() }).optional(),
  /** Ajans takvimi (varsayılan 'primary'). */
  calendar_id: z.string().default('primary'),
  /** Arşiv etiketi (JS/İşlendi) id'si — ilk arşivlemede oluşturulur. */
  archive_label_id: z.string().optional(),
});
export type GoogleOrgConfig = z.infer<typeof googleOrgConfigSchema>;

/** user_integrations.config (provider='google'): kişisel bağlantı. */
export const googleUserConfigSchema = z.object({ tokens_enc: z.string().min(10), calendar_id: z.string().default('primary') });
export type GoogleUserConfig = z.infer<typeof googleUserConfigSchema>;

/** İstemciye dönen görünüm (token yok). */
export interface GooglePublicState {
  connected: boolean; email: string | null; display_name: string | null; scopes: string[]; connected_at: string | null;
  last_sync_at: string | null; last_sync_error: string | null; counts: { threads: number; messages: number; matched: number } | null;
  history_id: string | null; calendar_id: string | null;
  /** Son eşitleme 10 dk cron penceresinin 2 katından eskiyse 'stale'. */
  cron: 'ok' | 'stale' | 'never'; env_ready: boolean; enc_ready: boolean; sync_log?: SyncLogEntry[];
}
export function maskGoogleConfig(c: Partial<GoogleOrgConfig> | null | undefined, o: { now?: string; envReady: boolean; encReady: boolean }): GooglePublicState {
  const now = o.now ? Date.parse(o.now) : Date.now();
  const last = c?.last_sync_at ? Date.parse(c.last_sync_at) : NaN;
  return {
    connected: !!c?.tokens_enc && !!c?.email, email: c?.email ?? null, display_name: c?.display_name ?? null, scopes: c?.scopes ?? [], connected_at: c?.connected_at ?? null,
    last_sync_at: c?.last_sync_at ?? null, last_sync_error: c?.last_sync_error ?? null, counts: c?.counts ?? null, history_id: c?.history_id ?? null, calendar_id: c?.calendar_id ?? null,
    cron: Number.isNaN(last) ? 'never' : now - last > 2 * 10 * 60_000 ? 'stale' : 'ok', env_ready: o.envReady, enc_ready: o.encReady,
  };
}
export interface GoogleUserState { connected: boolean; email: string | null; scopes: string[]; connected_at: string | null; gmail: boolean; env_ready: boolean }

/* ───────── E-posta sağlayıcısı (organizations.settings.notifications.email_provider) ───────── */
export const EMAIL_PROVIDERS = ['gmail', 'resend', 'off'] as const;
export type EmailProviderChoice = (typeof EMAIL_PROVIDERS)[number];
export const EMAIL_PROVIDER_LABELS: Record<EmailProviderChoice, string> = { gmail: 'Gmail (Google Workspace)', resend: 'Resend', off: 'Kapalı' };
/** Seçim yoksa: Gmail bağlıysa gmail, değilse resend (env varsa) ya da yalnızca günlük. */
export function resolveEmailProviderChoice(choice: string | null | undefined, o: { gmailConnected: boolean; resendConfigured: boolean }): EmailProviderChoice | 'log' {
  if (choice === 'off') return 'off';
  if (choice === 'resend') return o.resendConfigured ? 'resend' : 'log';
  if (choice === 'gmail') return o.gmailConnected ? 'gmail' : o.resendConfigured ? 'resend' : 'log';
  return o.gmailConnected ? 'gmail' : o.resendConfigured ? 'resend' : 'log';
}

/* ───────── Gelen kutusu: mail_threads / mail_messages ───────── */
export interface MailAttachmentMeta { filename: string; mime: string; size: number; attachment_id?: string }
export interface MailThread {
  id: string; org_id: string; gmail_thread_id: string; subject: string; snippet: string; from_email: string; from_name: string; to_emails: string[];
  client_id: string | null; brand_id: string | null; contact_id: string | null; request_id: string | null;
  last_message_at: string; first_message_at: string; message_count: number; unread: boolean; archived: boolean; labels: string[]; raw_headers: Record<string, string>;
  created_at: string; updated_at: string;
}
export interface MailMessage {
  id: string; org_id: string; thread_id: string; gmail_message_id: string; from_email: string; from_name: string; to_emails: string[]; cc_emails: string[];
  date: string; text: string; html_sanitized: string; attachments: MailAttachmentMeta[]; message_id_header: string | null; in_reply_to: string | null; references_header: string | null;
  outbound: boolean; created_at: string;
}
export type MailFilter = 'all' | 'matched' | 'unmatched' | 'unread';
export const MAIL_FILTER_LABELS: Record<MailFilter, string> = { all: 'Tümü', matched: 'Eşleşen müşteri', unmatched: 'Eşleşmeyen', unread: 'Okunmamış' };
export const filterMailThreads = (rows: MailThread[], f: MailFilter) => rows.filter((t) => (f === 'matched' ? !!t.client_id : f === 'unmatched' ? !t.client_id : f === 'unread' ? t.unread : true));
export const mailCounts = (rows: MailThread[]): Record<MailFilter, number> => ({ all: rows.length, matched: rows.filter((t) => !!t.client_id).length, unmatched: rows.filter((t) => !t.client_id).length, unread: rows.filter((t) => t.unread).length });

/* ───────── Gönderen → müşteri eşleme (SAF) ───────── */
export interface MatchSource {
  clients: Array<{ id: string; email?: string | null; domain?: string | null }>;
  brands: Array<{ id: string; client_id: string }>;
  contacts: Array<{ id: string; client_id: string; brand_id?: string | null; email?: string | null }>;
}
export interface CrmMatch { client_id: string; brand_id: string | null; contact_id: string | null; via: 'contact' | 'client_email' | 'domain' }
/** Serbest e-postalar (gmail.com vb.) alan adıyla eşlenmez. */
export const PUBLIC_MAIL_DOMAINS = new Set(['gmail.com', 'googlemail.com', 'hotmail.com', 'outlook.com', 'live.com', 'yahoo.com', 'yandex.com', 'icloud.com', 'me.com', 'protonmail.com', 'proton.me', 'mail.ru', 'aol.com', 'msn.com']);
export const emailDomain = (email: string) => (email.split('@')[1] ?? '').trim().toLowerCase();
const normDomain = (d: string | null | undefined) => (d ?? '').trim().toLowerCase().replace(/^https?:\/\//, '').replace(/^www\./, '').split('/')[0];
/** Adres listesinden (gönderen önce, sonra alıcılar) ilk eşleşme: kişi e-postası → müşteri e-postası → müşteri alan adı. Marka: kişinin markası ya da müşterinin tek markası. */
export function matchAddressesToCrm(addresses: string[], src: MatchSource, ownDomains: string[] = []): CrmMatch | null {
  const own = new Set(ownDomains.map(normDomain).filter(Boolean));
  const brandOf = (clientId: string, preferred?: string | null) => {
    if (preferred) return preferred;
    const b = src.brands.filter((x) => x.client_id === clientId);
    return b.length === 1 ? b[0].id : null;
  };
  const list = addresses.map((a) => a.trim().toLowerCase()).filter((a) => a.includes('@') && !own.has(emailDomain(a)));
  for (const a of list) {
    const c = src.contacts.find((x) => (x.email ?? '').trim().toLowerCase() === a);
    if (c) return { client_id: c.client_id, brand_id: brandOf(c.client_id, c.brand_id), contact_id: c.id, via: 'contact' };
  }
  for (const a of list) {
    const c = src.clients.find((x) => (x.email ?? '').trim().toLowerCase() === a);
    if (c) return { client_id: c.id, brand_id: brandOf(c.id), contact_id: null, via: 'client_email' };
  }
  for (const a of list) {
    const d = emailDomain(a);
    if (!d || PUBLIC_MAIL_DOMAINS.has(d)) continue;
    const c = src.clients.find((x) => normDomain(x.domain) === d);
    if (c) return { client_id: c.id, brand_id: brandOf(c.id), contact_id: null, via: 'domain' };
  }
  return null;
}

/* ───────── Takvim → Ajanda (SAF) ───────── */
export interface CalendarEvent { id: string; title: string; start: string; end: string; all_day: boolean; html_link?: string | null; location?: string | null; source: 'me' | 'org'; calendar?: string }
const hhmm = (iso: string, tz: string) => { try { return new Intl.DateTimeFormat('tr-TR', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: tz }).format(new Date(iso)); } catch { return iso.slice(11, 16); } };
const dayOf = (iso: string, tz: string) => { if (/^\d{4}-\d{2}-\d{2}$/.test(iso)) return iso; try { const p = new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(iso)); return p; } catch { return iso.slice(0, 10); } };
/** Etkinlikleri gün kovalarına ekler (saat sırasıyla; görev/kilometre taşından sonra). Çok günlü etkinlik kapsadığı her güne yazılır. */
export function mergeCalendarIntoAgenda(days: Array<{ day: string; items: AgendaItem[] }>, events: CalendarEvent[], tz = 'Europe/Istanbul'): Array<{ day: string; items: AgendaItem[] }> {
  if (!days.length) return days;
  const first = days[0].day, last = days[days.length - 1].day;
  const out = days.map((d) => ({ day: d.day, items: [...d.items] }));
  const seen = new Set<string>();
  for (const e of [...events].sort((a, b) => a.start.localeCompare(b.start))) {
    const s = dayOf(e.start, tz);
    // all-day end tarihi Google'da dışlayıcıdır (end = son gün + 1)
    const endRaw = e.all_day && /^\d{4}-\d{2}-\d{2}$/.test(e.end) ? new Date(new Date(`${e.end}T00:00:00Z`).getTime() - 86400000).toISOString().slice(0, 10) : dayOf(e.end, tz);
    const en = endRaw < s ? s : endRaw;
    for (const d of out) {
      if (d.day < s || d.day > en || d.day < first || d.day > last) continue;
      const key = `${e.source}:${e.id}:${d.day}`; if (seen.has(key)) continue; seen.add(key);
      const time = e.all_day ? 'Tüm gün' : `${hhmm(e.start, tz)}–${hhmm(e.end, tz)}`;
      d.items.push({ id: `c:${e.source}:${e.id}:${d.day}`, kind: 'calendar', title: e.title || '(başlıksız)', day: d.day, href: e.html_link ?? undefined, meta: `${time}${e.source === 'org' ? ' · Ajans takvimi' : ''}${e.location ? ` · ${e.location}` : ''}` });
    }
  }
  return out;
}
