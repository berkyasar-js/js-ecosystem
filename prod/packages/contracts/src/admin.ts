import type { Role } from './index';

/* ───────── Ana Yönetim Paneli (apps/admin) ───────── */
/** Yalnızca bu roller apps/admin'e girebilir. */
export const ADMIN_ROLES: readonly Role[] = ['owner', 'org_admin'];
export const isAdminRole = (r: string | null | undefined): r is Role => !!r && (ADMIN_ROLES as readonly string[]).includes(r);

/** Yönetim panelinde yaşayan modüller: kullanıcı uygulamasında (apps/web) menüde yoktur, rotaları taşındı bildirimine yönlenir. */
export const ADMIN_ONLY_MODULES = ['board', 'admin', 'integrations', 'automations', 'marketplace'] as const;
export const isAdminOnlyModule = (id: string) => (ADMIN_ONLY_MODULES as readonly string[]).includes(id);

export interface MembershipLite { org_id: string; role: string; status?: string | null }
export type AdminGuard = { ok: true; orgId: string; role: Role } | { ok: false; reason: 'no_session' | 'no_membership' | 'forbidden' | 'disabled' };
/**
 * Yönetim paneli yetki kararı (saf). Oturum yoksa no_session; hiç üyelik yoksa no_membership;
 * devre dışı üyelik disabled; owner/org_admin değilse forbidden. Birden çok org varsa tercih edilen (cookie) org'da yönetici olunmalı,
 * yoksa yönetici olunan ilk org seçilir.
 */
export function guardAdmin(userId: string | null | undefined, memberships: MembershipLite[], preferredOrg?: string | null): AdminGuard {
  if (!userId) return { ok: false, reason: 'no_session' };
  if (!memberships.length) return { ok: false, reason: 'no_membership' };
  const active = memberships.filter((m) => (m.status ?? 'active') === 'active');
  if (!active.length) return { ok: false, reason: 'disabled' };
  const admins = active.filter((m) => isAdminRole(m.role));
  if (!admins.length) return { ok: false, reason: 'forbidden' };
  const pick = (preferredOrg && admins.find((m) => m.org_id === preferredOrg)) || admins[0];
  return { ok: true, orgId: pick.org_id, role: pick.role as Role };
}
/** Yalnızca owner, başka bir owner'ı değiştirebilir/silebilir; org_admin owner rolüne dokunamaz. */
export const canAssignRole = (actor: Role, target: Role) => actor === 'owner' || (actor === 'org_admin' && target !== 'owner');

/* ───────── Özellik anahtarları (feature_toggles) ───────── */
export interface FeatureDef {
  /** `<modül>.<özellik>` — organizations.settings.feature_toggles anahtarı. */
  key: string; module: string; label: string; desc: string;
  /** Verilirse: ModulePage'de bu kimlikli sekme, özellik kapalıyken gizlenir. */
  tab?: string;
  /** Sunucu tarafında da uygulanan ajan (POST /api/agents/run). */
  agent?: string;
}
const F = (module: string, id: string, label: string, desc: string, extra: Partial<FeatureDef> = {}): FeatureDef => ({ key: `${module}.${id}`, module, label, desc, ...extra });
export const FEATURES: FeatureDef[] = [
  F('tasks', 'board_view', 'Pano görünümü', 'Proje/görev ekranında Kanban "Pano" sekmesi.'),
  F('tasks', 'bids', 'Ajan ihalesi', 'Görevde "İhale" düğmesi ve ikiz teklifleri (twin_bid).', { agent: 'twin_bid' }),
  F('tasks', 'comments', 'Yorumlar', 'Görev ayrıntısında Yorumlar sekmesi.'),
  F('tasks', 'checklists', 'Checklist', 'Görev ayrıntısında Checklist sekmesi.'),
  F('tasks', 'files', 'Dosyalar', 'Görev ayrıntısında Dosyalar (Storage) sekmesi.'),
  F('tasks', 'cover', 'Kapak', 'Görev ayrıntısında Kapak sekmesi.'),
  F('tasks', 'trello_sync', 'Trello kaynağı göstergeleri', 'Görevlerde "Trello" rozeti ve kaynak satırı (asıl eşitleme Entegrasyonlar\'dan yönetilir).'),
  F('inbox', 'ai_drafts', 'AI görev taslakları', 'Gelen kutusunda "AI görev taslakları" düğmesi (inbox_drafts ajanı).', { agent: 'inbox_drafts' }),
  F('studio', 'ai_drafts', 'AI Composer', 'JS Studio AI konsept taslağı sekmesi (studio_draft ajanı).', { tab: 'composer', agent: 'studio_draft' }),
  F('crm', 'health_scores', 'Sağlık skorları', 'Marka/hesap sağlık skoru çubukları ve Account 360 metriği.'),
  F('crm', 'proposals', 'Teklifler', 'Teklif sekmesi ve PDF üretimi.', { tab: 'proposals' }),
  F('finance', 'invoices', 'Faturalar & tahsilat', 'Faturalar sekmesi.', { tab: 'invoices' }),
  F('finance', 'purchasing', 'Satın alma', 'Satın alma sekmesi.', { tab: 'purchasing' }),
  F('finance', 'margin', 'Marj', 'Marj hesabı sekmesi.', { tab: 'margin' }),
  F('finance', 'ledger', 'Şirket defteri', 'Şirket defteri sekmesi.', { tab: 'ledger' }),
  F('people', 'archive', 'Personel arşivi (HRIS)', 'Özlük arşivi sekmesi.', { tab: 'archive' }),
  F('people', 'kolay_ik', 'Kolay İK aktarımı', 'Kolay İK içe aktarım sekmesi.', { tab: 'import' }),
  F('people', 'reports', 'HR raporları', 'HR Reports sekmesi.', { tab: 'reports' }),
  F('hire', 'talent_pool', 'Yetenek havuzu', 'Talent pool sekmesi.', { tab: 'talent' }),
  F('twins', 'bids', 'Görev ihaleleri', 'Dijital ikizler → Görev/İş ihaleleri sekmeleri.'),
  F('insights', 'profitability', 'Proje kârlılığı', 'Project Profitability sekmesi.', { tab: 'profitability' }),
  F('insights', 'funnel', 'Satış hunisi', 'Sales Funnel sekmesi.', { tab: 'funnel' }),
  F('portal', 'surveys', 'Anketler', 'Müşteri portalı anketleri.', { tab: 'surveys' }),
  F('resources', 'rates', 'Freelancer rate card', 'Rate card sekmesi.', { tab: 'rates' }),
];
export const featuresOf = (moduleId: string) => FEATURES.filter((f) => f.module === moduleId);
/** Açıkça false değilse açık. */
export const featureEnabled = (toggles: Record<string, boolean> | undefined | null, key: string) => toggles?.[key] !== false;
/** ModulePage sekme filtresi: kapalı özelliğe bağlı sekmeleri düşer. */
export const tabEnabled = (toggles: Record<string, boolean> | undefined | null, moduleId: string, tab: string) => {
  const f = FEATURES.find((x) => x.module === moduleId && x.tab === tab);
  return !f || featureEnabled(toggles, f.key);
};
/** Ajan → özellik anahtarı (sunucuda uygulanır). */
export const agentFeatureKey = (agent: string): string | null => FEATURES.find((f) => f.agent === agent)?.key ?? null;

/** Yönetim panelinde açılıp kapatılabilen modüller (yönetim modülleri ve ALWAYS_ON hariç). */
export const toggleableModuleIds = (all: Array<{ id: string }>, alwaysOn: readonly string[]) => all.map((m) => m.id).filter((id) => !alwaysOn.includes(id) && id !== 'apps');

/* ───────── Giriş güvenliği ───────── */
export const normalizeDomains = (list: string[] | undefined | null) =>
  Array.from(new Set((list ?? []).map((d) => d.trim().toLowerCase().replace(/^@/, '')).filter(Boolean)));
/** Liste boşsa herkes; doluysa e-posta alan adı listede olmalı (alt alan adı eşleşmez). */
export function emailDomainAllowed(email: string | null | undefined, domains: string[] | undefined | null): boolean {
  const list = normalizeDomains(domains);
  if (!list.length) return true;
  const at = (email ?? '').lastIndexOf('@');
  if (at < 1) return false;
  return list.includes((email as string).slice(at + 1).trim().toLowerCase());
}
/** API anahtarı politikası: izinli kapsam + en uzun ömür. */
export function checkTokenPolicy(policy: { token_max_days?: number; token_allowed_scopes?: string[] } | undefined, req: { scopes: string[]; expires_in_days: number | null | undefined }): string | null {
  const max = policy?.token_max_days ?? 0;
  if (max > 0 && (req.expires_in_days == null || req.expires_in_days > max)) return `Güvenlik politikası: anahtar ömrü en fazla ${max} gün olabilir.`;
  const allowed = policy?.token_allowed_scopes;
  if (allowed?.length) { const bad = req.scopes.filter((s) => !allowed.includes(s)); if (bad.length) return `Güvenlik politikası bu kapsamlara izin vermiyor: ${bad.join(', ')}`; }
  return null;
}
export const ADMIN_AUDIT_PREFIX = 'admin.';
