import type { SupabaseClient } from '@supabase/supabase-js';
import { matchAddressesToCrm, type CrmMatch, type MailMessage, type MailThread, type MatchSource, type SyncLogEntry } from '@jscore/contracts';
import { GoogleApiError, getAccessToken, loadGoogleOrgConfig, saveGoogleOrgConfig, type OAuthDeps } from './google-oauth';
import { buildMime, buildReferences, extractBodies, formatAddress, headerMap, htmlToText, parseAddress, parseAddressList, replySubject, sanitizeHtml, toBase64Url, type GmailMessage } from './gmail-mime';

/**
 * Gmail REST istemcisi (users.messages / history / threads / labels) + Gelen kutusu → CRM eşitlemesi (mail_threads / mail_messages) + yanıt / arşiv.
 * Hız sınırı: 429 / 5xx → artan bekleme ile 3 deneme. Yalnızca sunucu (servis rolü + şifreli token).
 */
const API = 'https://gmail.googleapis.com/gmail/v1/users/me';
const sleepReal = (ms: number) => new Promise((r) => setTimeout(r, ms));
export interface GmailFetchOpts { method?: 'GET' | 'POST' | 'DELETE'; params?: Record<string, string>; body?: unknown; fetchImpl?: typeof fetch; sleep?: (ms: number) => Promise<unknown>; maxRetries?: number }
export async function gmailFetch<T>(token: string, path: string, opts: GmailFetchOpts = {}): Promise<T> {
  const url = new URL(path.startsWith('http') ? path : API + path);
  for (const [k, v] of Object.entries(opts.params ?? {})) url.searchParams.append(k, v);
  const f = opts.fetchImpl ?? fetch; const sleep = opts.sleep ?? sleepReal; const max = opts.maxRetries ?? 3;
  for (let attempt = 0; ; attempt++) {
    const r = await f(url, { method: opts.method ?? 'GET', headers: { authorization: `Bearer ${token}`, accept: 'application/json', ...(opts.body !== undefined ? { 'content-type': 'application/json' } : {}) }, body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined, signal: AbortSignal.timeout(25_000), cache: 'no-store' });
    if ((r.status === 429 || r.status >= 500) && attempt < max) { await sleep(Math.min(20_000, 1000 * 2 ** attempt)); continue; }
    if (!r.ok) {
      const txt = (await r.text().catch(() => '')).slice(0, 400);
      let msg = txt; let reason: string | undefined;
      try { const j = JSON.parse(txt) as { error?: { message?: string; errors?: Array<{ reason?: string }> } }; msg = j.error?.message ?? txt; reason = j.error?.errors?.[0]?.reason; } catch { /* düz metin */ }
      throw new GoogleApiError(r.status, r.status === 401 ? 'Gmail yetkisi geçersiz — yeniden bağlan' : r.status === 403 ? `Gmail yetki hatası (kapsamlar): ${msg}` : `Gmail ${r.status}: ${msg}`, reason);
    }
    if (r.status === 204) return undefined as T;
    const txt = await r.text();
    return (txt ? JSON.parse(txt) : {}) as T;
  }
}
export interface GmailHistoryPage { history?: Array<{ id: string; messagesAdded?: Array<{ message: { id: string; threadId: string; labelIds?: string[] } }> }>; nextPageToken?: string; historyId: string }
export class GmailClient {
  constructor(private token: string, private opts: Pick<GmailFetchOpts, 'fetchImpl' | 'sleep' | 'maxRetries'> = {}) {}
  private req<T>(path: string, o: GmailFetchOpts = {}) { return gmailFetch<T>(this.token, path, { ...this.opts, ...o }); }
  profile() { return this.req<{ emailAddress: string; historyId: string; messagesTotal?: number }>('/profile'); }
  history(startHistoryId: string, pageToken?: string) { return this.req<GmailHistoryPage>('/history', { params: { startHistoryId, historyTypes: 'messageAdded', maxResults: '500', ...(pageToken ? { pageToken } : {}) } }); }
  list(q: string, maxResults = 100) { return this.req<{ messages?: Array<{ id: string; threadId: string }>; resultSizeEstimate?: number }>('/messages', { params: { q, maxResults: String(maxResults) } }); }
  get(id: string, format: 'full' | 'metadata' | 'minimal' = 'full') { return this.req<GmailMessage>(`/messages/${id}`, { params: { format } }); }
  send(raw: string, threadId?: string) { return this.req<{ id: string; threadId: string; labelIds?: string[] }>('/messages/send', { method: 'POST', body: { raw, ...(threadId ? { threadId } : {}) } }); }
  modifyThread(threadId: string, add: string[], remove: string[]) { return this.req<{ id: string }>(`/threads/${threadId}/modify`, { method: 'POST', body: { addLabelIds: add, removeLabelIds: remove } }); }
  labels() { return this.req<{ labels?: Array<{ id: string; name: string; type?: string }> }>('/labels'); }
  createLabel(name: string) { return this.req<{ id: string; name: string }>('/labels', { method: 'POST', body: { name, labelListVisibility: 'labelShow', messageListVisibility: 'show' } }); }
}

/* ───────── SAF: eşitleme planı / history imleci ───────── */
export const DEFAULT_LIST_QUERY = 'newer_than:14d -in:spam -in:trash -in:chats -category:promotions -category:social';
export type SyncPlan = { mode: 'history'; startHistoryId: string } | { mode: 'list'; q: string };
export function planSync(cfg: { history_id?: string | null }, q = DEFAULT_LIST_QUERY): SyncPlan {
  return cfg.history_id && /^\d+$/.test(cfg.history_id) ? { mode: 'history', startHistoryId: cfg.history_id } : { mode: 'list', q };
}
/** İki history id'den büyüğü (sayısal; BigInt). */
export function maxHistoryId(a: string | null | undefined, b: string | null | undefined): string | null {
  const va = a && /^\d+$/.test(a) ? BigInt(a) : null; const vb = b && /^\d+$/.test(b) ? BigInt(b) : null;
  if (va === null) return vb === null ? null : String(vb);
  if (vb === null) return String(va);
  return String(va > vb ? va : vb);
}
/** History sayfalarındaki eklenen ileti id'leri (tekil, sırayla) + sayfaların en büyük historyId'si. */
export function collectHistory(pages: GmailHistoryPage[]): { ids: Array<{ id: string; threadId: string }>; historyId: string | null } {
  const seen = new Set<string>(); const ids: Array<{ id: string; threadId: string }> = []; let hid: string | null = null;
  for (const p of pages) {
    hid = maxHistoryId(hid, p.historyId);
    for (const h of p.history ?? []) for (const a of h.messagesAdded ?? []) { if (!seen.has(a.message.id)) { seen.add(a.message.id); ids.push({ id: a.message.id, threadId: a.message.threadId }); } }
  }
  return { ids, historyId: hid };
}
/** Bir sonraki imleç: eski imleç geçersizse (404) profile.historyId'ye sıfırla; değilse görülen en büyük. */
export const nextHistoryId = (o: { stored: string | null | undefined; seen: string | null; profile: string; invalid: boolean }) => (o.invalid ? o.profile : maxHistoryId(maxHistoryId(o.stored, o.seen), o.profile));

/* ───────── Gmail iletisi → yerel satırlar (SAF) ───────── */
export interface ParsedMail {
  gmail_message_id: string; gmail_thread_id: string; subject: string; snippet: string; from: { email: string; name: string }; to: string[]; cc: string[]; date: string;
  text: string; html_sanitized: string; attachments: MailMessage['attachments']; message_id_header: string | null; in_reply_to: string | null; references_header: string | null; labels: string[]; unread: boolean; raw_headers: Record<string, string>;
}
const KEEP_HEADERS = ['from', 'to', 'cc', 'reply-to', 'subject', 'date', 'message-id', 'in-reply-to', 'references', 'list-unsubscribe', 'x-mailer', 'return-path'];
export function parseGmailMessage(m: GmailMessage): ParsedMail {
  const h = headerMap(m.payload?.headers);
  const b = extractBodies(m.payload);
  const from = parseAddress(h.from) ?? { email: '', name: '' };
  const date = m.internalDate ? new Date(Number(m.internalDate)).toISOString() : h.date && !Number.isNaN(Date.parse(h.date)) ? new Date(h.date).toISOString() : new Date().toISOString();
  const labels = m.labelIds ?? [];
  return {
    gmail_message_id: m.id, gmail_thread_id: m.threadId, subject: (h.subject ?? '').trim() || '(konu yok)', snippet: (m.snippet ?? htmlToText(b.text).slice(0, 200)).trim(),
    from, to: parseAddressList(h.to).map((a) => a.email), cc: parseAddressList(h.cc).map((a) => a.email), date,
    text: b.text.slice(0, 50_000), html_sanitized: sanitizeHtml(b.html).slice(0, 200_000), attachments: b.attachments, message_id_header: h['message-id'] ?? null, in_reply_to: h['in-reply-to'] ?? null, references_header: h.references ?? null,
    labels, unread: labels.includes('UNREAD'), raw_headers: Object.fromEntries(KEEP_HEADERS.filter((k) => h[k]).map((k) => [k, h[k].slice(0, 500)])),
  };
}
/** Konu satırı güncellemesi: ilk ileti gönderen/konuyu verir; son ileti snippet/son saati; okunmamış = herhangi bir gelen ileti UNREAD. */
export function foldThread(cur: Partial<MailThread> | null, p: ParsedMail, mailbox: string): Partial<MailThread> {
  const outbound = p.from.email === mailbox.toLowerCase();
  const first = !cur || !cur.first_message_at || p.date < cur.first_message_at;
  const last = !cur || !cur.last_message_at || p.date >= cur.last_message_at;
  const from_email = first ? (outbound ? (cur?.from_email ?? p.to[0] ?? p.from.email) : p.from.email) : (cur?.from_email ?? p.from.email);
  const from_name = first ? (outbound ? (cur?.from_name ?? '') : p.from.name) : (cur?.from_name ?? '');
  const to_emails = [...new Set([...(cur?.to_emails ?? []), ...p.to, ...p.cc, p.from.email])].filter(Boolean).slice(0, 20);
  return {
    gmail_thread_id: p.gmail_thread_id, subject: first || !cur?.subject ? p.subject : cur.subject, snippet: last ? p.snippet : (cur?.snippet ?? ''), from_email, from_name, to_emails,
    first_message_at: first ? p.date : cur!.first_message_at, last_message_at: last ? p.date : cur!.last_message_at, message_count: (cur?.message_count ?? 0) + 1,
    unread: (cur?.unread ?? false) || (!outbound && p.unread), archived: cur?.archived ?? false, labels: [...new Set([...(cur?.labels ?? []), ...p.labels])], raw_headers: first || !cur?.raw_headers ? p.raw_headers : cur.raw_headers,
  };
}

/* ───────── Eşitleme (servis rolü) ───────── */
export interface GmailSyncResult { org_id: string; skipped?: 'not_connected' | 'no_scope'; mode: 'history' | 'list' | 'none'; fetched: number; messages: number; threads: number; matched: number; history_id: string | null; errors: string[] }
type Row = Record<string, unknown>;
export async function loadMatchSource(admin: SupabaseClient, orgId: string): Promise<MatchSource> {
  const [c, b, k] = await Promise.all([
    admin.from('clients').select('id,email,domain').eq('org_id', orgId), admin.from('brands').select('id,client_id').eq('org_id', orgId), admin.from('client_contacts').select('id,client_id,brand_id,email').eq('org_id', orgId),
  ]);
  return { clients: (c.data ?? []) as MatchSource['clients'], brands: (b.data ?? []) as MatchSource['brands'], contacts: (k.data ?? []) as MatchSource['contacts'] };
}
export async function writeGoogleLog(admin: SupabaseClient, orgId: string, e: { direction: 'pull' | 'push' | 'reconcile'; entity: string; entity_id?: string | null; external_id?: string | null; action: string; ok: boolean; message: string }): Promise<void> {
  await admin.from('integration_sync_log').insert({ org_id: orgId, provider: 'google', direction: e.direction, entity: e.entity, entity_id: e.entity_id ?? null, external_id: e.external_id ?? null, action: e.action, ok: e.ok, message: e.message.slice(0, 500) }).then(() => undefined, () => undefined);
}
export async function loadGoogleLog(admin: SupabaseClient, orgId: string, limit = 30): Promise<SyncLogEntry[]> {
  const { data } = await admin.from('integration_sync_log').select('id,provider,direction,entity,entity_id,external_id,action,ok,message,created_at').eq('org_id', orgId).eq('provider', 'google').order('created_at', { ascending: false }).limit(limit);
  return (data ?? []) as SyncLogEntry[];
}

export async function syncGmail(admin: SupabaseClient, orgId: string, deps: OAuthDeps & { maxMessages?: number } = {}): Promise<GmailSyncResult> {
  const res: GmailSyncResult = { org_id: orgId, mode: 'none', fetched: 0, messages: 0, threads: 0, matched: 0, history_id: null, errors: [] };
  const cfg = await loadGoogleOrgConfig(admin, orgId);
  if (!cfg) return { ...res, skipped: 'not_connected' };
  if (!cfg.scopes.includes('https://www.googleapis.com/auth/gmail.readonly') && !cfg.scopes.includes('https://www.googleapis.com/auth/gmail.modify')) return { ...res, skipped: 'no_scope' };
  const tok = await getAccessToken(admin, { kind: 'org', orgId }, deps);
  if (!tok) return { ...res, skipped: 'not_connected' };
  const g = new GmailClient(tok.token, { fetchImpl: deps.fetchImpl, sleep: deps.sleep });
  const mailbox = cfg.email.toLowerCase();
  try {
    const profile = await g.profile();
    let plan = planSync(cfg);
    let ids: Array<{ id: string; threadId: string }> = []; let seenHid: string | null = null; let invalid = false;
    if (plan.mode === 'history') {
      try {
        const pages: Awaited<ReturnType<GmailClient['history']>>[] = [];
        for (let pt: string | undefined; ;) { const p = await g.history(plan.startHistoryId, pt); pages.push(p); pt = p.nextPageToken; if (!pt || pages.length >= 10) break; }
        const c = collectHistory(pages); ids = c.ids; seenHid = c.historyId;
      } catch (e) {
        if (e instanceof GoogleApiError && (e.status === 404 || e.status === 400)) { invalid = true; plan = { mode: 'list', q: DEFAULT_LIST_QUERY }; } else throw e;
      }
    }
    if (plan.mode === 'list') { const l = await g.list(plan.q, deps.maxMessages ?? 100); ids = (l.messages ?? []).map((m) => ({ id: m.id, threadId: m.threadId })); }
    res.mode = plan.mode;
    // zaten çekilmiş iletiler
    const known = new Set<string>();
    for (let i = 0; i < ids.length; i += 200) {
      const { data } = await admin.from('mail_messages').select('gmail_message_id').eq('org_id', orgId).in('gmail_message_id', ids.slice(i, i + 200).map((x) => x.id));
      for (const r of (data ?? []) as Array<{ gmail_message_id: string }>) known.add(r.gmail_message_id);
    }
    const fresh = ids.filter((x) => !known.has(x.id)).slice(0, deps.maxMessages ?? 100);
    res.fetched = fresh.length;
    const src = fresh.length ? await loadMatchSource(admin, orgId) : null;
    const ownDomains = [mailbox.split('@')[1] ?? ''];
    const touched = new Set<string>();
    for (const x of fresh) {
      try {
        const parsed = parseGmailMessage(await g.get(x.id, 'full'));
        if (['DRAFT', 'SPAM', 'TRASH', 'CHAT'].some((l) => parsed.labels.includes(l))) continue;
        const { data: curRow } = await admin.from('mail_threads').select('*').eq('org_id', orgId).eq('gmail_thread_id', parsed.gmail_thread_id).maybeSingle();
        const cur = (curRow as MailThread | null) ?? null;
        const folded = foldThread(cur, parsed, mailbox);
        let match: CrmMatch | null = null;
        if (!cur?.client_id && src) match = matchAddressesToCrm([parsed.from.email, ...parsed.to, ...parsed.cc], src, ownDomains);
        const threadRow: Row = { ...folded, org_id: orgId, ...(match ? { client_id: match.client_id, brand_id: match.brand_id, contact_id: match.contact_id } : {}), updated_at: new Date().toISOString() };
        let threadId = cur?.id;
        if (cur) { const { error } = await admin.from('mail_threads').update(threadRow).eq('id', cur.id); if (error) throw new Error(error.message); }
        else { const { data, error } = await admin.from('mail_threads').insert(threadRow).select('id').single(); if (error) throw new Error(error.message); threadId = (data as { id: string }).id; }
        if (match) res.matched++;
        const outbound = parsed.from.email === mailbox;
        const { error: me } = await admin.from('mail_messages').upsert({
          org_id: orgId, thread_id: threadId, gmail_message_id: parsed.gmail_message_id, from_email: parsed.from.email, from_name: parsed.from.name, to_emails: parsed.to, cc_emails: parsed.cc, date: parsed.date,
          text: parsed.text, html_sanitized: parsed.html_sanitized, attachments: parsed.attachments, message_id_header: parsed.message_id_header, in_reply_to: parsed.in_reply_to, references_header: parsed.references_header, outbound,
        }, { onConflict: 'gmail_message_id' });
        if (me) throw new Error(me.message);
        res.messages++; touched.add(parsed.gmail_thread_id);
      } catch (e) { res.errors.push(`${x.id}: ${e instanceof Error ? e.message : String(e)}`); }
    }
    res.threads = touched.size;
    res.history_id = nextHistoryId({ stored: cfg.history_id, seen: seenHid, profile: profile.historyId, invalid });
    const { count: tc } = await admin.from('mail_threads').select('id', { count: 'exact', head: true }).eq('org_id', orgId);
    const { count: mc } = await admin.from('mail_messages').select('id', { count: 'exact', head: true }).eq('org_id', orgId);
    const { count: kc } = await admin.from('mail_threads').select('id', { count: 'exact', head: true }).eq('org_id', orgId).not('client_id', 'is', null);
    await saveGoogleOrgConfig(admin, orgId, { history_id: res.history_id ?? undefined, last_sync_at: new Date().toISOString(), last_sync_error: res.errors.length ? res.errors[0].slice(0, 300) : undefined, counts: { threads: tc ?? 0, messages: mc ?? 0, matched: kc ?? 0 } }, 'connected');
    await writeGoogleLog(admin, orgId, { direction: 'pull', entity: 'mail', action: 'sync', ok: res.errors.length === 0, message: `${res.mode} · ${res.messages} ileti · ${res.threads} konu · ${res.matched} eşleşti${res.errors.length ? ` · ${res.errors.length} hata` : ''}` });
    return res;
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    await saveGoogleOrgConfig(admin, orgId, { last_sync_error: msg.slice(0, 300) }, e instanceof GoogleApiError && e.status === 401 ? 'error' : 'connected').catch(() => undefined);
    await writeGoogleLog(admin, orgId, { direction: 'pull', entity: 'mail', action: 'sync', ok: false, message: msg });
    res.errors.push(msg);
    return res;
  }
}

/* ───────── Eylemler: yanıt / arşiv / okundu / yeniden eşle ───────── */
export const ARCHIVE_LABEL = 'JS/İşlendi';
async function ensureArchiveLabel(admin: SupabaseClient, orgId: string, g: GmailClient, cfg: { archive_label_id?: string }): Promise<string> {
  if (cfg.archive_label_id) return cfg.archive_label_id;
  const ls = await g.labels();
  let id = ls.labels?.find((l) => l.name === ARCHIVE_LABEL)?.id;
  if (!id) id = (await g.createLabel(ARCHIVE_LABEL)).id;
  await saveGoogleOrgConfig(admin, orgId, { archive_label_id: id });
  return id;
}
async function orgGmail(admin: SupabaseClient, orgId: string, deps: OAuthDeps) {
  const cfg = await loadGoogleOrgConfig(admin, orgId); if (!cfg) throw new GoogleApiError(400, 'Google posta kutusu bağlı değil');
  const tok = await getAccessToken(admin, { kind: 'org', orgId }, deps); if (!tok) throw new GoogleApiError(400, 'Google posta kutusu bağlı değil');
  return { cfg, g: new GmailClient(tok.token, { fetchImpl: deps.fetchImpl, sleep: deps.sleep }) };
}
async function loadThread(admin: SupabaseClient, orgId: string, id: string): Promise<{ thread: MailThread; messages: MailMessage[] }> {
  const { data: t, error } = await admin.from('mail_threads').select('*').eq('org_id', orgId).eq('id', id).maybeSingle();
  if (error) throw new Error(error.message); if (!t) throw new GoogleApiError(404, 'Konu bulunamadı');
  const { data: ms } = await admin.from('mail_messages').select('*').eq('thread_id', id).order('date');
  return { thread: t as MailThread, messages: (ms ?? []) as MailMessage[] };
}
/** Yanıt: son iletiye In-Reply-To/References ile, aynı Gmail konusunda; gönderilen ileti mail_messages'a yazılır. */
export async function replyToThread(admin: SupabaseClient, orgId: string, id: string, input: { text: string; html?: string; actorName?: string }, deps: OAuthDeps = {}): Promise<{ gmail_message_id: string }> {
  const text = input.text.trim(); if (!text) throw new GoogleApiError(400, 'Yanıt metni boş');
  const { cfg, g } = await orgGmail(admin, orgId, deps);
  if (!cfg.scopes.includes('https://www.googleapis.com/auth/gmail.send')) throw new GoogleApiError(403, 'gmail.send kapsamı yok — org posta kutusunu yeniden bağla');
  const { thread, messages } = await loadThread(admin, orgId, id);
  const last = messages[messages.length - 1];
  const mailbox = cfg.email.toLowerCase();
  const lastInbound = [...messages].reverse().find((m) => !m.outbound) ?? last;
  const to = lastInbound ? (lastInbound.outbound ? lastInbound.to_emails : [lastInbound.from_email]) : [thread.from_email];
  const cc = lastInbound ? [...lastInbound.to_emails, ...lastInbound.cc_emails].filter((e) => e !== mailbox && !to.includes(e)) : [];
  const html = input.html ?? `<div style="font-family:system-ui,sans-serif;font-size:14px;line-height:1.5">${text.split('\n').map((l) => l.replace(/&/g, '&amp;').replace(/</g, '&lt;')).join('<br />')}</div>`;
  const raw = buildMime({
    from: formatAddress(cfg.email, cfg.display_name), to, cc: cc.length ? cc : undefined, replyTo: formatAddress(cfg.email, cfg.display_name), subject: replySubject(thread.subject), text, html,
    inReplyTo: last?.message_id_header ?? null, references: buildReferences(last?.references_header, last?.message_id_header),
  });
  const sent = await g.send(toBase64Url(raw), thread.gmail_thread_id);
  const now = new Date().toISOString();
  await admin.from('mail_messages').upsert({ org_id: orgId, thread_id: thread.id, gmail_message_id: sent.id, from_email: mailbox, from_name: cfg.display_name, to_emails: to, cc_emails: cc, date: now, text, html_sanitized: sanitizeHtml(html), attachments: [], message_id_header: null, in_reply_to: last?.message_id_header ?? null, references_header: buildReferences(last?.references_header, last?.message_id_header), outbound: true }, { onConflict: 'gmail_message_id' });
  await admin.from('mail_threads').update({ snippet: text.slice(0, 200), last_message_at: now, message_count: thread.message_count + 1, unread: false, updated_at: now }).eq('id', thread.id);
  await admin.from('email_log').insert({ org_id: orgId, user_id: null, kind: 'reply', to_email: to.join(', '), subject: replySubject(thread.subject), status: 'sent', provider_id: sent.id, error: null }).then(() => undefined, () => undefined);
  await writeGoogleLog(admin, orgId, { direction: 'push', entity: 'mail', entity_id: thread.id, external_id: sent.id, action: 'reply', ok: true, message: `${input.actorName ?? 'JS'} → ${to.join(', ')}` });
  return { gmail_message_id: sent.id };
}
/** Arşivle: Gmail'de INBOX/UNREAD kaldırılır, "JS/İşlendi" etiketi eklenir; yerelde archived=true. */
export async function archiveThread(admin: SupabaseClient, orgId: string, id: string, deps: OAuthDeps = {}): Promise<void> {
  const { cfg, g } = await orgGmail(admin, orgId, deps);
  const { thread } = await loadThread(admin, orgId, id);
  if (cfg.scopes.includes('https://www.googleapis.com/auth/gmail.modify')) {
    const label = await ensureArchiveLabel(admin, orgId, g, cfg);
    await g.modifyThread(thread.gmail_thread_id, [label], ['INBOX', 'UNREAD']);
  }
  await admin.from('mail_threads').update({ archived: true, unread: false, labels: [...new Set([...thread.labels.filter((l) => l !== 'INBOX' && l !== 'UNREAD'), ARCHIVE_LABEL])], updated_at: new Date().toISOString() }).eq('id', thread.id);
  await writeGoogleLog(admin, orgId, { direction: 'push', entity: 'mail', entity_id: thread.id, external_id: thread.gmail_thread_id, action: 'archive', ok: true, message: thread.subject.slice(0, 120) });
}
/** Okundu: yerelde unread=false; gmail.modify varsa Gmail'de UNREAD kaldırılır (best-effort). */
export async function markThreadRead(admin: SupabaseClient, orgId: string, id: string, deps: OAuthDeps = {}): Promise<void> {
  const { thread } = await loadThread(admin, orgId, id);
  if (!thread.unread) return;
  await admin.from('mail_threads').update({ unread: false, updated_at: new Date().toISOString() }).eq('id', thread.id);
  try { const { cfg, g } = await orgGmail(admin, orgId, deps); if (cfg.scopes.includes('https://www.googleapis.com/auth/gmail.modify')) await g.modifyThread(thread.gmail_thread_id, [], ['UNREAD']); } catch { /* best-effort */ }
}
/** Eşleşmeyen konuları yeniden eşle (kişi eklendikten sonra). */
export async function rematchThreads(admin: SupabaseClient, orgId: string, mailbox: string): Promise<number> {
  const src = await loadMatchSource(admin, orgId);
  const { data } = await admin.from('mail_threads').select('id,from_email,to_emails').eq('org_id', orgId).is('client_id', null).limit(500);
  let n = 0;
  for (const t of (data ?? []) as Array<{ id: string; from_email: string; to_emails: string[] }>) {
    const m = matchAddressesToCrm([t.from_email, ...t.to_emails], src, [mailbox.split('@')[1] ?? '']);
    if (m) { await admin.from('mail_threads').update({ client_id: m.client_id, brand_id: m.brand_id, contact_id: m.contact_id, updated_at: new Date().toISOString() }).eq('id', t.id); n++; }
  }
  return n;
}
