import type { SupabaseClient } from '@supabase/supabase-js';
import { hubspotConfigSchema, type HubSpotConfig, type HubSpotPipeline, type SyncLogEntry } from '@jscore/contracts';

/**
 * HubSpot REST v3 istemcisi (companies, contacts, deals, pipelines, owners, associations v4) + integrations.config yapılandırması + senkron günlüğü.
 * YALNIZCA SUNUCU: özel uygulama (private app) token'ı integrations.config.token içinde saklanır, istemciye hiç inmez (bkz. maskHubSpotConfig).
 * Hız sınırı: 429 → Retry-After (ya da artan bekleme) ile yeniden dener; 5xx bir kez daha denenir. Sayfalama: paging.next.after.
 */
const API = 'https://api.hubapi.com';
export class HubSpotApiError extends Error {
  constructor(public status: number, msg: string, public category?: string) { super(msg); this.name = 'HubSpotApiError'; }
}
const sleepReal = (ms: number) => new Promise((r) => setTimeout(r, ms));

export interface HubSpotFetchOpts {
  method?: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE'; params?: Record<string, string>; body?: unknown;
  fetchImpl?: typeof fetch; timeoutMs?: number; maxRetries?: number; sleep?: (ms: number) => Promise<unknown>;
}
/** Retry-After başlığı (saniye ya da HTTP tarihi) → ms; yoksa null. */
export function retryAfterMs(header: string | null | undefined, now = Date.now()): number | null {
  if (!header) return null;
  const s = Number(header);
  if (Number.isFinite(s)) return Math.max(0, s * 1000);
  const d = Date.parse(header);
  return Number.isNaN(d) ? null : Math.max(0, d - now);
}
/** Deneme sırasına göre bekleme (ms): Retry-After varsa o, yoksa 1s·2^n (+jitter yok: testlenebilir), en çok 20 sn. */
export const backoffMs = (attempt: number, retryAfter: number | null) => Math.min(20_000, retryAfter ?? 1000 * 2 ** attempt);

export async function hubspotFetch<T>(token: string, path: string, opts: HubSpotFetchOpts = {}): Promise<T> {
  const url = new URL(path.startsWith('http') ? path : API + path);
  for (const [k, v] of Object.entries(opts.params ?? {})) url.searchParams.set(k, v);
  const f = opts.fetchImpl ?? fetch;
  const sleep = opts.sleep ?? sleepReal;
  const max = opts.maxRetries ?? 4;
  for (let attempt = 0; ; attempt++) {
    const r = await f(url, {
      method: opts.method ?? 'GET',
      headers: { authorization: `Bearer ${token}`, accept: 'application/json', ...(opts.body !== undefined ? { 'content-type': 'application/json' } : {}) },
      body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined, signal: AbortSignal.timeout(opts.timeoutMs ?? 25_000), cache: 'no-store',
    });
    if ((r.status === 429 || r.status >= 500) && attempt < max) { await sleep(backoffMs(attempt, retryAfterMs(r.headers.get('retry-after')))); continue; }
    if (!r.ok) {
      const txt = (await r.text().catch(() => '')).slice(0, 400);
      let cat: string | undefined; let msg = txt;
      try { const j = JSON.parse(txt) as { message?: string; category?: string }; cat = j.category; msg = j.message ?? txt; } catch { /* düz metin */ }
      throw new HubSpotApiError(r.status, r.status === 401 ? 'HubSpot token geçersiz ya da süresi dolmuş' : r.status === 403 ? `HubSpot yetki hatası (uygulama kapsamları): ${msg}` : `HubSpot ${r.status}: ${msg}`, cat);
    }
    if (r.status === 204) return undefined as T;
    const txt = await r.text();
    return (txt ? JSON.parse(txt) : {}) as T;
  }
}

/* ───────── Nesne biçimleri ───────── */
export type HubSpotObject = 'companies' | 'contacts' | 'deals';
export interface HsRecord { id: string; properties: Record<string, string | null>; createdAt?: string; updatedAt?: string; archived?: boolean }
interface Page<T> { results: T[]; paging?: { next?: { after?: string } } }
export interface HsOwner { id: string; email?: string; firstName?: string; lastName?: string; userId?: number; archived?: boolean }
export interface HsAssociation { from: { id: string }; to: Array<{ toObjectId: number | string; associationTypes?: Array<{ category: string; typeId: number; label?: string | null }> }> }

export const COMPANY_PROPS = ['name', 'domain', 'industry', 'phone', 'city', 'country', 'website', 'lifecyclestage', 'hubspot_owner_id', 'description', 'hs_lastmodifieddate', 'createdate'];
export const CONTACT_PROPS = ['firstname', 'lastname', 'email', 'phone', 'mobilephone', 'jobtitle', 'company', 'hubspot_owner_id', 'lastmodifieddate', 'createdate', 'associatedcompanyid'];
export const DEAL_PROPS = ['dealname', 'amount', 'dealstage', 'pipeline', 'closedate', 'hubspot_owner_id', 'description', 'hs_lastmodifieddate', 'createdate', 'deal_currency_code', 'hs_next_step'];
/** Her nesnenin "son değişiklik" özelliği (arama filtresi). */
export const LASTMOD: Record<HubSpotObject, string> = { companies: 'hs_lastmodifieddate', contacts: 'lastmodifieddate', deals: 'hs_lastmodifieddate' };
const PROPS: Record<HubSpotObject, string[]> = { companies: COMPANY_PROPS, contacts: CONTACT_PROPS, deals: DEAL_PROPS };
const PAGE = 100;
/** HubSpot arama ucu en çok 10.000 sonuç döner; aşılırsa tam içe aktarma (liste ucu) önerilir. */
export const SEARCH_CAP = 10_000;

export class HubSpotClient {
  constructor(private token: string, private opts: Pick<HubSpotFetchOpts, 'fetchImpl' | 'sleep' | 'maxRetries' | 'timeoutMs'> = {}) {}
  private req<T>(path: string, o: HubSpotFetchOpts = {}) { return hubspotFetch<T>(this.token, path, { ...this.opts, ...o }); }

  /** Portal bilgisi (bağlantı testi). */
  accountInfo() { return this.req<{ portalId: number; uiDomain?: string; timeZone?: string }>('/account-info/v3/details'); }
  async owners(): Promise<HsOwner[]> {
    const out: HsOwner[] = [];
    for (let after: string | undefined; ;) {
      const p = await this.req<Page<HsOwner>>('/crm/v3/owners', { params: { limit: '100', ...(after ? { after } : {}) } });
      out.push(...p.results);
      after = p.paging?.next?.after; if (!after) return out;
    }
  }
  async dealPipelines(): Promise<HubSpotPipeline[]> {
    const p = await this.req<{ results: Array<{ id: string; label: string; stages: Array<{ id: string; label: string; displayOrder?: number; metadata?: { probability?: string } }> }> }>('/crm/v3/pipelines/deals');
    return p.results.map((x) => ({ id: x.id, label: x.label, stages: x.stages.map((s) => ({ id: s.id, label: s.label, display_order: s.displayOrder ?? 0, ...(s.metadata?.probability !== undefined && s.metadata.probability !== null ? { probability: Math.min(1, Math.max(0, Number(s.metadata.probability) || 0)) } : {}) })) }));
  }
  /** Tüm kayıtlar (liste ucu; `after` sayfalaması). `onPage` ile akış halinde işlenebilir. */
  async listAll(object: HubSpotObject, onPage?: (rows: HsRecord[]) => Promise<void> | void, props: string[] = PROPS[object]): Promise<HsRecord[]> {
    const out: HsRecord[] = [];
    for (let after: string | undefined; ;) {
      const p = await this.req<Page<HsRecord>>(`/crm/v3/objects/${object}`, { params: { limit: String(PAGE), properties: props.join(','), archived: 'false', ...(after ? { after } : {}) } });
      if (onPage) await onPage(p.results); else out.push(...p.results);
      after = p.paging?.next?.after; if (!after) return out;
    }
  }
  /** `since`'ten beri değişenler (arama ucu, hs_lastmodifieddate ≥ since). since yoksa listAll. */
  async changedSince(object: HubSpotObject, since: string | null, props: string[] = PROPS[object]): Promise<{ rows: HsRecord[]; capped: boolean }> {
    if (!since) return { rows: await this.listAll(object, undefined, props), capped: false };
    const rows: HsRecord[] = [];
    for (let after: string | undefined; ;) {
      const body = { filterGroups: [{ filters: [{ propertyName: LASTMOD[object], operator: 'GTE', value: String(Date.parse(since)) }] }], properties: props, sorts: [{ propertyName: LASTMOD[object], direction: 'ASCENDING' }], limit: PAGE, ...(after ? { after } : {}) };
      const p = await this.req<Page<HsRecord> & { total?: number }>(`/crm/v3/objects/${object}/search`, { method: 'POST', body });
      rows.push(...p.results);
      after = p.paging?.next?.after;
      if (!after) return { rows, capped: false };
      if (rows.length >= SEARCH_CAP) return { rows, capped: true };
    }
  }
  async batchRead(object: HubSpotObject, ids: string[], props: string[] = PROPS[object]): Promise<HsRecord[]> {
    const out: HsRecord[] = [];
    for (let i = 0; i < ids.length; i += 100) {
      const p = await this.req<{ results: HsRecord[] }>(`/crm/v3/objects/${object}/batch/read`, { method: 'POST', body: { properties: props, inputs: ids.slice(i, i + 100).map((id) => ({ id })) } });
      out.push(...p.results);
    }
    return out;
  }
  async getOne(object: HubSpotObject, id: string, props: string[] = PROPS[object]): Promise<HsRecord | null> {
    try { return await this.req<HsRecord>(`/crm/v3/objects/${object}/${id}`, { params: { properties: props.join(',') } }); }
    catch (e) { if (e instanceof HubSpotApiError && e.status === 404) return null; throw e; }
  }
  create(object: HubSpotObject, properties: Record<string, string>) { return this.req<HsRecord>(`/crm/v3/objects/${object}`, { method: 'POST', body: { properties } }); }
  update(object: HubSpotObject, id: string, properties: Record<string, string>) { return this.req<HsRecord>(`/crm/v3/objects/${object}/${id}`, { method: 'PATCH', body: { properties } }); }
  /** Toplu upsert (idProperty benzersiz özellik, ör. contacts → email). 100'lük gruplar. */
  async batchUpsert(object: HubSpotObject, inputs: Array<{ id: string; properties: Record<string, string> }>, idProperty: string): Promise<HsRecord[]> {
    const out: HsRecord[] = [];
    for (let i = 0; i < inputs.length; i += 100) {
      const p = await this.req<{ results: HsRecord[] }>(`/crm/v3/objects/${object}/batch/upsert`, { method: 'POST', body: { inputs: inputs.slice(i, i + 100).map((x) => ({ idProperty, id: x.id, properties: x.properties })) } });
      out.push(...p.results);
    }
    return out;
  }
  async batchUpdate(object: HubSpotObject, inputs: Array<{ id: string; properties: Record<string, string> }>): Promise<HsRecord[]> {
    const out: HsRecord[] = [];
    for (let i = 0; i < inputs.length; i += 100) {
      const p = await this.req<{ results: HsRecord[] }>(`/crm/v3/objects/${object}/batch/update`, { method: 'POST', body: { inputs: inputs.slice(i, i + 100) } });
      out.push(...p.results);
    }
    return out;
  }
  /** v4 ilişkiler: from → to (100'lük gruplar). Dönüş: fromId → toId[] */
  async associations(from: HubSpotObject, to: HubSpotObject, ids: string[]): Promise<Record<string, string[]>> {
    const out: Record<string, string[]> = {};
    for (let i = 0; i < ids.length; i += 100) {
      const p = await this.req<{ results: HsAssociation[] }>(`/crm/v4/associations/${from}/${to}/batch/read`, { method: 'POST', body: { inputs: ids.slice(i, i + 100).map((id) => ({ id })) } });
      for (const r of p.results) out[String(r.from.id)] = r.to.map((t) => String(t.toObjectId));
    }
    return out;
  }
  /** Varsayılan ilişki türüyle bağla (ör. contact → company). */
  associate(from: HubSpotObject, fromId: string, to: HubSpotObject, toId: string) {
    return this.req<unknown>(`/crm/v4/objects/${from}/${fromId}/associations/default/${to}/${toId}`, { method: 'PUT' });
  }
}

/* ───────── Yapılandırma (integrations.config, provider='hubspot') ───────── */
type Row = Record<string, unknown>;
export async function loadHubSpotConfig(admin: SupabaseClient, orgId: string): Promise<HubSpotConfig | null> {
  const { data, error } = await admin.from('integrations').select('config').eq('org_id', orgId).eq('provider', 'hubspot').maybeSingle();
  if (error) throw new Error(error.message);
  const p = hubspotConfigSchema.safeParse((data as Row | null)?.config ?? {});
  return p.success ? p.data : null;
}
export async function saveHubSpotConfig(admin: SupabaseClient, orgId: string, patch: Partial<HubSpotConfig>, status: 'connected' | 'available' | 'error' = 'connected'): Promise<HubSpotConfig> {
  const { data } = await admin.from('integrations').select('id,config').eq('org_id', orgId).eq('provider', 'hubspot').maybeSingle();
  const cur = ((data as Row | null)?.config ?? {}) as Partial<HubSpotConfig>;
  const parsed = hubspotConfigSchema.parse({ ...cur, ...patch });
  const row = { config: parsed, status, last_sync_at: parsed.last_sync_at ?? null, scopes: ['crm.objects.companies.read', 'crm.objects.companies.write', 'crm.objects.contacts.read', 'crm.objects.contacts.write', 'crm.objects.deals.read', 'crm.objects.deals.write', 'crm.objects.owners.read'] };
  const q = data ? admin.from('integrations').update(row).eq('id', (data as Row).id as string) : admin.from('integrations').insert({ ...row, org_id: orgId, provider: 'hubspot', name: 'HubSpot' });
  const { error } = await q;
  if (error) throw new Error(error.message);
  return parsed;
}
/** Bağlantıyı kaldır: token silinir, eşleme/mod ayarları korunur (yeniden bağlanınca sürer). */
export async function clearHubSpotToken(admin: SupabaseClient, orgId: string): Promise<void> {
  const { data } = await admin.from('integrations').select('id,config').eq('org_id', orgId).eq('provider', 'hubspot').maybeSingle();
  if (!data) return;
  const { token: _t, ...rest } = ((data as Row).config ?? {}) as Partial<HubSpotConfig>; void _t;
  const { error } = await admin.from('integrations').update({ config: rest, status: 'available' }).eq('id', (data as Row).id as string);
  if (error) throw new Error(error.message);
}

/* ───────── Senkron günlüğü (public.integration_sync_log, provider='hubspot') ───────── */
export interface HubSpotLogDraft { direction: 'push' | 'pull' | 'reconcile'; entity: string; entity_id: string | null; external_id: string | null; action: string; ok: boolean; message: string }
export async function writeHubSpotLog(admin: SupabaseClient, orgId: string, entries: HubSpotLogDraft[]): Promise<void> {
  if (!entries.length) return;
  const rows = entries.map((e) => ({ ...e, org_id: orgId, provider: 'hubspot', message: e.message.slice(0, 500) }));
  for (let i = 0; i < rows.length; i += 200) await admin.from('integration_sync_log').insert(rows.slice(i, i + 200)).then(() => undefined, () => undefined);
}
export async function loadHubSpotLog(admin: SupabaseClient, orgId: string, limit = 50): Promise<SyncLogEntry[]> {
  const { data } = await admin.from('integration_sync_log').select('id,provider,direction,entity,entity_id,external_id,action,ok,message,created_at').eq('org_id', orgId).eq('provider', 'hubspot').order('created_at', { ascending: false }).limit(limit);
  return (data ?? []) as SyncLogEntry[];
}

/** Bağlantı testi: portal id + owner sayısı + pipeline'lar; sonuç config'e yazılır (portal_id, pipelines, owners_count). */
export async function testHubSpotConnection(admin: SupabaseClient, orgId: string, fetchImpl?: typeof fetch): Promise<{ portal_id: string; owners: number; pipelines: HubSpotPipeline[] }> {
  const cfg = await loadHubSpotConfig(admin, orgId);
  if (!cfg) throw new HubSpotApiError(400, 'HubSpot bağlı değil (token yok)');
  const c = new HubSpotClient(cfg.token, { fetchImpl });
  const [info, owners, pipelines] = await Promise.all([c.accountInfo(), c.owners(), c.dealPipelines()]);
  const portal_id = String(info.portalId);
  await saveHubSpotConfig(admin, orgId, { portal_id, pipelines, owners_count: owners.length });
  return { portal_id, owners: owners.length, pipelines };
}
