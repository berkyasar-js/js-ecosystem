import type { SupabaseClient } from '@supabase/supabase-js';
import type { CalendarEvent } from '@jscore/contracts';
import { GoogleApiError, getAccessToken, loadGoogleOrgConfig, type OAuthDeps, type TokenOwner } from './google-oauth';

/**
 * Google Takvim (calendar.readonly): sonraki N gün etkinlikleri, bellek içi 5 dk önbellek (anahtar = sahip + takvim + aralık; ETag ile 304).
 * DB yok; istek anında çekilir. Kişisel (user_integrations) ve ajans takvimi (org posta kutusu) aynı yoldan.
 */
const API = 'https://www.googleapis.com/calendar/v3';
interface GEvent { id: string; status?: string; summary?: string; htmlLink?: string; location?: string; start?: { date?: string; dateTime?: string }; end?: { date?: string; dateTime?: string }; eventType?: string }
interface GList { items?: GEvent[]; nextPageToken?: string; etag?: string }
export const CAL_CACHE_TTL_MS = 5 * 60_000;
interface CacheEntry { at: number; etag: string | null; events: CalendarEvent[] }
const cache = new Map<string, CacheEntry>();
export const _calendarCache = cache; // test

/** SAF: Google etkinliği → CalendarEvent (iptal edilenler ve "çalışma yeri" türleri düşer). */
export function normalizeEvent(e: GEvent, source: CalendarEvent['source'], calendar?: string): CalendarEvent | null {
  if (e.status === 'cancelled' || e.eventType === 'workingLocation' || e.eventType === 'outOfOffice' && !e.summary) return null;
  const start = e.start?.dateTime ?? e.start?.date; const end = e.end?.dateTime ?? e.end?.date ?? start;
  if (!start) return null;
  return { id: e.id, title: (e.summary ?? '').trim() || '(başlıksız)', start, end: end ?? start, all_day: !e.start?.dateTime, html_link: e.htmlLink ?? null, location: e.location ?? null, source, calendar };
}

export async function fetchCalendarEvents(token: string, o: { calendarId?: string; timeMin: string; timeMax: string; source: CalendarEvent['source']; fetchImpl?: typeof fetch; cacheKey?: string; now?: number }): Promise<CalendarEvent[]> {
  const calendarId = o.calendarId || 'primary';
  const key = o.cacheKey ?? `${o.source}:${calendarId}:${o.timeMin.slice(0, 13)}:${o.timeMax.slice(0, 13)}`;
  const now = o.now ?? Date.now();
  const hit = cache.get(key);
  if (hit && now - hit.at < CAL_CACHE_TTL_MS) return hit.events;
  const f = o.fetchImpl ?? fetch;
  const all: CalendarEvent[] = []; let etag: string | null = null;
  for (let pageToken: string | undefined; ;) {
    const u = new URL(`${API}/calendars/${encodeURIComponent(calendarId)}/events`);
    u.searchParams.set('singleEvents', 'true'); u.searchParams.set('orderBy', 'startTime'); u.searchParams.set('timeMin', o.timeMin); u.searchParams.set('timeMax', o.timeMax); u.searchParams.set('maxResults', '250');
    u.searchParams.set('fields', 'items(id,status,summary,htmlLink,location,start,end,eventType),nextPageToken,etag');
    if (pageToken) u.searchParams.set('pageToken', pageToken);
    const r = await f(u, { headers: { authorization: `Bearer ${token}`, ...(hit?.etag && !pageToken ? { 'if-none-match': hit.etag } : {}) }, signal: AbortSignal.timeout(15_000), cache: 'no-store' });
    if (r.status === 304 && hit) { cache.set(key, { ...hit, at: now }); return hit.events; }
    if (!r.ok) {
      const txt = (await r.text().catch(() => '')).slice(0, 300);
      throw new GoogleApiError(r.status, r.status === 401 ? 'Takvim yetkisi geçersiz — yeniden bağlan' : r.status === 403 ? 'Takvim okuma kapsamı yok' : r.status === 404 ? 'Takvim bulunamadı' : `Takvim ${r.status}: ${txt}`);
    }
    const j = (await r.json()) as GList;
    etag = etag ?? j.etag ?? null;
    for (const e of j.items ?? []) { const n = normalizeEvent(e, o.source, calendarId); if (n) all.push(n); }
    pageToken = j.nextPageToken; if (!pageToken || all.length >= 500) break;
  }
  cache.set(key, { at: now, etag, events: all });
  return all;
}
/** Aralık: bugünden (00:00) N gün. */
export const calendarWindow = (today: string, days: number) => ({ timeMin: `${today}T00:00:00.000Z`, timeMax: new Date(new Date(`${today}T00:00:00Z`).getTime() + days * 86400000).toISOString() });

/** Kişisel + (isteğe bağlı) ajans takvimi; bağlı olmayan kaynak sessizce boş döner, hata mesajı `errors`'a. */
export async function loadAgendaEvents(admin: SupabaseClient, o: { userId: string; orgId: string; today: string; days: number; includeOrg: boolean; deps?: OAuthDeps }): Promise<{ events: CalendarEvent[]; me: boolean; org: boolean; errors: string[] }> {
  const win = calendarWindow(o.today, o.days);
  const out = { events: [] as CalendarEvent[], me: false, org: false, errors: [] as string[] };
  const pull = async (owner: TokenOwner, source: CalendarEvent['source'], calendarId: string) => {
    const tok = await getAccessToken(admin, owner, o.deps ?? {});
    if (!tok || !tok.scopes.includes('https://www.googleapis.com/auth/calendar.readonly')) return false;
    out.events.push(...await fetchCalendarEvents(tok.token, { calendarId, ...win, source, fetchImpl: o.deps?.fetchImpl, cacheKey: `${source}:${owner.kind === 'org' ? owner.orgId : owner.userId}:${calendarId}:${o.today}:${o.days}` }));
    return true;
  };
  try { out.me = await pull({ kind: 'user', userId: o.userId }, 'me', 'primary'); } catch (e) { out.errors.push(`Takvimim: ${e instanceof Error ? e.message : String(e)}`); }
  if (o.includeOrg) {
    try { const cfg = await loadGoogleOrgConfig(admin, o.orgId); if (cfg) out.org = await pull({ kind: 'org', orgId: o.orgId }, 'org', cfg.calendar_id || 'primary'); }
    catch (e) { out.errors.push(`Ajans takvimi: ${e instanceof Error ? e.message : String(e)}`); }
  }
  return out;
}
