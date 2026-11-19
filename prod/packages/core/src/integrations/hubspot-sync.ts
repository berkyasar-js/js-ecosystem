import { createHmac, timingSafeEqual } from 'node:crypto';
import type { SupabaseClient } from '@supabase/supabase-js';
import { hubspotRef, parseHubSpotRef, type DealStage, type HubSpotConfig, type HubSpotEntity, type HubSpotImportResult, type HubSpotPipeline, type HubSpotReconcileSummary } from '@jscore/contracts';
import { HubSpotApiError, HubSpotClient, loadHubSpotConfig, saveHubSpotConfig, writeHubSpotLog, type HsOwner, type HsRecord, type HubSpotLogDraft, type HubSpotObject } from './hubspot';
import {
  buildOwnerMap, clientToCompanyProps, companyToBrand, companyToClient, contactToClientContact, contactToProps, dealToCrmDeal, dealToProps, diffProps, hubspotIsNewer,
  needsPush, resolveConflict, resolveOwner, type BrandDraft, type ClientDraft, type ContactDraft, type DealDraft, type Employee, type LocalBrand, type LocalClient, type LocalContact, type LocalDeal,
} from './hubspot-map';
import { fold } from './trello-map';

/**
 * HubSpot senkron motoru (port tabanlı): `runPull` (tam/artımlı çekme), `runPush` (JS → HubSpot), `reconcileHubSpot` (saatlik), webhook alıcısı.
 * Depo portu `HubSpotStore`: üretimde Supabase servis rolü (SupabaseHubSpotStore), testte bellek. HubSpot kaynaklı her yazma
 * sync_origin='hubspot' + synced_at ile işaretlenir (0020 core.sync_touch) → geri itilmez. Çakışmada son yazan kazanır.
 */

/* ───────── Depo portu ───────── */
export interface Link { entity: HubSpotEntity; local_id: string; remote_id: string; remote_updated_at: string | null }
export interface StoreState { clients: LocalClient[]; brands: LocalBrand[]; contacts: LocalContact[]; deals: LocalDeal[]; employees: Employee[]; links: Link[] }
export interface HubSpotStore {
  load(): Promise<StoreState>;
  createClient(d: ClientDraft): Promise<{ id: string }>;
  updateClient(id: string, patch: Partial<ClientDraft>): Promise<void>;
  createBrand(d: BrandDraft): Promise<{ id: string }>;
  updateBrand(id: string, patch: Partial<BrandDraft>): Promise<void>;
  createContact(d: ContactDraft): Promise<{ id: string }>;
  updateContact(id: string, patch: Partial<ContactDraft>): Promise<void>;
  createDeal(d: DealDraft): Promise<{ id: string }>;
  updateDeal(id: string, patch: Partial<DealDraft>): Promise<void>;
  /** integration_links upsert (provider=hubspot). */
  link(l: Link & { local_updated_at?: string | null }): Promise<void>;
}
export interface HubSpotSnapshot { companies: HsRecord[]; contacts: HsRecord[]; deals: HsRecord[]; owners: HsOwner[]; contactCompany: Record<string, string[]>; dealCompany: Record<string, string[]> }
export type LogFn = (e: HubSpotLogDraft) => void;
const FALLBACK_CLIENT = 'HubSpot · Şirketsiz kişiler';
export const emptyImportResult = (): HubSpotImportResult => ({ companies_seen: 0, contacts_seen: 0, deals_seen: 0, clients_created: 0, clients_updated: 0, brands_created: 0, contacts_created: 0, contacts_updated: 0, deals_created: 0, deals_updated: 0, skipped_conflicts: 0, unmapped_owners: [], errors: [] });

const changed = <T extends object>(cur: Record<string, unknown>, want: T, keys: Array<keyof T & string>): Partial<T> => {
  const out: Partial<T> = {};
  const w = want as Record<string, unknown>;
  for (const k of keys) if ((w[k] ?? null) !== (cur[k] ?? null)) (out as Record<string, unknown>)[k] = w[k];
  return out;
};
const norm = (s: string | null | undefined) => fold((s ?? '').normalize('NFC')).replace(/[^a-z0-9]+/g, ' ').trim();
const domainOf = (s: string | null | undefined) => (s ?? '').toLowerCase().replace(/^https?:\/\//, '').replace(/^www\./, '').replace(/\/.*$/, '').trim();

/* ───────── Çekme (HubSpot → JS) ───────── */
export async function runPull(snap: HubSpotSnapshot, store: HubSpotStore, cfg: Pick<HubSpotConfig, 'pipelines' | 'stage_map' | 'owner_map'>, log: LogFn): Promise<HubSpotImportResult & { owner_map: Record<string, string> }> {
  const res = emptyImportResult();
  const st = await store.load();
  const om = buildOwnerMap(snap.owners, st.employees, cfg.owner_map);
  res.unmapped_owners = om.unmapped;
  const ownerMap = { ...(cfg.owner_map ?? {}), ...om.owner_map };
  const linkOf = (entity: HubSpotEntity, remoteId: string) => st.links.find((l) => l.entity === entity && l.remote_id === remoteId);
  const clientByRef = new Map(st.clients.filter((c) => c.source_ref).map((c) => [c.source_ref as string, c]));
  const brandByRef = new Map(st.brands.filter((b) => b.source_ref).map((b) => [b.source_ref as string, b]));
  const contactByRef = new Map(st.contacts.filter((c) => c.source_ref).map((c) => [c.source_ref as string, c]));
  const dealByRef = new Map(st.deals.filter((d) => d.source_ref).map((d) => [d.source_ref as string, d]));
  /** şirket id → { clientId, brandId } (kişi/fırsat bağlamak için) */
  const companyLocal = new Map<string, { clientId: string; brandId: string | null; name: string }>();
  for (const [ref, c] of clientByRef) { const p = parseHubSpotRef(ref); if (p?.entity === 'company') companyLocal.set(p.id, { clientId: c.id, brandId: brandByRef.get(ref)?.id ?? st.brands.find((b) => b.client_id === c.id)?.id ?? null, name: c.name }); }

  /* şirketler */
  for (const c of snap.companies) {
    res.companies_seen++;
    const ref = hubspotRef('company', c.id);
    try {
      const draft = companyToClient(c);
      let client = clientByRef.get(ref) ?? (() => { const l = linkOf('company', c.id); return l ? st.clients.find((x) => x.id === l.local_id) : undefined; })();
      if (!client) {
        // Bağsız yerel müşteri: alan adı ya da ad eşleşmesi (yalnızca source_ref'i boş olanlar)
        const dom = domainOf(draft.domain);
        client = st.clients.find((x) => !x.source_ref && dom && domainOf(x.domain) === dom) ?? st.clients.find((x) => !x.source_ref && norm(x.name) === norm(draft.name));
        if (client) { await store.updateClient(client.id, { source_ref: ref }); client.source_ref = ref; clientByRef.set(ref, client); log({ direction: 'pull', entity: 'company', entity_id: client.id, external_id: c.id, action: 'linked', ok: true, message: `Mevcut müşteri bağlandı: ${client.name}` }); }
      }
      if (!client) {
        const { id } = await store.createClient(draft);
        client = { id, ...draft, updated_at: c.updatedAt ?? null, synced_at: c.updatedAt ?? null };
        st.clients.push(client); clientByRef.set(ref, client); res.clients_created++;
        log({ direction: 'pull', entity: 'company', entity_id: id, external_id: c.id, action: 'created', ok: true, message: draft.name });
      } else {
        const patch = changed(client as unknown as Record<string, unknown>, draft, ['name', 'sector', 'domain', 'contact']);
        if (Object.keys(patch).length) {
          if (resolveConflict(client, c.updatedAt) === 'push') { res.skipped_conflicts++; log({ direction: 'pull', entity: 'company', entity_id: client.id, external_id: c.id, action: 'skipped_conflict', ok: true, message: `JS daha yeni (${client.updated_at}) · ${Object.keys(patch).join(', ')} uygulanmadı` }); }
          else { await store.updateClient(client.id, patch); Object.assign(client, patch); res.clients_updated++; log({ direction: 'pull', entity: 'company', entity_id: client.id, external_id: c.id, action: 'updated', ok: true, message: Object.keys(patch).join(', ') }); }
        }
      }
      // Marka: şirkete bağlı marka yoksa müşterinin ilk markasını bağla, o da yoksa şirket adıyla tek marka aç.
      let brand = brandByRef.get(ref);
      if (!brand) {
        brand = st.brands.find((b) => b.client_id === client!.id && !b.source_ref);
        if (brand) { await store.updateBrand(brand.id, { source_ref: ref }); brand.source_ref = ref; brandByRef.set(ref, brand); }
      }
      if (!brand) {
        const bd = companyToBrand(c, client.id);
        const { id } = await store.createBrand(bd);
        brand = { id, ...bd }; st.brands.push(brand); brandByRef.set(ref, brand); res.brands_created++;
        log({ direction: 'pull', entity: 'brand', entity_id: id, external_id: c.id, action: 'created', ok: true, message: bd.name });
      }
      companyLocal.set(c.id, { clientId: client.id, brandId: brand.id, name: client.name });
      await store.link({ entity: 'company', local_id: client.id, remote_id: c.id, remote_updated_at: c.updatedAt ?? null, local_updated_at: client.updated_at ?? null });
    } catch (e) { res.errors.push(`şirket ${c.id}: ${e instanceof Error ? e.message : String(e)}`); log({ direction: 'pull', entity: 'company', entity_id: null, external_id: c.id, action: 'error', ok: false, message: e instanceof Error ? e.message : String(e) }); }
  }

  /* kişiler */
  let fallback: { clientId: string; brandId: string | null } | null = null;
  const ensureFallback = async () => {
    if (fallback) return fallback;
    let c = st.clients.find((x) => x.name === FALLBACK_CLIENT);
    if (!c) { const { id } = await store.createClient({ name: FALLBACK_CLIENT, sector: null, domain: null, email: null, contact: null, source_ref: '' }); c = { id, name: FALLBACK_CLIENT }; st.clients.push(c); res.clients_created++; }
    fallback = { clientId: c.id, brandId: st.brands.find((b) => b.client_id === c!.id)?.id ?? null };
    return fallback;
  };
  for (const c of snap.contacts) {
    res.contacts_seen++;
    const ref = hubspotRef('contact', c.id);
    try {
      const companyId = snap.contactCompany[c.id]?.[0] ?? (c.properties?.associatedcompanyid || null);
      const home = (companyId && companyLocal.get(companyId)) || (await ensureFallback());
      const draft = contactToClientContact(c, home.clientId, home.brandId);
      let local = contactByRef.get(ref) ?? (() => { const l = linkOf('contact', c.id); return l ? st.contacts.find((x) => x.id === l.local_id) : undefined; })();
      if (!local && draft.email) { local = st.contacts.find((x) => !x.source_ref && x.email.toLowerCase() === draft.email); if (local) { await store.updateContact(local.id, { source_ref: ref }); local.source_ref = ref; } }
      if (!local) {
        const { id } = await store.createContact(draft);
        local = { id, ...draft }; st.contacts.push(local); contactByRef.set(ref, local); res.contacts_created++;
        log({ direction: 'pull', entity: 'contact', entity_id: id, external_id: c.id, action: 'created', ok: true, message: draft.name });
      } else {
        const keys: Array<keyof ContactDraft & string> = ['name', 'email', 'phone', 'title', 'client_id', 'brand_id'];
        const patch = changed(local as unknown as Record<string, unknown>, draft, keys);
        if (Object.keys(patch).length) {
          if (resolveConflict(local, c.updatedAt) === 'push') { res.skipped_conflicts++; log({ direction: 'pull', entity: 'contact', entity_id: local.id, external_id: c.id, action: 'skipped_conflict', ok: true, message: `JS daha yeni · ${Object.keys(patch).join(', ')} uygulanmadı` }); }
          else { await store.updateContact(local.id, { ...patch, raw: draft.raw }); Object.assign(local, patch); res.contacts_updated++; log({ direction: 'pull', entity: 'contact', entity_id: local.id, external_id: c.id, action: 'updated', ok: true, message: Object.keys(patch).join(', ') }); }
        }
      }
      await store.link({ entity: 'contact', local_id: local.id, remote_id: c.id, remote_updated_at: c.updatedAt ?? null, local_updated_at: local.updated_at ?? null });
    } catch (e) { res.errors.push(`kişi ${c.id}: ${e instanceof Error ? e.message : String(e)}`); log({ direction: 'pull', entity: 'contact', entity_id: null, external_id: c.id, action: 'error', ok: false, message: e instanceof Error ? e.message : String(e) }); }
  }

  /* fırsatlar */
  for (const d of snap.deals) {
    res.deals_seen++;
    const ref = hubspotRef('deal', d.id);
    try {
      const companyId = snap.dealCompany[d.id]?.[0] ?? null;
      const home = companyId ? companyLocal.get(companyId) : undefined;
      const owner = resolveOwner(d.properties?.hubspot_owner_id, snap.owners, st.employees, ownerMap);
      const draft = dealToCrmDeal(d, { brandId: home?.brandId ?? null, company: home?.name ?? '', owner, pipelines: cfg.pipelines ?? [], stageMap: cfg.stage_map ?? {} });
      let local = dealByRef.get(ref) ?? (() => { const l = linkOf('deal', d.id); return l ? st.deals.find((x) => x.id === l.local_id) : undefined; })();
      if (!local) {
        const { id } = await store.createDeal(draft);
        local = { id, ...draft }; st.deals.push(local); dealByRef.set(ref, local); res.deals_created++;
        log({ direction: 'pull', entity: 'deal', entity_id: id, external_id: d.id, action: 'created', ok: true, message: `${draft.title} · ${draft.stage}` });
      } else {
        const keys: Array<keyof DealDraft & string> = ['title', 'stage', 'value_minor', 'close_at', 'hs_pipeline', 'hs_stage', 'next_step', ...(home ? (['brand_id', 'company'] as const) : []), ...(owner ? (['owner'] as const) : [])];
        const patch = changed(local as unknown as Record<string, unknown>, draft, keys);
        if (Object.keys(patch).length) {
          if (resolveConflict(local, d.updatedAt) === 'push') { res.skipped_conflicts++; log({ direction: 'pull', entity: 'deal', entity_id: local.id, external_id: d.id, action: 'skipped_conflict', ok: true, message: `JS daha yeni (${local.updated_at}) · ${Object.keys(patch).join(', ')} uygulanmadı` }); }
          else { await store.updateDeal(local.id, patch); Object.assign(local, patch); res.deals_updated++; log({ direction: 'pull', entity: 'deal', entity_id: local.id, external_id: d.id, action: 'updated', ok: true, message: Object.keys(patch).join(', ') }); }
        }
      }
      await store.link({ entity: 'deal', local_id: local.id, remote_id: d.id, remote_updated_at: d.updatedAt ?? null, local_updated_at: local.updated_at ?? null });
    } catch (e) { res.errors.push(`fırsat ${d.id}: ${e instanceof Error ? e.message : String(e)}`); log({ direction: 'pull', entity: 'deal', entity_id: null, external_id: d.id, action: 'error', ok: false, message: e instanceof Error ? e.message : String(e) }); }
  }
  return { ...res, owner_map: ownerMap };
}

/* ───────── İtme (JS → HubSpot) ───────── */
export interface RemotePorts {
  getOne(object: HubSpotObject, id: string): Promise<HsRecord | null>;
  create(object: HubSpotObject, props: Record<string, string>): Promise<HsRecord>;
  update(object: HubSpotObject, id: string, props: Record<string, string>): Promise<HsRecord>;
  associate(from: HubSpotObject, fromId: string, to: HubSpotObject, toId: string): Promise<unknown>;
}
export interface PushSummary { pushed: number; created_remote: number; skipped_conflicts: number; errors: string[] }
const CAP = { push: 200 };
/**
 * Son senkrondan sonra JS'te değişen (ve HubSpot kaynaklı olmayan) müşteri/kişi/fırsat kayıtlarını HubSpot'a yazar.
 * Bağlı kayıt → PATCH (yalnızca fark; HubSpot daha yeniyse `skipped_conflict`). Bağsız kayıt → `since`'ten (bağlanma anından) sonra
 * JS'te açılmışsa HubSpot'ta oluşturulur ve bağlanır; eski kayıtlar toplu olarak HubSpot'a dökülmez. Yalnızca mode='two_way'.
 */
export async function runPush(store: HubSpotStore, remote: RemotePorts, cfg: HubSpotConfig, log: LogFn, opts: { only?: Array<{ entity: HubSpotEntity; id: string }>; now?: string } = {}): Promise<PushSummary> {
  const out: PushSummary = { pushed: 0, created_remote: 0, skipped_conflicts: 0, errors: [] };
  if (cfg.mode !== 'two_way') return out;
  const st = await store.load();
  const since = cfg.connected_at ? Date.parse(cfg.connected_at) : NaN;
  const createdAfter = (r: { created_at?: string | null }) => !Number.isNaN(since) && !!r.created_at && Date.parse(r.created_at) >= since;
  const want = (entity: HubSpotEntity, id: string) => !opts.only || opts.only.some((o) => o.entity === entity && o.id === id);
  const companyOfClient = (clientId: string) => parseHubSpotRef(st.clients.find((c) => c.id === clientId)?.source_ref)?.id ?? null;
  let n = 0;
  const one = async (entity: HubSpotEntity, object: HubSpotObject, local: { id: string; source_ref?: string | null; updated_at?: string | null; synced_at?: string | null; sync_origin?: string | null; created_at?: string | null }, props: (cur: HsRecord | null) => Record<string, string>, after?: (rec: HsRecord) => Promise<void>) => {
    if (!want(entity, local.id) || n >= CAP.push) return;
    const forced = !!opts.only;
    if (!forced && !needsPush(local)) return;
    n++;
    const remoteId = parseHubSpotRef(local.source_ref)?.id ?? null;
    try {
      if (remoteId) {
        const cur = await remote.getOne(object, remoteId);
        if (!cur) { log({ direction: 'push', entity, entity_id: local.id, external_id: remoteId, action: 'vanished', ok: false, message: 'Kayıt HubSpot’ta bulunamadı' }); out.errors.push(`${entity} ${local.id}: HubSpot’ta yok`); return; }
        const patch = diffProps(props(cur), cur);
        const keys = Object.keys(patch);
        if (!keys.length) return;
        if (!forced && hubspotIsNewer(local.updated_at, cur.updatedAt)) { out.skipped_conflicts++; log({ direction: 'push', entity, entity_id: local.id, external_id: remoteId, action: 'skipped_conflict', ok: true, message: `HubSpot daha yeni (${cur.updatedAt}) · ${keys.join(', ')} itilmedi` }); return; }
        const rec = await remote.update(object, remoteId, patch);
        await store.link({ entity, local_id: local.id, remote_id: remoteId, remote_updated_at: rec.updatedAt ?? null, local_updated_at: local.updated_at ?? null });
        out.pushed++; log({ direction: 'push', entity, entity_id: local.id, external_id: remoteId, action: 'updated', ok: true, message: keys.join(', ') });
        return;
      }
      if (local.source_ref || (!forced && !createdAfter(local))) return;
      const rec = await remote.create(object, props(null));
      const ref = hubspotRef(entity, rec.id);
      if (entity === 'company') await store.updateClient(local.id, { source_ref: ref });
      else if (entity === 'contact') await store.updateContact(local.id, { source_ref: ref });
      else await store.updateDeal(local.id, { source_ref: ref });
      await store.link({ entity, local_id: local.id, remote_id: rec.id, remote_updated_at: rec.updatedAt ?? null, local_updated_at: local.updated_at ?? null });
      if (after) await after(rec).catch((e) => log({ direction: 'push', entity, entity_id: local.id, external_id: rec.id, action: 'warning', ok: false, message: `ilişki kurulamadı: ${e instanceof Error ? e.message : String(e)}` }));
      out.created_remote++; log({ direction: 'push', entity, entity_id: local.id, external_id: rec.id, action: 'created', ok: true, message: 'HubSpot’ta oluşturuldu' });
    } catch (e) { out.errors.push(`${entity} ${local.id}: ${e instanceof Error ? e.message : String(e)}`); log({ direction: 'push', entity, entity_id: local.id, external_id: remoteId, action: 'error', ok: false, message: e instanceof Error ? e.message : String(e) }); }
  };
  for (const c of st.clients) if (c.name !== FALLBACK_CLIENT) await one('company', 'companies', c, () => clientToCompanyProps(c));
  for (const c of st.contacts) {
    const companyId = companyOfClient(c.client_id);
    await one('contact', 'contacts', c, () => contactToProps(c), companyId ? async (rec) => { await remote.associate('contacts', rec.id, 'companies', companyId); } : undefined);
  }
  for (const d of st.deals) {
    const brand = st.brands.find((b) => b.id === d.brand_id);
    const companyId = brand ? parseHubSpotRef(brand.source_ref)?.id ?? companyOfClient(brand.client_id) : null;
    await one('deal', 'deals', d, (cur) => dealToProps(d, cfg, cur), companyId ? async (rec) => { await remote.associate('deals', rec.id, 'companies', companyId); } : undefined);
  }
  return out;
}

/* ───────── Supabase deposu ───────── */
type Row = Record<string, unknown>;
const mark = () => ({ sync_origin: 'hubspot', synced_at: new Date().toISOString() });
export class SupabaseHubSpotStore implements HubSpotStore {
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
  /** Çalışanlar + e-posta (auth.users üzerinden; servis rolü). */
  async employees(): Promise<Employee[]> {
    const emps = await this.all<{ id: string; name: string; auth_user_id: string | null }>('employees', 'id,name,auth_user_id');
    const emails = new Map<string, string>();
    try {
      for (let page = 1; page <= 10; page++) {
        const { data, error } = await this.admin.auth.admin.listUsers({ page, perPage: 1000 });
        if (error || !data?.users?.length) break;
        for (const u of data.users) if (u.email) emails.set(u.id, u.email);
        if (data.users.length < 1000) break;
      }
    } catch { /* e-posta eşlemesi yoksa ad eşleşmesine düşer */ }
    return emps.map((e) => ({ id: e.id, name: e.name, email: e.auth_user_id ? emails.get(e.auth_user_id) ?? null : null }));
  }
  async load(): Promise<StoreState> {
    const [clients, brands, contacts, dealRows, employees, links] = await Promise.all([
      this.all<LocalClient & { created_at?: string }>('clients', 'id,name,sector,domain,email,contact,source_ref,updated_at,synced_at,sync_origin,created_at'),
      this.all<LocalBrand>('brands', 'id,client_id,name,sector,status,source_ref,updated_at,synced_at,sync_origin'),
      this.all<LocalContact & { created_at?: string }>('client_contacts', 'id,client_id,brand_id,name,email,phone,title,source_ref,updated_at,synced_at,sync_origin,created_at'),
      this.all<Row>('crm_deals', '*'),
      this.employees(),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      this.all<Link>('integration_links', 'entity,local_id,remote_id,remote_updated_at', (q: any) => q.eq('provider', 'hubspot')),
    ]);
    const deals = dealRows.map((r) => { const { data, ...rest } = r; return { ...rest, ...((data as Row | null) ?? {}) } as unknown as LocalDeal; });
    return { clients, brands, contacts, deals, employees, links };
  }
  private async ins(table: string, row: Row) {
    const r = await this.admin.from(table).insert({ ...row, org_id: this.orgId, ...mark() }).select('id').single();
    if (r.error) throw new Error(r.error.message);
    return r.data as { id: string };
  }
  private async upd(table: string, id: string, row: Row) {
    const { error } = await this.admin.from(table).update({ ...row, ...mark() }).eq('id', id).eq('org_id', this.orgId);
    if (error) throw new Error(error.message);
  }
  createClient(d: ClientDraft) { return this.ins('clients', { name: d.name, sector: d.sector, domain: d.domain, email: d.email, contact: d.contact, source_ref: d.source_ref || null }); }
  updateClient(id: string, p: Partial<ClientDraft>) { return this.upd('clients', id, p as Row); }
  createBrand(d: BrandDraft) { return this.ins('brands', { client_id: d.client_id, name: d.name, sector: d.sector, status: d.status, source_ref: d.source_ref }); }
  updateBrand(id: string, p: Partial<BrandDraft>) { return this.upd('brands', id, p as Row); }
  createContact(d: ContactDraft) { return this.ins('client_contacts', { ...d }); }
  updateContact(id: string, p: Partial<ContactDraft>) { return this.upd('client_contacts', id, p as Row); }
  /** crm_deals: brand_id/source_ref gerçek kolon, geri kalanı data jsonb (COLLECTIONS.native ile aynı). */
  private dealRow(d: Partial<DealDraft>, cur: Row = {}) {
    const { brand_id, source_ref, ...rest } = d;
    const data = { ...((cur.data as Row | null) ?? {}), ...rest };
    return { ...(brand_id !== undefined ? { brand_id } : {}), ...(source_ref !== undefined ? { source_ref } : {}), data };
  }
  createDeal(d: DealDraft) { return this.ins('crm_deals', this.dealRow(d)); }
  async updateDeal(id: string, p: Partial<DealDraft>) {
    const { data, error } = await this.admin.from('crm_deals').select('data').eq('id', id).eq('org_id', this.orgId).maybeSingle();
    if (error) throw new Error(error.message);
    await this.upd('crm_deals', id, this.dealRow(p, (data as Row | null) ?? {}));
  }
  async link(l: Link & { local_updated_at?: string | null }) {
    const row = { org_id: this.orgId, provider: 'hubspot', entity: l.entity, local_id: l.local_id, remote_id: l.remote_id, remote_updated_at: l.remote_updated_at, local_updated_at: l.local_updated_at ?? null, synced_at: new Date().toISOString() };
    const { error } = await this.admin.from('integration_links').upsert(row, { onConflict: 'provider,entity,remote_id' });
    if (error) throw new Error(error.message);
  }
}

/* ───────── Üst düzey akışlar (Supabase + HubSpot HTTP) ───────── */
const credsOf = (cfg: HubSpotConfig | null): HubSpotConfig => { if (!cfg) throw new HubSpotApiError(400, 'HubSpot bağlı değil'); return cfg; };
async function fetchSnapshot(c: HubSpotClient, since: string | null, log: LogFn): Promise<{ snap: HubSpotSnapshot; pipelines: HubSpotPipeline[]; capped: boolean }> {
  const [owners, pipelines] = await Promise.all([c.owners(), c.dealPipelines()]);
  const [co, ct, de] = await Promise.all([c.changedSince('companies', since), c.changedSince('contacts', since), c.changedSince('deals', since)]);
  const capped = co.capped || ct.capped || de.capped;
  if (capped) log({ direction: 'pull', entity: 'integration', entity_id: null, external_id: null, action: 'warning', ok: false, message: 'Arama 10.000 sonuç sınırına ulaştı — tam içe aktarmayı çalıştır' });
  const [contactCompany, dealCompany] = await Promise.all([
    ct.rows.length ? c.associations('contacts', 'companies', ct.rows.map((r) => r.id)) : {},
    de.rows.length ? c.associations('deals', 'companies', de.rows.map((r) => r.id)) : {},
  ]);
  return { snap: { companies: co.rows, contacts: ct.rows, deals: de.rows, owners, contactCompany, dealCompany }, pipelines, capped };
}
/** Tam içe aktarma (tüm şirket/kişi/fırsat). Sonunda last_sync_at, owner_map, pipelines, counts yazılır. */
export async function importFromHubSpot(admin: SupabaseClient, orgId: string, fetchImpl?: typeof fetch): Promise<HubSpotImportResult> {
  const cfg = credsOf(await loadHubSpotConfig(admin, orgId));
  if (cfg.mode === 'off') throw new HubSpotApiError(400, 'HubSpot entegrasyonu kapalı');
  const c = new HubSpotClient(cfg.token, { fetchImpl });
  const now = new Date().toISOString();
  const logs: HubSpotLogDraft[] = []; const log: LogFn = (e) => logs.push(e);
  const { snap, pipelines } = await fetchSnapshot(c, null, log);
  const store = new SupabaseHubSpotStore(admin, orgId);
  const res = await runPull(snap, store, { ...cfg, pipelines }, log);
  const { owner_map, ...out } = res;
  await saveHubSpotConfig(admin, orgId, { last_sync_at: now, pipelines, owner_map, owners_count: snap.owners.length, counts: { companies: snap.companies.length, contacts: snap.contacts.length, deals: snap.deals.length } });
  logs.push({ direction: 'pull', entity: 'integration', entity_id: null, external_id: null, action: 'import', ok: out.errors.length === 0, message: `şirket ${out.companies_seen} · kişi ${out.contacts_seen} · fırsat ${out.deals_seen} · yeni müşteri ${out.clients_created} · yeni kişi ${out.contacts_created} · yeni fırsat ${out.deals_created} · atlanan ${out.skipped_conflicts}${out.errors.length ? ` · hata ${out.errors.length}` : ''}` });
  await writeHubSpotLog(admin, orgId, logs);
  await admin.from('audit_events').insert({ org_id: orgId, action: 'hubspot.import', resource: 'integrations/hubspot', meta: { ...out, unmapped_owners: out.unmapped_owners.length } }).then(() => undefined, () => undefined);
  return out;
}
/** Artımlı çekme (since'ten beri değişenler). */
export async function pullHubSpot(admin: SupabaseClient, orgId: string, since: string | null, fetchImpl?: typeof fetch): Promise<HubSpotImportResult> {
  const cfg = credsOf(await loadHubSpotConfig(admin, orgId));
  const c = new HubSpotClient(cfg.token, { fetchImpl });
  const logs: HubSpotLogDraft[] = []; const log: LogFn = (e) => logs.push(e);
  const { snap } = await fetchSnapshot(c, since, log);
  const { owner_map, ...out } = await runPull(snap, new SupabaseHubSpotStore(admin, orgId), cfg, log);
  await saveHubSpotConfig(admin, orgId, { owner_map });
  await writeHubSpotLog(admin, orgId, logs);
  return out;
}
const remotePorts = (c: HubSpotClient): RemotePorts => ({ getOne: (o, id) => c.getOne(o, id), create: (o, p) => c.create(o, p), update: (o, id, p) => c.update(o, id, p), associate: (f, fi, t, ti) => c.associate(f, fi, t, ti) });
/** Tek kaydı (müşteri / kişi / fırsat) hemen iter — JS yazımından sonra tarayıcıdan best-effort çağrılır. */
export async function pushHubSpotNow(admin: SupabaseClient, orgId: string, entity: HubSpotEntity, id: string, fetchImpl?: typeof fetch): Promise<PushSummary | { skipped: 'mode' | 'not_connected' }> {
  const cfg = await loadHubSpotConfig(admin, orgId);
  if (!cfg) return { skipped: 'not_connected' };
  if (cfg.mode !== 'two_way') return { skipped: 'mode' };
  const logs: HubSpotLogDraft[] = [];
  const r = await runPush(new SupabaseHubSpotStore(admin, orgId), remotePorts(new HubSpotClient(cfg.token, { fetchImpl })), cfg, (e) => logs.push(e), { only: [{ entity, id }] });
  await writeHubSpotLog(admin, orgId, logs);
  return r;
}
/**
 * Saatlik uzlaştırma (mode ≠ off): (iki yönlü) JS'te değişenleri it → last_sync_at'ten beri HubSpot'ta değişenleri çek → last_sync_at.
 * Çekim itmeden sonra gelir ki JS'ten yazılan değer HubSpot'tan geri okunup (aynı değer) sakin kalsın.
 */
export async function reconcileHubSpot(admin: SupabaseClient, orgId: string, fetchImpl?: typeof fetch): Promise<HubSpotReconcileSummary> {
  const out: HubSpotReconcileSummary = { org_id: orgId, pulled: 0, pushed: 0, created_remote: 0, skipped_conflicts: 0, errors: [] };
  const cfg = await loadHubSpotConfig(admin, orgId);
  if (!cfg) return { ...out, skipped: 'not_connected' };
  if (cfg.mode === 'off') return { ...out, skipped: 'off' };
  const c = new HubSpotClient(cfg.token, { fetchImpl });
  const now = new Date().toISOString();
  const since = cfg.last_sync_at ?? null;
  const logs: HubSpotLogDraft[] = []; const log: LogFn = (e) => logs.push({ ...e, direction: e.direction === 'pull' ? 'reconcile' : e.direction });
  const store = new SupabaseHubSpotStore(admin, orgId);
  if (cfg.mode === 'two_way') {
    const p = await runPush(store, remotePorts(c), cfg, log);
    out.pushed = p.pushed; out.created_remote = p.created_remote; out.skipped_conflicts += p.skipped_conflicts; out.errors.push(...p.errors.map((e) => `itme: ${e}`));
  }
  const { snap, pipelines } = await fetchSnapshot(c, since, log);
  const { owner_map, ...r } = await runPull(snap, store, { ...cfg, pipelines }, log);
  out.pulled = r.clients_created + r.clients_updated + r.contacts_created + r.contacts_updated + r.deals_created + r.deals_updated;
  out.skipped_conflicts += r.skipped_conflicts; out.errors.push(...r.errors);
  logs.push({ direction: 'reconcile', entity: 'integration', entity_id: null, external_id: null, action: 'reconcile', ok: out.errors.length === 0, message: `çekilen ${out.pulled} · itilen ${out.pushed} · HubSpot’ta yeni ${out.created_remote} · atlanan ${out.skipped_conflicts}${out.errors.length ? ` · hata ${out.errors.length}` : ''}` });
  await writeHubSpotLog(admin, orgId, logs);
  await saveHubSpotConfig(admin, orgId, { last_sync_at: now, pipelines, owner_map, owners_count: snap.owners.length });
  return out;
}

/* ───────── Webhook (isteğe bağlı; HubSpot herkese açık uygulama gerektirir) ───────── */
export interface HubSpotWebhookEvent { objectId: number | string; subscriptionType: string; eventId?: number; occurredAt?: number; propertyName?: string; changeSource?: string }
/** X-HubSpot-Signature-v3 = base64(HMAC-SHA256(method + uri + body + timestamp, client secret)); 5 dakikadan eski zaman damgası reddedilir. */
export function verifyHubSpotSignatureV3(p: { method: string; url: string; body: string; timestamp: string | null | undefined; signature: string | null | undefined; secret: string | undefined; now?: number; maxAgeMs?: number }): boolean {
  if (!p.secret || !p.signature || !p.timestamp) return false;
  const ts = Number(p.timestamp);
  if (!Number.isFinite(ts) || Math.abs((p.now ?? Date.now()) - ts) > (p.maxAgeMs ?? 5 * 60_000)) return false;
  const expected = createHmac('sha256', p.secret).update(`${p.method.toUpperCase()}${p.url}${p.body}${p.timestamp}`).digest('base64');
  const a = Buffer.from(p.signature.trim()), b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}
/** Olaylardaki nesneleri HubSpot'tan yeniden okuyup aynı çekme çekirdeğiyle uygular. Silme olayları günlüğe yazılır (yerel kayıt korunur). */
export async function applyHubSpotWebhook(admin: SupabaseClient, orgId: string, events: HubSpotWebhookEvent[], fetchImpl?: typeof fetch): Promise<{ applied: number; deleted: number; ignored: number }> {
  const cfg = credsOf(await loadHubSpotConfig(admin, orgId));
  if (cfg.mode === 'off') return { applied: 0, deleted: 0, ignored: events.length };
  const c = new HubSpotClient(cfg.token, { fetchImpl });
  const ids: Record<HubSpotObject, Set<string>> = { companies: new Set(), contacts: new Set(), deals: new Set() };
  const logs: HubSpotLogDraft[] = [];
  let deleted = 0, ignored = 0;
  for (const ev of events) {
    const [kind, action] = ev.subscriptionType.split('.');
    const object: HubSpotObject | null = kind === 'company' ? 'companies' : kind === 'contact' ? 'contacts' : kind === 'deal' ? 'deals' : null;
    if (!object) { ignored++; continue; }
    if (action === 'deletion' || action === 'privacyDeletion') { deleted++; logs.push({ direction: 'pull', entity: kind as HubSpotEntity, entity_id: null, external_id: String(ev.objectId), action: 'deleted_remote', ok: true, message: 'HubSpot’ta silindi; yerel kayıt korundu' }); continue; }
    ids[object].add(String(ev.objectId));
  }
  const [companies, contacts, deals] = await Promise.all([
    ids.companies.size ? c.batchRead('companies', [...ids.companies]) : [], ids.contacts.size ? c.batchRead('contacts', [...ids.contacts]) : [], ids.deals.size ? c.batchRead('deals', [...ids.deals]) : [],
  ]);
  const [owners, contactCompany, dealCompany] = await Promise.all([c.owners(), contacts.length ? c.associations('contacts', 'companies', contacts.map((r) => r.id)) : {}, deals.length ? c.associations('deals', 'companies', deals.map((r) => r.id)) : {}]);
  const snap: HubSpotSnapshot = { companies, contacts, deals, owners, contactCompany, dealCompany };
  const r = await runPull(snap, new SupabaseHubSpotStore(admin, orgId), cfg, (e) => logs.push(e));
  await writeHubSpotLog(admin, orgId, logs);
  return { applied: r.clients_created + r.clients_updated + r.contacts_created + r.contacts_updated + r.deals_created + r.deals_updated, deleted, ignored };
}

/* ───────── Olay hattı: Supabase deposu yazdıktan sonra (cron /api/events/dispatch) ───────── */
export interface SyncEventLike { type: string; aggregate: string; payload: { new?: Record<string, unknown> | null; old?: Record<string, unknown> | null } & Record<string, unknown> }
const ENTITY_OF: Record<string, HubSpotEntity> = { clients: 'company', client_contacts: 'contact', crm_deals: 'deal' };
/** Olay JS → HubSpot itmesi gerektirir mi? (two_way, ilgili tablo, HubSpot kaynaklı değil) */
export function shouldPushHubSpotEvent(ev: SyncEventLike, cfg: Pick<HubSpotConfig, 'mode'> | null): { push: false; reason: string } | { push: true; entity: HubSpotEntity; id: string } {
  if (!cfg || cfg.mode !== 'two_way') return { push: false, reason: 'mode' };
  const entity = ENTITY_OF[ev.aggregate];
  if (!entity || !/\.(insert|update)$/.test(ev.type)) return { push: false, reason: 'not_crm' };
  const n = ev.payload.new;
  if (!n) return { push: false, reason: 'no_row' };
  if (n.sync_origin === 'hubspot' || ev.payload.origin === 'hubspot') return { push: false, reason: 'origin' };
  const ref = typeof n.source_ref === 'string' ? n.source_ref : null;
  if (ref && !ref.startsWith('hubspot:')) return { push: false, reason: 'foreign_ref' };
  return { push: true, entity, id: String(n.id) };
}
/** Dispatcher portu: olaydan itme (hata yutulur, günlüğe düşer). cfgCache org başına. */
export async function syncHubSpotEvent(admin: SupabaseClient, ev: SyncEventLike & { org_id: string }, cache: Map<string, HubSpotConfig | null>) {
  if (!ENTITY_OF[ev.aggregate]) return;
  if (!cache.has(ev.org_id)) cache.set(ev.org_id, await loadHubSpotConfig(admin, ev.org_id).catch(() => null));
  const d = shouldPushHubSpotEvent(ev, cache.get(ev.org_id) ?? null);
  if (!d.push) return;
  await pushHubSpotNow(admin, ev.org_id, d.entity, d.id);
}
export type { DealStage };
