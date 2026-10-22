import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { maskTrelloConfig, trelloConfigSchema } from '@jscore/contracts';
import { signTrello, verifyTrelloSignature } from '@jscore/core/hmac';
import { TRELLO_FIXTURE } from '@jscore/core/integrations/trello-fixture';
import {
  classifyList, mapCard, matchBrand, memberKey, parseCardName, resolveEmployee, runImport,
  type MapCtx, type StoreProject, type StoreTask, type SyncLogDraft, type TaskDraft, type TrelloCard, type TrelloStore,
} from '@jscore/core/integrations/trello-map';
import { DemoRepo } from '@jscore/core/repo/demo';

const BRANDS = ['Badem Pınarı', 'Anova', 'Noche', 'Premium İşitme', 'Dora', 'Jobs Studio', 'Ebrusu Tekstil', 'Ran Sigorta'].map((name, i) => ({ id: `b${i}`, name }));
const TEAM = [
  ['BY', 'Batuhan Berk Yaşar'], ['UC', 'Ural Çalışkan'], ['OE', 'Öykü Erelmalı'], ['SO', 'Selin Öztekeşin'], ['SK', 'Seda Karabacak'],
  ['DO', 'Duygu Öztürk'], ['RV', 'Raif Vural'], ['HO', 'Hulusi Melih Özbay'], ['BA', 'Bengisu Arda'],
].map(([id, name]) => ({ id, name }));
const NOW = '2026-10-16T10:00:00.000Z';
const ctx = (over: Partial<MapCtx> = {}): MapCtx => ({
  now: NOW, board: { id: 'b1', name: '2_Tasarım&Produksiyon' }, list: { id: 'l', idBoard: 'b1', name: 'Raif' }, brands: BRANDS, employees: TEAM,
  members: { m1: 'Selin Kutlutürk', m2: 'Öykü Çalyan', m3: 'seda', m4: 'Raif Vural', m5: 'Melih Özbay', m6: 'Ural Çalışkan' }, ...over,
});
const card = (name: string, over: Partial<TrelloCard> = {}): TrelloCard => ({ id: 'c1', idList: 'l', name, ...over });

describe('Trello · kart adı', () => {
  it('iş numarası + marka + ay + SM', () => {
    expect(parseCardName("184_Anova Kasım'26 SM")).toMatchObject({ jobNo: '184', title: "Anova Kasım'26 SM", brandText: 'Anova', sm: true, month: { index: 11, label: 'Kasım', yy: '26' } });
    expect(parseCardName("Noche Madencilik Mart'25 SM")).toMatchObject({ jobNo: null, brandText: 'Noche Madencilik', sm: true, month: { label: 'Mart', yy: '25' } });
    expect(parseCardName('Kasım26 SM Plan')).toMatchObject({ month: { label: 'Kasım', yy: '26' }, sm: true });
  });
  it('tire ve rakam sonekli, ayraçsız adlar', () => {
    expect(parseCardName('Tanoto2- Online Rezervasyon Pop Up')).toMatchObject({ brandText: 'Tanoto', sm: false, month: null });
    expect(parseCardName('253_Badem Satış Kampanyası')).toMatchObject({ jobNo: '253', brandText: null, title: 'Badem Satış Kampanyası' });
    expect(parseCardName('001_Korelio Web Sitesi').jobNo).toBe('001');
  });
  it('"Smart" / "Martı" yanlış eşleşmez', () => {
    expect(parseCardName('Smart Home Martı Kampanya')).toMatchObject({ sm: false, month: null });
  });
  it('marka bulanıklığı: önek, tek kelime = ilk kelime, bilinmeyen = aday', () => {
    expect(matchBrand(parseCardName('253_Badem Satış Kampanyası'), BRANDS)).toEqual({ id: 'b0', name: 'Badem Pınarı' });
    expect(matchBrand(parseCardName("Noche Madencilik Mart'25 SM"), BRANDS).name).toBe('Noche');
    expect(matchBrand(parseCardName("Premium İşitme Ekim'26 SM"), BRANDS).name).toBe('Premium İşitme');
    expect(matchBrand(parseCardName("Ebrusu Tekstil Mart'25 SM"), BRANDS).id).toBe('b6');
    expect(matchBrand(parseCardName('Tanoto2- Online Rezervasyon Pop Up'), BRANDS)).toEqual({ id: null, name: 'Tanoto' });
    expect(matchBrand(parseCardName('001_Korelio Web Sitesi'), BRANDS)).toEqual({ id: null, name: 'Korelio' });
  });
});

describe('Trello · liste türü', () => {
  it('aşama listeleri', () => {
    expect(classifyList('Müşteri Onay').kind).toBe('approval');
    expect(classifyList('Anova Müşteri Onay').kind).toBe('approval');
    expect(classifyList('Müşteri Teslim').kind).toBe('delivery');
    expect(classifyList('Web Teslim').kind).toBe('delivery');
    expect(classifyList('Kurulum-Baskı-Produksiyon').kind).toBe('production');
    expect(classifyList('Bekleme Salonu <3').kind).toBe('paused');
    expect(classifyList('Kasım26 SM').kind).toBe('plan');
  });
  it('şablon listeleri', () => {
    for (const n of ['ŞABLONLAR', 'SM Aylık Şablon', 'Web şablonları']) expect(classifyList(n).kind).toBe('template');
  });
  it('kişi kuyrukları (değiştiriciler ayıklanır)', () => {
    expect(classifyList('Selin T.')).toMatchObject({ kind: 'person', person: 'Selin T.' });
    expect(classifyList('Selin Kontrol')).toMatchObject({ kind: 'person', person: 'Selin', review: true });
    expect(classifyList('Melih Masaüstü')).toMatchObject({ kind: 'person', person: 'Melih' });
    expect(classifyList('Melih Çekim')).toMatchObject({ kind: 'person', person: 'Melih' });
    for (const n of ['Öykü', 'Duygu', 'Raif', 'Sedoş', 'Berfin']) expect(classifyList(n).kind).toBe('person');
  });
});

describe('Trello · kişi eşleme', () => {
  it('ad / takma ad / baş harf', () => {
    expect(resolveEmployee('Öykü Çalyan', TEAM)).toBe('OE');
    expect(resolveEmployee('Duygu Öztürk', TEAM)).toBe('DO');
    expect(resolveEmployee('Raif Vural', TEAM)).toBe('RV');
    expect(resolveEmployee('Melih Özbay', TEAM)).toBe('HO');
    expect(resolveEmployee('Melih', TEAM)).toBe('HO');
    expect(resolveEmployee('Bengisu Arda', TEAM)).toBe('BA');
    expect(resolveEmployee('Ural Çalışkan', TEAM)).toBe('UC');
    expect(resolveEmployee('seda', TEAM)).toBe('SK');
    expect(resolveEmployee('Sedoş', TEAM)).toBe('SK');
    expect(resolveEmployee('Selin Kutlutürk', TEAM)).toBe('SO');
    expect(resolveEmployee('selin', TEAM)).toBe('SO');
    expect(resolveEmployee('Berfin', TEAM)).toBeNull();
  });
  it('aynı ad birden fazlaysa baş harfle ayrışır, yoksa eşlenmez; member_map önceliklidir', () => {
    const team = [...TEAM, { id: 'ST', name: 'Selin Tekin' }];
    expect(resolveEmployee('Selin T.', team)).toBe('ST');
    expect(resolveEmployee('Selin', team)).toBeNull();
    expect(resolveEmployee('Selin', team, { [memberKey('Selin')]: 'SO' })).toBe('SO');
    expect(resolveEmployee('Berfin', TEAM, { berfin: 'BA' })).toBe('BA');
    expect(resolveEmployee('Berfin', TEAM, { berfin: 'YOK' })).toBeNull();
  });
});

describe('Trello · mapCard', () => {
  it('SM kartı: aylık proje, social_visual, iş no, checklist, gecikmiş → high', () => {
    const m = mapCard(card("184_Anova Kasım'26 SM", { due: '2026-10-01T00:00:00Z', labels: [{ name: 'Reels' }, { name: '', color: 'red' }], badges: { checkItems: 12, checkItemsChecked: 4 } }), ctx());
    expect(m).toMatchObject({ skipped: false, ref: 'trello:c1', brandId: 'b1', projectName: 'Anova · Trello', projectType: 'imported' });
    expect(m.draft).toMatchObject({ title: "Anova Kasım'26 SM", task_type: 'social_visual', priority: 'high', planned_minutes: 360, assignee_id: 'RV', state: 'production', source_ref: 'trello:c1' });
    expect(m.draft.labels).toEqual(expect.arrayContaining(['trello', 'Reels', 'red', 'job:184', 'sm:2026-11', 'checklist 4/12', 'board:2_Tasarım&Produksiyon']));
  });
  it('SM olmayan kart: marka başına "<Marka> · Trello", general; dueComplete gecikmiş sayılmaz', () => {
    const m = mapCard(card('253_Badem Satış Kampanyası', { due: '2026-01-01T00:00:00Z', dueComplete: true }), ctx());
    expect(m).toMatchObject({ projectName: 'Badem Pınarı · Trello', projectType: 'imported' });
    expect(m.draft).toMatchObject({ task_type: 'general', priority: 'normal', planned_minutes: 0 });
  });
  it('liste türü → aşama; Bekleme = brief + waiting; arşivli liste = archive + etiket', () => {
    const l = (name: string, closed = false) => ({ id: 'l', idBoard: 'b1', name, closed });
    expect(mapCard(card('Dora X'), ctx({ list: l('Müşteri Onay') })).draft.state).toBe('approval');
    expect(mapCard(card('Dora X'), ctx({ list: l('Müşteri Teslim') })).draft.state).toBe('delivery');
    expect(mapCard(card('Dora X'), ctx({ list: l('Kurulum-Baskı-Produksiyon') })).draft.state).toBe('production');
    expect(mapCard(card('Dora X'), ctx({ list: l('Kasım26 SM') })).draft.state).toBe('plan');
    expect(mapCard(card('Dora X'), ctx({ list: l('Selin Kontrol') })).draft.state).toBe('internal_review');
    const w = mapCard(card('001_Korelio Web Sitesi'), ctx({ list: l('Bekleme Salonu <3') }));
    expect(w.draft).toMatchObject({ state: 'brief' }); expect(w.draft.labels).toContain('waiting');
    const a = mapCard(card('Dora X'), ctx({ list: l('Eski Kuyruk', true) }));
    expect(a.draft.state).toBe('archive'); expect(a.draft.labels).toContain('trello:archived-list'); expect(a.unmapped).toEqual([]);
  });
  it('şablon listesindeki kart atlanır', () => {
    expect(mapCard(card('SM Aylık Şablon'), ctx({ list: { id: 'l', idBoard: 'b1', name: 'ŞABLONLAR' } })).skipped).toBe(true);
  });
  it('atanan: kişi listesi > kart üyesi; eşlenemeyen adlar raporlanır', () => {
    const l = (name: string) => ({ id: 'l', idBoard: 'b1', name });
    expect(mapCard(card('Dora X', { idMembers: ['m4'] }), ctx({ list: l('Öykü') })).draft.assignee_id).toBe('OE');
    expect(mapCard(card('Dora X', { idMembers: ['m3'] }), ctx({ list: l('Müşteri Onay') })).draft.assignee_id).toBe('SK');
    const u = mapCard(card('Tanoto2- Pop Up', { idMembers: ['m1'] }), ctx({ list: l('Berfin'), members: { m1: 'Zeynep Kaya' } }));
    expect(u.draft.assignee_id).toBeNull(); expect(u.unmapped).toEqual(['Berfin', 'Zeynep Kaya']);
  });
});

/** Bellek içi depo: runImport'un idempotentliğini sınar. */
function memStore() {
  const s = { brands: [...BRANDS], projects: [] as StoreProject[], logs: [] as SyncLogDraft[], tasks: [] as StoreTask[], createdBrands: [] as string[] };
  const store: TrelloStore = {
    load: async () => ({ employees: TEAM, brands: s.brands, projects: s.projects, tasks: s.tasks }),
    createBrand: async (name) => { const b = { id: `nb${s.brands.length}`, name }; s.brands.push(b); s.createdBrands.push(name); return b; },
    createProject: async (p) => { const r = { id: `p${s.projects.length}`, name: p.name, brand_id: p.brand_id, source_ref: p.source_ref ?? null, status: 'active' }; s.projects.push(r); return { id: r.id }; },
    moveProjectTasks: async (from, to) => { const rows = s.tasks.filter((t) => t.project_id === from); rows.forEach((t) => { t.project_id = to; }); return rows.length; },
    updateProject: async (id, patch) => { Object.assign(s.projects.find((x) => x.id === id)!, patch); },
    createTasks: async (rows: TaskDraft[]) => { rows.forEach((r) => s.tasks.push({ ...r, id: `t${s.tasks.length}` })); },
    updateTask: async (id, patch) => { Object.assign(s.tasks.find((t) => t.id === id)!, patch); },
  };
  return { s, store };
}

describe('Trello · runImport idempotenti', () => {
  it('iki kez çalıştırmak aynı sayıda kayıt bırakır', async () => {
    const { s, store } = memStore();
    const r1 = await runImport(TRELLO_FIXTURE, store, { now: NOW });
    expect(r1).toMatchObject({ boards: 2, lists: 9, cards_seen: 10, skipped_templates: 1, tasks_created: 9, tasks_updated: 0, errors: [] });
    expect(r1.brands_created.sort()).toEqual(['Korelio', 'MarkAntalya', 'Meva', 'Tanoto']);
    const counts = [s.brands.length, s.projects.length, s.tasks.length];
    const r2 = await runImport(TRELLO_FIXTURE, store, { now: NOW });
    expect([s.brands.length, s.projects.length, s.tasks.length]).toEqual(counts);
    expect(r2).toMatchObject({ tasks_created: 0, tasks_updated: 0, tasks_unchanged: 9, projects_created: 0, brands_created: [] });
    expect(new Set(s.tasks.map((t) => t.source_ref)).size).toBe(s.tasks.length);
  });
  it('Trello’da değişen kart güncellenir, çift kayıt olmaz; member_map sonraki içe aktarmada uygulanır', async () => {
    const { s, store } = memStore();
    const r1 = await runImport(TRELLO_FIXTURE, store, { now: NOW });
    expect(r1.unmapped_members.map((u) => u.name)).toEqual(expect.arrayContaining(['Berfin']));
    const moved = { ...TRELLO_FIXTURE, cards: TRELLO_FIXTURE.cards.map((c) => (c.id === 'c09' ? { ...c, idList: 'l3', name: 'Dora Rapor Tasarımı v2' } : c)) };
    const r2 = await runImport(moved, store, { now: NOW, memberMap: { [memberKey('Berfin')]: 'BA' } });
    expect(r2.tasks_created).toBe(0); expect(r2.tasks_updated).toBe(2); // c09 + Berfin kartı (c04)
    expect(s.tasks.find((t) => t.source_ref === 'trello:c09')).toMatchObject({ title: 'Dora Rapor Tasarımı v2', assignee_id: 'OE' });
    expect(s.tasks.find((t) => t.source_ref === 'trello:c04')!.assignee_id).toBe('BA');
    expect(r2.unmapped_members.find((u) => u.name === 'Berfin')).toBeUndefined();
  });
});

describe('Trello · DemoRepo', () => {
  it('örnek içe aktarma idempotent, olay üretir, eşleme kaydedilir', async () => {
    const repo = new DemoRepo();
    const before = (await repo.listTasks()).length;
    const r1 = await repo.trelloImport!();
    expect(r1.tasks_created).toBe(9);
    expect((await repo.listTasks()).length).toBe(before + 9);
    expect((await repo.trelloState!()).connected).toBe(true);
    const r2 = await repo.trelloImport!();
    expect(r2).toMatchObject({ tasks_created: 0, tasks_updated: 0 });
    expect((await repo.listTasks()).length).toBe(before + 9);
    const berfin = r2.unmapped_members.find((u) => u.name === 'Berfin');
    expect(berfin).toBeTruthy();
    await repo.trelloSetMember!('Berfin', 'BA');
    const r3 = await repo.trelloImport!();
    expect(r3.unmapped_members.find((u) => u.name === 'Berfin')).toBeUndefined();
    expect(r3.tasks_updated).toBe(1);
    expect((await repo.listTasks()).filter((t) => t.source_ref === 'trello:c04')[0].assignee_id).toBe('BA');
  });
  it('yetkisiz rol reddedilir', async () => {
    await expect(new DemoRepo({ accountId: 'creative' }).trelloImport!()).rejects.toThrow();
  });
});

describe('Trello · sırlar ve webhook imzası', () => {
  it('maskeli görünüm tam anahtar/token içermez', () => {
    const cfg = trelloConfigSchema.parse({ api_key: 'a'.repeat(16) + 'WXYZ', token: 'ATTA' + 'q'.repeat(40) + 'LAST', board_ids: ['x'] });
    const v = JSON.stringify(maskTrelloConfig(cfg));
    expect(v).not.toContain(cfg.api_key); expect(v).not.toContain(cfg.token);
    expect(v).toContain('WXYZ'); expect(v).toContain('LAST');
    expect(maskTrelloConfig(null).connected).toBe(false);
  });
  it('x-trello-webhook: HMAC-SHA1 base64(gövde+callbackURL)', () => {
    const body = '{"action":{"type":"updateCard"}}', cb = 'https://x.example/api/webhooks/trello?org=o&k=1';
    const sig = signTrello(body, cb, 's3cret');
    expect(verifyTrelloSignature(body, cb, sig, 's3cret')).toBe(true);
    expect(verifyTrelloSignature(body, cb + 'x', sig, 's3cret')).toBe(false);
    expect(verifyTrelloSignature(body + ' ', cb, sig, 's3cret')).toBe(false);
    expect(verifyTrelloSignature(body, cb, null, 's3cret')).toBe(false);
    expect(verifyTrelloSignature(body, cb, sig, undefined)).toBe(false);
  });
});

describe('Trello · migration 0007', () => {
  const sql = readFileSync(join(__dirname, '../../../../../packages/schema/supabase/migrations/0007_trello.sql'), 'utf8');
  it('config sütunu istemci rollerinden gizlenir', () => {
    expect(sql).toMatch(/add column if not exists config jsonb/);
    expect(sql).toMatch(/revoke select on public\.integrations from authenticated, anon/);
    const grant = sql.match(/grant select \(([^)]*)\) on public\.integrations/)![1];
    expect(grant).not.toMatch(/config/);
  });
});

describe('Trello · birleştirme sonrası kart güncellemesi', () => {
  it('birleştirme taşıması (sync_origin=trello, synced_at=updated_at) sonraki kart güncellemesini engellemez', async () => {
    const { s, store } = memStore();
    // Üretim deposunu taklit: taşıma yazması işaretlenir, DB tetikleyicisi updated_at'i synced_at'e eşitler.
    store.moveProjectTasks = async (from, to) => {
      const rows = s.tasks.filter((t) => t.project_id === from);
      rows.forEach((t) => { t.project_id = to; t.updated_at = '2026-10-16T12:00:00Z'; t.synced_at = '2026-10-16T12:00:00Z'; });
      return rows.length;
    };
    s.projects.push({ id: 'o1', name: "Anova Kasım'26 SM", brand_id: 'b1', source_ref: 'trello:board:b1', status: 'active' }, { id: 'o3', name: 'Anova · Trello', brand_id: 'b1', source_ref: 'trello:board:b1', status: 'active' });
    s.tasks.push({ id: 'a', project_id: 'o1', source_ref: 'trello:x1', title: "Anova Kasım'26 SM", assignee_id: null, state: 'production', priority: 'normal', due_at: null, planned_minutes: 0, task_type: 'general', labels: ['trello'] });
    const snap = { ...TRELLO_FIXTURE, cards: [{ id: 'x1', idBoard: 'b1', idList: 'l7', name: "Anova Kasım'26 SM", dateLastActivity: '2026-10-16T09:00:00Z' }] };
    const logs: SyncLogDraft[] = [];
    const r = await runImport(snap, store, { now: '2026-10-16T13:00:00Z', onLog: (e) => logs.push(e) });
    expect(r.projects_merged).toBe(1);
    expect(logs.some((l) => l.action === 'skipped_conflict')).toBe(false);
    expect(s.tasks[0].labels).toContain('sm:2026-11');
  });
});

describe('Trello · marka başına tek proje', () => {
  it('SM ayı ayrıştırma: Türkçe ay adları, 2 ve 4 haneli yıl → sm:YYYY-MM etiketi', () => {
    const lab = (n: string) => mapCard(card(n), ctx()).draft.labels.filter((l) => l.startsWith('sm:'));
    expect(lab("Anova Kasım'26 SM")).toEqual(['sm:2026-11']);
    expect(lab("Noche Mart'25 SM")).toEqual(['sm:2025-03']);
    expect(lab('Dora Şubat 2027 SM')).toEqual(['sm:2027-02']);
    expect(lab("Dora Ağustos’26 SM")).toEqual(['sm:2026-08']);
    expect(lab('Dora Rapor Tasarımı')).toEqual([]);
  });
  it('aylık SM kartları tek projede görev olur; başlık kart adını korur', async () => {
    const { s, store } = memStore();
    const snap = { ...TRELLO_FIXTURE, cards: [
      { id: 'x1', idBoard: 'b1', idList: 'l7', name: "Anova Kasım'26 SM" }, { id: 'x2', idBoard: 'b1', idList: 'l7', name: "Anova Aralık'26 SM" },
      { id: 'x3', idBoard: 'b1', idList: 'l7', name: "Anova Mart'25 SM" }, { id: 'x4', idBoard: 'b2', idList: 'l3', name: 'Anova Lansman' },
    ] };
    const r = await runImport(snap, store, { now: NOW });
    const anova = s.projects.filter((p) => p.brand_id === 'b1');
    expect(anova).toHaveLength(1);
    expect(anova[0]).toMatchObject({ name: 'Anova · Trello', source_ref: 'trello:board:b1' });
    expect(s.tasks.map((t) => t.title).sort()).toEqual(["Anova Aralık'26 SM", "Anova Kasım'26 SM", 'Anova Lansman', "Anova Mart'25 SM"]);
    expect(s.tasks.find((t) => t.title === "Anova Mart'25 SM")!.labels).toContain('sm:2025-03');
    expect(r.projects_created).toBe(1);
  });
  it('mevcut projeleri birleştirir: görevler taşınır, boşlar done + (birleştirildi), silinmez, günlük yazılır, idempotent', async () => {
    const { s, store } = memStore();
    s.projects.push(
      { id: 'o1', name: "Anova Kasım'26 SM", brand_id: 'b1', source_ref: 'trello:board:b1', status: 'active' },
      { id: 'o2', name: "Anova Mart'25 SM", brand_id: 'b1', source_ref: null, status: 'active' },
      { id: 'o3', name: 'Anova · Trello', brand_id: 'b1', source_ref: 'trello:board:b2', status: 'active' },
      { id: 'o4', name: "Dora Ekim'26 SM", brand_id: 'b4', source_ref: null, status: 'active' },
      { id: 'o5', name: 'Anova Marka Filmi', brand_id: 'b1', source_ref: null, status: 'active' }, // Trello'dan değil: dokunulmaz
    );
    const tk = (id: string, project_id: string): StoreTask => ({ id, project_id, source_ref: `trello:${id}`, title: id, assignee_id: null, state: 'production', priority: 'normal', due_at: null, planned_minutes: 0, task_type: 'general', labels: ['trello'] });
    s.tasks.push(tk('a', 'o1'), tk('b', 'o2'), tk('c', 'o3'), tk('d', 'o4'), tk('e', 'o5'));
    const logs: SyncLogDraft[] = [];
    const r1 = await runImport({ ...TRELLO_FIXTURE, cards: [] }, store, { now: NOW, onLog: (e) => logs.push(e) });
    expect(r1.projects_merged).toBe(3);
    const byId = (id: string) => s.projects.find((p) => p.id === id)!;
    expect(s.tasks.filter((t) => ['a', 'b', 'c'].includes(t.id)).map((t) => t.project_id)).toEqual(['o3', 'o3', 'o3']);
    expect(byId('o1')).toMatchObject({ status: 'done', name: "Anova Kasım'26 SM (birleştirildi)" });
    expect(byId('o2').status).toBe('done');
    expect(byId('o3')).toMatchObject({ status: 'active', name: 'Anova · Trello' });
    expect(byId('o5')).toMatchObject({ status: 'active', name: 'Anova Marka Filmi' });
    const dora = s.projects.find((p) => p.name === 'Dora · Trello')!; // kanonik yoksa oluşturulur
    expect(dora).toBeTruthy();
    expect(s.tasks.find((t) => t.id === 'd')!.project_id).toBe(dora.id);
    expect(logs.filter((l) => l.action === 'merged' && l.direction === 'reconcile')).toHaveLength(3);
    // ikinci çalıştırma: değişiklik yok
    const snapshot = JSON.stringify([s.projects, s.tasks]);
    const logs2: SyncLogDraft[] = [];
    const r2 = await runImport({ ...TRELLO_FIXTURE, cards: [] }, store, { now: NOW, onLog: (e) => logs2.push(e) });
    expect(r2.projects_merged).toBe(0); expect(r2.projects_created).toBe(0);
    expect(logs2).toEqual([]);
    expect(JSON.stringify([s.projects, s.tasks])).toBe(snapshot);
  });
  it('tam içe aktarma (fixture) iki kez: marka başına tek proje, ikinci çalıştırmada değişiklik yok', async () => {
    const { s, store } = memStore();
    await runImport(TRELLO_FIXTURE, store, { now: NOW });
    const names = s.projects.map((p) => p.name);
    expect(new Set(names).size).toBe(names.length);
    expect(names.every((n) => n.endsWith(' · Trello'))).toBe(true);
    const r2 = await runImport(TRELLO_FIXTURE, store, { now: NOW });
    expect(r2).toMatchObject({ projects_created: 0, projects_merged: 0, tasks_created: 0, tasks_updated: 0 });
  });
});

describe('Trello · kişi olmayan listeler', () => {
  it('Ödüllü İşler = ideas (brief + ödül-fikri), kişi olarak raporlanmaz', () => {
    expect(classifyList('Ödüllü İşler')).toEqual({ kind: 'ideas' });
    const l = { id: 'l', idBoard: 'b1', name: 'Ödüllü İşler' };
    const m = mapCard(card('Dora Ödül Fikri'), ctx({ list: l }));
    expect(m.draft.state).toBe('brief'); expect(m.draft.labels).toContain('ödül-fikri'); expect(m.unmapped).toEqual([]);
  });
  it.each(['Acil İşler', 'Müşteri Onay', 'Müşteri Teslim', 'ŞABLONLAR', 'Bekleme Salonu <3', 'Kasım26 SM', 'Toplantı Salonu', 'Dora SM'])('"%s" kişi değil', (name) => {
    expect(classifyList(name).kind).not.toBe('person');
    const m = mapCard(card('Dora X'), ctx({ list: { id: 'l', idBoard: 'b1', name } }));
    expect(m.unmapped).toEqual([]);
  });
  it('gerçek kişi (Berfin) hâlâ eşlenemeyen olarak raporlanır; Ödüllü İşler raporlanmaz', async () => {
    const { store } = memStore();
    const snap = { ...TRELLO_FIXTURE, lists: [...TRELLO_FIXTURE.lists, { id: 'l11', idBoard: 'b2', name: 'Ödüllü İşler' }, { id: 'l12', idBoard: 'b2', name: 'Acil İşler' }], cards: [...TRELLO_FIXTURE.cards, { id: 'c11', idBoard: 'b2', idList: 'l11', name: 'Dora Ödül' }, { id: 'c12', idBoard: 'b2', idList: 'l12', name: 'Dora Acil' }] };
    const r = await runImport(snap, store, { now: NOW });
    const names = r.unmapped_members.map((u) => u.name);
    expect(names).toContain('Berfin'); expect(names).not.toContain('Ödüllü İşler'); expect(names).not.toContain('Acil İşler');
  });
});
