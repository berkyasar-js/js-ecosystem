import { readFileSync } from 'node:fs';
import { createHmac } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { COLLECTIONS, hubspotConfigSchema, hubspotRef, hubspotUrl, hubspotUrlFor, maskHubSpotConfig, parseHubSpotRef, type HubSpotPipeline } from '@jscore/contracts';
import { HubSpotApiError, HubSpotClient, backoffMs, hubspotFetch, retryAfterMs, type HsOwner, type HsRecord } from '@jscore/core/integrations/hubspot';
import {
  amountToMinor, buildDefaultStageMap, buildOwnerMap, companyToBrand, companyToClient, contactToClientContact, contactToProps, dealToCrmDeal, dealToProps, diffProps,
  hubspotIsNewer, isHubSpotOriginWrite, mapStage, needsPush, resolveConflict, resolveOwner, reverseStage,
} from '@jscore/core/integrations/hubspot-map';
import { runPull, runPush, shouldPushHubSpotEvent, verifyHubSpotSignatureV3, type HubSpotSnapshot, type HubSpotStore, type Link, type RemotePorts, type StoreState } from '@jscore/core/integrations/hubspot-sync';
import { DemoRepo } from '@jscore/core/repo/demo';

const PIPES: HubSpotPipeline[] = [{ id: 'default', label: 'Satış', stages: [
  { id: 'appointmentscheduled', label: 'Randevu', display_order: 0, probability: 0.2 }, { id: 'qualifiedtobuy', label: 'Nitelikli', display_order: 1, probability: 0.4 },
  { id: 'presentationscheduled', label: 'Sunum', display_order: 2, probability: 0.6 }, { id: 'contractsent', label: 'Sözleşme gönderildi', display_order: 3, probability: 0.9 },
  { id: 'closedwon', label: 'Kazanıldı', display_order: 4, probability: 1 }, { id: 'closedlost', label: 'Kaybedildi', display_order: 5, probability: 0 },
] }];
const rec = (id: string, properties: Record<string, string | null>, updatedAt = '2026-11-10T08:00:00Z'): HsRecord => ({ id, properties, updatedAt, createdAt: '2026-10-01T00:00:00Z' });
const OWNERS: HsOwner[] = [{ id: '11', email: 'oguz@js.example', firstName: 'Oğuz', lastName: 'Erdem' }, { id: '12', email: 'x@y.example', firstName: 'Seda', lastName: 'Karabacak' }, { id: '13', email: 'ghost@y.example', firstName: 'Bilinmeyen', lastName: 'Kişi' }];
const EMP = [{ id: 'OE', name: 'Oğuz Erdem', email: 'oguz@js.example' }, { id: 'SK', name: 'Seda Karabacak', email: null }, { id: 'UC', name: 'Ural Çalışkan', email: 'ural@js.example' }];

describe('HubSpot · sözleşmeler', () => {
  it('config şeması: varsayılan mod pull_only; maske token’ı gizler; portal id varsayılanı 149668156', () => {
    const c = hubspotConfigSchema.parse({ token: 'pat-eu1-abcdefghijklmnopqrstuvwxyz' });
    expect(c.mode).toBe('pull_only');
    const m = maskHubSpotConfig(c);
    expect(m.connected).toBe(true); expect(m.token).toBe('pat-eu1••••wxyz'); expect(m.token).not.toContain('abcdefg'); expect(m.portal_id).toBe('149668156');
    expect(maskHubSpotConfig(null).connected).toBe(false);
  });
  it('source_ref ayrıştırma + HubSpot bağlantısı', () => {
    expect(parseHubSpotRef('hubspot:company:3001')).toEqual({ entity: 'company', id: '3001' });
    expect(parseHubSpotRef('trello:abc')).toBeNull(); expect(parseHubSpotRef(null)).toBeNull();
    expect(hubspotUrl('company', '3001')).toBe('https://app.hubspot.com/contacts/149668156/company/3001');
    expect(hubspotUrlFor(hubspotRef('deal', 5001), '999')).toBe('https://app.hubspot.com/contacts/999/deal/5001');
  });
  it('client_contacts koleksiyonu kayıtlı (gerçek kolonlar) ve 0020 migration tabloları/RLS’i oluşturur', () => {
    expect(COLLECTIONS.client_contacts.native).toEqual(expect.arrayContaining(['client_id', 'brand_id', 'name', 'email', 'source_ref']));
    const sql = readFileSync(fileURLToPath(new URL('../../../../../packages/schema/supabase/migrations/0020_hubspot.sql', import.meta.url)), 'utf8');
    for (const t of ['client_contacts', 'integration_links']) { expect(sql).toContain(`create table if not exists public.${t} (`); expect(sql).toContain(`alter table public.${t} enable row level security;`); expect(sql).toContain(`create policy ${t}_r on`); }
    expect(sql).toContain('unique (provider, entity, remote_id)');
    expect(sql).toContain('alter table public.crm_deals add column if not exists source_ref');
    expect(sql).toContain('alter table public.clients add column if not exists source_ref');
    expect(sql).toContain('supabase_realtime add table public.client_contacts');
    expect(sql).toContain('function core.sync_touch()');
    expect(sql).not.toMatch(/create table public\./);
  });
});

describe('HubSpot · eşleme (saf)', () => {
  it('company → client + varsayılan brand (ad = şirket adı; customer → active, diğerleri prospect)', () => {
    const c = rec('3001', { name: 'Clayton', domain: 'clayton.com', industry: 'REAL_ESTATE', phone: '+90 212', lifecyclestage: 'customer' });
    expect(companyToClient(c)).toMatchObject({ name: 'Clayton', domain: 'clayton.com', sector: 'REAL_ESTATE', contact: '+90 212', source_ref: 'hubspot:company:3001' });
    expect(companyToBrand(c, 'cl1')).toMatchObject({ client_id: 'cl1', name: 'Clayton', status: 'active', source_ref: 'hubspot:company:3001' });
    expect(companyToBrand(rec('2', { name: 'X', lifecyclestage: 'lead' }), 'cl').status).toBe('prospect');
    expect(companyToClient(rec('7', { name: null, website: 'https://www.acme.io/x' })).name).toBe('acme.io');
  });
  it('contact → client_contact (ad birleşimi, e-posta küçük harf, telefon yedeği, raw)', () => {
    const c = contactToClientContact(rec('901', { firstname: 'Pınar', lastname: 'Yılmaz', email: 'Pinar@Anova.example', phone: null, mobilephone: '+90 532', jobtitle: 'PM' }), 'cl1', 'b1');
    expect(c).toMatchObject({ client_id: 'cl1', brand_id: 'b1', name: 'Pınar Yılmaz', email: 'pinar@anova.example', phone: '+90 532', title: 'PM', source_ref: 'hubspot:contact:901' });
    expect(c.raw).toMatchObject({ firstname: 'Pınar', hs_updated_at: '2026-11-10T08:00:00Z' });
    expect(contactToClientContact(rec('9', { email: 'a@b.c' }), 'cl', null).name).toBe('a@b.c');
  });
  it('aşama eşlemesi: açık eşleme > varsayılan sezgisel; geri yazım ilk eşleşen aşama', () => {
    const def = buildDefaultStageMap(PIPES);
    expect(def).toMatchObject({ 'default:appointmentscheduled': 'new', 'default:qualifiedtobuy': 'talk', 'default:presentationscheduled': 'talk', 'default:contractsent': 'proposal', 'default:closedwon': 'won', 'default:closedlost': 'lost' });
    expect(mapStage('default', 'contractsent', PIPES)).toBe('proposal');
    expect(mapStage('default', 'contractsent', PIPES, { 'default:contractsent': 'talk' })).toBe('talk');
    expect(mapStage('default', 'nope', PIPES)).toBe('new');
    expect(mapStage('other', 'closedwon', PIPES)).toBe('won'); // pipeline bilinmese de aşama id'sinden
    expect(reverseStage('proposal', 'default', PIPES)).toBe('contractsent');
    expect(reverseStage('talk', 'default', PIPES)).toBe('qualifiedtobuy');
    expect(reverseStage('won', 'default', PIPES, { 'default:closedwon': 'lost' })).toBeNull();
    expect(buildDefaultStageMap(PIPES, { 'default:closedwon': 'lost' })['default:closedwon']).toBe('lost'); // mevcut korunur
  });
  it('owner → çalışan: e-posta eşleşmesi, yoksa ad; eşlenemeyen raporlanır; owner_map öncelikli', () => {
    expect(resolveOwner('11', OWNERS, EMP)).toBe('OE');
    expect(resolveOwner('12', OWNERS, EMP)).toBe('SK'); // e-posta uymadı → ad
    expect(resolveOwner('13', OWNERS, EMP)).toBeNull();
    expect(resolveOwner('13', OWNERS, EMP, { 13: 'UC' })).toBe('UC');
    const m = buildOwnerMap(OWNERS, EMP);
    expect(m.owner_map).toEqual({ 11: 'OE', 12: 'SK' });
    expect(m.unmapped).toEqual([{ id: '13', label: 'ghost@y.example' }]);
  });
  it('deal → crm_deals: tutar kuruş, aşama, owner yedeği, kapanış tarihi', () => {
    const d = dealToCrmDeal(rec('5001', { dealname: 'Lansman', amount: '650000.5', dealstage: 'contractsent', pipeline: 'default', closedate: '1765756800000', hs_next_step: 'Sunum' }), { brandId: 'b1', company: 'Clayton', owner: 'OE', pipelines: PIPES, stageMap: {} });
    expect(d).toMatchObject({ brand_id: 'b1', company: 'Clayton', title: 'Lansman', stage: 'proposal', value_minor: 65000050, owner: 'OE', source: 'HubSpot', next_step: 'Sunum', source_ref: 'hubspot:deal:5001', hs_pipeline: 'default', hs_stage: 'contractsent' });
    expect(d.close_at).toBe('2025-12-15T00:00:00.000Z');
    expect(dealToCrmDeal(rec('5', { dealname: 'X', amount: null, dealstage: 'closedwon' }), { brandId: null, company: '', owner: null, pipelines: PIPES, stageMap: {} })).toMatchObject({ value_minor: 0, owner: 'hubspot', company: 'X', stage: 'won' });
    expect(amountToMinor('1.234,50'.replace('.', ''))).toBe(123450);
  });
  it('çakışma saati (0010): JS yazması yalnızca updated_at > synced_at ise sayılır; sonra en yeni kazanır', () => {
    const r = '2026-11-10T08:00:00Z';
    expect(resolveConflict({ updated_at: '2026-11-10T09:00:00Z', synced_at: '2026-11-10T07:00:00Z' }, r)).toBe('push');
    expect(resolveConflict({ updated_at: '2026-11-10T07:30:00Z', synced_at: '2026-11-10T07:00:00Z' }, r)).toBe('pull');
    expect(resolveConflict({ updated_at: '2026-11-10T09:00:00Z', synced_at: '2026-11-10T09:00:00Z' }, r)).toBe('pull'); // HubSpot kaynaklı yazma
    expect(resolveConflict({ updated_at: '2026-11-10T09:00:00Z', synced_at: null }, r)).toBe('pull'); // hiç eşitlenmemiş → HubSpot uygulanır
    expect(resolveConflict({ updated_at: '2026-11-10T09:00:00Z', synced_at: '2026-11-10T07:00:00Z' }, null)).toBe('pull');
    expect(isHubSpotOriginWrite({ sync_origin: 'hubspot' })).toBe(true);
    expect(isHubSpotOriginWrite({ updated_at: '2026-11-10T08:00:00Z', synced_at: '2026-11-10T08:00:00Z' })).toBe(true);
    expect(needsPush({ updated_at: '2026-11-10T09:00:00Z', synced_at: '2026-11-10T08:00:00Z' })).toBe(true);
    expect(needsPush({ updated_at: '2026-11-10T09:00:00Z', synced_at: null })).toBe(true);
    expect(needsPush({ updated_at: null, synced_at: null })).toBe(false);
    expect(needsPush({ updated_at: '2026-11-10T08:00:00Z', synced_at: '2026-11-10T08:00:00Z' })).toBe(false);
    expect(hubspotIsNewer('2026-11-10T08:00:00Z', '2026-11-10T08:30:00Z')).toBe(true);
  });
  it('JS → HubSpot özellikleri ve fark', () => {
    expect(contactToProps({ name: 'Ali Can Çetin', email: 'Ali@X.com', phone: '', title: 'CEO' })).toEqual({ firstname: 'Ali', lastname: 'Can Çetin', email: 'ali@x.com', jobtitle: 'CEO' });
    const cur = rec('5001', { dealname: 'Lansman', amount: '650000.00', dealstage: 'presentationscheduled', pipeline: 'default' });
    const props = dealToProps({ title: 'Lansman v2', value_minor: 65000000, stage: 'talk', owner: 'OE', next_step: '', close_at: null, hs_pipeline: 'default' }, { pipelines: PIPES, stage_map: {}, owner_map: { 11: 'OE' } }, cur);
    expect(props).toEqual({ dealname: 'Lansman v2', amount: '650000.00', hubspot_owner_id: '11' }); // aşama zaten 'talk' → dealstage yazılmaz
    expect(diffProps(props, cur)).toEqual({ dealname: 'Lansman v2', hubspot_owner_id: '11' });
    const moved = dealToProps({ title: 'Lansman', value_minor: 65000000, stage: 'won', owner: 'x', next_step: '', close_at: null, hs_pipeline: 'default' }, { pipelines: PIPES, stage_map: {}, owner_map: {} }, cur);
    expect(moved).toMatchObject({ dealstage: 'closedwon', pipeline: 'default' });
    expect(diffProps({ closedate: '2026-12-15T00:00:00.000Z' }, rec('1', { closedate: '1765756800000' }))).toEqual({ closedate: '2026-12-15T00:00:00.000Z' }); // 2025 ≠ 2026
    expect(diffProps({ closedate: '2025-12-15T10:00:00.000Z' }, rec('1', { closedate: '1765756800000' }))).toEqual({}); // aynı gün
  });
});

/* ───────── HTTP: sayfalama + geri çekilme (sahte fetch) ───────── */
type Call = { url: string; method: string; body?: unknown };
const fakeFetch = (handler: (url: URL, init: RequestInit, n: number) => { status: number; body?: unknown; headers?: Record<string, string> }) => {
  const calls: Call[] = [];
  const f = (async (input: URL | RequestInfo, init?: RequestInit) => {
    const url = input instanceof URL ? input : new URL(String(input));
    calls.push({ url: url.toString(), method: init?.method ?? 'GET', body: init?.body ? JSON.parse(String(init.body)) : undefined });
    const r = handler(url, init ?? {}, calls.length);
    return new Response(r.body === undefined ? null : JSON.stringify(r.body), { status: r.status, headers: { 'content-type': 'application/json', ...(r.headers ?? {}) } });
  }) as unknown as typeof fetch;
  return { f, calls };
};
describe('HubSpot · HTTP katmanı', () => {
  it('429 → Retry-After kadar bekler ve yeniden dener; 5xx bir kez daha; 4xx hata fırlatır', async () => {
    const waits: number[] = [];
    const { f, calls } = fakeFetch((_u, _i, n) => (n === 1 ? { status: 429, headers: { 'retry-after': '2' } } : n === 2 ? { status: 503 } : { status: 200, body: { ok: 1 } }));
    const r = await hubspotFetch<{ ok: number }>('tok', '/x', { fetchImpl: f, sleep: async (ms) => { waits.push(ms); } });
    expect(r).toEqual({ ok: 1 }); expect(calls.length).toBe(3); expect(waits).toEqual([2000, 2000]); // Retry-After 2 sn; sonra 1s·2^1
    expect(backoffMs(0, null)).toBe(1000); expect(backoffMs(3, null)).toBe(8000); expect(backoffMs(10, null)).toBe(20000); expect(backoffMs(0, 500)).toBe(500);
    expect(retryAfterMs('3')).toBe(3000); expect(retryAfterMs(null)).toBeNull(); expect(retryAfterMs(new Date(Date.now() + 5000).toUTCString())).toBeGreaterThan(3000);
    const bad = fakeFetch(() => ({ status: 401, body: { message: 'nope' } }));
    await expect(hubspotFetch('tok', '/x', { fetchImpl: bad.f, sleep: async () => undefined })).rejects.toMatchObject({ status: 401, message: expect.stringContaining('token') });
    const forbidden = fakeFetch(() => ({ status: 403, body: { message: 'scope missing', category: 'MISSING_SCOPES' } }));
    await expect(hubspotFetch('tok', '/x', { fetchImpl: forbidden.f, sleep: async () => undefined })).rejects.toBeInstanceOf(HubSpotApiError);
    const tooMany = fakeFetch(() => ({ status: 429 }));
    await expect(hubspotFetch('tok', '/x', { fetchImpl: tooMany.f, sleep: async () => undefined, maxRetries: 2 })).rejects.toMatchObject({ status: 429 });
    expect(tooMany.calls.length).toBe(3);
  });
  it('listAll paging.next.after ile tüm sayfaları gezer; changedSince arama ucunu since ile kullanır; associations v4 batch', async () => {
    const { f, calls } = fakeFetch((u, init) => {
      if (u.pathname.endsWith('/search')) { const b = JSON.parse(String(init.body)) as { after?: string; filterGroups: Array<{ filters: Array<{ value: string }> }> }; return { status: 200, body: { results: [rec(b.after ? 'c2' : 'c1', { name: 'x' })], paging: b.after ? undefined : { next: { after: '1' } } } }; }
      if (u.pathname.includes('/associations/')) return { status: 200, body: { results: [{ from: { id: '901' }, to: [{ toObjectId: 3001 }] }] } };
      const after = u.searchParams.get('after');
      return { status: 200, body: { results: [rec(after ? 'b' : 'a', { name: after ?? '0' })], ...(after ? {} : { paging: { next: { after: 'A2' } } }) } };
    });
    const c = new HubSpotClient('tok', { fetchImpl: f, sleep: async () => undefined });
    const all = await c.listAll('companies');
    expect(all.map((r) => r.id)).toEqual(['a', 'b']);
    expect(calls[0].url).toContain('limit=100'); expect(calls[0].url).toContain('properties=name'); expect(calls[1].url).toContain('after=A2');
    const ch = await c.changedSince('deals', '2026-11-10T08:00:00Z');
    expect(ch.rows.map((r) => r.id)).toEqual(['c1', 'c2']); expect(ch.capped).toBe(false);
    const body = calls[2].body as { filterGroups: Array<{ filters: Array<{ propertyName: string; operator: string; value: string }> }> };
    expect(body.filterGroups[0].filters[0]).toEqual({ propertyName: 'hs_lastmodifieddate', operator: 'GTE', value: String(Date.parse('2026-11-10T08:00:00Z')) });
    const as = await c.associations('contacts', 'companies', ['901']);
    expect(as).toEqual({ 901: ['3001'] });
    expect(calls.at(-1)!.url).toContain('/crm/v4/associations/contacts/companies/batch/read');
    const upserted = await c.batchUpsert('contacts', [{ id: 'a@b.c', properties: { firstname: 'A' } }], 'email').catch(() => []);
    expect(Array.isArray(upserted)).toBe(true);
    expect((calls.at(-1)!.body as { inputs: Array<{ idProperty: string }> }).inputs[0].idProperty).toBe('email');
  });
});

/* ───────── Senkron çekirdeği: bellek deposu ───────── */
function memStore(init: Partial<StoreState> = {}) {
  const st: StoreState = { clients: [], brands: [], contacts: [], deals: [], employees: EMP, links: [], ...init };
  let n = 0; const id = (p: string) => `${p}${++n}`;
  const writes: string[] = [];
  const store: HubSpotStore = {
    load: async () => ({ ...st, clients: [...st.clients], brands: [...st.brands], contacts: [...st.contacts], deals: [...st.deals], links: [...st.links] }),
    createClient: async (d) => { const r = { id: id('cl'), ...d, source_ref: d.source_ref || null, updated_at: '2026-11-10T08:00:00Z', synced_at: '2026-11-10T08:00:00Z' }; st.clients.push(r); writes.push(`client+${r.id}`); return r; },
    updateClient: async (i, p) => { Object.assign(st.clients.find((x) => x.id === i)!, p); writes.push(`client~${i}:${Object.keys(p).join(',')}`); },
    createBrand: async (d) => { const r = { id: id('b'), ...d }; st.brands.push(r); writes.push(`brand+${r.id}`); return r; },
    updateBrand: async (i, p) => { Object.assign(st.brands.find((x) => x.id === i)!, p); writes.push(`brand~${i}`); },
    createContact: async (d) => { const r = { id: id('cc'), ...d }; st.contacts.push(r); writes.push(`contact+${r.id}`); return r; },
    updateContact: async (i, p) => { Object.assign(st.contacts.find((x) => x.id === i)!, p); writes.push(`contact~${i}:${Object.keys(p).filter((k) => k !== 'raw').join(',')}`); },
    createDeal: async (d) => { const r = { id: id('d'), ...d }; st.deals.push(r); writes.push(`deal+${r.id}`); return r; },
    updateDeal: async (i, p) => { Object.assign(st.deals.find((x) => x.id === i)!, p); writes.push(`deal~${i}:${Object.keys(p).join(',')}`); },
    link: async (l: Link) => { const i = st.links.findIndex((x) => x.entity === l.entity && x.remote_id === l.remote_id); if (i >= 0) st.links[i] = l; else st.links.push(l); },
  };
  return { st, store, writes };
}
const SNAP = (o: Partial<HubSpotSnapshot> = {}): HubSpotSnapshot => ({
  companies: [rec('3001', { name: 'Clayton', domain: 'clayton.com', lifecyclestage: 'customer' })],
  contacts: [rec('901', { firstname: 'Ali', lastname: 'Çetin', email: 'ali@clayton.example', jobtitle: 'Satış' })],
  deals: [rec('5001', { dealname: 'Lansman', amount: '650000', dealstage: 'contractsent', pipeline: 'default', hubspot_owner_id: '11' })],
  owners: OWNERS, contactCompany: { 901: ['3001'] }, dealCompany: { 5001: ['3001'] }, ...o,
});
const CFG = { pipelines: PIPES, stage_map: {}, owner_map: {} };

describe('HubSpot · çekme çekirdeği (runPull)', () => {
  it('şirket → müşteri + marka, kişi ve fırsat bağlanır; ikinci çalıştırma değişiklik yapmaz (idempotent)', async () => {
    const { st, store, writes } = memStore();
    const logs: string[] = [];
    const r = await runPull(SNAP(), store, CFG, (e) => logs.push(`${e.entity}:${e.action}`));
    expect(r).toMatchObject({ companies_seen: 1, contacts_seen: 1, deals_seen: 1, clients_created: 1, brands_created: 1, contacts_created: 1, deals_created: 1, skipped_conflicts: 0, errors: [] });
    expect(r.unmapped_owners).toEqual([{ id: '13', label: 'ghost@y.example' }]); expect(r.owner_map).toEqual({ 11: 'OE', 12: 'SK' });
    expect(st.clients[0]).toMatchObject({ name: 'Clayton', source_ref: 'hubspot:company:3001' });
    expect(st.brands[0]).toMatchObject({ client_id: st.clients[0].id, name: 'Clayton', status: 'active', source_ref: 'hubspot:company:3001' });
    expect(st.contacts[0]).toMatchObject({ client_id: st.clients[0].id, brand_id: st.brands[0].id, name: 'Ali Çetin', source_ref: 'hubspot:contact:901' });
    expect(st.deals[0]).toMatchObject({ brand_id: st.brands[0].id, company: 'Clayton', title: 'Lansman', stage: 'proposal', value_minor: 65000000, owner: 'OE', source_ref: 'hubspot:deal:5001' });
    expect(st.links.map((l) => `${l.entity}:${l.remote_id}→${l.local_id}`).sort()).toEqual([`company:3001→${st.clients[0].id}`, `contact:901→${st.contacts[0].id}`, `deal:5001→${st.deals[0].id}`]);
    const before = writes.length;
    const r2 = await runPull(SNAP(), store, CFG, () => undefined);
    expect(r2).toMatchObject({ clients_created: 0, clients_updated: 0, brands_created: 0, contacts_created: 0, contacts_updated: 0, deals_created: 0, deals_updated: 0 });
    expect(writes.length).toBe(before);
    expect(logs).toEqual(['company:created', 'brand:created', 'contact:created', 'deal:created']);
  });
  it('bağsız mevcut müşteri alan adı / adla bağlanır; mevcut markası şirkete bağlanır (yeni marka açılmaz)', async () => {
    const { st, store } = memStore({ clients: [{ id: 'clX', name: 'CLAYTON A.Ş.', domain: 'www.clayton.com' }], brands: [{ id: 'bX', client_id: 'clX', name: 'Clayton Konut' }] });
    const r = await runPull(SNAP({ contacts: [], deals: [] }), store, CFG, () => undefined);
    expect(r.clients_created).toBe(0); expect(r.brands_created).toBe(0);
    expect(st.clients[0].source_ref).toBe('hubspot:company:3001'); expect(st.brands[0].source_ref).toBe('hubspot:company:3001');
  });
  it('son yazan kazanır: JS daha yeniyse HubSpot değişikliği atlanır (skipped_conflict); HubSpot daha yeniyse uygulanır', async () => {
    const base = { id: 'clX', name: 'Eski Ad', source_ref: 'hubspot:company:3001' };
    const newer = memStore({ clients: [{ ...base, updated_at: '2026-11-10T09:00:00Z', synced_at: '2026-11-10T07:00:00Z' }], brands: [{ id: 'b', client_id: 'clX', name: 'x', source_ref: 'hubspot:company:3001' }] });
    const logs: Array<{ action: string; entity: string }> = [];
    const r1 = await runPull(SNAP({ contacts: [], deals: [] }), newer.store, CFG, (e) => logs.push(e));
    expect(r1.skipped_conflicts).toBe(1); expect(newer.st.clients[0].name).toBe('Eski Ad');
    expect(logs.find((l) => l.action === 'skipped_conflict')?.entity).toBe('company');
    const older = memStore({ clients: [{ ...base, updated_at: '2026-11-10T07:30:00Z', synced_at: '2026-11-10T07:00:00Z' }], brands: [{ id: 'b', client_id: 'clX', name: 'x', source_ref: 'hubspot:company:3001' }] });
    const r2 = await runPull(SNAP({ contacts: [], deals: [] }), older.store, CFG, () => undefined);
    expect(r2.clients_updated).toBe(1); expect(older.st.clients[0].name).toBe('Clayton');
  });
  it('şirketsiz kişi yedek müşteriye düşer; owner eşlenemeyen fırsat "hubspot" sahipli kalır; aşama eşlemesi config’ten', async () => {
    const { st, store } = memStore();
    const r = await runPull(SNAP({ companies: [], contactCompany: {}, dealCompany: {}, deals: [rec('5', { dealname: 'X', dealstage: 'contractsent', pipeline: 'default', hubspot_owner_id: '13' })] }), store, { ...CFG, stage_map: { 'default:contractsent': 'talk' } }, () => undefined);
    expect(st.clients[0].name).toBe('HubSpot · Şirketsiz kişiler'); expect(st.contacts[0].client_id).toBe(st.clients[0].id);
    expect(st.deals[0]).toMatchObject({ owner: 'hubspot', stage: 'talk', brand_id: null });
    expect(r.errors).toEqual([]);
  });
});

describe('HubSpot · itme (runPush)', () => {
  const remote = (cur: Record<string, HsRecord | null>) => {
    const calls: Array<{ op: string; object: string; id?: string; props?: Record<string, string> }> = [];
    const ports: RemotePorts = {
      getOne: async (o, id) => cur[`${o}:${id}`] ?? null,
      create: async (o, props) => { calls.push({ op: 'create', object: o, props }); return rec('777', props, '2026-11-12T10:00:00Z'); },
      update: async (o, id, props) => { calls.push({ op: 'update', object: o, id, props }); return rec(id, { ...(cur[`${o}:${id}`]?.properties ?? {}), ...props }, '2026-11-12T10:00:00Z'); },
      associate: async (f, fi, t, ti) => { calls.push({ op: 'assoc', object: `${f}/${fi}→${t}/${ti}` }); },
    };
    return { ports, calls };
  };
  const cfg = hubspotConfigSchema.parse({ token: 't'.repeat(30), mode: 'two_way', connected_at: '2026-11-01T00:00:00Z', pipelines: PIPES, owner_map: { 11: 'OE' } });
  it('mode ≠ two_way → hiçbir şey itilmez', async () => {
    const { store } = memStore({ contacts: [{ id: 'cc1', client_id: 'cl', brand_id: null, name: 'A', email: 'a@b.c', phone: '', title: '', source_ref: 'hubspot:contact:901', updated_at: '2026-11-12T09:00:00Z', synced_at: '2026-11-10T08:00:00Z' }] });
    const r = remote({});
    expect(await runPush(store, r.ports, { ...cfg, mode: 'pull_only' }, () => undefined)).toMatchObject({ pushed: 0 });
    expect(r.calls).toEqual([]);
  });
  it('bağlı kişi: yalnızca fark PATCH edilir; HubSpot daha yeniyse skipped_conflict; HubSpot kaynaklı yazma itilmez', async () => {
    const mk = (updated_at: string, synced_at: string) => memStore({ contacts: [{ id: 'cc1', client_id: 'cl', brand_id: null, name: 'Ali Çetin', email: 'ali@clayton.example', phone: '+90 1', title: 'Direktör', source_ref: 'hubspot:contact:901', updated_at, synced_at }] });
    const cur = { 'contacts:901': rec('901', { firstname: 'Ali', lastname: 'Çetin', email: 'ali@clayton.example', phone: '+90 1', jobtitle: 'Satış' }, '2026-11-10T08:00:00Z') };
    const a = mk('2026-11-12T09:00:00Z', '2026-11-10T08:00:00Z'); const ra = remote(cur); const logs: string[] = [];
    expect(await runPush(a.store, ra.ports, cfg, (e) => logs.push(e.action))).toMatchObject({ pushed: 1, skipped_conflicts: 0 });
    expect(ra.calls).toEqual([{ op: 'update', object: 'contacts', id: '901', props: { jobtitle: 'Direktör' } }]);
    expect(a.st.links[0]).toMatchObject({ entity: 'contact', remote_id: '901', remote_updated_at: '2026-11-12T10:00:00Z' });
    const b = mk('2026-11-10T08:30:00Z', '2026-11-10T08:00:00Z'); const rb = remote({ 'contacts:901': { ...cur['contacts:901'], updatedAt: '2026-11-10T09:00:00Z' } });
    expect(await runPush(b.store, rb.ports, cfg, (e) => logs.push(e.action))).toMatchObject({ pushed: 0, skipped_conflicts: 1 }); expect(rb.calls).toEqual([]);
    const c = mk('2026-11-10T08:00:00Z', '2026-11-10T08:00:00Z'); const rc = remote(cur);
    expect(await runPush(c.store, rc.ports, cfg, () => undefined)).toMatchObject({ pushed: 0, skipped_conflicts: 0 }); expect(rc.calls).toEqual([]);
    expect(logs).toEqual(['updated', 'skipped_conflict']);
  });
  it('bağsız yeni fırsat (bağlanmadan sonra açılmış) HubSpot’ta oluşturulur, şirkete ilişkilendirilir ve bağlanır; eski bağsız kayıt dökülmez', async () => {
    const deal = { id: 'd9', brand_id: 'b1', company: 'Clayton', title: 'Yeni iş', stage: 'proposal' as const, value_minor: 1000000, owner: 'OE', source: 'Web', next_step: '', updated_at: '2026-11-12T09:00:00Z', created_at: '2026-11-12T09:00:00Z' };
    const { st, store } = memStore({ clients: [{ id: 'cl1', name: 'Clayton', source_ref: 'hubspot:company:3001' }], brands: [{ id: 'b1', client_id: 'cl1', name: 'Clayton', source_ref: 'hubspot:company:3001' }], deals: [deal, { ...deal, id: 'd0', created_at: '2026-10-01T00:00:00Z' }] });
    const r = remote({});
    expect(await runPush(store, r.ports, cfg, () => undefined)).toMatchObject({ created_remote: 1, pushed: 0, errors: [] });
    expect(r.calls[0]).toMatchObject({ op: 'create', object: 'deals', props: { dealname: 'Yeni iş', amount: '10000.00', dealstage: 'contractsent', pipeline: 'default', hubspot_owner_id: '11' } });
    expect(r.calls[1]).toEqual({ op: 'assoc', object: 'deals/777→companies/3001' });
    expect(st.deals.find((d) => d.id === 'd9')?.source_ref).toBe('hubspot:deal:777'); expect(st.deals.find((d) => d.id === 'd0')?.source_ref).toBeUndefined();
  });
  it('olay süzgeci: two_way + crm tablosu + HubSpot kaynaklı olmayan yazma', () => {
    const ev = (aggregate: string, n: Record<string, unknown>, type = `${aggregate}.update`) => ({ type, aggregate, payload: { new: n } });
    expect(shouldPushHubSpotEvent(ev('crm_deals', { id: 'd1' }), { mode: 'two_way' })).toEqual({ push: true, entity: 'deal', id: 'd1' });
    expect(shouldPushHubSpotEvent(ev('client_contacts', { id: 'c1', sync_origin: 'hubspot' }), { mode: 'two_way' })).toMatchObject({ push: false, reason: 'origin' });
    expect(shouldPushHubSpotEvent(ev('tasks', { id: 't' }), { mode: 'two_way' })).toMatchObject({ push: false, reason: 'not_crm' });
    expect(shouldPushHubSpotEvent(ev('clients', { id: 'c' }), { mode: 'pull_only' })).toMatchObject({ push: false, reason: 'mode' });
    expect(shouldPushHubSpotEvent(ev('clients', { id: 'c', source_ref: 'trello:x' }), { mode: 'two_way' })).toMatchObject({ push: false, reason: 'foreign_ref' });
  });
});

describe('HubSpot · webhook imzası v3', () => {
  const secret = 'client-secret'; const url = 'https://app.example/api/webhooks/hubspot?org=o1'; const body = '[{"objectId":1,"subscriptionType":"contact.propertyChange"}]';
  const sign = (ts: string) => createHmac('sha256', secret).update(`POST${url}${body}${ts}`).digest('base64');
  it('doğru imza + güncel zaman damgası geçer; eski damga, yanlış sır, eksik başlık reddedilir', () => {
    const now = 1_762_800_000_000; const ts = String(now - 10_000);
    expect(verifyHubSpotSignatureV3({ method: 'post', url, body, timestamp: ts, signature: sign(ts), secret, now })).toBe(true);
    expect(verifyHubSpotSignatureV3({ method: 'POST', url, body, timestamp: ts, signature: sign(ts), secret: 'other', now })).toBe(false);
    const old = String(now - 6 * 60_000);
    expect(verifyHubSpotSignatureV3({ method: 'POST', url, body, timestamp: old, signature: sign(old), secret, now })).toBe(false);
    expect(verifyHubSpotSignatureV3({ method: 'POST', url, body, timestamp: ts, signature: null, secret, now })).toBe(false);
    expect(verifyHubSpotSignatureV3({ method: 'POST', url, body, timestamp: ts, signature: sign(ts), secret: undefined, now })).toBe(false);
    expect(verifyHubSpotSignatureV3({ method: 'POST', url, body: body + ' ', timestamp: ts, signature: sign(ts), secret, now })).toBe(false);
  });
});

describe('HubSpot · DemoRepo', () => {
  it('client_contacts koleksiyonu okunur/yazılır; HubSpot bağlı demo kayıtları rozet verisini taşır; senkron günlüğü rol kapılı', async () => {
    const repo = new DemoRepo({ accountId: 'account' });
    const rows = await repo.list('client_contacts');
    expect(rows.length).toBeGreaterThanOrEqual(3);
    expect(rows.find((r) => r.source_ref === 'hubspot:contact:901')).toMatchObject({ name: 'Pınar Yılmaz', client_id: 'cl_anova' });
    const saved = await repo.save('client_contacts', { client_id: 'cl_lumio', brand_id: 'c_lumio', name: 'Yeni Kişi', email: 'yeni@lumio.example', phone: '', title: 'CMO', source_ref: null });
    expect(saved.id).toMatch(/^cc/);
    const brands = await repo.listBrands();
    expect(brands.find((b) => b.id === 'c_clayton')?.source_ref).toBe('hubspot:company:3001');
    const deals = await repo.list('crm_deals');
    expect(deals.find((d) => d.source_ref === 'hubspot:deal:5001')?.source).toBe('HubSpot');
    expect((await repo.listSyncLog('hubspot')).some((e) => e.action === 'skipped_conflict')).toBe(true);
    expect(await new DemoRepo({ accountId: 'creative' }).listSyncLog('hubspot')).toEqual([]);
  });
});
