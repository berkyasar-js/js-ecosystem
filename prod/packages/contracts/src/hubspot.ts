import { z } from 'zod';
import { DEAL_STAGES, type DealStage } from './modules';
import type { SyncLogEntry } from './index';

/* ───────── HubSpot (CRM) entegrasyonu — geçici iki yönlü senkron ───────── */
/** Ajansın HubSpot portalı (app.hubspot.com/contacts/<hub id>/…). Bağlantı testi gerçek portal id'yi config.portal_id'ye yazar; bağlantılar onu, yoksa bunu kullanır. */
export const HUBSPOT_PORTAL_ID = '149668156';

export type HubSpotMode = 'two_way' | 'pull_only' | 'off';
export const HUBSPOT_MODES: HubSpotMode[] = ['pull_only', 'two_way', 'off'];
export const HUBSPOT_MODE_LABELS: Record<HubSpotMode, string> = { two_way: 'İki yönlü', pull_only: 'Yalnızca HubSpot → JS', off: 'Kapalı' };

/** HubSpot pipeline + aşamaları (bağlantı testinde önbelleğe alınır; aşama eşleme düzenleyicisi bunu listeler). */
export const hubspotPipelineSchema = z.object({
  id: z.string(), label: z.string(),
  stages: z.array(z.object({ id: z.string(), label: z.string(), display_order: z.number().int().default(0), probability: z.number().min(0).max(1).optional() })),
});
export type HubSpotPipeline = z.infer<typeof hubspotPipelineSchema>;

/**
 * integrations.config (provider='hubspot'). Token yalnızca sunucuda okunur/yazılır; istemciye `maskHubSpotConfig` görünümü gider.
 * `stage_map`: '<pipelineId>:<stageId>' → JS fırsat aşaması (new/talk/proposal/won/lost). Eşlenmeyen aşamalar sezgisel kuralla çözülür (hubspot-map).
 * `owner_map`: HubSpot owner id → employee id (e-posta / ad eşleşmesiyle çözülenler + elle düzeltmeler).
 */
export const hubspotConfigSchema = z.object({
  token: z.string().trim().min(20).max(300),
  portal_id: z.string().optional(),
  connected_at: z.string().optional(),
  /** Varsayılan: yalnızca HubSpot → JS (bağlanırken). */
  mode: z.enum(['two_way', 'pull_only', 'off']).default('pull_only'),
  last_sync_at: z.string().optional(),
  stage_map: z.record(z.string(), z.enum(DEAL_STAGES)).optional(),
  pipelines: z.array(hubspotPipelineSchema).optional(),
  owner_map: z.record(z.string(), z.string()).optional(),
  owners_count: z.number().int().optional(),
  /** HubSpot uygulama webhook'u için istemci sırrı (X-HubSpot-Signature-v3). Yoksa webhook kabul edilmez; saatlik uzlaştırma yeter. */
  webhook_secret: z.string().optional(),
  counts: z.object({ companies: z.number().int(), contacts: z.number().int(), deals: z.number().int() }).optional(),
});
export type HubSpotConfig = z.infer<typeof hubspotConfigSchema>;

export interface HubSpotPublicState {
  connected: boolean; token: string | null; portal_id: string; mode: HubSpotMode; last_sync_at: string | null;
  stage_map: Record<string, DealStage>; pipelines: HubSpotPipeline[]; owner_map: Record<string, string>; owners_count: number | null;
  counts: { companies: number; contacts: number; deals: number } | null; webhook_configured: boolean; sync_log?: SyncLogEntry[];
}
const maskTail = (s: string) => `${s.slice(0, 7)}••••${s.slice(-4)}`;
/** İstemciye dönen maskeli görünüm: tam token asla yok. */
export function maskHubSpotConfig(c: Partial<HubSpotConfig> | null | undefined): HubSpotPublicState {
  return {
    connected: !!c?.token, token: c?.token ? maskTail(c.token) : null, portal_id: c?.portal_id ?? HUBSPOT_PORTAL_ID, mode: c?.mode ?? 'pull_only',
    last_sync_at: c?.last_sync_at ?? null, stage_map: c?.stage_map ?? {}, pipelines: c?.pipelines ?? [], owner_map: c?.owner_map ?? {}, owners_count: c?.owners_count ?? null,
    counts: c?.counts ?? null, webhook_configured: !!c?.webhook_secret,
  };
}

/** Tam içe aktarma / çekme sonucu. */
export interface HubSpotImportResult {
  companies_seen: number; contacts_seen: number; deals_seen: number;
  clients_created: number; clients_updated: number; brands_created: number;
  contacts_created: number; contacts_updated: number; deals_created: number; deals_updated: number;
  /** Son-yazan-kazanır gereği atlanan (JS daha yeni) kayıt sayısı. */
  skipped_conflicts: number;
  /** Çalışana eşlenemeyen HubSpot owner'ları (id + e-posta/ad). */
  unmapped_owners: Array<{ id: string; label: string }>;
  errors: string[];
}
export interface HubSpotReconcileSummary {
  org_id: string; skipped?: 'off' | 'not_connected'; pulled: number; pushed: number; created_remote: number; skipped_conflicts: number; errors: string[];
}
export interface HubSpotTestResult { portal_id: string; owners: number; pipelines: HubSpotPipeline[] }

/** source_ref / bağlantı yardımcıları: 'hubspot:<entity>:<id>'. */
export type HubSpotEntity = 'company' | 'contact' | 'deal';
export const hubspotRef = (entity: HubSpotEntity, id: string | number) => `hubspot:${entity}:${id}`;
export function parseHubSpotRef(ref: string | null | undefined): { entity: HubSpotEntity; id: string } | null {
  const m = typeof ref === 'string' ? ref.match(/^hubspot:(company|contact|deal):(\d+)$/) : null;
  return m ? { entity: m[1] as HubSpotEntity, id: m[2] } : null;
}
/** HubSpot arayüz bağlantısı (app.hubspot.com/contacts/<portal>/<record>/<id>). */
export function hubspotUrl(entity: HubSpotEntity, id: string, portalId: string = HUBSPOT_PORTAL_ID): string {
  const seg = entity === 'company' ? 'company' : entity === 'contact' ? 'contact' : 'deal';
  return `https://app.hubspot.com/contacts/${portalId}/${seg}/${id}`;
}
export const hubspotUrlFor = (ref: string | null | undefined, portalId?: string) => { const p = parseHubSpotRef(ref); return p ? hubspotUrl(p.entity, p.id, portalId) : null; };

export const hubspotStageMapSchema = z.object({ stage_map: z.record(z.string().min(1), z.enum(DEAL_STAGES)) });
export const hubspotOwnerMapSchema = z.object({ owner_map: z.record(z.string().min(1), z.string().min(1)) });
export type { DealStage };
