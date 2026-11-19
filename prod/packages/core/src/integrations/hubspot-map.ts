import { DEAL_STAGES, hubspotRef, parseHubSpotRef, type DealStage, type HubSpotConfig, type HubSpotPipeline } from '@jscore/contracts';
import { fold, jsEditedSinceSync, resolveEmployee } from './trello-map';
import type { HsOwner, HsRecord } from './hubspot';

/**
 * HubSpot ↔ JS CRM eşleme çekirdeği: SAF fonksiyonlar (G/Ç yok).
 *  companies → clients (+ markası yoksa şirket adıyla tek varsayılan brand), contacts → client_contacts, deals → crm_deals,
 *  owners → employees (e-posta, yoksa ad eşleşmesi). Dış id `source_ref='hubspot:<entity>:<id>'` + integration_links.
 *  Çakışma: son yazan kazanır (0010 saati: JS yazması yalnızca updated_at > synced_at ise sayılır; HubSpot updatedAt ile karşılaştırılır).
 */

/* ───────── Yerel şekiller (kullanılan alanlar) ───────── */
export interface SyncStamp { updated_at?: string | null; synced_at?: string | null; sync_origin?: string | null; created_at?: string | null }
export interface LocalClient extends SyncStamp { id: string; name: string; sector?: string | null; domain?: string | null; email?: string | null; contact?: string | null; source_ref?: string | null }
export interface LocalBrand extends SyncStamp { id: string; client_id: string; name: string; sector?: string | null; status?: string; source_ref?: string | null }
export interface LocalContact extends SyncStamp { id: string; client_id: string; brand_id: string | null; name: string; email: string; phone: string; title: string; source_ref?: string | null }
export interface LocalDeal extends SyncStamp {
  id: string; brand_id: string | null; company: string; title: string; stage: DealStage; value_minor: number; owner: string; source: string; next_step: string;
  source_ref?: string | null; close_at?: string | null; hs_pipeline?: string | null; hs_stage?: string | null;
}
export interface Employee { id: string; name: string; email?: string | null }

/* ───────── Yardımcılar ───────── */
const P = (r: HsRecord, k: string) => { const v = r.properties?.[k]; return v == null ? '' : String(v).trim(); };
const nz = (s: string) => (s === '' ? null : s);
export const UNASSIGNED_OWNER = 'hubspot';
/** HubSpot `amount` (ondalık, para birimi) → kuruş. Boş/geçersiz → 0. */
export const amountToMinor = (amount: string | null | undefined): number => { const n = Number(String(amount ?? '').replace(',', '.')); return Number.isFinite(n) && n > 0 ? Math.round(n * 100) : 0; };
export const minorToAmount = (minor: number): string => (Math.round(minor) / 100).toFixed(2);
/** HubSpot tarih özelliği (epoch ms ya da ISO) → ISO; boş → null. */
export function hsDate(v: string | null | undefined): string | null {
  if (!v) return null;
  const n = /^\d{10,}$/.test(v) ? Number(v) : Date.parse(v);
  return Number.isNaN(n) ? null : new Date(n).toISOString();
}
export const refId = (ref: string | null | undefined) => parseHubSpotRef(ref)?.id ?? null;

/* ───────── Company → client / brand ───────── */
export interface ClientDraft { name: string; sector: string | null; domain: string | null; email: string | null; contact: string | null; source_ref: string }
export function companyToClient(c: HsRecord): ClientDraft {
  const domain = nz(P(c, 'domain') || P(c, 'website').replace(/^https?:\/\//, '').replace(/^www\./, '').replace(/\/.*$/, ''));
  return { name: P(c, 'name') || domain || `HubSpot şirket ${c.id}`, sector: nz(P(c, 'industry')), domain, email: null, contact: nz(P(c, 'phone')), source_ref: hubspotRef('company', c.id) };
}
export interface BrandDraft { client_id: string; name: string; sector: string | null; status: 'active' | 'risky' | 'prospect'; source_ref: string }
/** lifecyclestage customer → active; diğerleri aday (prospect). */
export function companyToBrand(c: HsRecord, clientId: string): BrandDraft {
  const lc = P(c, 'lifecyclestage').toLowerCase();
  return { client_id: clientId, name: P(c, 'name') || P(c, 'domain') || `HubSpot şirket ${c.id}`, sector: nz(P(c, 'industry')), status: lc === 'customer' || lc === 'evangelist' ? 'active' : 'prospect', source_ref: hubspotRef('company', c.id) };
}

/* ───────── Contact → client_contacts ───────── */
export const contactName = (c: HsRecord) => [P(c, 'firstname'), P(c, 'lastname')].filter(Boolean).join(' ') || P(c, 'email') || `HubSpot kişi ${c.id}`;
export interface ContactDraft { client_id: string; brand_id: string | null; name: string; email: string; phone: string; title: string; source_ref: string; raw: Record<string, unknown> }
export function contactToClientContact(c: HsRecord, clientId: string, brandId: string | null): ContactDraft {
  return { client_id: clientId, brand_id: brandId, name: contactName(c), email: P(c, 'email').toLowerCase(), phone: P(c, 'phone') || P(c, 'mobilephone'), title: P(c, 'jobtitle'), source_ref: hubspotRef('contact', c.id), raw: { ...c.properties, hs_updated_at: c.updatedAt ?? null } };
}

/* ───────── Pipeline aşaması → JS fırsat aşaması ───────── */
export const stageKey = (pipelineId: string, stageId: string) => `${pipelineId}:${stageId}`;
type Stage = HubSpotPipeline['stages'][number];
/** Sezgisel: kapanış (won/lost) etiket ya da olasılık, teklif/sözleşme sözcükleri, görüşme/sunum sözcükleri, ilk aşama → new. */
export function defaultStageFor(s: Stage, index: number, count: number): DealStage {
  const f = fold(s.label);
  if (/closedwon|kazan|won(?![a-z])|anlas/.test(f) || /^closedwon$/.test(s.id) || s.probability === 1) return 'won';
  if (/closedlost|kayb|lost|iptal|olumsuz/.test(f) || /^closedlost$/.test(s.id) || s.probability === 0) return 'lost';
  if (/teklif|proposal|quote|sozlesme|contract|karar|decision|negot|muzakere/.test(f)) return 'proposal';
  if (index === 0) return 'new';
  if (/gorus|meeting|sunum|present|qualif|nitel|kesif|discovery|demo|randevu/.test(f)) return 'talk';
  // konum tabanlı: son çeyrek → teklif, orta → görüşme
  if (count > 2 && index >= Math.floor((count - 1) * 0.6)) return 'proposal';
  return index === 0 ? 'new' : 'talk';
}
/** Tüm pipeline aşamaları için varsayılan eşleme ('<pipeline>:<stage>' → DealStage); mevcut eşlemeler korunur. */
export function buildDefaultStageMap(pipelines: ReadonlyArray<HubSpotPipeline>, existing: Readonly<Record<string, DealStage>> = {}): Record<string, DealStage> {
  const out: Record<string, DealStage> = { ...existing };
  for (const p of pipelines) {
    const stages = [...p.stages].sort((a, b) => a.display_order - b.display_order);
    stages.forEach((s, i) => { const k = stageKey(p.id, s.id); if (!out[k]) out[k] = defaultStageFor(s, i, stages.length); });
  }
  return out;
}
/** HubSpot (pipeline, dealstage) → JS aşaması: açık eşleme → aşama id'si tek başına → sezgisel → 'new'. */
export function mapStage(pipelineId: string, stageId: string, pipelines: ReadonlyArray<HubSpotPipeline>, stageMap: Readonly<Record<string, DealStage>> = {}): DealStage {
  const explicit = stageMap[stageKey(pipelineId, stageId)] ?? stageMap[stageId];
  if (explicit && (DEAL_STAGES as readonly string[]).includes(explicit)) return explicit;
  const p = pipelines.find((x) => x.id === pipelineId) ?? pipelines.find((x) => x.stages.some((s) => s.id === stageId));
  if (!p) return 'new';
  const stages = [...p.stages].sort((a, b) => a.display_order - b.display_order);
  const i = stages.findIndex((s) => s.id === stageId);
  return i < 0 ? 'new' : defaultStageFor(stages[i], i, stages.length);
}
/** JS aşaması → HubSpot aşaması (geri yazım): aynı pipeline'da o JS aşamasına eşlenen ilk (sıraya göre) aşama; yoksa null (dealstage yazılmaz). */
export function reverseStage(stage: DealStage, pipelineId: string | null | undefined, pipelines: ReadonlyArray<HubSpotPipeline>, stageMap: Readonly<Record<string, DealStage>> = {}): string | null {
  const p = pipelines.find((x) => x.id === pipelineId) ?? pipelines[0];
  if (!p) return null;
  const stages = [...p.stages].sort((a, b) => a.display_order - b.display_order);
  const hit = stages.find((s, i) => (stageMap[stageKey(p.id, s.id)] ?? stageMap[s.id] ?? defaultStageFor(s, i, stages.length)) === stage);
  return hit?.id ?? null;
}

/* ───────── Owner → çalışan ───────── */
const emailKey = (e: string | null | undefined) => (e ?? '').trim().toLowerCase();
export const ownerName = (o: HsOwner) => [o.firstName, o.lastName].filter(Boolean).join(' ').trim();
/** Owner id → employee id: owner_map, e-posta (auth kullanıcısı e-postası), sonra tam/ilk ad eşleşmesi (Trello resolveEmployee). */
export function resolveOwner(ownerId: string | null | undefined, owners: ReadonlyArray<HsOwner>, employees: ReadonlyArray<Employee>, ownerMap: Readonly<Record<string, string>> = {}): string | null {
  if (!ownerId) return null;
  const mapped = ownerMap[ownerId];
  if (mapped && employees.some((e) => e.id === mapped)) return mapped;
  const o = owners.find((x) => String(x.id) === String(ownerId));
  if (!o) return null;
  const em = emailKey(o.email);
  if (em) { const byMail = employees.filter((e) => emailKey(e.email) === em); if (byMail.length === 1) return byMail[0].id; }
  const name = ownerName(o);
  return name ? resolveEmployee(name, employees) : null;
}
/** Tüm owner'lar için eşleme + eşlenemeyenler (e-posta ya da ad). */
export function buildOwnerMap(owners: ReadonlyArray<HsOwner>, employees: ReadonlyArray<Employee>, existing: Readonly<Record<string, string>> = {}): { owner_map: Record<string, string>; unmapped: Array<{ id: string; label: string }> } {
  const owner_map: Record<string, string> = {};
  const unmapped: Array<{ id: string; label: string }> = [];
  for (const o of owners) {
    if (o.archived) continue;
    const emp = resolveOwner(String(o.id), owners, employees, existing);
    if (emp) owner_map[String(o.id)] = emp; else unmapped.push({ id: String(o.id), label: o.email || ownerName(o) || String(o.id) });
  }
  return { owner_map, unmapped };
}
/** employee id → owner id (owner_map'in tersi; fırsat geri yazımında hubspot_owner_id). */
export const reverseOwner = (employeeId: string | null | undefined, ownerMap: Readonly<Record<string, string>>): string | null => Object.entries(ownerMap).find(([, e]) => e === employeeId)?.[0] ?? null;

/* ───────── Deal → crm_deals ───────── */
export interface DealDraft {
  brand_id: string | null; company: string; title: string; stage: DealStage; value_minor: number; owner: string; source: string; next_step: string;
  source_ref: string; close_at: string | null; hs_pipeline: string | null; hs_stage: string | null;
}
export interface DealCtx { brandId: string | null; company: string; owner: string | null; pipelines: ReadonlyArray<HubSpotPipeline>; stageMap: Readonly<Record<string, DealStage>> }
export function dealToCrmDeal(d: HsRecord, ctx: DealCtx): DealDraft {
  const pipeline = P(d, 'pipeline') || 'default'; const hsStage = P(d, 'dealstage');
  return {
    brand_id: ctx.brandId, company: ctx.company || P(d, 'dealname') || '—', title: P(d, 'dealname') || `HubSpot fırsat ${d.id}`, stage: mapStage(pipeline, hsStage, ctx.pipelines, ctx.stageMap),
    value_minor: amountToMinor(P(d, 'amount')), owner: ctx.owner ?? UNASSIGNED_OWNER, source: 'HubSpot', next_step: P(d, 'hs_next_step').slice(0, 500),
    source_ref: hubspotRef('deal', d.id), close_at: hsDate(P(d, 'closedate')), hs_pipeline: nz(pipeline), hs_stage: nz(hsStage),
  };
}

/* ───────── Çakışma kuralı: son yazan kazanır (0010 saati) ───────── */
export function isHubSpotOriginWrite(t: SyncStamp): boolean {
  if (t.sync_origin === 'hubspot') return true;
  const u = t.updated_at ? Date.parse(t.updated_at) : NaN, s = t.synced_at ? Date.parse(t.synced_at) : NaN;
  return !Number.isNaN(u) && !Number.isNaN(s) && u <= s;
}
/**
 * 'pull' = HubSpot uygulanır; 'push' = JS daha yeni (HubSpot'tan gelen değişiklik atlanır, skipped_conflict).
 * JS ancak gerçek bir JS yazması varsa (updated_at > synced_at) VE HubSpot updatedAt'inden yeniyse kazanır.
 */
export function resolveConflict(local: SyncStamp, remoteUpdatedAt: string | null | undefined): 'pull' | 'push' {
  if (!jsEditedSinceSync(local.updated_at, local.synced_at)) return 'pull';
  const l = Date.parse(local.updated_at as string), r = remoteUpdatedAt ? Date.parse(remoteUpdatedAt) : NaN;
  if (Number.isNaN(r)) return 'pull';
  return l > r ? 'push' : 'pull';
}
/** HubSpot kaydı JS'ten yeniyse JS → HubSpot yazımı atlanır (HubSpot kazanır). */
export const hubspotIsNewer = (localUpdatedAt: string | null | undefined, remoteUpdatedAt: string | null | undefined) => {
  const l = localUpdatedAt ? Date.parse(localUpdatedAt) : NaN, r = remoteUpdatedAt ? Date.parse(remoteUpdatedAt) : NaN;
  return !Number.isNaN(l) && !Number.isNaN(r) && l <= r;
};
/** JS'te son senkrondan sonra düzenlenmiş ve HubSpot kaynaklı olmayan (geri itme adayı) mı? */
export const needsPush = (t: SyncStamp) => !!t.updated_at && !isHubSpotOriginWrite(t) && (!t.synced_at || jsEditedSinceSync(t.updated_at, t.synced_at));

/* ───────── JS → HubSpot özellikleri ───────── */
const str = (v: unknown) => (v == null ? '' : String(v));
export function clientToCompanyProps(c: Pick<LocalClient, 'name' | 'sector' | 'domain' | 'contact'>): Record<string, string> {
  const p: Record<string, string> = { name: c.name };
  if (c.sector) p.industry = c.sector;
  if (c.domain) p.domain = c.domain;
  if (c.contact) p.phone = c.contact;
  return p;
}
export function contactToProps(c: Pick<LocalContact, 'name' | 'email' | 'phone' | 'title'>): Record<string, string> {
  const [first, ...rest] = c.name.trim().split(/\s+/);
  const p: Record<string, string> = { firstname: first ?? '', lastname: rest.join(' ') };
  if (c.email) p.email = c.email.toLowerCase();
  if (c.phone) p.phone = c.phone;
  if (c.title) p.jobtitle = c.title;
  return p;
}
export function dealToProps(d: Pick<LocalDeal, 'title' | 'value_minor' | 'stage' | 'owner' | 'next_step' | 'close_at' | 'hs_pipeline'>, cfg: Pick<HubSpotConfig, 'pipelines' | 'stage_map' | 'owner_map'>, current?: HsRecord | null): Record<string, string> {
  const p: Record<string, string> = { dealname: d.title, amount: minorToAmount(d.value_minor) };
  const pipeline = d.hs_pipeline ?? current?.properties?.pipeline ?? cfg.pipelines?.[0]?.id ?? null;
  // Aşama: HubSpot'taki mevcut aşama zaten aynı JS aşamasına eşleniyorsa dokunma (alt aşamalar korunur).
  const curStage = current?.properties?.dealstage ?? null;
  const same = curStage && pipeline && mapStage(pipeline, curStage, cfg.pipelines ?? [], cfg.stage_map) === d.stage;
  if (!same) { const target = reverseStage(d.stage, pipeline, cfg.pipelines ?? [], cfg.stage_map); if (target) { p.dealstage = target; if (pipeline) p.pipeline = pipeline; } }
  const owner = reverseOwner(d.owner, cfg.owner_map ?? {});
  if (owner) p.hubspot_owner_id = owner;
  if (d.next_step) p.hs_next_step = d.next_step;
  if (d.close_at) p.closedate = d.close_at;
  return p;
}
/** Yalnızca FARKLI özellikler (boş yama = yapılacak bir şey yok). Para alanları sayısal, tarihler gün bazında karşılaştırılır. */
export function diffProps(wanted: Record<string, string>, current: HsRecord | null | undefined): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(wanted)) {
    const cur = str(current?.properties?.[k]).trim();
    if (k === 'amount') { if (amountToMinor(v) !== amountToMinor(cur)) out[k] = v; continue; }
    if (k === 'closedate') { if ((hsDate(v) ?? '').slice(0, 10) !== (hsDate(cur) ?? '').slice(0, 10)) out[k] = v; continue; }
    if (v.trim() !== cur) out[k] = v;
  }
  return out;
}
