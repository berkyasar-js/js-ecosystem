import { describe, expect, it } from 'vitest';
import { summarizeSyncLog, trelloConfigSchema, type TrelloConfig } from '@jscore/contracts';
import { dispatchEvent, type AutomationEvent, type DispatchPorts } from '@jscore/core/automations/dispatch';
import {
  buildListMap, buildMemberIds, reconcilePlan, resolveConflict, runImport,
  type StoreTask, type SyncLogDraft, type TaskDraft, type TrelloCard, type TrelloSnapshot, type TrelloStore,
} from '@jscore/core/integrations/trello-map';
import { buildCardPatch, cardNameFor, chooseList, isOwnTrelloAction, pushTaskWith, shouldPushEvent, type ListMap, type PushPorts, type PushTask } from '@jscore/core/integrations/trello-push';

const TEAM = [{ id: 'RV', name: 'Raif Vural' }, { id: 'SK', name: 'Seda Karabacak' }, { id: 'UC', name: 'Ural Çalışkan' }];
const LISTS = [
  { id: 'lRaif', idBoard: 'B1', name: 'Raif' }, { id: 'lRaifK', idBoard: 'B1', name: 'Raif Kontrol' }, { id: 'lSeda', idBoard: 'B1', name: 'Seda' },
  { id: 'lOnay', idBoard: 'B1', name: 'Tasarım Müşteri Onay' }, { id: 'lTeslim', idBoard: 'B1', name: 'Tasarım Teslim' },
  { id: 'lProd', idBoard: 'B1', name: 'Kurulum-Baskı-Produksiyon' }, { id: 'lBekle', idBoard: 'B1', name: 'Bekleme Salonu' },
  { id: 'lSm', idBoard: 'B1', name: 'Kasım26 SM' }, { id: 'lSablon', idBoard: 'B1', name: 'Seda şablon' }, { id: 'lOther', idBoard: 'B2', name: 'Seda' },
];
const LM: ListMap = buildListMap(LISTS, TEAM);
const MEMBER_IDS = buildMemberIds([{ id: 'mRV', fullName: 'Raif Vural' }, { id: 'mSK', fullName: 'Seda K.' }], TEAM);
const task = (o: Partial<PushTask> = {}): PushTask => ({ id: 't1', project_id: 'p1', title: 'Anova Kasım\'26 SM', assignee_id: 'RV', state: 'production', due_at: null, labels: ['trello', 'job:184'], source_ref: 'trello:c1', updated_at: '2026-10-16T10:00:00Z', ...o });
const card = (o: Partial<TrelloCard> = {}): TrelloCard => ({ id: 'c1', idBoard: 'B1', idList: 'lRaif', name: "184_Anova Kasım'26 SM", due: null, dueComplete: false, idMembers: [], closed: false, dateLastActivity: '2026-10-16T09:00:00Z', ...o });
const CFG = (o: Partial<TrelloConfig> = {}): TrelloConfig => trelloConfigSchema.parse({ api_key: 'k'.repeat(20), token: 't'.repeat(30), list_map: LM, member_ids: MEMBER_IDS, token_member_id: 'mBOT', ...o });

describe('Trello push · liste eşlemesi', () => {
  it('buildListMap: tür, aşama, kişi; şablon ve başka pano karışmaz', () => {
    expect(LM.lRaif).toMatchObject({ board: 'B1', kind: 'person', stage: 'production', person: 'Raif', employee: 'RV' });
    expect(LM.lRaifK).toMatchObject({ kind: 'person', stage: 'internal_review', review: true, employee: 'RV' });
    expect(LM.lOnay).toMatchObject({ kind: 'approval', stage: 'approval' });
    expect(LM.lTeslim.stage).toBe('delivery');
    expect(LM.lSablon).toBeUndefined();
    expect(MEMBER_IDS).toEqual({ RV: 'mRV', SK: 'mSK' });
  });
  it('üretim → atananın kişi kuyruğu (aynı pano); kuyruk yoksa aşama listesi', () => {
    expect(chooseList({ state: 'production', assignee_id: 'SK' }, 'B1', LM)).toBe('lSeda');
    expect(chooseList({ state: 'production', assignee_id: 'SK' }, 'B2', LM)).toBe('lOther');
    expect(chooseList({ state: 'production', assignee_id: 'UC' }, 'B1', LM)).toBe('lProd');
  });
  it('onay / teslim → aşama listesi (atanan olsa da); iç revize → Kontrol kuyruğu; plan / brief', () => {
    expect(chooseList({ state: 'approval', assignee_id: 'RV' }, 'B1', LM)).toBe('lOnay');
    expect(chooseList({ state: 'delivery', assignee_id: 'RV' }, 'B1', LM)).toBe('lTeslim');
    expect(chooseList({ state: 'internal_review', assignee_id: 'RV' }, 'B1', LM)).toBe('lRaifK');
    expect(chooseList({ state: 'internal_review', assignee_id: 'SK' }, 'B1', LM)).toBeNull(); // Seda'nın Kontrol kuyruğu yok → kart yerinde
    expect(chooseList({ state: 'plan', assignee_id: 'RV' }, 'B1', LM)).toBe('lSm');
    expect(chooseList({ state: 'brief', assignee_id: null }, 'B1', LM)).toBe('lBekle');
    expect(chooseList({ state: 'archive', assignee_id: 'RV' }, 'B1', LM)).toBeNull();
  });
  it('zaten uygun listedeki kart taşınmaz', () => {
    expect(chooseList({ state: 'production', assignee_id: 'RV' }, 'B1', LM, 'lRaif')).toBe('lRaif');
    expect(chooseList({ state: 'production', assignee_id: null }, 'B1', LM, 'lSeda')).toBe('lSeda');
    expect(chooseList({ state: 'production', assignee_id: 'SK' }, 'B1', LM, 'lProd')).toBe('lSeda'); // atanan var → kişi kuyruğu tercih
  });
});

describe('Trello push · kart yaması', () => {
  const env = { listMap: LM, memberIds: MEMBER_IDS, boardId: 'B1' };
  it('fark yoksa boş yama', () => { expect(buildCardPatch(task({ assignee_id: 'RV' }), card({ idMembers: ['mRV'] }), env)).toEqual({}); });
  it('kart adı iş no önekini korur', () => {
    expect(cardNameFor(task())).toBe("184_Anova Kasım'26 SM");
    expect(buildCardPatch(task({ title: 'Yeni ad' }), card(), env).name).toBe('184_Yeni ad');
  });
  it('aşama + atanan → liste, üye (eski atananın üyesi çıkar), due', () => {
    const p = buildCardPatch(task({ assignee_id: 'SK', due_at: '2026-10-20T12:00:00+00:00' }), card({ idMembers: ['mRV', 'mX'] }), { ...env, prevAssignee: 'RV' });
    expect(p).toEqual({ idList: 'lSeda', due: '2026-10-20T12:00:00.000Z', idMembers: ['mX', 'mSK'] });
  });
  it('onaya taşıma ve due kaldırma', () => {
    expect(buildCardPatch(task({ state: 'approval', due_at: null }), card({ due: '2026-10-20T00:00:00.000Z' }), env)).toMatchObject({ idList: 'lOnay', due: null });
  });
  it('arşiv → closed=true + dueComplete; liste taşınmaz; geri açma closed=false', () => {
    const p = buildCardPatch(task({ state: 'archive', due_at: '2026-10-20T00:00:00Z' }), card({ due: '2026-10-20T00:00:00.000Z' }), env);
    expect(p).toEqual({ closed: true, dueComplete: true });
    expect(buildCardPatch(task(), card({ closed: true }), env).closed).toBe(false);
  });
});

describe('Trello push · döngü koruması', () => {
  const ev = (o: Record<string, unknown> = {}, old: Record<string, unknown> | null = { state: 'brief', assignee_id: 'RV', title: 'a', due_at: null }, type = 'tasks.update') =>
    ({ type, aggregate: 'tasks', payload: { new: { source_ref: 'trello:c1', state: 'production', assignee_id: 'RV', title: 'a', due_at: null, ...o }, old } });
  it('Trello kaynaklı yazma (sync_origin / payload.origin) geri itilmez', () => {
    expect(shouldPushEvent(ev(), CFG())).toEqual({ push: true, reason: 'changed' });
    expect(shouldPushEvent(ev({ sync_origin: 'trello' }), CFG()).reason).toBe('origin');
    expect(shouldPushEvent({ ...ev(), payload: { ...ev().payload, origin: 'trello' } }, CFG()).reason).toBe('origin');
  });
  it('updated_at <= synced_at (içe aktarma yazması) itilmez; senkron sonrası JS yazması itilir', () => {
    expect(shouldPushEvent(ev({ updated_at: '2026-10-16T10:00:00Z', synced_at: '2026-10-16T10:00:00Z' }), CFG()).reason).toBe('origin');
    expect(shouldPushEvent(ev({ updated_at: '2026-10-16T10:00:01Z', synced_at: '2026-10-16T10:00:00Z' }), CFG()).push).toBe(true);
  });
  it('mod two_way değilse, ilgisiz alan değişince, yabancı source_ref ile itilmez; yeni görev (ref yok) itilir', () => {
    expect(shouldPushEvent(ev(), CFG({ mode: 'pull_only' })).reason).toBe('mode');
    expect(shouldPushEvent(ev(), CFG({ mode: 'off' })).push).toBe(false);
    expect(shouldPushEvent(ev({ state: 'brief' }), CFG()).reason).toBe('irrelevant');
    expect(shouldPushEvent(ev({ source_ref: 'automation:a1' }), CFG()).reason).toBe('foreign_ref');
    expect(shouldPushEvent(ev({ source_ref: null }, null, 'tasks.insert'), CFG()).reason).toBe('new_task');
    expect(shouldPushEvent(ev({}, null, 'tasks.insert'), CFG()).push).toBe(false);
  });
  it('webhook: token sahibinin kendi eylemi yok sayılır', () => {
    expect(isOwnTrelloAction({ idMemberCreator: 'mBOT' }, CFG())).toBe(true);
    expect(isOwnTrelloAction({ idMemberCreator: 'mHuman' }, CFG())).toBe(false);
    expect(isOwnTrelloAction({ idMemberCreator: 'mBOT' }, CFG({ token_member_id: undefined }))).toBe(false);
  });
});

/* ───────── pushTaskWith: bellek portları ───────── */
function fakePorts(t: PushTask | null, c: TrelloCard | null, cfg = CFG(), projectRef: string | null = 'trello:board:B1') {
  const calls: { put: Array<[string, Record<string, unknown>]>; post: Array<Record<string, unknown>>; links: Array<string | null> } = { put: [], post: [], links: [] };
  const logs: SyncLogDraft[] = [];
  const row = t && { ...t };
  const ports: PushPorts = {
    cfg,
    loadTask: async () => row,
    projectRef: async () => projectRef,
    claimNew: async () => { if (!row || row.source_ref) return false; row.source_ref = 'trello:pending'; return true; },
    linkCard: async (_id, cardId) => { calls.links.push(cardId); if (row) row.source_ref = cardId ? `trello:${cardId}` : null; },
    getCard: async () => c,
    putCard: async (id, body) => { calls.put.push([id, body]); },
    postCard: async (body) => { calls.post.push(body); return { id: 'newCard' }; },
    log: (e) => { logs.push(e); },
  };
  return { ports, calls, logs };
}
describe('Trello push · pushTaskWith', () => {
  it('değişikliği karta yazar ve günlüğe düşer', async () => {
    const { ports, calls, logs } = fakePorts(task({ state: 'approval' }), card());
    expect(await pushTaskWith(ports, 't1')).toBe('updated');
    expect(calls.put).toEqual([['c1', { idList: 'lOnay', idMembers: 'mRV' }]]);
    expect(logs[0]).toMatchObject({ direction: 'push', action: 'updated', ok: true, external_id: 'c1' });
  });
  it('fark yoksa Trello’ya yazılmaz (idempotent)', async () => {
    const { ports, calls } = fakePorts(task(), card({ idMembers: ['mRV'] }));
    expect(await pushTaskWith(ports, 't1')).toBe('noop');
    expect(calls.put).toEqual([]);
  });
  it('mod pull_only / off → yazma yok', async () => {
    for (const mode of ['pull_only', 'off'] as const) {
      const { ports, calls } = fakePorts(task({ state: 'approval' }), card(), CFG({ mode }));
      expect(await pushTaskWith(ports, 't1')).toBe('skipped');
      expect(calls.put).toEqual([]);
    }
  });
  it('sync_origin=trello olan görev geri itilmez (günlüğe skipped_origin)', async () => {
    const { ports, calls, logs } = fakePorts(task({ state: 'approval', sync_origin: 'trello' }), card());
    expect(await pushTaskWith(ports, 't1')).toBe('skipped');
    expect(calls.put).toEqual([]);
    expect(logs[0].action).toBe('skipped_origin');
  });
  it('çakışma: Trello kartı daha yeniyse itme atlanır; JS daha yeniyse yazılır', async () => {
    const newer = fakePorts(task({ state: 'approval', updated_at: '2026-10-16T10:00:00Z' }), card({ dateLastActivity: '2026-10-16T10:05:00Z' }));
    expect(await pushTaskWith(newer.ports, 't1')).toBe('skipped');
    expect(newer.calls.put).toEqual([]);
    expect(newer.logs[0]).toMatchObject({ action: 'skipped_conflict', ok: true });
    const older = fakePorts(task({ state: 'approval', updated_at: '2026-10-16T10:00:00Z' }), card({ dateLastActivity: '2026-10-16T09:00:00Z' }));
    expect(await pushTaskWith(older.ports, 't1')).toBe('updated');
  });
  it('updated_at <= synced_at olan görev (Trello yazması) geri itilmez', async () => {
    const { ports, calls } = fakePorts(task({ state: 'approval', updated_at: '2026-10-16T10:00:00Z', synced_at: '2026-10-16T10:00:00Z' }), card({ dateLastActivity: '2026-10-16T09:00:00Z' }));
    expect(await pushTaskWith(ports, 't1')).toBe('skipped');
    expect(calls.put).toEqual([]);
  });
  it('kart Trello’da yok → hata günlüğü (vanished)', async () => {
    const { ports, logs } = fakePorts(task(), null);
    expect(await pushTaskWith(ports, 't1')).toBe('error');
    expect(logs[0]).toMatchObject({ action: 'vanished', ok: false });
  });
  it('Trello kaynaklı projede yeni görev → doğru listede kart, source_ref geri yazılır', async () => {
    const { ports, calls, logs } = fakePorts(task({ source_ref: null, title: 'Yeni iş', labels: [], assignee_id: 'SK', due_at: '2026-10-30T00:00:00Z' }), null);
    expect(await pushTaskWith(ports, 't1')).toBe('created');
    expect(calls.post).toEqual([{ idList: 'lSeda', name: 'Yeni iş', pos: 'bottom', due: '2026-10-30T00:00:00.000Z', idMembers: 'mSK' }]);
    expect(calls.links).toEqual(['newCard']);
    expect(logs.at(-1)).toMatchObject({ action: 'created', external_id: 'newCard' });
  });
  it('Trello kaynaklı olmayan projede ya da uygun liste yoksa kart açılmaz', async () => {
    const none = fakePorts(task({ source_ref: null }), null, CFG(), null);
    expect(await pushTaskWith(none.ports, 't1')).toBe('noop');
    expect(none.calls.post).toEqual([]);
    const nolist = fakePorts(task({ source_ref: null, state: 'internal_review', assignee_id: 'SK' }), null);
    expect(await pushTaskWith(nolist.ports, 't1')).toBe('error');
    expect(nolist.calls.links).toEqual([null]); // claim serbest bırakıldı
  });
});

describe('Trello · çakışma kuralı (son yazan kazanır)', () => {
  it('resolveConflict: yalnızca senkrondan sonraki JS yazması engeller', () => {
    const SY = '2026-10-16T08:00:00Z';
    expect(resolveConflict('2026-10-16T10:00:00Z', '2026-10-16T09:00:00Z', SY)).toBe('push'); // JS düzenlemesi (updated_at > synced_at) ve kartan yeni
    expect(resolveConflict('2026-10-16T09:00:00Z', '2026-10-16T10:00:00Z', SY)).toBe('pull'); // Trello daha yeni
    expect(resolveConflict('2026-10-16T10:00:00Z', '2026-10-16T10:00:00Z', SY)).toBe('pull');
    expect(resolveConflict(undefined, '2026-10-16T10:00:00Z', SY)).toBe('pull');
    expect(resolveConflict('2026-10-16T10:00:00Z', '2026-10-16T09:00:00Z', '2026-10-16T10:00:00Z')).toBe('pull'); // updated_at == synced_at → içe aktarma yazması
    expect(resolveConflict('2026-10-16T10:00:00Z', '2026-10-16T09:00:00Z', '2026-10-16T10:30:00Z')).toBe('pull'); // senkron sonrası JS yazması yok
    expect(resolveConflict('2026-10-16T10:00:00Z', '2026-10-16T09:00:00Z', null)).toBe('pull'); // synced_at yok → engellemez
    expect(resolveConflict('2026-10-16T10:00:00Z', '2026-10-16T09:00:00Z', undefined)).toBe('pull');
  });
  const SNAP = (activity: string): TrelloSnapshot => ({ boards: [{ id: 'B1', name: 'Pano' }], lists: [{ id: 'lSeda', idBoard: 'B1', name: 'Seda' }], members: [],
    cards: [{ id: 'c1', idBoard: 'B1', idList: 'lSeda', name: '184_Anova İş', dateLastActivity: activity }] });
  function store(updatedAt: string, syncedAt: string | null = '2026-10-16T08:00:00Z') {
    const cur: StoreTask = { id: 't1', source_ref: 'trello:c1', project_id: 'p1', title: 'Eski ad', assignee_id: 'SK', state: 'production', priority: 'normal', due_at: null, planned_minutes: 0, task_type: 'general', labels: [], updated_at: updatedAt, synced_at: syncedAt };
    const updates: Array<Partial<TaskDraft>> = [];
    const s: TrelloStore = {
      load: async () => ({ brands: [{ id: 'b', name: 'Anova' }], employees: TEAM, projects: [{ id: 'p1', name: 'Anova · Trello' }], tasks: [cur] }),
      createBrand: async (name) => ({ id: 'bn', name }), createProject: async () => ({ id: 'pn' }), createTasks: async () => undefined,
      updateTask: async (_id, patch) => { updates.push(patch); },
    };
    return { s, updates };
  }
  it('JS daha yeniyse Trello değişikliği atlanır ve günlüğe yazılır', async () => {
    const { s, updates } = store('2026-10-16T10:00:00Z');
    const logs: SyncLogDraft[] = [];
    const r = await runImport(SNAP('2026-10-16T09:00:00Z'), s, { now: '2026-10-16T11:00:00Z', onLog: (e) => logs.push(e) });
    expect(updates).toEqual([]);
    expect(r).toMatchObject({ tasks_updated: 0, tasks_skipped: 1 });
    expect(logs[0]).toMatchObject({ direction: 'pull', action: 'skipped_conflict' });
  });
  it('içe aktarma/birleştirme yazması (updated_at <= synced_at ya da synced_at yok) kart güncellemesini engellemez', async () => {
    for (const [u, sy] of [['2026-10-16T10:00:00Z', '2026-10-16T10:00:00Z'], ['2026-10-16T10:00:00Z', '2026-10-16T10:30:00Z'], ['2026-10-16T10:00:00Z', null]] as const) {
      const { s, updates } = store(u, sy);
      const r = await runImport(SNAP('2026-10-16T09:00:00Z'), s, { now: '2026-10-16T11:00:00Z' });
      expect(updates[0]).toMatchObject({ title: 'Anova İş' });
      expect(r).toMatchObject({ tasks_updated: 1, tasks_skipped: 0 });
    }
  });
  it('Trello daha yeniyse uygulanır', async () => {
    const { s, updates } = store('2026-10-16T08:00:00Z');
    const logs: SyncLogDraft[] = [];
    const r = await runImport(SNAP('2026-10-16T09:00:00Z'), s, { now: '2026-10-16T11:00:00Z', onLog: (e) => logs.push(e) });
    expect(updates[0]).toMatchObject({ title: 'Anova İş' });
    expect(r.tasks_updated).toBe(1);
    expect(logs[0]).toMatchObject({ action: 'updated', ok: true });
  });
  it('içe aktarma Trello kaynaklı projeye board bağını yazar', async () => {
    const created: unknown[] = [];
    const refs: string[] = [];
    const s: TrelloStore = {
      load: async () => ({ brands: [{ id: 'b', name: 'Anova' }], employees: TEAM, projects: [{ id: 'p0', name: 'Anova · Trello', source_ref: null }], tasks: [] }),
      createBrand: async (name) => ({ id: 'bn', name }), createProject: async (p) => { created.push(p); return { id: 'pn' }; }, createTasks: async () => undefined, updateTask: async () => undefined,
      setProjectRef: async (_id, ref) => { refs.push(ref); },
    };
    await runImport(SNAP('2026-10-16T09:00:00Z'), s, { now: '2026-10-16T11:00:00Z' });
    expect(refs).toEqual(['trello:board:B1']);
    const fresh = { ...s, load: async () => ({ brands: [], employees: TEAM, projects: [], tasks: [] }) };
    await runImport(SNAP('2026-10-16T09:00:00Z'), fresh, { now: '2026-10-16T11:00:00Z' });
    expect(created[0]).toMatchObject({ source_ref: 'trello:board:B1' });
  });
});

describe('Trello · saatlik uzlaştırma seçimi', () => {
  const st = (id: string, o: Partial<StoreTask & { sync_origin?: string | null }> = {}): StoreTask & { sync_origin?: string | null } => ({ id: `t_${id}`, source_ref: `trello:${id}`, project_id: 'p1', title: id, assignee_id: null, state: 'production', priority: 'normal', due_at: null, planned_minutes: 0, task_type: 'general', labels: [], updated_at: '2026-10-16T08:00:00Z', ...o });
  const SINCE = '2026-10-16T09:00:00Z';
  const cards: TrelloCard[] = [
    { id: 'old', idList: 'l', name: 'a', dateLastActivity: '2026-10-16T08:30:00Z' },
    { id: 'chg', idList: 'l', name: 'b', dateLastActivity: '2026-10-16T09:30:00Z' },
    { id: 'new', idList: 'l', name: 'c', dateLastActivity: '2026-10-15T00:00:00Z' }, // görevi yok → çekilir
  ];
  const tasks = [
    st('old'), st('chg'), st('gone'), st('gone_arch', { state: 'archive' }), st('gone_flag', { labels: ['trello:vanished'] }),
    st('jsedit', { updated_at: '2026-10-16T09:45:00Z' }), st('fromTrello', { updated_at: '2026-10-16T09:45:00Z', sync_origin: 'trello' }),
    st('syncedWrite', { updated_at: '2026-10-16T09:45:00Z', synced_at: '2026-10-16T09:45:00Z' }), st('editAfterSync', { updated_at: '2026-10-16T09:50:00Z', synced_at: '2026-10-16T09:45:00Z' }),
    { ...st('x'), id: 'unl', source_ref: '', project_id: 'trelloProj' } as StoreTask,
  ];
  it('çekilecek kartlar, kayıp görevler, itilecek görevler', () => {
    const p = reconcilePlan(cards, tasks, SINCE, { trelloProjectIds: new Set(['trelloProj']) });
    expect(p.pullCards.map((c) => c.id).sort()).toEqual(['chg', 'new']);
    expect(p.missing.map((t) => t.source_ref).sort()).toEqual(['trello:editAfterSync', 'trello:fromTrello', 'trello:gone', 'trello:jsedit', 'trello:syncedWrite'].sort());
    expect(p.pushTasks.map((t) => t.id).sort()).toEqual(['t_editAfterSync', 't_jsedit']); // Trello kaynaklı yazma (sync_origin / updated_at <= synced_at) itilmez
    expect(p.unlinked.map((t) => t.id)).toEqual(['unl']);
  });
  it('last_sync_at yoksa (ilk koşu) tüm kartlar çekilir, hiçbir görev itilmez', () => {
    const p = reconcilePlan(cards, tasks, null);
    expect(p.pullCards).toHaveLength(3);
    expect(p.pushTasks).toEqual([]);
  });
});

describe('Dispatcher · entegrasyon senkron adımı', () => {
  const ports = (seen: AutomationEvent[]): DispatchPorts => ({
    now: () => '2026-10-16T10:00:00Z', rules: async () => [], logRun: async () => undefined, touchRule: async () => undefined, notify: async () => undefined,
    createTask: async () => ({ id: 'x' }), setTaskState: async () => undefined, webhook: async () => undefined, integrationSync: async (ev) => { seen.push(ev); },
  });
  it('otomasyon kuralı olmasa da, otomasyon kaynaklı olay olsa da çağrılır; hata dağıtımı durdurmaz', async () => {
    const seen: AutomationEvent[] = [];
    const ev = (ref: string | null): AutomationEvent => ({ org_id: 'o', type: 'tasks.insert', aggregate: 'tasks', aggregate_id: 't', payload: { new: { source_ref: ref } } });
    await dispatchEvent(ev(null), ports(seen));
    await dispatchEvent(ev('automation:a1'), ports(seen));
    expect(seen).toHaveLength(2);
    const bad = { ...ports([]), integrationSync: async () => { throw new Error('trello down'); } };
    await expect(dispatchEvent(ev(null), bad)).resolves.toEqual([]);
  });
});

describe('Senkron günlüğü özeti', () => {
  it('değişiklik / hata sayısı (atlananlar ve bilgi satırları hariç)', () => {
    expect(summarizeSyncLog([
      { ok: true, action: 'updated' }, { ok: true, action: 'created' }, { ok: true, action: 'skipped_conflict' }, { ok: true, action: 'reconcile' },
      { ok: false, action: 'error' }, { ok: false, action: 'vanished' }, { ok: true, action: 'mode' },
    ])).toEqual({ changes: 2, errors: 2 });
  });
});
