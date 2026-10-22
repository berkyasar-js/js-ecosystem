import { describe, expect, it } from 'vitest';
import { MAX_ATTACHMENT_BYTES, taskPatchSchema, trelloConfigSchema, type TaskAttachment, type TaskCheckItem, type TaskChecklist, type TaskComment, type TaskCover, type TrelloConfig } from '@jscore/contracts';
import { parseBlocks, parseInline } from '../../components/work/md-parse';
import {
  addDetails, applyDetailOp, attachmentUrlBody, checkItemBody, checklistBody, commentBody, detailChangeOf, emptyDetailsSummary, mapCover, planWebhookAction, pushDetailWith, shouldPushDetail, syncCardDetails,
  type CardDetails, type DetailPushPorts, type DetailStore, type DetailTable, type JsDetails,
} from '@jscore/core/integrations/trello-details';
import { TRELLO_FIXTURE } from '@jscore/core/integrations/trello-fixture';
import { runImport, type StoreProject, type StoreTask, type SyncLogDraft, type TaskDraft, type TrelloCard, type TrelloStore } from '@jscore/core/integrations/trello-map';
import { buildCardPatch, shouldPushEvent, wantedCover, type PushTask } from '@jscore/core/integrations/trello-push';
import { DemoRepo } from '@jscore/core/repo/demo';

/* ───────── Bellek içi ayrıntı deposu (DetailStore) ───────── */
type Row = Record<string, unknown>;
function memDetails() {
  const s = { description: null as string | null, cover: null as TaskCover | null, comments: [] as TaskComment[], lists: [] as Array<Omit<TaskChecklist, 'items'>>, items: [] as TaskCheckItem[], atts: [] as TaskAttachment[], n: 0 };
  const id = (p: string) => `${p}${++s.n}`;
  const tag = { sync_origin: 'trello' };
  const store: DetailStore = {
    load: async () => ({ description: s.description, cover: s.cover, comments: s.comments, attachments: s.atts, checklists: s.lists.map((l) => ({ ...l, items: s.items.filter((i) => i.checklist_id === l.id) })) }) as JsDetails,
    setTaskFields: async (_t, p) => { if ('description' in p) s.description = p.description ?? null; if ('cover' in p) s.cover = p.cover ?? null; },
    addComment: async (t, c) => { const r = { id: id('cm'), org_id: 'o', task_id: t, author_id: null, ...tag, ...c } as TaskComment; s.comments.push(r); return { id: r.id }; },
    updateComment: async (i, p) => { Object.assign(s.comments.find((x) => x.id === i)!, p); },
    deleteComment: async (i) => { s.comments = s.comments.filter((x) => x.id !== i); },
    addChecklist: async (t, c) => { const r = { id: id('cl'), org_id: 'o', task_id: t, ...c }; s.lists.push(r); return { id: r.id }; },
    updateChecklist: async (i, p) => { Object.assign(s.lists.find((x) => x.id === i)!, p); },
    deleteChecklist: async (i) => { s.lists = s.lists.filter((x) => x.id !== i); s.items = s.items.filter((x) => x.checklist_id !== i); },
    addCheckItem: async (c, it) => { const r = { id: id('ci'), org_id: 'o', checklist_id: c, ...it } as TaskCheckItem; s.items.push(r); return { id: r.id }; },
    updateCheckItem: async (i, p) => { Object.assign(s.items.find((x) => x.id === i)!, p); },
    deleteCheckItem: async (i) => { s.items = s.items.filter((x) => x.id !== i); },
    addAttachment: async (t, a) => { const r = { id: id('at'), org_id: 'o', task_id: t, uploaded_by: null, ...a } as TaskAttachment; s.atts.push(r); return { id: r.id }; },
    updateAttachment: async (i, p) => { Object.assign(s.atts.find((x) => x.id === i)!, p); },
    deleteAttachment: async (i) => { s.atts = s.atts.filter((x) => x.id !== i); },
  };
  return { s, store };
}
const RAW: CardDetails = {
  desc: 'Merhaba\r\n- bir',
  cover: { color: 'blue' },
  checklists: [
    { id: 'L1', name: 'Üretim', pos: 1, checkItems: [
      { id: 'I1', name: 'Moodboard', state: 'complete', pos: 1 },
      { id: 'I2', name: 'Kurgu', state: 'incomplete', pos: 2, due: '2026-10-30T09:00:00.000Z', idMember: 'tm1' },
    ] },
    { id: 'L2', name: 'Teslim', pos: 2, checkItems: [] },
  ],
  comments: [
    { id: 'A2', date: '2026-10-11T12:00:00.000Z', memberCreator: { fullName: 'Raif Vural' }, data: { text: 'ikinci' } },
    { id: 'A1', date: '2026-10-10T08:00:00.000Z', memberCreator: { username: 'selin' }, data: { text: 'ilk @seda' } },
  ],
  attachments: [
    { id: 'T1', name: 'rehber', url: 'https://example.com/r', bytes: 0, isUpload: false },
    { id: 'T2', name: 'foto.png', url: 'https://trello.com/1/cards/c/attachments/T2/download/foto.png', bytes: 1000, mimeType: 'image/png', isUpload: true },
    { id: 'T3', name: 'film.mov', url: 'https://trello.com/1/cards/c/attachments/T3/download/film.mov', bytes: MAX_ATTACHMENT_BYTES + 1, mimeType: 'video/quicktime', isUpload: true },
  ],
};
const download = async (a: { id: string; bytes?: number | null }) => ({ storage_path: `o/t/${a.id}-x`, bytes: a.bytes ?? 0, mime: 'image/png' });
const total = (r: ReturnType<typeof addDetails>) => r.comments + r.checklists + r.check_items + r.attachments + r.description + r.cover;

describe('Trello ayrıntı · eşleme (çek)', () => {
  it('mapCover: ek → JS ek id; bilinmeyen ek / geçersiz renk → renge ya da boş', () => {
    expect(mapCover({ color: 'blue' }, () => null)).toEqual({ color: 'blue' });
    expect(mapCover({ idAttachment: 'T2', color: 'red' }, (t) => (t === 'T2' ? 'js-at' : null))).toEqual({ attachment_id: 'js-at' });
    expect(mapCover({ idAttachment: 'ZZ', color: 'red' }, () => null)).toEqual({ color: 'red' });
    expect(mapCover({ color: 'green_dark' }, () => null)).toEqual({});
    expect(mapCover(null, () => null)).toEqual({});
  });

  it('açıklama, kapak, checklist(+madde durumu/bitiş/üye), yorum ve ekler göreve eşlenir', async () => {
    const { s, store } = memDetails();
    const r = await syncCardDetails(store, 't1', RAW, { memberEmployees: { tm1: 'RV' }, download, cardActivity: '2026-10-12T00:00:00Z' });
    expect(r.errors).toEqual([]);
    expect(s.description).toBe('Merhaba\n- bir');
    expect(s.cover).toEqual({ color: 'blue' });
    expect(s.lists.map((l) => [l.name, l.position, l.external_id])).toEqual([['Üretim', 0, 'L1'], ['Teslim', 1, 'L2']]);
    expect(s.items.map((i) => [i.name, i.checked, i.external_id, i.assignee_id, i.due_at])).toEqual([
      ['Moodboard', true, 'I1', null, null], ['Kurgu', false, 'I2', 'RV', '2026-10-30T09:00:00.000Z'],
    ]);
    expect(s.comments.map((c) => [c.external_id, c.author_name, c.body]).sort()).toEqual([['A1', 'selin', 'ilk @seda'], ['A2', 'Raif Vural', 'ikinci']]);
    expect(s.atts.map((a) => [a.external_id, a.storage_path, a.url.startsWith('http'), a.mime])).toEqual([
      ['T1', null, true, ''], ['T2', 'o/t/T2-x', true, 'image/png'], ['T3', null, true, 'video/quicktime'], // >25 MB: indirilmez, bağlantı yedeği kalır
    ]);
    expect(r).toMatchObject({ description: true, cover: true, comments: { created: 2 }, checklists: { created: 2 }, items: { created: 2 }, attachments: { created: 3 } });
  });

  it('kapak görsel ekse JS ek id’sine bağlanır', async () => {
    const { s, store } = memDetails();
    await syncCardDetails(store, 't1', { ...RAW, cover: { idAttachment: 'T2' } }, { download });
    expect(s.cover).toEqual({ attachment_id: s.atts.find((a) => a.external_id === 'T2')!.id });
  });

  it('indirme hatası → bağlantı yedeği + günlük (içe aktarma durmaz)', async () => {
    const { s, store } = memDetails();
    const logs: SyncLogDraft[] = [];
    await syncCardDetails(store, 't1', RAW, { download: async () => { throw new Error('ağ'); }, log: (e) => logs.push(e) });
    expect(s.atts.find((a) => a.external_id === 'T2')!.storage_path).toBeNull();
    expect(logs.some((l) => l.action === 'download_failed' && !l.ok)).toBe(true);
    expect(logs.some((l) => l.action === 'skipped_too_large')).toBe(true);
  });

  it('idempotent: ikinci çalıştırma hiçbir şeyi değiştirmez', async () => {
    const { s, store } = memDetails();
    await syncCardDetails(store, 't1', RAW, { download });
    const snap = JSON.stringify(s);
    const r2 = await syncCardDetails(store, 't1', RAW, { download });
    expect(JSON.stringify(s)).toBe(snap);
    expect(addDetails(emptyDetailsSummary(), r2)).toMatchObject({ comments: 0, checklists: 0, check_items: 0, attachments: 0, description: 0, cover: 0, errors: 0 });
    expect(r2.items.unchanged).toBe(2); expect(r2.comments.unchanged).toBe(2);
  });

  it('Trello’da değişen / silinen satırlar yansır; external_id’si olmayan JS satırlarına dokunulmaz', async () => {
    const { s, store } = memDetails();
    await syncCardDetails(store, 't1', RAW, { download });
    await store.addComment('t1', { external_id: null as never, author_name: 'Ben', body: 'JS yorumu', created_at: 'x' }); s.comments[s.comments.length - 1].external_id = null;
    const next: CardDetails = {
      ...RAW, desc: 'yeni',
      checklists: [{ id: 'L1', name: 'Üretim 2', pos: 1, checkItems: [{ id: 'I2', name: 'Kurgu', state: 'complete', pos: 1 }] }], // L2 + I1 silindi, I2 tamamlandı
      comments: [RAW.comments![0]], attachments: [RAW.attachments![0]],
    };
    const r = await syncCardDetails(store, 't1', next, { download });
    expect(s.description).toBe('yeni');
    expect(s.lists.map((l) => l.name)).toEqual(['Üretim 2']);
    expect(s.items.map((i) => [i.external_id, i.checked])).toEqual([['I2', true]]);
    expect(s.comments.map((c) => c.body).sort()).toEqual(['JS yorumu', 'ikinci']);
    expect(s.atts.map((a) => a.external_id)).toEqual(['T1']);
    expect(r).toMatchObject({ checklists: { updated: 1, deleted: 1 }, items: { updated: 1, deleted: 1 }, comments: { deleted: 1 }, attachments: { deleted: 2 } });
  });

  it('yorumlar sayfalıysa (commentsComplete=false) silme uygulanmaz; çekilmeyen parça (undefined) korunur', async () => {
    const { s, store } = memDetails();
    await syncCardDetails(store, 't1', RAW, { download });
    await syncCardDetails(store, 't1', { comments: [], commentsComplete: false }, {});
    expect(s.comments).toHaveLength(2);
    await syncCardDetails(store, 't1', { desc: 'x' }, {});
    expect(s.lists).toHaveLength(2); expect(s.atts).toHaveLength(3);
  });

  it('son yazan kazanır: JS daha yeniyse açıklama / kapak / değişmiş satır ezilmez', async () => {
    const { s, store } = memDetails();
    await syncCardDetails(store, 't1', RAW, { download });
    s.description = 'JS metni';
    const it = s.items[0]; it.checked = false; it.sync_origin = null; it.synced_at = '2026-10-12T00:00:00.000Z'; it.updated_at = '2026-10-13T00:00:00.000Z'; // JS düzenlemesi
    const r = await syncCardDetails(store, 't1', { ...RAW, desc: 'Trello metni', cover: { color: 'red' } }, { download, jsNewer: true, cardActivity: '2026-10-12T12:00:00.000Z' });
    expect(s.description).toBe('JS metni'); expect(s.cover).toEqual({ color: 'blue' });
    expect(it.checked).toBe(false);
    expect(r.skipped_conflicts).toBeGreaterThanOrEqual(3);
    // Trello daha yeniyse uygulanır
    await syncCardDetails(store, 't1', { ...RAW, desc: 'Trello metni' }, { download, jsNewer: false, cardActivity: '2026-10-14T00:00:00.000Z' });
    expect(s.description).toBe('Trello metni'); expect(it.checked).toBe(true);
  });
});

describe('Trello ayrıntı · içe aktarma (runImport + kanca) idempotent', () => {
  function taskStore() {
    const st = { brands: [{ id: 'b0', name: 'Anova' }], projects: [] as StoreProject[], tasks: [] as StoreTask[] };
    const store: TrelloStore = {
      load: async () => ({ employees: [{ id: 'RV', name: 'Raif Vural' }], brands: st.brands, projects: st.projects, tasks: st.tasks }),
      createBrand: async (name) => { const b = { id: `nb${st.brands.length}`, name }; st.brands.push(b); return b; },
      createProject: async (p) => { const r = { id: `p${st.projects.length}`, name: p.name, brand_id: p.brand_id, source_ref: p.source_ref ?? null, status: 'active' }; st.projects.push(r); return { id: r.id }; },
      createTasks: async (rows: TaskDraft[]) => { rows.forEach((r) => st.tasks.push({ ...r, id: `t${st.tasks.length}` })); },
      updateTask: async (id, patch) => { Object.assign(st.tasks.find((t) => t.id === id)!, patch); },
    };
    return { st, store };
  }
  it('iki kez içe aktarma: aynı kayıt sayıları, ikinci turda sıfır değişiklik', async () => {
    const { st, store } = taskStore();
    const d = memDetails();
    const snap = { ...TRELLO_FIXTURE, details: { c01: RAW } };
    const sum1 = emptyDetailsSummary(), sum2 = emptyDetailsSummary();
    const run = (sum: typeof sum1) => runImport(snap, store, {
      now: '2026-10-16T10:00:00.000Z',
      details: async ({ card, taskId, jsNewer }) => { if (card.id === 'c01') addDetails(sum, await syncCardDetails(d.store, taskId, { desc: card.desc ?? '', ...RAW }, { jsNewer, download })); },
    });
    const r1 = await run(sum1);
    const counts = [d.s.lists.length, d.s.items.length, d.s.comments.length, d.s.atts.length, st.tasks.length];
    const r2 = await run(sum2);
    expect([d.s.lists.length, d.s.items.length, d.s.comments.length, d.s.atts.length, st.tasks.length]).toEqual(counts);
    expect(counts).toEqual([2, 2, 2, 3, 9]);
    expect(r1.errors).toEqual([]); expect(r2.tasks_created).toBe(0);
    expect(total(sum1)).toBeGreaterThan(0);
    expect(total(sum2)).toBe(0);
  });
});

describe('Trello ayrıntı · webhook eylemleri', () => {
  const act = (type: string, data: Record<string, unknown>, extra: Record<string, unknown> = {}) => ({ id: 'ACT', type, date: '2026-10-16T09:00:00.000Z', memberCreator: { fullName: 'Selin K.' }, data: { card: { id: 'c1' }, ...data }, ...extra });
  it('planWebhookAction: tür → normalleştirilmiş işlem', () => {
    expect(planWebhookAction(act('commentCard', { text: 'selam' }))).toMatchObject({ type: 'comment.upsert', id: 'ACT', text: 'selam', author: 'Selin K.' });
    expect(planWebhookAction(act('updateComment', { action: { id: 'A9', text: 'düz' } }))).toMatchObject({ type: 'comment.upsert', id: 'A9', text: 'düz' });
    expect(planWebhookAction(act('deleteComment', { action: { id: 'A9' } }))).toEqual({ type: 'comment.delete', id: 'A9' });
    expect(planWebhookAction(act('addAttachmentToCard', { attachment: { id: 'T1' } }))).toEqual({ type: 'resync', what: ['attachments'] });
    expect(planWebhookAction(act('deleteAttachmentFromCard', { attachment: { id: 'T1' } }))).toEqual({ type: 'attachment.delete', id: 'T1' });
    expect(planWebhookAction(act('addChecklistToCard', { checklist: { id: 'L1', name: 'Liste' } }))).toEqual({ type: 'checklist.upsert', id: 'L1', name: 'Liste' });
    expect(planWebhookAction(act('removeChecklistFromCard', { checklist: { id: 'L1' } }))).toEqual({ type: 'checklist.delete', id: 'L1' });
    expect(planWebhookAction(act('createCheckItem', { checklist: { id: 'L1' }, checkItem: { id: 'I1', name: 'Madde', state: 'incomplete' } }))).toEqual({ type: 'item.upsert', id: 'I1', checklistId: 'L1', name: 'Madde', state: 'incomplete' });
    expect(planWebhookAction(act('updateCheckItemStateOnCard', { checklist: { id: 'L1' }, checkItem: { id: 'I1', name: 'Madde', state: 'complete' } }))).toMatchObject({ type: 'item.upsert', state: 'complete' });
    expect(planWebhookAction(act('updateCheckItem', { checkItem: { id: 'I1' } }))).toEqual({ type: 'resync', what: ['checklists'] });
    expect(planWebhookAction(act('deleteCheckItem', { checkItem: { id: 'I1' } }))).toEqual({ type: 'item.delete', id: 'I1' });
    expect(planWebhookAction(act('updateCard', { old: { desc: 'a' } }))).toBeNull();
    expect(planWebhookAction(act('commentCard', {}))).toEqual({ type: 'resync', what: ['comments'] });
  });

  it('applyDetailOp: yorum / checklist / madde / ek işlemleri uygulanır, tekrar uygulamak idempotent', async () => {
    const { s, store } = memDetails();
    const run = async (type: string, data: Record<string, unknown>) => applyDetailOp(store, 't1', planWebhookAction(act(type, data))!, { cardActivity: '2026-10-16T09:00:00.000Z' });
    expect((await run('commentCard', { text: 'selam' })).applied).toBe(true);
    expect((await run('commentCard', { text: 'selam' })).applied).toBe(false); // aynı eylem tekrar → değişiklik yok
    expect(s.comments).toHaveLength(1);
    await run('updateComment', { action: { id: 'ACT', text: 'düzeltildi' } });
    expect(s.comments[0].body).toBe('düzeltildi');
    await run('addChecklistToCard', { checklist: { id: 'L1', name: 'Liste' } });
    await run('createCheckItem', { checklist: { id: 'L1' }, checkItem: { id: 'I1', name: 'Madde', state: 'incomplete' } });
    expect(s.items.map((i) => [i.name, i.checked])).toEqual([['Madde', false]]);
    await run('updateCheckItemStateOnCard', { checklist: { id: 'L1' }, checkItem: { id: 'I1', name: 'Madde', state: 'complete' } });
    expect(s.items[0].checked).toBe(true);
    await run('deleteCheckItem', { checkItem: { id: 'I1' } });
    expect(s.items).toHaveLength(0);
    await run('removeChecklistFromCard', { checklist: { id: 'L1' } });
    expect(s.lists).toHaveLength(0);
    await run('deleteComment', { action: { id: 'ACT' } });
    expect(s.comments).toHaveLength(0);
    await store.addAttachment('t1', { external_id: 'T1', name: 'a', url: 'u', mime: '', bytes: 0, storage_path: null, created_at: 'x' });
    await run('deleteAttachmentFromCard', { attachment: { id: 'T1' } });
    expect(s.atts).toHaveLength(0);
  });

  it('üst checklist yoksa madde eylemi tam çekime yönlendirilir; ek ekleme de çekim ister', async () => {
    const { store } = memDetails();
    const r = await applyDetailOp(store, 't1', planWebhookAction(act('createCheckItem', { checklist: { id: 'YOK' }, checkItem: { id: 'I1', name: 'M', state: 'incomplete' } }))!);
    expect(r).toEqual({ applied: false, resync: ['checklists'] });
    expect(await applyDetailOp(store, 't1', planWebhookAction(act('addAttachmentToCard', { attachment: { id: 'T1' } }))!)).toEqual({ applied: false, resync: ['attachments'] });
  });

  it('JS daha yeni yorum / madde Trello eylemiyle ezilmez', async () => {
    const { s, store } = memDetails();
    await applyDetailOp(store, 't1', planWebhookAction(act('commentCard', { text: 'ilk' }))!);
    Object.assign(s.comments[0], { sync_origin: null, synced_at: '2026-10-16T08:00:00.000Z', updated_at: '2026-10-16T09:30:00.000Z', body: 'JS düzenledi' });
    const r = await applyDetailOp(store, 't1', planWebhookAction(act('updateComment', { action: { id: 'ACT', text: 'Trello eski' } }))!, { cardActivity: '2026-10-16T09:00:00.000Z' });
    expect(r.applied).toBe(false); expect(s.comments[0].body).toBe('JS düzenledi');
  });
});

describe('Trello ayrıntı · itme gövdeleri', () => {
  it('yorum / checklist / madde / bağlantı gövdeleri', () => {
    expect(commentBody({ body: 'selam' })).toEqual({ text: 'selam' });
    expect(checklistBody({ name: 'Üretim', position: 0 })).toEqual({ name: 'Üretim', pos: 1000 });
    const it = { name: 'Kurgu', checked: true, position: 2, due_at: '2026-10-30T09:00:00Z', assignee_id: 'RV' };
    expect(checkItemBody(it, { memberIds: { RV: 'tm1' } }, 'create')).toEqual({ name: 'Kurgu', pos: 3000, checked: true, due: '2026-10-30T09:00:00.000Z', idMember: 'tm1' });
    expect(checkItemBody(it, { memberIds: { RV: 'tm1' } }, 'update')).toMatchObject({ state: 'complete', due: '2026-10-30T09:00:00.000Z', idMember: 'tm1' });
    expect(checkItemBody({ ...it, checked: false, due_at: null, assignee_id: null }, { memberIds: {} }, 'update')).toEqual({ name: 'Kurgu', pos: 3000, state: 'incomplete', due: null, idMember: null });
    expect(checkItemBody({ ...it, due_at: null, assignee_id: 'XX' }, { memberIds: {} }, 'create')).toEqual({ name: 'Kurgu', pos: 3000, checked: true });
    expect(attachmentUrlBody({ name: 'r', url: 'https://x.y' })).toEqual({ url: 'https://x.y', name: 'r' });
  });

  const task = (o: Partial<PushTask> = {}): PushTask => ({ id: 't1', project_id: 'p1', title: 'Anova', assignee_id: null, state: 'production', due_at: null, labels: [], source_ref: 'trello:c1', updated_at: '2026-10-16T10:00:00Z', ...o });
  const card = (o: Partial<TrelloCard> = {}): TrelloCard => ({ id: 'c1', idBoard: 'B1', idList: 'l1', name: 'Anova', idMembers: [], ...o });
  const env = { listMap: {}, memberIds: {}, boardId: 'B1' };
  it('kart yaması: açıklama ve kapak yalnızca eşlenmişse (null değilse) ve farklıysa itilir', () => {
    expect(buildCardPatch(task(), card({ desc: 'Trello açıklaması' }), env)).toEqual({}); // description null → Trello açıklamasını silme
    expect(buildCardPatch(task({ description: null }), card({ desc: 'x' }), env)).toEqual({});
    expect(buildCardPatch(task({ description: 'yeni' }), card({ desc: 'eski' }), env)).toEqual({ desc: 'yeni' });
    expect(buildCardPatch(task({ description: '' }), card({ desc: 'eski' }), env)).toEqual({ desc: '' }); // bilerek temizlendi
    expect(buildCardPatch(task({ description: 'a\r\nb' }), card({ desc: 'a\nb' }), env)).toEqual({});
    expect(buildCardPatch(task({ cover: { color: 'red' } }), card({ cover: { color: 'blue' } }), env)).toEqual({ cover: { color: 'red', idAttachment: null, size: 'normal' } });
    expect(buildCardPatch(task({ cover: { color: 'red' } }), card({ cover: { color: 'red' } }), env)).toEqual({});
    expect(buildCardPatch(task({ cover: {} }), card({ cover: { color: 'red' } }), env)).toEqual({ cover: { color: null, idAttachment: null } });
    expect(buildCardPatch(task({ cover: null }), card({ cover: { color: 'red' } }), env)).toEqual({});
    expect(buildCardPatch(task({ cover: { attachment_id: 'js1' } }), card(), { ...env, attachmentExt: { js1: 'T9' } })).toEqual({ cover: { color: null, idAttachment: 'T9', size: 'normal' } });
    expect(wantedCover({ attachment_id: 'js1' }, {})).toBeUndefined(); // ek henüz Trello'da yok → dokunma
  });
  it('görev olayı: açıklama / kapak değişimi itilir, aynı değer itilmez', () => {
    const cfg = trelloConfigSchema.parse({ api_key: 'k'.repeat(20), token: 't'.repeat(30) });
    const ev = (n: Row, o: Row) => ({ type: 'tasks.update', aggregate: 'tasks', payload: { new: { source_ref: 'trello:c1', ...n }, old: { source_ref: 'trello:c1', ...o } } });
    expect(shouldPushEvent(ev({ description: 'b' }, { description: 'a' }), cfg).push).toBe(true);
    expect(shouldPushEvent(ev({ cover: { color: 'red' } }, { cover: null }), cfg).push).toBe(true);
    expect(shouldPushEvent(ev({ description: 'a' }, { description: 'a' }), cfg)).toMatchObject({ push: false, reason: 'irrelevant' });
  });
});

describe('Trello ayrıntı · itme döngü koruması (olay süzgeci)', () => {
  const CFG = (o: Partial<TrelloConfig> = {}) => trelloConfigSchema.parse({ api_key: 'k'.repeat(20), token: 't'.repeat(30), member_ids: { RV: 'tm1' }, ...o });
  const ins = (n: Row) => ({ type: 'task.commented', aggregate: 'tasks', payload: { task_id: 't1', new: { id: 'cm1', task_id: 't1', body: 'x', ...n } } });
  const ev = (table: string, op: string, n: Row | null, o: Row | null = null) => ({ type: `${table}.${op}`, aggregate: table, payload: { task_id: 't1', new: n, old: o } });
  it('task.commented → yorum insert; mod, Trello kaynağı ve updated_at<=synced_at engeller', () => {
    expect(detailChangeOf(ins({}))).toMatchObject({ table: 'task_comments', op: 'insert', task_id: 't1', id: 'cm1' });
    expect(shouldPushDetail(ins({}), CFG())).toMatchObject({ push: true });
    expect(shouldPushDetail(ins({}), CFG({ mode: 'pull_only' }))).toMatchObject({ push: false, reason: 'mode' });
    expect(shouldPushDetail(ins({}), null).push).toBe(false);
    expect(shouldPushDetail(ins({ sync_origin: 'trello' }), CFG())).toMatchObject({ push: false, reason: 'origin' });
    expect(shouldPushDetail(ins({ updated_at: '2026-10-16T10:00:00Z', synced_at: '2026-10-16T10:00:00Z' }), CFG())).toMatchObject({ push: false, reason: 'origin' });
    expect(shouldPushDetail(ins({ updated_at: '2026-10-16T10:05:00Z', synced_at: '2026-10-16T10:00:00Z' }), CFG()).push).toBe(true);
  });
  it('güncelleme: yalnız damga değişimi itilmez; silme: webhook silmesi (trello_delete) itilmez, JS silmesi external_id varsa itilir', () => {
    const base = { id: 'i1', name: 'M', checked: false, checklist_id: 'l1', external_id: 'I1' };
    expect(shouldPushDetail(ev('task_check_items', 'update', { ...base, updated_at: 'b' }, { ...base, updated_at: 'a' }), CFG())).toMatchObject({ push: false, reason: 'irrelevant' });
    expect(shouldPushDetail(ev('task_check_items', 'update', { ...base, checked: true }, base), CFG()).push).toBe(true);
    expect(shouldPushDetail(ev('task_check_items', 'delete', null, { ...base, sync_origin: 'trello_delete' }), CFG())).toMatchObject({ push: false, reason: 'origin' });
    expect(shouldPushDetail(ev('task_check_items', 'delete', null, { ...base, sync_origin: 'trello' }), CFG()).push).toBe(true); // Trello'dan gelmiş satırı JS siliyor
    expect(shouldPushDetail(ev('task_check_items', 'delete', null, { ...base, external_id: null }), CFG())).toMatchObject({ push: false, reason: 'not_linked' });
    expect(shouldPushDetail(ev('task_check_items', 'delete', null, { ...base, external_id: 'pending:i1' }), CFG()).push).toBe(false);
    expect(shouldPushDetail({ type: 'tasks.update', aggregate: 'tasks', payload: {} }, CFG()).reason).toBe('not_detail');
  });
});

/* ───────── pushDetailWith: bellek portları ───────── */
function fakePush(rows: Partial<Record<DetailTable, Row[]>>, o: { cfg?: TrelloConfig; card?: string | null; fail?: (method: string, path: string) => unknown } = {}) {
  const db: Record<string, Row[]> = { task_comments: [], task_checklists: [], task_check_items: [], task_attachments: [] };
  for (const [k, v] of Object.entries(rows)) db[k] = v!.map((r) => ({ ...r }));
  const calls: Array<[string, string, Record<string, unknown> | undefined]> = [];
  const logs: SyncLogDraft[] = [];
  let seq = 0;
  const ports: DetailPushPorts = {
    cfg: o.cfg ?? trelloConfigSchema.parse({ api_key: 'k'.repeat(20), token: 't'.repeat(30), member_ids: { RV: 'tm1' } }),
    cardOf: async () => (o.card === undefined ? 'c1' : o.card),
    loadRow: async (t, id) => db[t].find((r) => r.id === id) ?? null,
    claim: async (t, id) => { const r = db[t].find((x) => x.id === id); if (!r || r.external_id) return false; r.external_id = `pending:${id}`; r.sync_origin = 'trello'; return true; },
    link: async (t, id, ext) => { const r = db[t].find((x) => x.id === id)!; r.external_id = ext; r.sync_origin = 'trello'; },
    request: (async (method: string, path: string, body?: Record<string, unknown>) => {
      calls.push([method, path, body]);
      const f = o.fail?.(method, path); if (f) throw f;
      return { id: `X${++seq}` };
    }) as DetailPushPorts['request'],
    uploadFile: async (card, row) => { calls.push(['UPLOAD', `/cards/${card}/attachments`, { name: row.name, path: row.storage_path }]); return { id: `U${++seq}` }; },
    log: (e) => { logs.push(e); },
  };
  return { ports, db, calls, logs };
}
const CH = (table: DetailTable, op: 'insert' | 'update' | 'delete', row: Row) => ({ table, op, task_id: 't1', id: String(row.id), row });

describe('Trello ayrıntı · pushDetailWith', () => {
  it('yeni yorum Trello’ya gönderilir, external_id bağlanır; ikinci çağrı çift yorum üretmez', async () => {
    const f = fakePush({ task_comments: [{ id: 'cm1', task_id: 't1', body: 'selam', external_id: null }] });
    expect(await pushDetailWith(f.ports, CH('task_comments', 'insert', { id: 'cm1' }))).toBe('pushed');
    expect(f.calls).toEqual([['POST', '/cards/c1/actions/comments', { text: 'selam' }]]);
    expect(f.db.task_comments[0].external_id).toBe('X1');
    expect(await pushDetailWith(f.ports, CH('task_comments', 'insert', { id: 'cm1' }))).toBe('skipped'); // bağlı + Trello kaynaklı damga
    expect(f.calls).toHaveLength(1);
    expect(f.logs[0]).toMatchObject({ direction: 'push', entity: 'comment', action: 'created', external_id: 'X1' });
  });
  it('yorum düzenleme PUT, silme DELETE; 404 sorun değil', async () => {
    const f = fakePush({ task_comments: [{ id: 'cm1', task_id: 't1', body: 'yeni', external_id: 'A1', sync_origin: null, updated_at: '2026-10-16T11:00:00Z', synced_at: '2026-10-16T10:00:00Z' }] });
    expect(await pushDetailWith(f.ports, CH('task_comments', 'update', { id: 'cm1' }))).toBe('pushed');
    expect(f.calls[0]).toEqual(['PUT', '/cards/c1/actions/A1/comments', { text: 'yeni' }]);
    expect(await pushDetailWith(f.ports, CH('task_comments', 'delete', { id: 'cm1', external_id: 'A1' }))).toBe('pushed');
    expect(f.calls[1][0]).toBe('DELETE'); expect(f.calls[1][1]).toBe('/cards/c1/actions/A1/comments');
    const g = fakePush({}, { fail: () => Object.assign(new Error('yok'), { status: 404 }) });
    expect(await pushDetailWith(g.ports, CH('task_comments', 'delete', { id: 'cm1', external_id: 'A1' }))).toBe('noop');
    expect(g.logs[0].action).toBe('skipped_gone');
  });
  it('madde oluşturma: üst checklist Trello’da yoksa önce o oluşturulur; sonra madde; durum ve üye gövdede', async () => {
    const f = fakePush({
      task_checklists: [{ id: 'cl1', task_id: 't1', name: 'Üretim', position: 0, external_id: null }],
      task_check_items: [{ id: 'ci1', checklist_id: 'cl1', name: 'Kurgu', checked: true, position: 1, due_at: null, assignee_id: 'RV', external_id: null }],
    });
    expect(await pushDetailWith(f.ports, CH('task_check_items', 'insert', { id: 'ci1' }))).toBe('pushed');
    expect(f.calls).toEqual([
      ['POST', '/cards/c1/checklists', { name: 'Üretim', pos: 1000 }],
      ['POST', '/checklists/X1/checkItems', { name: 'Kurgu', pos: 2000, checked: true, idMember: 'tm1' }],
    ]);
    expect(f.db.task_checklists[0].external_id).toBe('X1'); expect(f.db.task_check_items[0].external_id).toBe('X2');
    // checklist'in kendi insert olayı sonradan gelirse çift oluşturmaz
    expect(await pushDetailWith(f.ports, CH('task_checklists', 'insert', { id: 'cl1' }))).toBe('skipped');
    expect(f.calls).toHaveLength(2);
  });
  it('madde işaretleme PUT state, silme kart-bazlı DELETE; checklist yeniden adlandırma / silme', async () => {
    const f = fakePush({
      task_checklists: [{ id: 'cl1', task_id: 't1', name: 'Yeni ad', position: 0, external_id: 'L1', sync_origin: null }],
      task_check_items: [{ id: 'ci1', checklist_id: 'cl1', name: 'Kurgu', checked: true, position: 0, due_at: null, assignee_id: null, external_id: 'I1', sync_origin: null }],
    });
    await pushDetailWith(f.ports, CH('task_check_items', 'update', { id: 'ci1' }));
    await pushDetailWith(f.ports, CH('task_checklists', 'update', { id: 'cl1' }));
    await pushDetailWith(f.ports, CH('task_check_items', 'delete', { id: 'ci1', external_id: 'I1' }));
    await pushDetailWith(f.ports, CH('task_checklists', 'delete', { id: 'cl1', external_id: 'L1' }));
    expect(f.calls).toEqual([
      ['PUT', '/cards/c1/checkItem/I1', { name: 'Kurgu', pos: 1000, state: 'complete', due: null, idMember: null }],
      ['PUT', '/checklists/L1', { name: 'Yeni ad', pos: 1000 }],
      ['DELETE', '/cards/c1/checkItem/I1', undefined],
      ['DELETE', '/checklists/L1', undefined],
    ]);
  });
  it('ekler: bağlantı → POST url; Storage dosyası → çok parçalı yükleme; 25 MB üstü atlanır; silme DELETE', async () => {
    const f = fakePush({ task_attachments: [
      { id: 'a1', task_id: 't1', name: 'rehber', url: 'https://example.com', storage_path: null, bytes: 0, external_id: null },
      { id: 'a2', task_id: 't1', name: 'foto.png', url: '', storage_path: 'o/t1/u-foto.png', bytes: 1000, mime: 'image/png', external_id: null },
      { id: 'a3', task_id: 't1', name: 'film.mov', url: '', storage_path: 'o/t1/u-film.mov', bytes: MAX_ATTACHMENT_BYTES + 1, external_id: null },
    ] });
    for (const id of ['a1', 'a2', 'a3']) await pushDetailWith(f.ports, CH('task_attachments', 'insert', { id }));
    expect(f.calls).toEqual([['POST', '/cards/c1/attachments', { url: 'https://example.com', name: 'rehber' }], ['UPLOAD', '/cards/c1/attachments', { name: 'foto.png', path: 'o/t1/u-foto.png' }]]);
    expect(f.logs.map((l) => l.action)).toEqual(['created', 'created', 'skipped_too_large']);
    expect(f.db.task_attachments[2].external_id).toBeNull(); // kilit bırakıldı değil: hiç alınmadı
    await pushDetailWith(f.ports, CH('task_attachments', 'delete', { id: 'a1', external_id: 'T1' }));
    expect(f.calls[2]).toEqual(['DELETE', '/cards/c1/attachments/T1', undefined]);
  });
  it('kart yoksa / mod pull_only ise yazılmaz; hata kilidi bırakır ve günlüğe düşer; kilit alınamazsa atlanır', async () => {
    const row = { id: 'cm1', task_id: 't1', body: 'x', external_id: null };
    const none = fakePush({ task_comments: [row] }, { card: null });
    expect(await pushDetailWith(none.ports, CH('task_comments', 'insert', row))).toBe('noop');
    const pull = fakePush({ task_comments: [row] }, { cfg: trelloConfigSchema.parse({ api_key: 'k'.repeat(20), token: 't'.repeat(30), mode: 'pull_only' }) });
    expect(await pushDetailWith(pull.ports, CH('task_comments', 'insert', row))).toBe('skipped');
    expect(pull.calls).toHaveLength(0);
    const bad = fakePush({ task_comments: [row] }, { fail: () => new Error('Trello 500') });
    expect(await pushDetailWith(bad.ports, CH('task_comments', 'insert', row))).toBe('error');
    expect(bad.db.task_comments[0].external_id).toBeNull();
    expect(bad.logs.at(-1)).toMatchObject({ action: 'error', ok: false, message: 'Trello 500' });
    const busy = fakePush({ task_comments: [{ ...row, external_id: 'pending:cm1' }] });
    expect(await pushDetailWith(busy.ports, CH('task_comments', 'insert', row))).toBe('skipped');
    expect(busy.calls).toHaveLength(0);
  });
});

describe('Görev ayrıntıları · sözleşme + markdown-lite', () => {
  it('taskPatchSchema: açıklama ve kapak kabul edilir, geçersiz renk reddedilir', () => {
    expect(taskPatchSchema.parse({ description: 'a', cover: { color: 'blue' } })).toEqual({ description: 'a', cover: { color: 'blue' } });
    expect(taskPatchSchema.parse({ description: '', cover: {} })).toEqual({ description: '', cover: {} });
    expect(() => taskPatchSchema.parse({ cover: { color: 'neon' } })).toThrow();
  });
  it('markdown-lite: kalın / italik / kod / liste / bağlantı / @anma; ham HTML metin kalır', () => {
    expect(parseInline('**k** *i* `c` @seda')).toEqual([{ t: 'b', v: [{ t: 'text', v: 'k' }] }, { t: 'text', v: ' ' }, { t: 'i', v: [{ t: 'text', v: 'i' }] }, { t: 'text', v: ' ' }, { t: 'code', v: 'c' }, { t: 'text', v: ' ' }, { t: 'mention', v: '@seda' }]);
    expect(parseInline('bak https://a.b/c.')).toEqual([{ t: 'text', v: 'bak ' }, { t: 'a', href: 'https://a.b/c', v: 'https://a.b/c' }, { t: 'text', v: '.' }]);
    expect(parseInline('[site](https://x.y)')).toEqual([{ t: 'a', href: 'https://x.y', v: 'site' }]);
    expect(parseInline('[kötü](javascript:alert(1))').every((n) => n.t !== 'a')).toBe(true);
    expect(parseInline('<script>x</script>')).toEqual([{ t: 'text', v: '<script>x</script>' }]);
    const b = parseBlocks('# Başlık\nmetin\n\n- bir\n- iki\n1. a\n2. b');
    expect(b.map((x) => x.t)).toEqual(['h', 'p', 'ul', 'ol']);
    expect(b[2]).toMatchObject({ t: 'ul', v: [[{ t: 'text', v: 'bir' }], [{ t: 'text', v: 'iki' }]] });
  });
});

/* ───────── DemoRepo: yorum / checklist / ek / rozet ───────── */
describe('DemoRepo · görev ayrıntıları', () => {
  const firstTask = async (repo: DemoRepo) => (await repo.listTasks())[0];
  it('yorum ekle / düzenle / sil; yalnız yazar (ya da yönetici) düzenler', async () => {
    const storage = new Map<string, string>(); const kv = { getItem: (k: string) => storage.get(k) ?? null, setItem: (k: string, v: string) => { storage.set(k, v); } };
    const owner = new DemoRepo({ accountId: 'owner', storage: kv });
    const t = await firstTask(owner);
    const c = await owner.addComment(t.id, '  selam @seda ');
    expect(c).toMatchObject({ body: 'selam @seda', author_name: 'Batuhan Berk Yaşar', task_id: t.id });
    await expect(owner.addComment(t.id, '   ')).rejects.toThrow();
    expect((await owner.updateComment(c.id, 'düzeltme')).body).toBe('düzeltme');
    const creative = new DemoRepo({ accountId: 'creative', storage: kv }); // yazar değil, yönetici değil
    await expect(creative.updateComment(c.id, 'x')).rejects.toThrow('kendi yorumunu');
    await expect(creative.deleteComment(c.id)).rejects.toThrow();
    expect((await creative.listComments(t.id)).map((x) => x.id)).toEqual([c.id]);
    await owner.deleteComment(c.id);
    expect(await owner.listComments(t.id)).toEqual([]);
  });
  it('checklist: çoklu liste, madde ekle / işaretle / yeniden adlandır / sil, rozet sayımı', async () => {
    const repo = new DemoRepo({ accountId: 'owner' });
    const t = await firstTask(repo);
    const l1 = await repo.addChecklist(t.id, 'Üretim'); const l2 = await repo.addChecklist(t.id, 'Teslim');
    expect([l1.position, l2.position]).toEqual([0, 1]);
    const a = await repo.addCheckItem(l1.id, { name: 'Çekim' }); const b = await repo.addCheckItem(l1.id, { name: 'Kurgu', due_at: '2026-10-30' });
    await repo.updateCheckItem(a.id, { checked: true }); await repo.updateCheckItem(b.id, { name: 'Kurgu v2', assignee_id: 'RV' });
    const lists = await repo.listChecklists(t.id);
    expect(lists.map((l) => [l.name, l.items.map((i) => [i.name, i.checked, i.assignee_id])])).toEqual([['Üretim', [['Çekim', true, null], ['Kurgu v2', false, 'RV']]], ['Teslim', []]]);
    expect((await repo.taskBadges([t.id]))[t.id]).toMatchObject({ checkTotal: 2, checkDone: 1, comments: 0, attachments: 0 });
    await repo.updateChecklist(l2.id, { name: 'Son' });
    await repo.deleteCheckItem(a.id);
    await repo.deleteChecklist(l1.id);
    expect((await repo.listChecklists(t.id)).map((l) => l.name)).toEqual(['Son']);
    await expect(repo.addCheckItem(l2.id, { name: '' })).rejects.toThrow();
  });
  it('ekler: bağlantı ve dosya (25 MB sınırı), kapak silinen eke bağlıysa temizlenir', async () => {
    const repo = new DemoRepo({ accountId: 'owner' });
    const t = await firstTask(repo);
    const link = await repo.addAttachment(t.id, { url: 'https://example.com/brief' });
    expect(link).toMatchObject({ name: 'example.com', url: 'https://example.com/brief', storage_path: null });
    await expect(repo.addAttachment(t.id, { url: 'javascript:alert(1)' })).rejects.toThrow('http');
    const big = new Blob([new Uint8Array(8)]); Object.defineProperty(big, 'size', { value: MAX_ATTACHMENT_BYTES + 1 });
    await expect(repo.addAttachment(t.id, { file: big, name: 'dev.bin' })).rejects.toThrow('25 MB');
    const img = await repo.addAttachment(t.id, { file: new Blob(['x'], { type: 'image/png' }), name: 'foto.png' });
    expect(img).toMatchObject({ name: 'foto.png', mime: 'image/png', bytes: 1 });
    expect(await repo.attachmentUrl(link)).toBe('https://example.com/brief');
    await repo.updateTask(t.id, { cover: { attachment_id: img.id } });
    await repo.deleteAttachment(img.id);
    expect((await repo.listTasks()).find((x) => x.id === t.id)!.cover).toEqual({});
    expect((await repo.taskBadges([t.id]))[t.id].attachments).toBe(1);
  });
  it('açıklama ve kapak updateTask ile kaydedilir; müşteri rolü ayrıntı göremez / yazamaz', async () => {
    const repo = new DemoRepo({ accountId: 'owner' });
    const t = await firstTask(repo);
    const u = await repo.updateTask(t.id, { description: '**not**', cover: { color: 'green' } });
    expect(u).toMatchObject({ description: '**not**', cover: { color: 'green' } });
    await expect(repo.updateTask(t.id, { cover: { color: 'neon' as never } })).rejects.toThrow();
    const client = new DemoRepo({ accountId: 'client_viewer' });
    await expect(client.listComments(t.id)).rejects.toThrow();
    await expect(client.addComment(t.id, 'x')).rejects.toThrow();
  });
  it('Trello örnek içe aktarma ayrıntıları idempotent getirir (checklist, yorum, ek, açıklama, kapak)', async () => {
    const repo = new DemoRepo({ accountId: 'owner' });
    const r1 = await repo.trelloImport!();
    expect(r1.details).toMatchObject({ comments: 3, checklists: 2, check_items: 6, attachments: 1, errors: 0 });
    const t = (await repo.listTasks()).find((x) => x.source_ref === 'trello:c01')!;
    expect(t.description).toContain('Kasım içerik planı'); expect(t.cover).toEqual({ color: 'blue' });
    const lists = await repo.listChecklists(t.id);
    expect(lists.map((l) => l.items.length)).toEqual([3, 3]);
    expect(lists[0].items.map((i) => i.checked)).toEqual([true, true, false]);
    expect((await repo.listComments(t.id)).map((c) => c.author_name)).toEqual(['Selin Kutlutürk', 'Raif Vural']);
    const mine = await repo.addComment(t.id, 'JS yorumu'); // external_id'siz JS satırı ikinci içe aktarmada korunur
    const r2 = await repo.trelloImport!();
    expect(r2.details).toMatchObject({ comments: 0, checklists: 0, check_items: 0, attachments: 0, description: 0, cover: 0 });
    expect((await repo.listComments(t.id)).map((c) => c.id)).toContain(mine.id);
    expect(((await repo.taskBadges([t.id]))[t.id])).toMatchObject({ comments: 3, attachments: 1, checkTotal: 6, checkDone: 2 });
  });
});
