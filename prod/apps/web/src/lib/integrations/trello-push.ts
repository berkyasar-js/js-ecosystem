import type { SupabaseClient } from '@supabase/supabase-js';
import type { TaskCover, TaskState, TrelloConfig } from '@jscore/contracts';
import { CARD_FIELDS, TrelloApiError, loadTrelloConfig, trelloFetch, writeSyncLog, type TrelloCreds } from './trello';
import { DETAIL_TABLES, detailChangeOf, shouldPushDetail } from './trello-details';
import { pushDetailNow } from './trello-details-supabase';
import { isTrelloOriginWrite, trelloIsNewer, type ListMapEntry, type SyncLogDraft, type TrelloCard } from './trello-map';

/**
 * JS → Trello yazımı. Saf kısım (liste seçimi, kart yaması, olay filtresi, döngü koruması) + port tabanlı `pushTaskWith`
 * (testte bellek portlarıyla, üretimde Supabase servis rolü + Trello HTTP ile).
 *
 * Kurallar:
 *  - Yalnızca mode='two_way' iter. Trello'dan gelen yazmalar (tasks.sync_origin='trello' / payload.origin='trello') geri itilmez.
 *  - Son yazan kazanır: kart Trello'da görevden yeniyse ve yapılacak bir fark varsa itme atlanır (günlüğe 'skipped_conflict').
 *  - Liste: arşiv → closed=true; onay/teslim aşamaları → aynı panodaki aşama listesi; üretim/iç revize/kapsam → atananın kişi kuyruğu
 *    (iç revize → "Kontrol" kuyruğu), yoksa aşama listesi; plan/brief → aşama listesi. Karşılığı olmayan aşamada kart yerinde kalır.
 */

export interface PushTask {
  id: string; org_id?: string; project_id: string; title: string; assignee_id: string | null; state: TaskState; due_at: string | null;
  labels: string[]; source_ref: string | null; updated_at?: string | null; synced_at?: string | null; sync_origin?: string | null;
  /** 0012. `null`/yok = Trello ile hiç eşlenmedi (itilmez); '' / {} = bilerek boşaltıldı (itilir). */
  description?: string | null; cover?: TaskCover | null;
}
export interface CoverPatch { color: string | null; idAttachment: string | null; size?: string }
export interface CardPatch { name?: string; idList?: string; due?: string | null; dueComplete?: boolean; idMembers?: string[]; closed?: boolean; desc?: string; cover?: CoverPatch }
export type ListMap = NonNullable<TrelloConfig['list_map']>;

/* ───────── Saf yardımcılar ───────── */
export const cardNameFor = (t: Pick<PushTask, 'title' | 'labels'>): string => {
  const job = t.labels.find((l) => l.startsWith('job:'))?.slice(4);
  return (job ? `${job}_${t.title}` : t.title).normalize('NFC').trim();
};
const dueMs = (s: string | null | undefined) => { const n = s ? Date.parse(s) : NaN; return Number.isNaN(n) ? null : n; };

/** Görevin hedef Trello listesi (aynı pano). null = taşıma yok. `currentListId` zaten uygunsa onu döner (gereksiz taşıma olmaz). */
export function chooseList(task: Pick<PushTask, 'state' | 'assignee_id'>, boardId: string, listMap: ListMap, currentListId?: string | null): string | null {
  if (task.state === 'archive') return null;
  const lists = Object.entries(listMap).filter(([, e]) => e.board === boardId).sort(([a], [b]) => a.localeCompare(b));
  const person = (review: boolean) => (e: ListMapEntry) => e.kind === 'person' && !!task.assignee_id && e.employee === task.assignee_id && !!e.review === review;
  const kind = (k: ListMapEntry['kind']) => (e: ListMapEntry) => e.kind === k;
  const targets: Array<(e: ListMapEntry) => boolean> = (() => {
    switch (task.state) {
      case 'approval': return [kind('approval')];
      case 'delivery': return [kind('delivery')];
      case 'production': return [person(false), kind('production')];
      case 'internal_review': return [person(true)];
      case 'scope': return [person(false)];
      case 'plan': return [kind('plan')];
      case 'brief': return [kind('paused')];
      default: return [];
    }
  })();
  const best = targets.find((p) => lists.some(([, e]) => p(e)));
  const cur = currentListId ? listMap[currentListId] : undefined;
  if (cur && cur.board === boardId) {
    if (best ? best(cur) : targets.some((p) => p(cur))) return currentListId!;
    // Atananı olmayan üretim kartı herhangi bir kişi kuyruğunda kalabilir (kuyruk sahibi zaten çözülememiş olabilir).
    if (task.state === 'brief' && cur.kind === 'ideas') return currentListId!;
    if (!task.assignee_id && task.state === 'production' && cur.kind === 'person' && !cur.review) return currentListId!;
  }
  return best ? lists.find(([, e]) => best(e))![0] : null;
}

export interface PatchEnv { listMap: ListMap; memberIds: Record<string, string>; boardId: string; prevAssignee?: string | null; /** JS ek id → Trello ek id (kapak için) */ attachmentExt?: Record<string, string> }
const nlf = (s: string | null | undefined) => (s ?? '').replace(/\r\n?/g, '\n').trim();
/** JS kapağı → Trello kapak hedefi; undefined = dokunma (eşlenmemiş / ek henüz Trello'da yok). */
export function wantedCover(cover: TaskCover | null | undefined, attachmentExt: Record<string, string> = {}): CoverPatch | undefined {
  if (cover == null) return undefined;
  if (cover.attachment_id) { const ext = attachmentExt[cover.attachment_id]; return ext ? { color: null, idAttachment: ext, size: 'normal' } : undefined; }
  if (cover.color) return { color: cover.color, idAttachment: null, size: 'normal' };
  return { color: null, idAttachment: null };
}
/** Görev → kart yaması (yalnızca FARK içerir; boş = yapılacak bir şey yok). */
export function buildCardPatch(task: PushTask, card: Pick<TrelloCard, 'name' | 'idList' | 'due' | 'dueComplete' | 'idMembers' | 'closed'> & Partial<Pick<TrelloCard, 'desc' | 'cover'>>, env: PatchEnv): CardPatch {
  const patch: CardPatch = {};
  const archived = task.state === 'archive';
  const name = cardNameFor(task);
  if (name.length >= 1 && name !== (card.name ?? '').normalize('NFC').trim()) patch.name = name;
  if (archived !== !!card.closed) patch.closed = archived;
  const want = dueMs(task.due_at), have = dueMs(card.due);
  if (want !== have) patch.due = want === null ? null : new Date(want).toISOString();
  const hasDue = want !== null || have !== null;
  if (hasDue && archived !== !!card.dueComplete && want !== null) patch.dueComplete = archived;
  if (!archived) {
    const target = chooseList(task, env.boardId, env.listMap, card.idList);
    if (target && target !== card.idList) patch.idList = target;
  }
  if (task.description != null && nlf(task.description) !== nlf(card.desc)) patch.desc = task.description.replace(/\r\n?/g, '\n');
  const wc = wantedCover(task.cover, env.attachmentExt);
  if (wc && ((wc.color ?? null) !== (card.cover?.color ?? null) || (wc.idAttachment ?? null) !== (card.cover?.idAttachment ?? null))) patch.cover = wc;
  const mine = task.assignee_id ? env.memberIds[task.assignee_id] : undefined;
  if (mine && !archived) {
    const prev = env.prevAssignee && env.prevAssignee !== task.assignee_id ? env.memberIds[env.prevAssignee] : undefined;
    const cur = card.idMembers ?? [];
    const next = [...cur.filter((m) => m !== prev), ...(cur.includes(mine) ? [] : [mine])];
    if (next.slice().sort().join() !== cur.slice().sort().join()) patch.idMembers = next;
  }
  return patch;
}
export const patchBody = (p: CardPatch) => {
  const { idMembers, ...rest } = p;
  return { ...rest, ...(idMembers ? { idMembers: idMembers.join(',') } : {}) };
};

/* ───────── Olay süzgeci + döngü koruması ───────── */
export interface SyncEventLike { type: string; aggregate: string; payload: { new?: Record<string, unknown> | null; old?: Record<string, unknown> | null } & Record<string, unknown> }
const RELEVANT = ['state', 'assignee_id', 'due_at', 'title', 'description', 'cover'] as const;
export function shouldPushEvent(ev: SyncEventLike, cfg: Pick<TrelloConfig, 'mode'> | null): { push: boolean; reason: string } {
  if (!cfg || cfg.mode !== 'two_way') return { push: false, reason: 'mode' };
  if (ev.aggregate !== 'tasks' || !/\.(insert|update)$/.test(ev.type)) return { push: false, reason: 'not_task' };
  const n = ev.payload.new;
  if (!n) return { push: false, reason: 'no_row' };
  if (ev.payload.origin === 'trello' || n.sync_origin === 'trello' || isTrelloOriginWrite(n as { updated_at?: string | null; synced_at?: string | null })) return { push: false, reason: 'origin' };
  const ref = typeof n.source_ref === 'string' ? n.source_ref : null;
  if (ref && !ref.startsWith('trello:')) return { push: false, reason: 'foreign_ref' };
  if (ev.type.endsWith('.insert')) return ref ? { push: false, reason: 'already_linked' } : { push: true, reason: 'new_task' };
  const o = ev.payload.old;
  if (o && !RELEVANT.some((k) => JSON.stringify(n[k] ?? null) !== JSON.stringify(o[k] ?? null))) return { push: false, reason: 'irrelevant' };
  return { push: true, reason: 'changed' };
}
/** Webhook eylemini entegrasyon token'ının kendi üyesi yaptıysa (bizim itmemizin yankısı) yok say. */
export const isOwnTrelloAction = (action: { idMemberCreator?: string } | undefined, cfg: Pick<TrelloConfig, 'token_member_id'> | null) =>
  !!cfg?.token_member_id && action?.idMemberCreator === cfg.token_member_id;

/* ───────── Port tabanlı itme ───────── */
export interface PushPorts {
  cfg: TrelloConfig;
  loadTask(id: string): Promise<PushTask | null>;
  /** projects.source_ref */
  projectRef(projectId: string): Promise<string | null>;
  /** source_ref null → 'trello:pending' (atomik). Başka bir çağrı kazandıysa false. */
  claimNew(taskId: string): Promise<boolean>;
  /** source_ref'i yazar (null = serbest bırak); yazma sync_origin='trello' ile işaretlenir. */
  linkCard(taskId: string, cardId: string | null): Promise<void>;
  getCard(cardId: string): Promise<TrelloCard | null>;
  /** JS ek id → Trello ek id (yalnızca kapak ek ise gerekir). */
  attachmentExt?(taskId: string): Promise<Record<string, string>>;
  putCard(cardId: string, body: Record<string, unknown>): Promise<void>;
  postCard(body: Record<string, unknown>): Promise<{ id: string }>;
  log(e: SyncLogDraft): void | Promise<void>;
}
export type PushResult = 'noop' | 'updated' | 'created' | 'skipped' | 'error';

export async function pushTaskWith(ports: PushPorts, taskId: string, opts: { prevAssignee?: string | null } = {}): Promise<PushResult> {
  const cfg = ports.cfg;
  if (cfg.mode !== 'two_way') return 'skipped';
  const log = (action: string, ok: boolean, message: string, extId: string | null) => ports.log({ direction: 'push', entity: 'task', entity_id: taskId, external_id: extId, action, ok, message });
  let claimed = false;
  try {
    const task = await ports.loadTask(taskId);
    if (!task) return 'noop';
    if (isTrelloOriginWrite(task)) { await log('skipped_origin', true, 'Trello kaynaklı yazma geri itilmedi', task.source_ref?.slice(7) ?? null); return 'skipped'; }
    const ref = task.source_ref;
    const listMap = cfg.list_map ?? {};
    if (ref?.startsWith('trello:') && !ref.startsWith('trello:board:') && ref !== 'trello:pending') {
      const cardId = ref.slice(7);
      const card = await ports.getCard(cardId);
      if (!card) { await log('vanished', false, 'Kart Trello’da bulunamadı', cardId); return 'error'; }
      const attachmentExt = task.cover?.attachment_id && ports.attachmentExt ? await ports.attachmentExt(task.id) : undefined;
      const patch = buildCardPatch(task, card, { listMap, memberIds: cfg.member_ids ?? {}, boardId: card.idBoard ?? '', prevAssignee: opts.prevAssignee, attachmentExt });
      const keys = Object.keys(patch);
      if (!keys.length) return 'noop';
      if (trelloIsNewer(task.updated_at, card.dateLastActivity)) { await log('skipped_conflict', true, `Trello daha yeni (${card.dateLastActivity}) · ${keys.join(', ')} itilmedi`, cardId); return 'skipped'; }
      await ports.putCard(cardId, patchBody(patch));
      await log('updated', true, keys.join(', '), cardId);
      return 'updated';
    }
    if (ref) return 'noop';
    // Yeni görev: yalnızca Trello kaynaklı projede kart açılır.
    const pref = await ports.projectRef(task.project_id);
    const boardId = pref?.startsWith('trello:board:') ? pref.slice('trello:board:'.length) : null;
    if (!boardId || task.state === 'archive') return 'noop';
    if (!(await ports.claimNew(task.id))) return 'noop';
    claimed = true;
    const idList = chooseList(task, boardId, listMap, null);
    if (!idList) { await ports.linkCard(task.id, null); claimed = false; await log('error', false, `Panoda "${task.state}" için uygun liste yok (list_map)`, null); return 'error'; }
    const due = dueMs(task.due_at);
    const member = task.assignee_id ? cfg.member_ids?.[task.assignee_id] : undefined;
    const c = await ports.postCard({ idList, name: cardNameFor(task), pos: 'bottom', ...(due !== null ? { due: new Date(due).toISOString() } : {}), ...(member ? { idMembers: member } : {}) });
    await ports.linkCard(task.id, c.id);
    claimed = false;
    await log('created', true, `kart oluşturuldu · ${cardNameFor(task)}`, c.id);
    return 'created';
  } catch (e) {
    if (claimed) await ports.linkCard(taskId, null).catch(() => undefined);
    await log('error', false, e instanceof Error ? e.message : String(e), null);
    return 'error';
  }
}

/* ───────── Supabase / Trello HTTP portları ───────── */
type Row = Record<string, unknown>;
export function supabasePushPorts(admin: SupabaseClient, orgId: string, cfg: TrelloConfig, fetchImpl?: typeof fetch): PushPorts {
  const creds: TrelloCreds = { api_key: cfg.api_key, token: cfg.token };
  return {
    cfg,
    async loadTask(id) {
      const { data, error } = await admin.from('tasks').select('id,project_id,title,assignee_id,state,due_at,labels,source_ref,updated_at,synced_at,sync_origin,description,cover').eq('id', id).eq('org_id', orgId).maybeSingle();
      if (error) throw new Error(error.message);
      return (data as PushTask | null) ?? null;
    },
    async projectRef(pid) {
      const { data } = await admin.from('projects').select('source_ref').eq('id', pid).eq('org_id', orgId).maybeSingle();
      return ((data as Row | null)?.source_ref as string | null) ?? null;
    },
    async claimNew(id) {
      const { data } = await admin.from('tasks').update({ source_ref: 'trello:pending', sync_origin: 'trello', synced_at: new Date().toISOString() }).eq('id', id).eq('org_id', orgId).is('source_ref', null).select('id');
      return !!data?.length;
    },
    async linkCard(id, cardId) {
      const { error } = await admin.from('tasks').update({ source_ref: cardId ? `trello:${cardId}` : null, sync_origin: 'trello', synced_at: new Date().toISOString() }).eq('id', id).eq('org_id', orgId);
      if (error) throw new Error(error.message);
    },
    async getCard(cardId) {
      try { return await trelloFetch<TrelloCard>(creds, `/cards/${cardId}`, { params: { fields: CARD_FIELDS }, fetchImpl }); }
      catch (e) { if (e instanceof TrelloApiError && e.status === 404) return null; throw e; }
    },
    async attachmentExt(taskId) {
      const { data } = await admin.from('task_attachments').select('id,external_id').eq('task_id', taskId).eq('org_id', orgId).not('external_id', 'is', null);
      return Object.fromEntries(((data ?? []) as Row[]).filter((r) => !String(r.external_id).startsWith('pending:')).map((r) => [r.id as string, r.external_id as string]));
    },
    async putCard(cardId, body) { await trelloFetch(creds, `/cards/${cardId}`, { method: 'PUT', body, fetchImpl }); },
    postCard: (body) => trelloFetch<{ id: string }>(creds, '/cards', { method: 'POST', body, fetchImpl }),
    log: (e) => writeSyncLog(admin, orgId, [e]),
  };
}

/** İnline / manuel itme: görevin güncel halini Trello'ya uygular. Yapılandırma yok ya da kapalıysa sessizce çıkar. */
export async function pushTaskNow(admin: SupabaseClient, orgId: string, taskId: string, cfgIn?: TrelloConfig | null, opts: { prevAssignee?: string | null } = {}): Promise<PushResult> {
  const cfg = cfgIn === undefined ? await loadTrelloConfig(admin, orgId) : cfgIn;
  if (!cfg || cfg.mode !== 'two_way') return 'skipped';
  return pushTaskWith(supabasePushPorts(admin, orgId, cfg), taskId, opts);
}

/**
 * Dispatcher'ın otomasyondan bağımsız "entegrasyon senkronu" adımı (cron + olay başına). Süzgeç geçerse ilgili görevi iter;
 * hata dispatcher'ı durdurmaz (günlüğe yazılır). `cache`: aynı partide org başına tek yapılandırma okuması.
 */
export async function syncEvent(admin: SupabaseClient, ev: SyncEventLike & { org_id: string; aggregate_id: string }, cache: Map<string, TrelloConfig | null> = new Map()): Promise<PushResult> {
  if (detailChangeOf(ev as never)) {
    if (!cache.has(ev.org_id)) cache.set(ev.org_id, await loadTrelloConfig(admin, ev.org_id).catch(() => null));
    const cfgD = cache.get(ev.org_id) ?? null;
    const d = shouldPushDetail(ev as never, cfgD);
    if (!d.push || !d.change) return 'skipped';
    const r = await pushDetailNow(admin, ev.org_id, d.change, cfgD);
    return r === 'pushed' ? 'updated' : r === 'error' ? 'error' : r === 'skipped' ? 'skipped' : 'noop';
  }
  if (ev.aggregate !== 'tasks') return 'skipped';
  if (!cache.has(ev.org_id)) cache.set(ev.org_id, await loadTrelloConfig(admin, ev.org_id).catch(() => null));
  const cfg = cache.get(ev.org_id) ?? null;
  if (!shouldPushEvent(ev, cfg).push) return 'skipped';
  return pushTaskNow(admin, ev.org_id, ev.aggregate_id, cfg, { prevAssignee: (ev.payload.old?.assignee_id as string | null | undefined) ?? null });
}

/**
 * Satır içi ayrıntı itmesi: tarayıcıdan yorum / checklist / ek yazıldıktan sonra son birkaç dakikanın ayrıntı olaylarını işler
 * (silmede güvenilir `old` satırı olaydan gelir; istemci kimlik göndermez). Cron aynı olayları tekrar işler; itme idempotenttir.
 */
export async function pushRecentDetailEvents(admin: SupabaseClient, orgId: string, windowMs = 3 * 60_000): Promise<{ processed: number; pushed: number }> {
  const cfg = await loadTrelloConfig(admin, orgId).catch(() => null);
  if (!cfg || cfg.mode !== 'two_way') return { processed: 0, pushed: 0 };
  const since = new Date(Date.now() - windowMs).toISOString();
  const { data } = await admin.from('events').select('id,org_id,type,aggregate,aggregate_id,payload').eq('org_id', orgId).gte('occurred_at', since)
    .or(`aggregate.in.(${DETAIL_TABLES.join(',')}),type.eq.task.commented`).order('occurred_at').limit(50);
  const cache = new Map<string, TrelloConfig | null>([[orgId, cfg]]);
  let pushed = 0;
  for (const ev of (data ?? []) as Array<SyncEventLike & { org_id: string; aggregate_id: string }>) if ((await syncEvent(admin, ev, cache)) === 'updated') pushed++;
  return { processed: data?.length ?? 0, pushed };
}
