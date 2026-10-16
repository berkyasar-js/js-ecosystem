import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { maskTrelloConfig, trelloConfigSchema } from '@jscore/contracts';
import { signTrello, verifyTrelloSignature } from '../hmac';
import { TRELLO_FIXTURE } from '../integrations/trello-fixture';
import {
  classifyList, mapCard, matchBrand, memberKey, parseCardName, resolveEmployee, runImport,
  type MapCtx, type StoreTask, type TaskDraft, type TrelloCard, type TrelloStore,
} from '../integrations/trello-map';
import { DemoRepo } from '../repo/demo';

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
    expect(m).toMatchObject({ skipped: false, ref: 'trello:c1', brandId: 'b1', projectName: "Anova Kasım'26 SM", projectType: 'social_monthly' });
    expect(m.draft).toMatchObject({ title: "Anova Kasım'26 SM", task_type: 'social_visual', priority: 'high', planned_minutes: 360, assignee_id: 'RV', state: 'production', source_ref: 'trello:c1' });
    expect(m.draft.labels).toEqual(expect.arrayContaining(['trello', 'Reels', 'red', 'job:184', 'checklist 4/12', 'board:2_Tasarım&Produksiyon']));
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
  const s = { brands: [...BRANDS], projects: [] as Array<{ id: string; name: string }>, tasks: [] as StoreTask[], createdBrands: [] as string[] };
  const store: TrelloStore = {
    load: async () => ({ employees: TEAM, brands: s.brands, projects: s.projects, tasks: s.tasks }),
    createBrand: async (name) => { const b = { id: `nb${s.brands.length}`, name }; s.brands.push(b); s.createdBrands.push(name); return b; },
    createProject: async (p) => { const r = { id: `p${s.projects.length}`, name: p.name }; s.projects.push(r); return { id: r.id }; },
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
