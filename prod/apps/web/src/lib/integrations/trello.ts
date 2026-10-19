import { randomBytes } from 'node:crypto';
import type { SupabaseClient } from '@supabase/supabase-js';
import { trelloConfigSchema, type SyncLogEntry, type TrelloConfig, type TrelloImportResult } from '@jscore/contracts';
import {
  buildListMap, buildMemberIds, memberKey, runImport,
  type StoreTask, type SyncLogDraft, type TaskDraft, type TrelloBoard, type TrelloCard, type TrelloList, type TrelloMember, type TrelloSnapshot, type TrelloStore,
} from './trello-map';

export * from './trello-map';

/**
 * Trello HTTP istemcisi + Supabase (servis rolü) deposu. YALNIZCA SUNUCU: api_key/token integrations.config içinde
 * saklanır, istemciye hiç gönderilmez (bkz. maskTrelloConfig). Panolar sıralı, kartlar tek istek/pano → hız sınırına duyarlı.
 */
const API = 'https://api.trello.com/1';
export interface TrelloCreds { api_key: string; token: string }
export class TrelloApiError extends Error {
  constructor(public status: number, msg: string) { super(msg); this.name = 'TrelloApiError'; }
}
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export async function trelloFetch<T>(c: TrelloCreds, path: string, opts: { params?: Record<string, string>; method?: 'GET' | 'POST' | 'PUT' | 'DELETE'; body?: unknown; fetchImpl?: typeof fetch } = {}): Promise<T> {
  const url = new URL(API + path);
  for (const [k, v] of Object.entries(opts.params ?? {})) url.searchParams.set(k, v);
  const f = opts.fetchImpl ?? fetch;
  for (let attempt = 0; ; attempt++) {
    const r = await f(url, {
      method: opts.method ?? 'GET',
      headers: { authorization: `OAuth oauth_consumer_key="${c.api_key}", oauth_token="${c.token}"`, accept: 'application/json', ...(opts.body ? { 'content-type': 'application/json' } : {}) },
      body: opts.body ? JSON.stringify(opts.body) : undefined, signal: AbortSignal.timeout(25_000), cache: 'no-store',
    });
    if (r.status === 429 && attempt < 3) { await sleep(1500 * (attempt + 1)); continue; }
    if (!r.ok) {
      const t = (await r.text().catch(() => '')).slice(0, 200);
      throw new TrelloApiError(r.status, r.status === 401 ? 'Trello anahtarı/token geçersiz' : `Trello ${r.status}: ${t}`);
    }
    return (await r.json()) as T;
  }
}

export const verifyCredentials = (c: TrelloCreds) => trelloFetch<{ id: string; fullName: string; username: string }>(c, '/members/me', { params: { fields: 'fullName,username' } });
export const listBoards = (c: TrelloCreds) => trelloFetch<Array<TrelloBoard & { closed?: boolean }>>(c, '/members/me/boards', { params: { filter: 'open', fields: 'name,closed' } });

export const CARD_FIELDS = 'name,idList,idBoard,due,dueComplete,labels,idMembers,dateLastActivity,desc,shortLink,badges,idChecklists,closed';
export async function fetchBoard(c: TrelloCreds, board: TrelloBoard): Promise<TrelloSnapshot> {
  const lists = await trelloFetch<TrelloList[]>(c, `/boards/${board.id}/lists`, { params: { filter: 'all', fields: 'name,closed,idBoard' } });
  const cards = await trelloFetch<TrelloCard[]>(c, `/boards/${board.id}/cards`, { params: { filter: 'open', fields: CARD_FIELDS } });
  const members = await trelloFetch<TrelloMember[]>(c, `/boards/${board.id}/members`, { params: { fields: 'fullName,username' } });
  return { boards: [board], lists, cards: cards.map((x) => ({ ...x, idBoard: x.idBoard ?? board.id })), members };
}
/** Panolar SIRAYLA çekilir (Trello hız sınırı: 100 istek/10 sn/token). */
export async function fetchSnapshot(c: TrelloCreds, boards: TrelloBoard[]): Promise<TrelloSnapshot> {
  const out: TrelloSnapshot = { boards: [], lists: [], cards: [], members: [] };
  const seen = new Set<string>();
  for (const b of boards) {
    const s = await fetchBoard(c, b);
    out.boards.push(b); out.lists.push(...s.lists); out.cards.push(...s.cards);
    for (const m of s.members) if (!seen.has(m.id)) { seen.add(m.id); out.members.push(m); }
  }
  return out;
}

/* ───────── Yapılandırma (integrations.config) ───────── */
type Row = Record<string, unknown>;
export async function loadTrelloConfig(admin: SupabaseClient, orgId: string): Promise<TrelloConfig | null> {
  const { data, error } = await admin.from('integrations').select('config').eq('org_id', orgId).eq('provider', 'trello').maybeSingle();
  if (error) throw new Error(error.message);
  const p = trelloConfigSchema.safeParse((data as Row | null)?.config ?? {});
  return p.success ? p.data : null;
}
export async function saveTrelloConfig(admin: SupabaseClient, orgId: string, patch: Partial<TrelloConfig>, status: 'connected' | 'available' | 'error' = 'connected'): Promise<TrelloConfig> {
  const { data } = await admin.from('integrations').select('id,config').eq('org_id', orgId).eq('provider', 'trello').maybeSingle();
  const cur = ((data as Row | null)?.config ?? {}) as Partial<TrelloConfig>;
  const next = { ...cur, ...patch };
  const parsed = trelloConfigSchema.parse(next);
  const row = { config: parsed, status, last_sync_at: parsed.last_sync_at ?? null, scopes: ['boards:read', 'cards:read', 'cards:write'] };
  const q = data
    ? admin.from('integrations').update(row).eq('id', (data as Row).id as string)
    : admin.from('integrations').insert({ ...row, org_id: orgId, provider: 'trello', name: 'Trello' });
  const { error } = await q;
  if (error) throw new Error(error.message);
  return parsed;
}
export const newWebhookKey = () => randomBytes(18).toString('base64url');

/* ───────── Supabase deposu ───────── */
export class SupabaseTrelloStore implements TrelloStore {
  constructor(private admin: SupabaseClient, private orgId: string) {}
  private async all<T>(table: string, cols: string, // eslint-disable-next-line @typescript-eslint/no-explicit-any
    filter?: (q: any) => any): Promise<T[]> {
    const rows: T[] = [];
    for (let from = 0; ; from += 1000) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      let q: any = this.admin.from(table).select(cols).eq('org_id', this.orgId);
      if (filter) q = filter(q);
      const { data, error } = await q.range(from, from + 999);
      if (error) throw new Error(error.message);
      rows.push(...((data ?? []) as T[]));
      if (!data || data.length < 1000) return rows;
    }
  }
  async load() {
    const [employees, brands, projects, tasks] = await Promise.all([
      this.all<{ id: string; name: string }>('employees', 'id,name'),
      this.all<{ id: string; name: string }>('brands', 'id,name'),
      this.all<{ id: string; name: string; brand_id: string; source_ref: string | null; status: string }>('projects', 'id,name,brand_id,source_ref,status'),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      this.all<StoreTask & { sync_origin?: string | null }>('tasks', 'id,source_ref,project_id,title,assignee_id,state,priority,due_at,planned_minutes,task_type,labels,updated_at,sync_origin', (q: any) => q.like('source_ref', 'trello:%')),
    ]);
    return { employees, brands, projects, tasks };
  }
  async createBrand(name: string) {
    const c = await this.admin.from('clients').insert({ org_id: this.orgId, name }).select('id').single();
    if (c.error) throw new Error(c.error.message);
    const b = await this.admin.from('brands').insert({ org_id: this.orgId, client_id: (c.data as Row).id, name, status: 'prospect' }).select('id,name').single();
    if (b.error) throw new Error(b.error.message);
    return b.data as { id: string; name: string };
  }
  async createProject(p: { brand_id: string; name: string; type: string; source_ref?: string }) {
    const r = await this.admin.from('projects').insert({ ...p, org_id: this.orgId, status: 'active', flow_stage: 'brief' }).select('id').single();
    if (r.error) throw new Error(r.error.message);
    return r.data as { id: string };
  }
  async setProjectRef(id: string, ref: string) {
    await this.admin.from('projects').update({ source_ref: ref }).eq('id', id).eq('org_id', this.orgId).is('source_ref', null);
  }
  /** Birleştirme: projedeki tüm görevleri hedefe taşır (görev silinmez). */
  async moveProjectTasks(fromId: string, toId: string) {
    const { data, error } = await this.admin.from('tasks').update({ project_id: toId, ...this.mark() }).eq('org_id', this.orgId).eq('project_id', fromId).select('id');
    if (error) throw new Error(error.message);
    return (data ?? []).length;
  }
  async updateProject(id: string, patch: { status?: string; name?: string }) {
    const { error } = await this.admin.from('projects').update(patch).eq('id', id).eq('org_id', this.orgId);
    if (error) throw new Error(error.message);
  }
  /** Trello kaynaklı her yazma işaretlenir (sync_origin + synced_at): geri itilmez. */
  private mark() { return { sync_origin: 'trello', synced_at: new Date().toISOString() }; }
  async createTasks(rows: TaskDraft[]) {
    const { error } = await this.admin.from('tasks').insert(rows.map((r) => ({ ...r, org_id: this.orgId, client_visible: false, ...this.mark() })));
    if (error) throw new Error(error.message);
  }
  async updateTask(id: string, patch: Partial<TaskDraft>) {
    const { error } = await this.admin.from('tasks').update({ ...patch, ...this.mark() }).eq('id', id).eq('org_id', this.orgId);
    if (error) throw new Error(error.message);
  }
}

/* ───────── Senkron günlüğü (public.integration_sync_log) ───────── */
export async function writeSyncLog(admin: SupabaseClient, orgId: string, entries: SyncLogDraft[]): Promise<void> {
  if (!entries.length) return;
  const rows = entries.map((e) => ({ ...e, org_id: orgId, provider: 'trello', message: e.message.slice(0, 500) }));
  for (let i = 0; i < rows.length; i += 200) await admin.from('integration_sync_log').insert(rows.slice(i, i + 200)).then(() => undefined, () => undefined);
}
export async function loadSyncLog(admin: SupabaseClient, orgId: string, limit = 50): Promise<SyncLogEntry[]> {
  const { data } = await admin.from('integration_sync_log').select('id,provider,direction,entity,entity_id,external_id,action,ok,message,created_at').eq('org_id', orgId).eq('provider', 'trello').order('created_at', { ascending: false }).limit(limit);
  return (data ?? []) as SyncLogEntry[];
}

/* ───────── Üst düzey akışlar ───────── */
const credsOf = (c: TrelloConfig | null): TrelloCreds => { if (!c) throw new TrelloApiError(400, 'Trello bağlı değil'); return { api_key: c.api_key, token: c.token }; };

/** Tam içe aktarma: seçili panolar (yoksa tüm açık panolar). Sonunda last_sync_at yazılır. */
export async function importFromTrello(admin: SupabaseClient, orgId: string): Promise<TrelloImportResult> {
  const cfg = await loadTrelloConfig(admin, orgId);
  const creds = credsOf(cfg);
  if (cfg?.mode === 'off') throw new TrelloApiError(400, 'Trello entegrasyonu kapalı');
  let boards = await listBoards(creds);
  if (cfg?.board_ids?.length) boards = boards.filter((b) => cfg.board_ids!.includes(b.id));
  const snap = await fetchSnapshot(creds, boards.map((b) => ({ id: b.id, name: b.name })));
  const now = new Date().toISOString();
  const store = new SupabaseTrelloStore(admin, orgId);
  const logs: SyncLogDraft[] = [];
  const res = await runImport(snap, store, { now, memberMap: cfg?.member_map, onLog: (e) => logs.push(e) });
  const { employees } = await store.load();
  await saveTrelloConfig(admin, orgId, { last_sync_at: now, list_map: buildListMap(snap.lists, employees, cfg?.member_map), member_ids: buildMemberIds(snap.members, employees, cfg?.member_map) });
  await writeSyncLog(admin, orgId, logs);
  await admin.from('audit_events').insert({ org_id: orgId, action: 'trello.import', resource: 'integrations/trello', meta: { ...res, unmapped_members: res.unmapped_members.length } }).then(() => undefined, () => undefined);
  return res;
}

/** Webhook: tek kartı (ve listesini/panosunu) çekip aynı çekirdekle upsert eder. */
export async function syncCard(admin: SupabaseClient, orgId: string, cardId: string): Promise<'synced' | 'ignored' | 'not_found'> {
  const cfg = await loadTrelloConfig(admin, orgId);
  const creds = credsOf(cfg);
  let card: TrelloCard;
  try { card = await trelloFetch<TrelloCard>(creds, `/cards/${cardId}`, { params: { fields: CARD_FIELDS } }); }
  catch (e) { if (e instanceof TrelloApiError && e.status === 404) return 'not_found'; throw e; }
  const boardId = card.idBoard ?? '';
  if (cfg?.board_ids?.length && !cfg.board_ids.includes(boardId)) return 'ignored';
  const board = await trelloFetch<TrelloBoard>(creds, `/boards/${boardId}`, { params: { fields: 'name' } });
  const list = await trelloFetch<TrelloList>(creds, `/lists/${card.idList}`, { params: { fields: 'name,closed,idBoard' } });
  const members = await trelloFetch<TrelloMember[]>(creds, `/boards/${boardId}/members`, { params: { fields: 'fullName,username' } });
  const store = new SupabaseTrelloStore(admin, orgId);
  const logs: SyncLogDraft[] = [];
  await runImport({ boards: [board], lists: [list], cards: [card], members }, store, { now: new Date().toISOString(), memberMap: cfg?.member_map, onLog: (e) => logs.push(e) });
  await writeSyncLog(admin, orgId, logs);
  // Yeni liste / üye görüldüyse tersinir eşlemeleri tamamla (kısmi güncelleme; mevcut kayıtlar korunur).
  if (!cfg?.list_map?.[list.id] || members.some((m) => !Object.values(cfg?.member_ids ?? {}).includes(m.id))) {
    const { employees } = await store.load();
    await saveTrelloConfig(admin, orgId, {
      list_map: { ...buildListMap([list], employees, cfg?.member_map), ...(cfg?.list_map ?? {}) },
      member_ids: { ...buildMemberIds(members, employees, cfg?.member_map), ...(cfg?.member_ids ?? {}) },
    }).catch(() => undefined);
  }
  return 'synced';
}
/** deleteCard: görevi silmeden arşive alır. */
export async function archiveCardTask(admin: SupabaseClient, orgId: string, cardId: string) {
  const { data } = await admin.from('tasks').update({ state: 'archive', sync_origin: 'trello', synced_at: new Date().toISOString() }).eq('org_id', orgId).eq('source_ref', `trello:${cardId}`).neq('state', 'archive').select('id');
  await writeSyncLog(admin, orgId, (data ?? []).map((r: Row) => ({ direction: 'pull' as const, entity: 'task', entity_id: r.id as string, external_id: cardId, action: 'archived', ok: true, message: 'Kart Trello’da silindi/arşivlendi' })));
}

/** Kayıtlı webhook'ları Trello'dan siler (kapatma anahtarı). Veriler korunur. */
export async function deleteWebhooks(admin: SupabaseClient, orgId: string): Promise<{ removed: number; errors: string[] }> {
  const cfg = await loadTrelloConfig(admin, orgId);
  const ids = Object.values(cfg?.webhook_ids ?? {});
  if (!cfg || !ids.length) return { removed: 0, errors: [] };
  const creds = credsOf(cfg);
  let removed = 0;
  const errors: string[] = [];
  for (const id of ids) {
    try { await trelloFetch(creds, `/webhooks/${id}`, { method: 'DELETE' }); removed++; }
    catch (e) { if (e instanceof TrelloApiError && e.status === 404) removed++; else errors.push(`${id}: ${e instanceof Error ? e.message : String(e)}`); }
  }
  await saveTrelloConfig(admin, orgId, { webhook_ids: {} });
  return { removed, errors };
}

/** Pano başına webhook kaydı (callbackURL = <origin>/api/webhooks/trello?org=..&k=..). Var olanı yeniden kullanır. */
export async function registerWebhooks(admin: SupabaseClient, orgId: string, origin: string, boardIds?: string[]): Promise<{ webhook_ids: Record<string, string>; errors: string[] }> {
  const cfg = await loadTrelloConfig(admin, orgId);
  const creds = credsOf(cfg);
  const ids = boardIds?.length ? boardIds : cfg?.board_ids ?? [];
  if (!ids.length) throw new TrelloApiError(400, 'Önce pano seç');
  const key = cfg?.webhook_key ?? newWebhookKey();
  const callbackURL = `${origin.replace(/\/$/, '')}/api/webhooks/trello?org=${encodeURIComponent(orgId)}&k=${encodeURIComponent(key)}`;
  const out: Record<string, string> = { ...(cfg?.webhook_ids ?? {}) };
  const errors: string[] = [];
  for (const id of ids) {
    try {
      const w = await trelloFetch<{ id: string }>(creds, '/webhooks', { method: 'POST', body: { callbackURL, idModel: id, description: 'JS Work' } });
      out[id] = w.id;
    } catch (e) {
      try {
        const all = await trelloFetch<Array<{ id: string; idModel: string; callbackURL: string }>>(creds, `/tokens/${creds.token}/webhooks`);
        const hit = all.find((w) => w.idModel === id && w.callbackURL === callbackURL);
        if (hit) { out[id] = hit.id; continue; }
      } catch { /* aşağıda hata olarak raporlanır */ }
      errors.push(`${id}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }
  await saveTrelloConfig(admin, orgId, { webhook_ids: out, webhook_key: key, callback_url: callbackURL });
  return { webhook_ids: out, errors };
}

export { memberKey };
