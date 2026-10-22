import { COVER_COLORS, MAX_ATTACHMENT_BYTES, type CoverColor, type TaskAttachment, type TaskCheckItem, type TaskChecklist, type TaskComment, type TaskCover, type TrelloConfig } from '@jscore/contracts';
import { isTrelloOriginWrite, resolveConflict, type SyncLogDraft } from './trello-map';

/**
 * Trello kart ayrıntıları ↔ görev ayrıntıları (açıklama, kapak, checklist, yorum, ek). SAF eşleme + port tabanlı idempotent senkron:
 *  - ÇEK  (Trello → JS): `syncCardDetails` (tam kart), `planWebhookAction` + `applyDetailOp` (webhook eylemi),
 *  - İT   (JS → Trello): `pushDetailWith` (satır değişikliği), gövde kurucuları (`commentBody`, `checkItemBody` …).
 * Kimlik eşlemesi `external_id` (Trello id); döngü koruması `sync_origin='trello'` (0012). Sunucu (Supabase) ve DemoRepo aynı çekirdeği kullanır.
 */

/* ───────── Trello API şekilleri ───────── */
export interface TrelloCheckItem { id: string; name: string; state: 'complete' | 'incomplete'; pos?: number; due?: string | null; idMember?: string | null }
export interface TrelloChecklist { id: string; name: string; idCard?: string; pos?: number; checkItems: TrelloCheckItem[] }
export interface TrelloCommentAction { id: string; date: string; idMemberCreator?: string; memberCreator?: { fullName?: string; username?: string }; data: { text: string; dateLastEdited?: string } }
export interface TrelloAttachment { id: string; name: string; url: string; bytes?: number | null; mimeType?: string | null; date?: string; isUpload?: boolean; idMember?: string }
export interface TrelloCover { color?: string | null; idAttachment?: string | null; size?: string | null }
/** `undefined` = çekilmedi / değişmedi (silme uygulanmaz); `[]` = Trello'da yok. */
export interface CardDetails { desc?: string; cover?: TrelloCover | null; checklists?: TrelloChecklist[]; comments?: TrelloCommentAction[]; attachments?: TrelloAttachment[]; commentsComplete?: boolean }

/* ───────── Saf yardımcılar ───────── */
const nl = (s: string | null | undefined) => (s ?? '').replace(/\r\n?/g, '\n');
const isColor = (c: unknown): c is CoverColor => typeof c === 'string' && (COVER_COLORS as readonly string[]).includes(c);
const msOf = (s: string | null | undefined) => { const n = s ? Date.parse(s) : NaN; return Number.isNaN(n) ? null : n; };
const sameTime = (a: string | null | undefined, b: string | null | undefined) => msOf(a) === msOf(b);
export const isPendingExternal = (id: string | null | undefined) => !!id && id.startsWith('pending:');
/** JS satırı Trello kartından daha yeni mi düzenlenmiş? (son yazan kazanır) */
export const jsWinsRow = (row: { updated_at?: string | null; synced_at?: string | null }, cardActivity: string | null | undefined) => resolveConflict(row.updated_at, cardActivity, row.synced_at) === 'push';

/** Trello kapağı → JS kapağı. `attachmentJsId`: Trello ek id'sinin JS karşılığı (bilinmiyorsa renge düşer). */
export function mapCover(c: TrelloCover | null | undefined, attachmentJsId: (trelloId: string) => string | null): TaskCover {
  if (c?.idAttachment) { const a = attachmentJsId(c.idAttachment); if (a) return { attachment_id: a }; }
  if (isColor(c?.color)) return { color: c!.color as CoverColor };
  return {};
}
export const coverKey = (c: TaskCover | null | undefined) => (c?.attachment_id ? `a:${c.attachment_id}` : c?.color ? `c:${c.color}` : '');

/* ───────── Çek (Trello → JS): depo portu ───────── */
export interface JsDetails { description: string | null; cover: TaskCover | null; comments: TaskComment[]; checklists: TaskChecklist[]; attachments: TaskAttachment[] }
export type NewComment = { external_id: string; author_name: string; body: string; created_at: string };
export type NewChecklist = { external_id: string; name: string; position: number };
export type NewCheckItem = { external_id: string; name: string; checked: boolean; position: number; due_at: string | null; assignee_id: string | null };
export type NewAttachment = { external_id: string; name: string; url: string; mime: string; bytes: number; storage_path: string | null; created_at: string };
/** Yazma portu: her yazma `sync_origin='trello'` ile işaretlenmeli (geri itilmez). Silme: önce işaretle (`sync_origin='trello_delete'`), sonra sil. */
export interface DetailStore {
  load(taskId: string): Promise<JsDetails>;
  setTaskFields(taskId: string, patch: { description?: string | null; cover?: TaskCover | null }): Promise<void>;
  addComment(taskId: string, c: NewComment): Promise<{ id: string }>;
  updateComment(id: string, patch: { body: string }): Promise<void>;
  deleteComment(id: string): Promise<void>;
  addChecklist(taskId: string, c: NewChecklist): Promise<{ id: string }>;
  updateChecklist(id: string, patch: Partial<Pick<NewChecklist, 'name' | 'position'>>): Promise<void>;
  deleteChecklist(id: string): Promise<void>;
  addCheckItem(checklistId: string, i: NewCheckItem): Promise<{ id: string }>;
  updateCheckItem(id: string, patch: Partial<Omit<NewCheckItem, 'external_id'>>): Promise<void>;
  deleteCheckItem(id: string): Promise<void>;
  addAttachment(taskId: string, a: NewAttachment): Promise<{ id: string }>;
  updateAttachment(id: string, patch: { name?: string }): Promise<void>;
  deleteAttachment(id: string): Promise<void>;
}
export interface Counts { created: number; updated: number; deleted: number; unchanged: number }
export interface DetailsResult { description: boolean; cover: boolean; comments: Counts; checklists: Counts; items: Counts; attachments: Counts; skipped_conflicts: number; errors: string[] }
const zero = (): Counts => ({ created: 0, updated: 0, deleted: 0, unchanged: 0 });
export const emptyDetailsResult = (): DetailsResult => ({ description: false, cover: false, comments: zero(), checklists: zero(), items: zero(), attachments: zero(), skipped_conflicts: 0, errors: [] });
export const detailsChanged = (r: DetailsResult) => r.description || r.cover || (['comments', 'checklists', 'items', 'attachments'] as const).some((k) => r[k].created + r[k].updated + r[k].deleted > 0);

export interface DetailSyncOpts {
  /** Trello üye id → çalışan id (cfg.member_ids'in tersi). */
  memberEmployees?: Readonly<Record<string, string>>;
  /** Trello'ya yüklenmiş eki indirip Storage'a koyar; null/atma = url yedeği kalır. */
  download?: (att: TrelloAttachment, taskId: string) => Promise<{ storage_path: string; bytes: number; mime?: string } | null>;
  /** JS daha yeni → açıklama / kapak / değişmiş satırlar ezilmez. */
  jsNewer?: boolean;
  /** Kartın dateLastActivity'si: satır bazlı son-yazan-kazanır. */
  cardActivity?: string | null;
  log?: (e: SyncLogDraft) => void;
}
const authorOf = (a: TrelloCommentAction) => (a.memberCreator?.fullName || a.memberCreator?.username || 'Trello').slice(0, 120);

/** Karttaki ayrıntıları göreve idempotent uygular (ikinci çalıştırma değişiklik yapmaz). */
export async function syncCardDetails(store: DetailStore, taskId: string, raw: CardDetails, opts: DetailSyncOpts = {}): Promise<DetailsResult> {
  const res = emptyDetailsResult();
  const log = (entity: string, entityId: string | null, ext: string | null, action: string, message: string, ok = true) =>
    opts.log?.({ direction: 'pull', entity, entity_id: entityId, external_id: ext, action, ok, message });
  const cur = await store.load(taskId);
  const wins = (row: { updated_at?: string | null; synced_at?: string | null }) => jsWinsRow(row, opts.cardActivity);
  const skipped = (entity: string, id: string, ext: string) => { res.skipped_conflicts++; log(entity, id, ext, 'skipped_conflict', 'JS daha yeni; Trello değişikliği atlandı'); };
  const attachmentJsId = new Map<string, string>(); // trello ek id → JS id
  for (const a of cur.attachments) if (a.external_id) attachmentJsId.set(a.external_id, a.id);

  /* checklist'ler + maddeler */
  if (raw.checklists) {
    const byExt = new Map(cur.checklists.filter((c) => c.external_id).map((c) => [c.external_id!, c]));
    const seen = new Set<string>();
    const sorted = [...raw.checklists].sort((a, b) => (a.pos ?? 0) - (b.pos ?? 0));
    for (const [ci, tl] of sorted.entries()) {
      seen.add(tl.id);
      const want = { name: tl.name.slice(0, 500) || 'Checklist', position: ci };
      let js = byExt.get(tl.id);
      try {
        if (!js) {
          const c = await store.addChecklist(taskId, { external_id: tl.id, ...want });
          js = { id: c.id, org_id: '', task_id: taskId, name: want.name, position: want.position, external_id: tl.id, items: [] };
          res.checklists.created++; log('checklist', c.id, tl.id, 'created', want.name);
        } else {
          const patch: Partial<typeof want> = {};
          if (js.name !== want.name) patch.name = want.name;
          if (js.position !== want.position) patch.position = want.position;
          if (!Object.keys(patch).length) res.checklists.unchanged++;
          else if (wins(js)) skipped('checklist', js.id, tl.id);
          else { await store.updateChecklist(js.id, patch); res.checklists.updated++; log('checklist', js.id, tl.id, 'updated', Object.keys(patch).join(', ')); }
        }
      } catch (e) { res.errors.push(`checklist ${tl.name}: ${e instanceof Error ? e.message : String(e)}`); continue; }
      const itemByExt = new Map(js.items.filter((i) => i.external_id).map((i) => [i.external_id!, i]));
      const seenItems = new Set<string>();
      const items = [...tl.checkItems].sort((a, b) => (a.pos ?? 0) - (b.pos ?? 0));
      for (const [ii, ti] of items.entries()) {
        seenItems.add(ti.id);
        const wantItem: NewCheckItem = {
          external_id: ti.id, name: ti.name.slice(0, 1000) || '—', checked: ti.state === 'complete', position: ii,
          due_at: ti.due ?? null, assignee_id: (ti.idMember && opts.memberEmployees?.[ti.idMember]) || null,
        };
        const ji = itemByExt.get(ti.id);
        try {
          if (!ji) { const r = await store.addCheckItem(js.id, wantItem); res.items.created++; log('check_item', r.id, ti.id, 'created', wantItem.name); continue; }
          const patch: Partial<Omit<NewCheckItem, 'external_id'>> = {};
          if (ji.name !== wantItem.name) patch.name = wantItem.name;
          if (ji.checked !== wantItem.checked) patch.checked = wantItem.checked;
          if (ji.position !== wantItem.position) patch.position = wantItem.position;
          if (!sameTime(ji.due_at, wantItem.due_at)) patch.due_at = wantItem.due_at;
          // Üye eşlenemiyorsa (null) mevcut atamayı silme.
          if (wantItem.assignee_id && (ji.assignee_id ?? null) !== wantItem.assignee_id) patch.assignee_id = wantItem.assignee_id;
          else if (!ti.idMember && ji.assignee_id) patch.assignee_id = null;
          if (!Object.keys(patch).length) res.items.unchanged++;
          else if (wins(ji)) skipped('check_item', ji.id, ti.id);
          else { await store.updateCheckItem(ji.id, patch); res.items.updated++; log('check_item', ji.id, ti.id, 'updated', Object.keys(patch).join(', ')); }
        } catch (e) { res.errors.push(`madde ${ti.name}: ${e instanceof Error ? e.message : String(e)}`); }
      }
      for (const ji of js.items) {
        if (!ji.external_id || isPendingExternal(ji.external_id) || seenItems.has(ji.external_id)) continue;
        try { await store.deleteCheckItem(ji.id); res.items.deleted++; log('check_item', ji.id, ji.external_id, 'deleted', 'Trello’da silinmiş'); } catch (e) { res.errors.push(`madde silme: ${e instanceof Error ? e.message : String(e)}`); }
      }
    }
    for (const c of cur.checklists) {
      if (!c.external_id || isPendingExternal(c.external_id) || seen.has(c.external_id)) continue;
      try { await store.deleteChecklist(c.id); res.checklists.deleted++; log('checklist', c.id, c.external_id, 'deleted', 'Trello’da silinmiş'); } catch (e) { res.errors.push(`checklist silme: ${e instanceof Error ? e.message : String(e)}`); }
    }
  }

  /* yorumlar */
  if (raw.comments) {
    const byExt = new Map(cur.comments.filter((c) => c.external_id).map((c) => [c.external_id!, c]));
    const seen = new Set<string>();
    for (const a of [...raw.comments].sort((x, y) => msOf(x.date)! - msOf(y.date)!)) {
      seen.add(a.id);
      const body = (a.data.text ?? '').slice(0, 20000);
      if (!body.trim()) continue;
      const js = byExt.get(a.id);
      try {
        if (!js) { const r = await store.addComment(taskId, { external_id: a.id, author_name: authorOf(a), body, created_at: a.date }); res.comments.created++; log('comment', r.id, a.id, 'created', body.slice(0, 80)); }
        else if (js.body === body) res.comments.unchanged++;
        else if (wins(js)) skipped('comment', js.id, a.id);
        else { await store.updateComment(js.id, { body }); res.comments.updated++; log('comment', js.id, a.id, 'updated', body.slice(0, 80)); }
      } catch (e) { res.errors.push(`yorum: ${e instanceof Error ? e.message : String(e)}`); }
    }
    if (raw.commentsComplete !== false) {
      for (const c of cur.comments) {
        if (!c.external_id || isPendingExternal(c.external_id) || seen.has(c.external_id)) continue;
        try { await store.deleteComment(c.id); res.comments.deleted++; log('comment', c.id, c.external_id, 'deleted', 'Trello’da silinmiş'); } catch (e) { res.errors.push(`yorum silme: ${e instanceof Error ? e.message : String(e)}`); }
      }
    }
  }

  /* ekler */
  if (raw.attachments) {
    const byExt = new Map(cur.attachments.filter((a) => a.external_id).map((a) => [a.external_id!, a]));
    const seen = new Set<string>();
    for (const ta of raw.attachments) {
      seen.add(ta.id);
      const js = byExt.get(ta.id);
      const name = (ta.name || 'ek').slice(0, 500);
      try {
        if (!js) {
          const bytes = Number(ta.bytes ?? 0);
          let stored: { storage_path: string; bytes: number; mime?: string } | null = null;
          if (ta.isUpload && opts.download && bytes <= MAX_ATTACHMENT_BYTES) {
            try { stored = await opts.download(ta, taskId); } catch (e) { log('attachment', null, ta.id, 'download_failed', `${name}: ${e instanceof Error ? e.message : String(e)} (bağlantı yedeği)`, false); }
          } else if (ta.isUpload && bytes > MAX_ATTACHMENT_BYTES) log('attachment', null, ta.id, 'skipped_too_large', `${name} 25 MB üstü; yalnızca bağlantı tutuldu`);
          const r = await store.addAttachment(taskId, {
            external_id: ta.id, name, url: ta.url ?? '', mime: stored?.mime || ta.mimeType || '', bytes: stored?.bytes ?? bytes,
            storage_path: stored?.storage_path ?? null, created_at: ta.date ?? new Date().toISOString(),
          });
          attachmentJsId.set(ta.id, r.id);
          res.attachments.created++; log('attachment', r.id, ta.id, 'created', name);
        } else if (js.name === name) res.attachments.unchanged++;
        else if (wins(js)) skipped('attachment', js.id, ta.id);
        else { await store.updateAttachment(js.id, { name }); res.attachments.updated++; log('attachment', js.id, ta.id, 'updated', name); }
      } catch (e) { res.errors.push(`ek ${name}: ${e instanceof Error ? e.message : String(e)}`); }
    }
    for (const a of cur.attachments) {
      if (!a.external_id || isPendingExternal(a.external_id) || seen.has(a.external_id)) continue;
      try { await store.deleteAttachment(a.id); res.attachments.deleted++; log('attachment', a.id, a.external_id, 'deleted', 'Trello’da silinmiş'); } catch (e) { res.errors.push(`ek silme: ${e instanceof Error ? e.message : String(e)}`); }
    }
  }

  /* açıklama + kapak (görev alanları) */
  const taskPatch: { description?: string | null; cover?: TaskCover | null } = {};
  if (raw.desc !== undefined && nl(cur.description) !== nl(raw.desc)) {
    if (opts.jsNewer) { res.skipped_conflicts++; log('task', taskId, null, 'skipped_conflict', 'açıklama: JS daha yeni'); }
    else taskPatch.description = nl(raw.desc);
  }
  if (raw.cover !== undefined) {
    const want = mapCover(raw.cover, (id) => attachmentJsId.get(id) ?? null);
    if (coverKey(cur.cover) !== coverKey(want) || cur.cover == null) {
      if (opts.jsNewer) { res.skipped_conflicts++; log('task', taskId, null, 'skipped_conflict', 'kapak: JS daha yeni'); }
      else taskPatch.cover = want;
    }
  }
  if (Object.keys(taskPatch).length) {
    try {
      await store.setTaskFields(taskId, taskPatch);
      if ('description' in taskPatch) { res.description = true; log('task', taskId, null, 'updated', 'açıklama'); }
      if ('cover' in taskPatch) { res.cover = true; log('task', taskId, null, 'updated', 'kapak'); }
    } catch (e) { res.errors.push(`görev alanları: ${e instanceof Error ? e.message : String(e)}`); }
  }
  return res;
}

/* ───────── Webhook eylemleri ───────── */
export type DetailOp =
  | { type: 'comment.upsert'; id: string; text: string; author: string; date: string }
  | { type: 'comment.delete'; id: string }
  | { type: 'attachment.delete'; id: string }
  | { type: 'checklist.upsert'; id: string; name: string }
  | { type: 'checklist.delete'; id: string }
  | { type: 'item.upsert'; id: string; checklistId: string; name: string; state: 'complete' | 'incomplete' | null }
  | { type: 'item.delete'; id: string }
  /** Eylem yetersiz (ek bilgisi, madde due/üye…): ilgili parçayı Trello'dan yeniden çek. */
  | { type: 'resync'; what: Array<'checklists' | 'comments' | 'attachments'> };

interface WebhookAction {
  id?: string; type?: string; date?: string; memberCreator?: { fullName?: string; username?: string };
  data?: {
    text?: string; card?: { id?: string };
    action?: { id?: string; text?: string };
    checklist?: { id?: string; name?: string };
    checkItem?: { id?: string; name?: string; state?: string };
    attachment?: { id?: string; name?: string; url?: string };
    old?: Record<string, unknown>;
  };
}
export const DETAIL_ACTIONS = new Set([
  'commentCard', 'updateComment', 'deleteComment', 'addAttachmentToCard', 'deleteAttachmentFromCard',
  'addChecklistToCard', 'removeChecklistFromCard', 'createCheckItem', 'updateCheckItemStateOnCard', 'updateCheckItem', 'deleteCheckItem', 'convertToCardFromCheckItem',
]);
/** Webhook eylemi → normalleştirilmiş işlem. İşlenmeyen tür → null. (`updateCard` desc/cover değişimi `syncCard` ile kartı yeniden çekerek işlenir.) */
export function planWebhookAction(a: WebhookAction | undefined): DetailOp | null {
  if (!a?.type) return null;
  const d = a.data ?? {};
  switch (a.type) {
    case 'commentCard': return a.id && d.text ? { type: 'comment.upsert', id: a.id, text: d.text, author: a.memberCreator?.fullName || a.memberCreator?.username || 'Trello', date: a.date ?? new Date().toISOString() } : { type: 'resync', what: ['comments'] };
    case 'updateComment': return d.action?.id && typeof d.action.text === 'string' ? { type: 'comment.upsert', id: d.action.id, text: d.action.text, author: a.memberCreator?.fullName || a.memberCreator?.username || 'Trello', date: a.date ?? new Date().toISOString() } : { type: 'resync', what: ['comments'] };
    case 'deleteComment': return d.action?.id ? { type: 'comment.delete', id: d.action.id } : { type: 'resync', what: ['comments'] };
    case 'addAttachmentToCard': return { type: 'resync', what: ['attachments'] }; // bytes / mime / isUpload webhook'ta yok
    case 'deleteAttachmentFromCard': return d.attachment?.id ? { type: 'attachment.delete', id: d.attachment.id } : { type: 'resync', what: ['attachments'] };
    case 'addChecklistToCard': return d.checklist?.id ? { type: 'checklist.upsert', id: d.checklist.id, name: d.checklist.name ?? 'Checklist' } : { type: 'resync', what: ['checklists'] };
    case 'removeChecklistFromCard': return d.checklist?.id ? { type: 'checklist.delete', id: d.checklist.id } : { type: 'resync', what: ['checklists'] };
    case 'createCheckItem': case 'updateCheckItemStateOnCard':
      return d.checkItem?.id && d.checklist?.id && d.checkItem.name
        ? { type: 'item.upsert', id: d.checkItem.id, checklistId: d.checklist.id, name: d.checkItem.name, state: d.checkItem.state === 'complete' ? 'complete' : d.checkItem.state === 'incomplete' ? 'incomplete' : null }
        : { type: 'resync', what: ['checklists'] };
    case 'updateCheckItem': return { type: 'resync', what: ['checklists'] }; // ad + due + üye + sıra değişebilir
    case 'deleteCheckItem': return d.checkItem?.id ? { type: 'item.delete', id: d.checkItem.id } : { type: 'resync', what: ['checklists'] };
    case 'convertToCardFromCheckItem': return { type: 'resync', what: ['checklists'] };
    default: return null;
  }
}
/** Webhook işlemini uygular. `resync` → hangi parçaların yeniden çekilmesi gerektiği döner. Üst madde bilinmiyorsa da resync. */
export async function applyDetailOp(store: DetailStore, taskId: string, op: DetailOp, opts: { log?: (e: SyncLogDraft) => void; cardActivity?: string | null } = {}): Promise<{ applied: boolean; resync?: Array<'checklists' | 'comments' | 'attachments'> }> {
  const log = (entity: string, id: string | null, ext: string, action: string, message: string) => opts.log?.({ direction: 'pull', entity, entity_id: id, external_id: ext, action, ok: true, message });
  if (op.type === 'resync') return { applied: false, resync: op.what };
  const cur = await store.load(taskId);
  switch (op.type) {
    case 'comment.upsert': {
      const js = cur.comments.find((c) => c.external_id === op.id);
      const body = op.text.slice(0, 20000);
      if (!body.trim()) return { applied: false };
      if (!js) { const r = await store.addComment(taskId, { external_id: op.id, author_name: op.author.slice(0, 120), body, created_at: op.date }); log('comment', r.id, op.id, 'created', body.slice(0, 80)); return { applied: true }; }
      if (js.body === body) return { applied: false };
      if (jsWinsRow(js, opts.cardActivity)) { log('comment', js.id, op.id, 'skipped_conflict', 'JS daha yeni'); return { applied: false }; }
      await store.updateComment(js.id, { body }); log('comment', js.id, op.id, 'updated', body.slice(0, 80)); return { applied: true };
    }
    case 'comment.delete': {
      const js = cur.comments.find((c) => c.external_id === op.id);
      if (!js) return { applied: false };
      await store.deleteComment(js.id); log('comment', js.id, op.id, 'deleted', 'Trello’da silindi'); return { applied: true };
    }
    case 'attachment.delete': {
      const js = cur.attachments.find((a) => a.external_id === op.id);
      if (!js) return { applied: false };
      await store.deleteAttachment(js.id); log('attachment', js.id, op.id, 'deleted', 'Trello’da silindi'); return { applied: true };
    }
    case 'checklist.upsert': {
      const js = cur.checklists.find((c) => c.external_id === op.id);
      const name = op.name.slice(0, 500) || 'Checklist';
      if (!js) { const r = await store.addChecklist(taskId, { external_id: op.id, name, position: cur.checklists.length }); log('checklist', r.id, op.id, 'created', name); return { applied: true }; }
      if (js.name === name) return { applied: false };
      await store.updateChecklist(js.id, { name }); log('checklist', js.id, op.id, 'updated', name); return { applied: true };
    }
    case 'checklist.delete': {
      const js = cur.checklists.find((c) => c.external_id === op.id);
      if (!js) return { applied: false };
      await store.deleteChecklist(js.id); log('checklist', js.id, op.id, 'deleted', 'Trello’da silindi'); return { applied: true };
    }
    case 'item.upsert': {
      const parent = cur.checklists.find((c) => c.external_id === op.checklistId);
      if (!parent) return { applied: false, resync: ['checklists'] }; // üst checklist henüz yok → tam çekim
      const ji = parent.items.find((i) => i.external_id === op.id);
      const checked = op.state === 'complete';
      if (!ji) { const r = await store.addCheckItem(parent.id, { external_id: op.id, name: op.name.slice(0, 1000), checked, position: parent.items.length, due_at: null, assignee_id: null }); log('check_item', r.id, op.id, 'created', op.name); return { applied: true }; }
      const patch: Partial<Omit<NewCheckItem, 'external_id'>> = {};
      if (ji.name !== op.name.slice(0, 1000)) patch.name = op.name.slice(0, 1000);
      if (op.state && ji.checked !== checked) patch.checked = checked;
      if (!Object.keys(patch).length) return { applied: false };
      if (jsWinsRow(ji, opts.cardActivity)) { log('check_item', ji.id, op.id, 'skipped_conflict', 'JS daha yeni'); return { applied: false }; }
      await store.updateCheckItem(ji.id, patch); log('check_item', ji.id, op.id, 'updated', Object.keys(patch).join(', ')); return { applied: true };
    }
    case 'item.delete': {
      const ji = cur.checklists.flatMap((c) => c.items).find((i) => i.external_id === op.id);
      if (!ji) return { applied: false };
      await store.deleteCheckItem(ji.id); log('check_item', ji.id, op.id, 'deleted', 'Trello’da silindi'); return { applied: true };
    }
  }
}

/* ───────── İt (JS → Trello): gövde kurucuları (saf) ───────── */
export const commentBody = (c: Pick<TaskComment, 'body'>) => ({ text: c.body });
export const checklistBody = (c: Pick<TaskChecklist, 'name' | 'position'>) => ({ name: c.name, pos: (c.position + 1) * 1000 });
export interface ItemEnv { memberIds: Record<string, string> }
/** POST /checklists/{id}/checkItems (oluşturma) ve PUT /cards/{card}/checkItem/{item} (güncelleme) gövdesi. */
export function checkItemBody(i: Pick<TaskCheckItem, 'name' | 'checked' | 'position' | 'due_at' | 'assignee_id'>, env: ItemEnv, mode: 'create' | 'update'): Record<string, unknown> {
  const member = i.assignee_id ? env.memberIds[i.assignee_id] : undefined;
  const due = i.due_at ? new Date(i.due_at).toISOString() : null;
  return {
    name: i.name, pos: (i.position + 1) * 1000, ...(mode === 'create' ? { checked: i.checked } : { state: i.checked ? 'complete' : 'incomplete' }),
    ...(due ? { due } : mode === 'update' ? { due: null } : {}), ...(member ? { idMember: member } : mode === 'update' ? { idMember: null } : {}),
  };
}
export const attachmentUrlBody = (a: Pick<TaskAttachment, 'name' | 'url'>) => ({ url: a.url, name: a.name });

/* ───────── İt: olay süzgeci (döngü koruması) ───────── */
export const DETAIL_TABLES = ['task_comments', 'task_checklists', 'task_check_items', 'task_attachments'] as const;
export type DetailTable = (typeof DETAIL_TABLES)[number];
type Row = Record<string, unknown>;
export interface DetailChange { table: DetailTable; op: 'insert' | 'update' | 'delete'; task_id: string; id: string; row: Row }
interface EvLike { type: string; aggregate: string; aggregate_id?: string; payload: { task_id?: string; new?: Row | null; old?: Row | null } & Row }
/** Olay → ayrıntı değişikliği (yoksa null). 'task.commented' = yorum insert. */
export function detailChangeOf(ev: EvLike): DetailChange | null {
  if (ev.type === 'task.commented' && ev.aggregate === 'tasks') {
    const n = ev.payload.new; const tid = ev.payload.task_id ?? (n?.task_id as string | undefined);
    return n && tid ? { table: 'task_comments', op: 'insert', task_id: tid, id: String(n.id), row: n } : null;
  }
  const table = ev.aggregate as DetailTable;
  if (!(DETAIL_TABLES as readonly string[]).includes(table)) return null;
  const op = ev.type.slice(table.length + 1) as DetailChange['op'];
  if (!['insert', 'update', 'delete'].includes(op)) return null;
  const row = op === 'delete' ? ev.payload.old : ev.payload.new;
  const tid = ev.payload.task_id;
  return row && tid ? { table, op, task_id: tid, id: String(row.id), row } : null;
}
const IGNORED_DIFF = new Set(['updated_at', 'synced_at', 'sync_origin']);
export function shouldPushDetail(ev: EvLike, cfg: Pick<TrelloConfig, 'mode'> | null): { push: boolean; reason: string; change?: DetailChange } {
  const ch = detailChangeOf(ev);
  if (!ch) return { push: false, reason: 'not_detail' };
  if (!cfg || cfg.mode !== 'two_way') return { push: false, reason: 'mode' };
  const r = ch.row as { sync_origin?: string | null; updated_at?: string | null; synced_at?: string | null };
  if (ch.op === 'delete') {
    // Webhook silmeleri önce 'trello_delete' ile işaretlenir; JS silmesi (işaret yok ya da 'trello' = eskiden çekilmiş) itilir.
    if (r.sync_origin === 'trello_delete') return { push: false, reason: 'origin' };
    return ch.row.external_id && !isPendingExternal(String(ch.row.external_id)) ? { push: true, reason: 'deleted', change: ch } : { push: false, reason: 'not_linked' };
  }
  if (r.sync_origin === 'trello' || isTrelloOriginWrite(r)) return { push: false, reason: 'origin' };
  if (ch.op === 'update') {
    const o = ev.payload.old;
    if (o && !Object.keys(ch.row).some((k) => !IGNORED_DIFF.has(k) && JSON.stringify(ch.row[k] ?? null) !== JSON.stringify(o[k] ?? null))) return { push: false, reason: 'irrelevant' };
  }
  return { push: true, reason: ch.op, change: ch };
}

/* ───────── İt: port tabanlı işleyici ───────── */
export interface DetailPushPorts {
  cfg: TrelloConfig;
  /** tasks.source_ref → 'trello:<kartId>' ise kart id; aksi halde null. */
  cardOf(taskId: string): Promise<string | null>;
  /** Güncel satır (silinmişse null). */
  loadRow(table: DetailTable, id: string): Promise<Row | null>;
  /** external_id null → 'pending:<id>' (atomik). Başka işlem kazandıysa false. */
  claim(table: DetailTable, id: string): Promise<boolean>;
  /** external_id yazar (null = serbest bırak); yazma sync_origin='trello' ile işaretlenir. */
  link(table: DetailTable, id: string, externalId: string | null): Promise<void>;
  request<T = Record<string, unknown>>(method: 'POST' | 'PUT' | 'DELETE', path: string, body?: Record<string, unknown>): Promise<T>;
  /** Storage dosyasını multipart olarak karta yükler. */
  uploadFile(cardId: string, row: Row): Promise<{ id: string }>;
  log(e: SyncLogDraft): void | Promise<void>;
}
export type DetailPushResult = 'noop' | 'pushed' | 'skipped' | 'error';
const is404 = (e: unknown) => typeof e === 'object' && e !== null && (e as { status?: number }).status === 404;

export async function pushDetailWith(ports: DetailPushPorts, ch: DetailChange): Promise<DetailPushResult> {
  const cfg = ports.cfg;
  if (cfg.mode !== 'two_way') return 'skipped';
  const entity = { task_comments: 'comment', task_checklists: 'checklist', task_check_items: 'check_item', task_attachments: 'attachment' }[ch.table];
  let ext: string | null = null;
  const log = (action: string, ok: boolean, message: string) => ports.log({ direction: 'push', entity, entity_id: ch.id, external_id: ext, action, ok, message });
  let claimed = false;
  try {
    const cardId = await ports.cardOf(ch.task_id);
    if (!cardId) return 'noop'; // Trello kartı olmayan görev
    const memberIds = cfg.member_ids ?? {};
    if (ch.op === 'delete') {
      ext = (ch.row.external_id as string | null) ?? null;
      if (!ext || isPendingExternal(ext)) return 'noop';
      const path = {
        task_comments: `/cards/${cardId}/actions/${ext}/comments`, task_checklists: `/checklists/${ext}`,
        task_check_items: `/cards/${cardId}/checkItem/${ext}`, task_attachments: `/cards/${cardId}/attachments/${ext}`,
      }[ch.table];
      try { await ports.request('DELETE', path); await log('deleted', true, 'Trello’dan silindi'); return 'pushed'; }
      catch (e) { if (is404(e)) { await log('skipped_gone', true, 'Trello’da zaten yok'); return 'noop'; } throw e; }
    }
    const row = await ports.loadRow(ch.table, ch.id);
    if (!row) return 'noop';
    // external_id'si olmayan satır tanım gereği JS kaynaklıdır (Trello'dan gelenler hep external_id taşır) → kilit bırakma damgası engellemez.
    if (row.external_id && (row.sync_origin === 'trello' || isTrelloOriginWrite(row as { updated_at?: string | null; synced_at?: string | null }))) return 'skipped';
    ext = (row.external_id as string | null) ?? null;
    if (isPendingExternal(ext)) return 'skipped';

    /** Henüz Trello'da olmayan satır: atomik kilit → oluştur → bağla; hata olursa kilidi bırak. */
    const create = async (fn: () => Promise<string | null>, what: string): Promise<DetailPushResult> => {
      if (!(await ports.claim(ch.table, ch.id))) return 'noop';
      claimed = true;
      const id = await fn();
      if (!id) { await ports.link(ch.table, ch.id, null); claimed = false; return 'skipped'; }
      await ports.link(ch.table, ch.id, id); claimed = false; ext = id;
      await log('created', true, what);
      return 'pushed';
    };

    switch (ch.table) {
      case 'task_comments': {
        if (!ext) return await create(async () => (await ports.request<{ id: string }>('POST', `/cards/${cardId}/actions/comments`, commentBody(row as { body: string }))).id, String(row.body).slice(0, 80));
        await ports.request('PUT', `/cards/${cardId}/actions/${ext}/comments`, commentBody(row as { body: string }));
        await log('updated', true, String(row.body).slice(0, 80)); return 'pushed';
      }
      case 'task_checklists': {
        if (!ext) return await create(async () => (await ports.request<{ id: string }>('POST', `/cards/${cardId}/checklists`, checklistBody(row as { name: string; position: number }))).id, String(row.name));
        await ports.request('PUT', `/checklists/${ext}`, checklistBody(row as { name: string; position: number }));
        await log('updated', true, String(row.name)); return 'pushed';
      }
      case 'task_check_items': {
        const body = (mode: 'create' | 'update') => checkItemBody(row as never, { memberIds }, mode);
        if (!ext) {
          // Üst checklist Trello'da yoksa önce o oluşturulur (olay sırası garanti değil).
          const parent = await ports.loadRow('task_checklists', String(row.checklist_id));
          if (!parent) return 'noop';
          let parentExt = (parent.external_id as string | null) ?? null;
          if (isPendingExternal(parentExt)) { await log('deferred', true, 'üst checklist oluşturuluyor; sonra tekrar denenecek'); return 'skipped'; }
          if (!parentExt) {
            if (!(await ports.claim('task_checklists', String(parent.id)))) { await log('deferred', true, 'üst checklist başka işlemde'); return 'skipped'; }
            try {
              parentExt = (await ports.request<{ id: string }>('POST', `/cards/${cardId}/checklists`, checklistBody(parent as { name: string; position: number }))).id;
              await ports.link('task_checklists', String(parent.id), parentExt);
            } catch (e) { await ports.link('task_checklists', String(parent.id), null).catch(() => undefined); throw e; }
          }
          return await create(async () => (await ports.request<{ id: string }>('POST', `/checklists/${parentExt}/checkItems`, body('create'))).id, String(row.name));
        }
        await ports.request('PUT', `/cards/${cardId}/checkItem/${ext}`, body('update'));
        await log('updated', true, `${row.checked ? '✓' : '○'} ${row.name}`); return 'pushed';
      }
      case 'task_attachments': {
        if (ext) { await log('skipped_unsupported', true, 'Trello ek yeniden adlandırmayı desteklemiyor'); return 'noop'; }
        const bytes = Number(row.bytes ?? 0);
        if (row.storage_path && bytes > MAX_ATTACHMENT_BYTES) { await log('skipped_too_large', true, `${row.name}: 25 MB üstü, Trello’ya yüklenmedi`); return 'skipped'; }
        if (!row.storage_path && !row.url) return 'noop';
        return await create(async () => row.storage_path ? (await ports.uploadFile(cardId, row)).id : (await ports.request<{ id: string }>('POST', `/cards/${cardId}/attachments`, attachmentUrlBody(row as { name: string; url: string }))).id, String(row.name));
      }
    }
  } catch (e) {
    if (claimed) await ports.link(ch.table, ch.id, null).catch(() => undefined);
    await log('error', false, e instanceof Error ? e.message : String(e));
    return 'error';
  }
}

/* ───────── Özet ───────── */
export interface DetailsSummary { cards: number; description: number; cover: number; comments: number; checklists: number; check_items: number; attachments: number; skipped_conflicts: number; errors: number }
export const emptyDetailsSummary = (): DetailsSummary => ({ cards: 0, description: 0, cover: 0, comments: 0, checklists: 0, check_items: 0, attachments: 0, skipped_conflicts: 0, errors: 0 });
const touched = (c: Counts) => c.created + c.updated + c.deleted;
/** Kart başına sonucu toplam sayaçlara ekler (yalnızca DEĞİŞENLER sayılır → ikinci içe aktarmada hepsi 0). */
export function addDetails(sum: DetailsSummary, r: DetailsResult): DetailsSummary {
  sum.cards++; sum.description += r.description ? 1 : 0; sum.cover += r.cover ? 1 : 0; sum.comments += touched(r.comments); sum.checklists += touched(r.checklists);
  sum.check_items += touched(r.items); sum.attachments += touched(r.attachments); sum.skipped_conflicts += r.skipped_conflicts; sum.errors += r.errors.length;
  return sum;
}
