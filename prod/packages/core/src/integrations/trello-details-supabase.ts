import { randomUUID } from 'node:crypto';
import type { SupabaseClient } from '@supabase/supabase-js';
import { MAX_ATTACHMENT_BYTES, type TaskAttachment, type TaskCheckItem, type TaskChecklist, type TaskComment, type TaskCover, type TrelloConfig } from '@jscore/contracts';
import { TrelloApiError, trelloDownload, trelloFetch, type TrelloCreds } from './trello-http';
import {
  DETAIL_TABLES, applyDetailOp, pushDetailWith, syncCardDetails, type CardDetails, type DetailChange, type DetailOp, type DetailPushPorts, type DetailPushResult, type DetailStore,
  type DetailSyncOpts, type DetailTable, type JsDetails, type TrelloAttachment, type TrelloChecklist, type TrelloCommentAction,
} from './trello-details';
import type { SyncLogDraft, TrelloCard } from './trello-map';

/** Supabase (servis rolü) + Trello HTTP uygulaması: ayrıntı deposu, kart ayrıntı çekimi, itme portları. YALNIZCA SUNUCU. */
type Row = Record<string, unknown>;
export const FILES_BUCKET = 'task-files';
const safeName = (n: string) => n.normalize('NFKD').replace(/[^\w.-]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 100) || 'dosya';
const err = (e: { message: string } | null) => { if (e) throw new Error(e.message); };

export class SupabaseDetailStore implements DetailStore {
  constructor(private admin: SupabaseClient, private orgId: string) {}
  /** Trello kaynaklı her yazma işaretlenir: geri itilmez (tetikleyici synced_at'i updated_at'e eşitler). */
  private mark() { return { sync_origin: 'trello', synced_at: new Date().toISOString() }; }
  async load(taskId: string): Promise<JsDetails> {
    const q = <T,>(table: string, f: (b: any) => any): Promise<T[]> => f(this.admin.from(table).select('*').eq('org_id', this.orgId)).then((r: { data: T[] | null; error: { message: string } | null }) => { err(r.error); return r.data ?? []; }); // eslint-disable-line @typescript-eslint/no-explicit-any
    const [t, comments, lists, attachments] = await Promise.all([
      this.admin.from('tasks').select('description,cover').eq('id', taskId).eq('org_id', this.orgId).maybeSingle(),
      q<TaskComment>('task_comments', (b) => b.eq('task_id', taskId).order('created_at')),
      q<Omit<TaskChecklist, 'items'>>('task_checklists', (b) => b.eq('task_id', taskId).order('position')),
      q<TaskAttachment>('task_attachments', (b) => b.eq('task_id', taskId).order('created_at')),
    ]);
    err(t.error);
    const items = lists.length ? await q<TaskCheckItem>('task_check_items', (b) => b.in('checklist_id', lists.map((l) => l.id)).order('position')) : [];
    const task = (t.data ?? {}) as { description?: string | null; cover?: TaskCover | null };
    return { description: task.description ?? null, cover: task.cover ?? null, comments, attachments, checklists: lists.map((l) => ({ ...l, items: items.filter((i) => i.checklist_id === l.id) })) };
  }
  private async ins(table: string, row: Row): Promise<{ id: string }> {
    const r = await this.admin.from(table).insert({ ...row, org_id: this.orgId, ...this.mark() }).select('id').single();
    err(r.error); return r.data as { id: string };
  }
  private async upd(table: string, id: string, patch: Row) { err((await this.admin.from(table).update({ ...patch, ...this.mark() }).eq('id', id).eq('org_id', this.orgId)).error); }
  /** Önce 'trello_delete' ile işaretle (olay süzgeci geri itmesin), sonra sil. */
  private async del(table: string, id: string) {
    err((await this.admin.from(table).update({ sync_origin: 'trello_delete', synced_at: new Date().toISOString() }).eq('id', id).eq('org_id', this.orgId)).error);
    err((await this.admin.from(table).delete().eq('id', id).eq('org_id', this.orgId)).error);
  }
  async setTaskFields(taskId: string, patch: { description?: string | null; cover?: TaskCover | null }) { await this.upd('tasks', taskId, patch); }
  addComment(taskId: string, c: Row & { created_at: string }) { return this.ins('task_comments', { task_id: taskId, ...c }); }
  updateComment(id: string, p: { body: string }) { return this.upd('task_comments', id, p); }
  deleteComment(id: string) { return this.del('task_comments', id); }
  addChecklist(taskId: string, c: Row) { return this.ins('task_checklists', { task_id: taskId, ...c }); }
  updateChecklist(id: string, p: Row) { return this.upd('task_checklists', id, p); }
  deleteChecklist(id: string) { return this.del('task_checklists', id); }
  addCheckItem(checklistId: string, i: Row) { return this.ins('task_check_items', { checklist_id: checklistId, ...i }); }
  updateCheckItem(id: string, p: Row) { return this.upd('task_check_items', id, p); }
  deleteCheckItem(id: string) { return this.del('task_check_items', id); }
  addAttachment(taskId: string, a: Row) { return this.ins('task_attachments', { task_id: taskId, ...a }); }
  updateAttachment(id: string, p: Row) { return this.upd('task_attachments', id, p); }
  async deleteAttachment(id: string) {
    const { data } = await this.admin.from('task_attachments').select('storage_path').eq('id', id).eq('org_id', this.orgId).maybeSingle();
    await this.del('task_attachments', id);
    const path = (data as Row | null)?.storage_path as string | undefined;
    if (path) await this.admin.storage.from(FILES_BUCKET).remove([path]).then(() => undefined, () => undefined);
  }
}

/* ───────── Trello'dan ayrıntı çekimi (kart başına, hız sınırına duyarlı: yalnızca gerekli uçlar) ───────── */
export interface JsHas { checklists: boolean; comments: boolean; attachments: boolean }
export type DetailPart = 'checklists' | 'comments' | 'attachments';
/**
 * Rozetlerden (badges / idChecklists) kartta olabilecek parçaları çıkarır; yoksa istek atmaz. JS'te bağlı satır varsa da çekilir
 * (Trello'da silinmişse JS'ten kaldırılabilsin). `only`: webhook'ta yalnızca ilgili parça; açıklama / kapak kartın kendi alanlarından gelir.
 */
export async function fetchCardDetails(creds: TrelloCreds, card: TrelloCard, has: JsHas, only?: DetailPart[], fetchImpl?: typeof fetch): Promise<CardDetails> {
  const out: CardDetails = only ? {} : { desc: card.desc ?? '', cover: card.cover ?? null };
  const want = (p: DetailPart) => !only || only.includes(p);
  if (want('checklists')) {
    const may = (card.idChecklists?.length ?? 0) > 0 || (card.badges?.checkItems ?? 0) > 0 || has.checklists || !!only;
    out.checklists = may ? await trelloFetch<TrelloChecklist[]>(creds, `/cards/${card.id}/checklists`, { params: { checkItems: 'all', checkItem_fields: 'name,state,pos,due,idMember', fields: 'name,pos,idCard' }, fetchImpl }) : [];
  }
  if (want('comments')) {
    const may = (card.badges?.comments ?? 0) > 0 || has.comments || !!only;
    if (may) {
      const a = await trelloFetch<TrelloCommentAction[]>(creds, `/cards/${card.id}/actions`, { params: { filter: 'commentCard', limit: '1000' }, fetchImpl });
      out.comments = a; out.commentsComplete = a.length < 1000;
    } else out.comments = [];
  }
  if (want('attachments')) {
    const may = (card.badges?.attachments ?? 0) > 0 || has.attachments || !!only;
    out.attachments = may ? await trelloFetch<TrelloAttachment[]>(creds, `/cards/${card.id}/attachments`, { params: { fields: 'name,url,bytes,mimeType,date,isUpload,idMember' }, fetchImpl }) : [];
  }
  return out;
}

/** Trello'ya yüklenmiş eki indirip Storage'a koyar (>25 MB → null = yalnızca bağlantı). */
export function storageDownloader(admin: SupabaseClient, orgId: string, creds: TrelloCreds, fetchImpl?: typeof fetch): NonNullable<DetailSyncOpts['download']> {
  return async (att, taskId) => {
    const f = await trelloDownload(creds, att.url, MAX_ATTACHMENT_BYTES, fetchImpl);
    if (!f) return null;
    const path = `${orgId}/${taskId}/${randomUUID()}-${safeName(att.name)}`;
    const mime = att.mimeType || f.mime || 'application/octet-stream';
    const { error } = await admin.storage.from(FILES_BUCKET).upload(path, f.data, { contentType: mime, upsert: false });
    if (error) throw new Error(`Storage: ${error.message}`);
    return { storage_path: path, bytes: f.data.byteLength, mime };
  };
}

/** Kartın JS tarafındaki var/yok bilgisi (Trello'da silinmişleri yakalamak için). */
async function jsHas(admin: SupabaseClient, orgId: string, taskId: string): Promise<JsHas> {
  const one = async (table: string) => { const { count } = await admin.from(table).select('id', { count: 'exact', head: true }).eq('org_id', orgId).eq('task_id', taskId).not('external_id', 'is', null); return (count ?? 0) > 0; };
  const [checklists, comments, attachments] = await Promise.all([one('task_checklists'), one('task_comments'), one('task_attachments')]);
  return { checklists, comments, attachments };
}
export const memberEmployeesOf = (cfg: Pick<TrelloConfig, 'member_ids'> | null): Record<string, string> =>
  Object.fromEntries(Object.entries(cfg?.member_ids ?? {}).map(([emp, tm]) => [tm, emp]));

/** Tam kart ayrıntı çekimi (içe aktarma / uzlaştırma / webhook). Sıralı: kart başına en çok 3 istek. */
export async function pullCardDetails(
  admin: SupabaseClient, orgId: string, cfg: TrelloConfig, info: { card: TrelloCard; taskId: string; jsNewer: boolean; only?: DetailPart[] }, onLog: (e: SyncLogDraft) => void, fetchImpl?: typeof fetch,
) {
  const creds: TrelloCreds = { api_key: cfg.api_key, token: cfg.token };
  const has = await jsHas(admin, orgId, info.taskId);
  const raw = await fetchCardDetails(creds, info.card, has, info.only, fetchImpl);
  return syncCardDetails(new SupabaseDetailStore(admin, orgId), info.taskId, raw, {
    memberEmployees: memberEmployeesOf(cfg), download: storageDownloader(admin, orgId, creds, fetchImpl), jsNewer: info.jsNewer, cardActivity: info.card.dateLastActivity, log: onLog,
  });
}
/** Webhook eylemi → doğrudan uygula; yetmiyorsa ilgili parçayı yeniden çek (kart yalnızca o zaman istenir). */
export async function applyWebhookOp(
  admin: SupabaseClient, orgId: string, cfg: TrelloConfig, taskId: string, op: DetailOp,
  o: { activity?: string | null; getCard: () => Promise<TrelloCard>; onLog: (e: SyncLogDraft) => void; fetchImpl?: typeof fetch },
) {
  const r = await applyDetailOp(new SupabaseDetailStore(admin, orgId), taskId, op, { log: o.onLog, cardActivity: o.activity });
  if (r.resync?.length) await pullCardDetails(admin, orgId, cfg, { card: await o.getCard(), taskId, jsNewer: false, only: r.resync }, o.onLog, o.fetchImpl);
  return r;
}

/* ───────── JS → Trello portları ───────── */
export function supabaseDetailPushPorts(admin: SupabaseClient, orgId: string, cfg: TrelloConfig, fetchImpl?: typeof fetch): DetailPushPorts {
  const creds: TrelloCreds = { api_key: cfg.api_key, token: cfg.token };
  const stamp = () => ({ sync_origin: 'trello', synced_at: new Date().toISOString() });
  return {
    cfg,
    async cardOf(taskId) {
      const { data } = await admin.from('tasks').select('source_ref').eq('id', taskId).eq('org_id', orgId).maybeSingle();
      const ref = (data as Row | null)?.source_ref as string | null | undefined;
      return ref?.startsWith('trello:') && !ref.startsWith('trello:board:') && ref !== 'trello:pending' ? ref.slice(7) : null;
    },
    async loadRow(table, id) {
      const { data, error } = await admin.from(table).select('*').eq('id', id).eq('org_id', orgId).maybeSingle();
      err(error); return (data as Row | null) ?? null;
    },
    async claim(table, id) {
      const { data } = await admin.from(table).update({ external_id: `pending:${id}`, ...stamp() }).eq('id', id).eq('org_id', orgId).is('external_id', null).select('id');
      return !!data?.length;
    },
    async link(table, id, externalId) { err((await admin.from(table).update({ external_id: externalId, ...stamp() }).eq('id', id).eq('org_id', orgId)).error); },
    request: (method, path, body) => trelloFetch(creds, path, { method, body, fetchImpl }),
    async uploadFile(cardId, row) {
      const { data, error } = await admin.storage.from(FILES_BUCKET).download(String(row.storage_path));
      if (error || !data) throw new Error(`Storage indirme: ${error?.message ?? 'boş'}`);
      const form = new FormData();
      form.set('file', data, String(row.name));
      form.set('name', String(row.name));
      if (row.mime) form.set('mimeType', String(row.mime));
      return trelloFetch<{ id: string }>(creds, `/cards/${cardId}/attachments`, { method: 'POST', form, fetchImpl, timeoutMs: 60_000 });
    },
    log: async (e) => { await admin.from('integration_sync_log').insert({ ...e, org_id: orgId, provider: 'trello', message: e.message.slice(0, 500) }).then(() => undefined, () => undefined); },
  };
}
export async function pushDetailNow(admin: SupabaseClient, orgId: string, change: DetailChange, cfg: TrelloConfig | null): Promise<DetailPushResult> {
  if (!cfg || cfg.mode !== 'two_way') return 'skipped';
  return pushDetailWith(supabaseDetailPushPorts(admin, orgId, cfg), change);
}

/**
 * Uzlaştırma: Trello kartlı görevlerde henüz Trello'ya gitmemiş (external_id yok) yorum / checklist / madde / ek satırlarını iter
 * (olay hattı kaçırdıysa), 15 dakikadan eski 'pending:' kilitlerini serbest bırakır. Sıralı ve sınırlı.
 */
export async function pushUnsyncedDetails(admin: SupabaseClient, orgId: string, cfg: TrelloConfig, cap = 60): Promise<{ pushed: number; errors: string[] }> {
  const out = { pushed: 0, errors: [] as string[] };
  const ports = supabaseDetailPushPorts(admin, orgId, cfg);
  const cutoff = new Date(Date.now() - 15 * 60_000).toISOString();
  for (const t of DETAIL_TABLES) await admin.from(t).update({ external_id: null }).eq('org_id', orgId).like('external_id', 'pending:%').lt('updated_at', cutoff).then(() => undefined, () => undefined);
  let left = cap;
  const order: Array<[DetailTable, string]> = [
    ['task_checklists', 'task_id, tasks!inner(source_ref)'], ['task_check_items', 'checklist_id, task_checklists!inner(task_id, tasks!inner(source_ref))'],
    ['task_comments', 'task_id, tasks!inner(source_ref)'], ['task_attachments', 'task_id, tasks!inner(source_ref)'],
  ];
  for (const [table, embed] of order) {
    if (left <= 0) break;
    const path = table === 'task_check_items' ? 'task_checklists.tasks.source_ref' : 'tasks.source_ref';
    const { data, error } = await admin.from(table).select(`id, ${embed}`).eq('org_id', orgId).is('external_id', null).like(path, 'trello:%').order('created_at').limit(left);
    if (error) { out.errors.push(`${table}: ${error.message}`); continue; }
    for (const r of (data ?? []) as unknown as Array<Row & { task_checklists?: { task_id?: string } }>) {
      const taskId = table === 'task_check_items' ? r.task_checklists?.task_id : (r.task_id as string);
      if (!taskId) continue;
      left--;
      const res = await pushDetailWith(ports, { table, op: 'insert', task_id: taskId, id: String(r.id), row: { id: r.id } });
      if (res === 'pushed') out.pushed++; else if (res === 'error') out.errors.push(`${table}/${r.id}`);
    }
  }
  return out;
}

export { TrelloApiError };
