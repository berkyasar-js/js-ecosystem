import { z } from 'zod';
import { studioDraftOutputSchema } from './modules';

/* ───────── Roller & izinler ───────── */
export const ROLES = [
  'owner', 'org_admin', 'operations', 'account', 'pm', 'creative', 'hr', 'payroll',
  'finance', 'client_admin', 'client_viewer', 'freelancer', 'auditor', 'integration_admin',
] as const;
export type Role = (typeof ROLES)[number];

export const ROLE_LABELS: Record<Role, string> = {
  owner: 'Owner', org_admin: 'Org Admin', operations: 'Operasyon', account: 'Account', pm: 'PM',
  creative: 'Creative', hr: 'İK', payroll: 'Bordro', finance: 'Finans', client_admin: 'Client Admin',
  client_viewer: 'Client Viewer', freelancer: 'Freelancer', auditor: 'Denetçi', integration_admin: 'Entegrasyon Admin',
};
export const isClientRole = (r: Role) => r === 'client_admin' || r === 'client_viewer';

export type Scope = 'own' | 'team' | 'brand' | 'org';
/** Permission = organization + product + resource + action + scope */
export interface Permission { organization: string; product: string; resource: string; action: string; scope: Scope }

/** 'product:resource:action' kalıpları; '*' joker. */
export const ROLE_GRANTS: Record<Role, string[]> = {
  owner: ['*:*:*'],
  org_admin: ['*:*:*'],
  operations: ['work:*:*', 'crm:*:*', 'resources:*:*', 'core:approval:*', 'intel:*:read', 'comms:*:*'],
  account: ['work:*:*', 'crm:*:*', 'core:approval:decide', 'core:approval:read', 'comms:*:*', 'intel:*:read'],
  pm: ['work:*:*', 'core:approval:decide', 'core:approval:read', 'comms:*:*'],
  creative: ['work:task:*', 'work:project:read', 'creative:*:*', 'core:approval:read', 'comms:*:*'],
  hr: ['people:*:*', 'hr:hr_archive:*', 'work:project:read', 'core:approval:decide'],
  payroll: ['payroll:*:*', 'people:employee:read', 'finance:invoice:read'],
  finance: ['finance:*:*', 'crm:*:read', 'work:project:read', 'core:approval:decide'],
  client_admin: ['portal:*:*', 'work:project:read', 'work:task:read', 'core:approval:decide', 'comms:message:*'],
  client_viewer: ['portal:*:read', 'work:project:read', 'work:task:read', 'comms:message:read'],
  freelancer: ['work:task:read', 'work:task:update', 'creative:*:read', 'comms:message:*'],
  auditor: ['*:*:read'],
  integration_admin: ['connect:*:*', 'core:audit:read'],
};
/** Owner/Org-admin için varsayılan olarak kapalı alanlar (açık grant gerekir). */
const DEFAULT_DENY: Array<{ product?: string; resource?: string }> = [{ product: 'payroll' }, { resource: 'hr_archive' }];

const match = (pat: string, v: string) => pat === '*' || pat === v;
export function hasPermission(role: Role, product: string, resource: string, action: string, extraGrants: string[] = []): boolean {
  const ok = (grants: string[]) => grants.some((g) => {
    const [p, r, a] = g.split(':');
    return match(p, product) && match(r, resource) && match(a, action);
  });
  if (ok(extraGrants)) return true;
  if ((role === 'owner' || role === 'org_admin') && DEFAULT_DENY.some((d) => (!d.product || d.product === product) && (!d.resource || d.resource === resource))) return false;
  return ok(ROLE_GRANTS[role]);
}

/** Onay kararı: kim hangi required_role'ü karara bağlayabilir. */
export function canDecideApproval(role: Role, required: Role): boolean {
  if (role === 'owner') return true;
  if (role === 'org_admin') return required !== 'owner';
  if (role === required) return true;
  if (required === 'pm') return role === 'operations' || role === 'account';
  if (required === 'account') return role === 'operations';
  return false;
}

/* ───────── Modül kataloğu (prototip ile aynı id'ler) ───────── */
export type ModuleGroup = 'main' | 'work' | 'creative' | 'people' | 'intel' | 'manage' | 'hidden';
export interface ModuleDef { id: string; name: string; group: ModuleGroup; icon: string; desc: string; slug: string; live: boolean }
const M = (id: string, name: string, group: ModuleGroup, icon: string, desc: string, live = false, slug = id): ModuleDef => ({ id, name, group, icon, desc, live, slug });
export const MODULES: ModuleDef[] = [
  M('overview', 'Genel Bakış', 'main', 'dashboard', 'Role göre KPI, bugünün odağı ve AI önerisi.', true),
  M('inbox', 'Akıllı Gelen Kutusu', 'main', 'inbox', 'Gmail → CRM eşleştirme → AI görev taslağı → onay.', true),
  M('mywork', 'Benim İşlerim', 'main', 'mywork', 'Görevlerim, zaman girişi, odak modu ve günlük plan.', true),
  M('messages', 'Mesajlar', 'main', 'messages', 'Kanallar ve proje konuşmaları.', true),
  M('crm', 'JS CRM', 'work', 'crm', 'Hesaplar, markalar, kişiler, lead’ler, teklif ve sözleşmeler.', true),
  M('projects', 'JS Work · Projeler', 'work', 'projects', 'Proje şablonları, kilometre taşları ve kapsam değişikliği.', true),
  M('tasks', 'JS Work · Görevler', 'work', 'tasks', '8 kolonlu Kanban, etiket, yorum, SLA ve zaman.', true),
  M('flow', 'JS Flow', 'work', 'flow', 'Aşama planı, sahipler ve akış darboğazları.', true),
  M('resources', 'JS Resources', 'work', 'resources', 'Kapasite ısı haritası, izin, beceri, ekipman ve zimmet.', true),
  M('finance', 'JS Finance', 'work', 'finance', 'Teklif, bütçe, gider, tedarikçi, fatura, tahsilat ve marj.', true),
  M('studio', 'JS Studio', 'creative', 'studio', 'Brand Memory, brief, AI konsept taslağı ve sürümler.', true),
  M('social', 'JS Social', 'creative', 'social', 'Marka × ay içerik takvimi, pipeline ve kota takibi.', true),
  M('media', 'JS Media', 'creative', 'media', 'Vimeo metadata, MinIO/S3 dosyaları, saklama süreleri.', true),
  M('review', 'JS Review', 'creative', 'review', 'Zaman kodlu yorum, sürüm, revize turu ve onay.', true),
  M('transfer', 'JS Transfer', 'creative', 'transfer', 'Yükleme, süreli paylaşım linki, indirme logu, dosya isteme.', true),
  M('present', 'JS Present', 'creative', 'present', 'Teklif belgesi, sunum taslağı, aylık rapor ve şablonlar.', true),
  M('marketing', 'JS Marketing', 'creative', 'marketing', 'Segmentler, mailing, otomatik diziler, bülten ve huni.', true),
  M('events', 'JS Events', 'creative', 'events', 'Run-of-show, tedarikçi, saha kontrolü, LCV ve bütçe.', true),
  M('people', 'JS People', 'people', 'people', 'Personel kartı, izin, zimmet, imza seti, onboarding ve devir.', true),
  M('hire', 'JS Hire', 'people', 'hire', 'Açık pozisyonlar, aday kanbanı, puan formu ve teklif.', true),
  M('portal', 'JS Client Portal', 'people', 'portal', 'Müşteri gözünden açık işler, onaylar, talep ve dosyalar.', true),
  M('board', 'Yönetim Kurulu', 'intel', 'board', 'Dokuz ajan, haftalık kurul ve kurucu kararları.', true),
  M('twins', 'Dijital İkizler', 'intel', 'twins', 'Kişi ve rol ikizleri, kapasite ve iş ihaleleri.', true),
  M('insights', 'JS Insights', 'intel', 'insights', 'Satış hunisi, kapasite, marj, müşteri sağlığı, veri kalitesi.', true),
  M('automations', 'JS Automation', 'manage', 'automation', 'Olay akışı, ajan çalıştırmaları ve maliyet tavanı.', true),
  M('integrations', 'JS Connect', 'manage', 'connect', 'Entegrasyonlar, MCP sunucuları, API ve webhook’lar.', true, 'connect'),
  M('approvals', 'Onay Merkezi', 'manage', 'approvals', 'İçerik, bütçe, kapsam dışı iş, müşteri kararı, yetki.', true),
  M('admin', 'JS Core · Admin', 'manage', 'admin', 'Admin Control Center: erişim, güvenlik, faturalama, veri.', true),
  M('marketplace', 'Ürünler & Paketler', 'manage', 'marketplace', 'Ürün paketleri, feature flag ve yetkilendirme.', true),
  M('profile', 'Profilim', 'manage', 'profile', 'Kapsam, ikiz ayarları, bildirim ve güvenlik.', true),
  M('apps', 'Uygulamalar', 'hidden', 'apps', 'Tüm modüller tek ekranda.', true),
];
export const GROUP_LABELS: Record<ModuleGroup, string> = {
  main: 'ANA MENÜ', work: 'AJANS OPERASYONU', creative: 'ÜRETİM & MEDYA', people: 'İNSAN & MÜŞTERİ', intel: 'ZEKÂ', manage: 'YÖNETİM & SİSTEM', hidden: '',
};
const ALL_IDS = MODULES.map((m) => m.id);
const MANAGER = ['overview', 'inbox', 'mywork', 'messages', 'crm', 'projects', 'tasks', 'flow', 'resources', 'people', 'studio', 'social', 'media', 'review', 'transfer', 'present', 'marketing', 'events', 'portal', 'board', 'twins', 'insights', 'automations', 'integrations', 'approvals', 'marketplace', 'profile', 'apps'].filter((x) => x !== 'board');
const CLIENT = ['overview', 'mywork', 'messages', 'projects', 'tasks', 'media', 'review', 'transfer', 'portal', 'approvals', 'profile', 'apps'];
export const ROLE_MODULES: Record<Role, string[]> = {
  owner: ALL_IDS, org_admin: ALL_IDS, operations: MANAGER, account: MANAGER,
  pm: MANAGER.filter((x) => !['board', 'marketplace'].includes(x)),
  creative: ['overview', 'mywork', 'messages', 'projects', 'tasks', 'flow', 'studio', 'social', 'media', 'review', 'transfer', 'present', 'events', 'twins', 'approvals', 'profile', 'apps'],
  finance: ['overview', 'mywork', 'messages', 'crm', 'projects', 'tasks', 'finance', 'insights', 'approvals', 'integrations', 'profile', 'apps'],
  hr: ['overview', 'mywork', 'messages', 'projects', 'tasks', 'resources', 'people', 'hire', 'insights', 'approvals', 'profile', 'apps'],
  payroll: ['overview', 'mywork', 'people', 'finance', 'insights', 'approvals', 'profile', 'apps'],
  client_admin: CLIENT,
  client_viewer: CLIENT.filter((x) => x !== 'approvals'),
  freelancer: ['overview', 'mywork', 'messages', 'tasks', 'review', 'transfer', 'profile', 'apps'],
  auditor: ['overview', 'insights', 'approvals', 'automations', 'admin', 'profile', 'apps'],
  integration_admin: ['overview', 'integrations', 'automations', 'admin', 'profile', 'apps'],
};
export const canAccessModule = (role: Role, id: string) => ROLE_MODULES[role].includes(id);

/* ───────── Domain sabitleri ───────── */
export const TASK_STATES = ['brief', 'scope', 'plan', 'production', 'internal_review', 'approval', 'delivery', 'archive'] as const;
export type TaskState = (typeof TASK_STATES)[number];
export const TASK_STATE_LABELS: Record<TaskState, string> = {
  brief: 'Brief', scope: 'Kapsam', plan: 'Plan', production: 'Üretim', internal_review: 'İç revize', approval: 'Onay', delivery: 'Teslim', archive: 'Arşiv',
};
export type Priority = 'low' | 'normal' | 'high';
export const AGENTS = ['chair', 'ceo', 'cfo', 'coo', 'cmo', 'cto', 'chro', 'cco', 'clo', 'inbox_drafts', 'twin_person', 'twin_role', 'twin_bid', 'studio_draft'] as const;
export type AgentName = (typeof AGENTS)[number];
export const BOARD_AGENTS = AGENTS.slice(0, 9) as readonly AgentName[];

/* ───────── Tablo tipleri (snake_case = DB kolonları) ───────── */
export interface Organization { id: string; name: string; slug: string }
export interface Membership { id: string; user_id: string; org_id: string; role: Role; scopes: Record<string, unknown> }
export interface Me {
  id: string; name: string; email: string; initials: string; title: string; role: Role; org_id: string;
  employee_id?: string; client_id?: string; brand_ids: string[]; scopes: string[];
}
export interface TeamMember { id: string; org_id: string; name: string; role_title: string; app_role: Role; status: 'active' | 'left'; weekly_hours: number }
export interface Brand {
  id: string; org_id: string; client_id: string; name: string; sector: string; status: 'active' | 'risky' | 'prospect';
  account_owner: string; art_director: string; copywriter: string; compliance_flags: string[]; monthly_quota: Record<string, number>;
  health: number; internal: boolean; contact?: string; email?: string;
}
export interface StagePlanItem { stage: TaskState; owner: string; due_at: string; done: boolean }
export interface Project {
  id: string; org_id: string; brand_id: string; name: string; type: string; status: 'planning' | 'active' | 'done' | 'paused';
  flow_stage: TaskState; flow_owner: string; stage_plan: StagePlanItem[]; due_at: string | null; budget_minor: number; summary: string; client_visible: boolean;
  /** Trello içe aktarma bağı ('trello:board:<id>'). */
  source_ref?: string | null;
}
export interface Task {
  id: string; org_id: string; project_id: string; title: string; assignee_id: string | null; state: TaskState; priority: Priority;
  due_at: string | null; planned_minutes: number; task_type: string; qty: number; source_ref: string | null; labels: string[]; client_visible: boolean; created_at: string;
  /** Trigger ile yazılır (0008): son-yazan-kazanır karşılaştırması için. */
  updated_at?: string; sync_origin?: string | null; synced_at?: string | null;
  /** 0012: Trello kartı açıklaması + kapağı (renk ya da görev eki). */
  description?: string | null; cover?: TaskCover | null;
}
/* ───────── Görev ayrıntıları (0012): yorum, checklist, ek, kapak ───────── */
export const COVER_COLORS = ['green', 'yellow', 'orange', 'red', 'purple', 'blue', 'sky', 'lime', 'pink', 'black'] as const;
export type CoverColor = (typeof COVER_COLORS)[number];
export const COVER_COLOR_LABELS: Record<CoverColor, string> = { green: 'Yeşil', yellow: 'Sarı', orange: 'Turuncu', red: 'Kırmızı', purple: 'Mor', blue: 'Mavi', sky: 'Gökyüzü', lime: 'Limon', pink: 'Pembe', black: 'Siyah' };
/** Kapak: renk ya da bir görev ekinin id'si (görsel). İkisi birden yok → kapaksız (null). */
export interface TaskCover { color?: CoverColor | null; attachment_id?: string | null }
export const MAX_ATTACHMENT_BYTES = 25 * 1024 * 1024;
/** Eşzamanlı Trello eşlemesi için ortak alanlar: external_id (Trello id) + döngü işaretçisi. */
interface SyncFields { external_id?: string | null; sync_origin?: string | null; synced_at?: string | null; updated_at?: string }
export interface TaskComment extends SyncFields { id: string; org_id: string; task_id: string; author_id: string | null; author_name: string; body: string; created_at: string }
export interface TaskCheckItem extends SyncFields { id: string; org_id: string; checklist_id: string; name: string; checked: boolean; position: number; due_at: string | null; assignee_id: string | null; created_at?: string }
export interface TaskChecklist extends SyncFields { id: string; org_id: string; task_id: string; name: string; position: number; created_at?: string; items: TaskCheckItem[] }
export interface TaskAttachment extends SyncFields { id: string; org_id: string; task_id: string; name: string; url: string; mime: string; bytes: number; storage_path: string | null; uploaded_by: string | null; created_at: string }
/** TaskRow / pano kartı rozetleri (Trello rozetleri gibi). */
export interface TaskBadges { comments: number; attachments: number; checkTotal: number; checkDone: number }
export interface TaskType { key: string; label: string; sla_hours: number; default_minutes: number; unit_price_minor: number }
export type ApprovalAction = 'content' | 'budget' | 'scope' | 'client_decision' | 'access';
export interface Approval {
  id: string; org_id: string; action_type: ApprovalAction; title: string;
  subject: { project_id?: string; brand_id?: string; amount_minor?: number; version?: string; note?: string; bid_id?: string; task_id?: string };
  required_role: Role; status: 'pending' | 'approved' | 'rejected'; requested_by: string; decided_by: string | null; decided_at: string | null;
  decision_note: string | null; due_at: string; created_at: string;
}
export interface Channel { id: string; org_id: string; name: string; kind: 'channel' | 'dm' | 'inbox'; brand_id: string | null }
export interface Message {
  id: string; org_id: string; channel_id: string; author_id: string; author_name: string; body: string;
  meta: { from?: string; subject?: string; brand_id?: string } & Record<string, unknown>; created_at: string;
}
export interface Integration { id: string; org_id: string; provider: string; name: string; status: 'connected' | 'available' | 'error'; scopes: string[]; secret_ref: string | null; last_sync_at?: string | null }
export interface McpServer { id: string; org_id: string; name: string; url: string; status: 'connected' | 'available'; tools: string[] }
export interface AccessToken {
  id: string; org_id: string; name: string; token_prefix: string; scopes: string[]; created_at: string; last_used_at: string | null;
  user_id?: string | null; expires_at?: string | null; revoked_at?: string | null;
}
/** API anahtarı kapsamları: 'mcp' (/api/mcp), 'webhooks' (/api/webhooks) ve ürün bazlı okuma izinleri (ROLE_GRANTS ürünleri). */
export const API_TOKEN_PRODUCTS = ['work', 'crm', 'resources', 'finance', 'intel', 'comms'] as const;
export const API_TOKEN_SCOPES = ['mcp', 'webhooks', ...API_TOKEN_PRODUCTS.map((p) => `${p}:read`)] as readonly string[];
/** Anahtar oluşturabilen roller (RLS tok_w ile aynı). */
export const TOKEN_ADMIN_ROLES: Role[] = ['owner', 'org_admin', 'integration_admin'];
export const tokenCreateSchema = z.object({
  name: z.string().trim().min(2).max(80),
  scopes: z.array(z.string().refine((s) => API_TOKEN_SCOPES.includes(s), 'Geçersiz kapsam')).min(1).max(API_TOKEN_SCOPES.length),
  /** null/yok = süresiz. */
  expires_in_days: z.number().int().min(1).max(730).nullable().optional(),
});
export type TokenCreate = z.input<typeof tokenCreateSchema>;
export interface Webhook { id: string; org_id: string; provider: string; url: string; events: string[]; active: boolean }
export interface ConnectData { integrations: Integration[]; mcp_servers: McpServer[]; webhooks: Webhook[]; tokens: AccessToken[] }
export interface Member { user_id: string; name: string; email: string; role: Role; status: 'active' | 'invited' }
export interface AgentPrompt { id: string; agent: AgentName; version: number; system_prompt: string; model: string; output_schema: Record<string, unknown>; is_active: boolean }
export interface AgentRun {
  id: string; org_id: string; agent: AgentName; trigger: string; input: unknown; output: unknown; model: string;
  tokens_in: number; tokens_out: number; cost_usd: number; latency_ms: number; status: 'ok' | 'error' | 'demo'; created_at: string;
}
export type BoardAnswer = 'EVET' | 'HAYIR' | 'ERTELE';
export interface BoardDecision {
  id: string; org_id: string; proposal_id: string; proposed_by: AgentName; level: 1 | 2 | 3; action: string; rationale: string;
  risk: 'low' | 'medium' | 'high'; votes: Record<string, 'yes' | 'no' | 'abstain'>; status: 'pending' | 'approved' | 'rejected' | 'deferred';
  founder_answer: BoardAnswer | null; created_at: string; decided_at: string | null;
}
export interface Twin {
  id: string; org_id: string; employee_id: string | null; kind: 'person' | 'role'; name: string; profile: Record<string, unknown>;
  defaults: Record<string, unknown>; preferences: Record<string, unknown>; opt_out: boolean; approved_by_owner_at: string | null;
}
/** Teklif atama / ihaleye açma yetkisi (RLS assign_bid ile aynı). */
export const BID_ROLES: Role[] = ['owner', 'org_admin', 'operations', 'account', 'pm'];
export type BidStatus = 'open' | 'won' | 'lost' | 'withdrawn';
/** twins.bids: bir görev için ikiz teklifi. */
export interface TaskBid {
  id: string; org_id: string; task_id: string; twin_id: string; employee_id: string | null; confidence: number; eta_hours: number;
  rationale: string; status: BidStatus; created_at: string;
}
export interface TaskAssignment { id: string; org_id: string; task_id: string; employee_id: string; bid_id: string | null; assigned_by: string; created_at: string }
export type BidAssignResult = { status: 'assigned'; assignment: TaskAssignment } | { status: 'pending_approval'; approval_id: string };
export const bidProposalSchema = z.object({
  twin_id: z.string().min(1), confidence: z.number().min(0).max(100), eta_hours: z.number().min(0.5).max(2000), rationale: z.string().max(600).default(''),
});
export type BidProposal = z.infer<typeof bidProposalSchema>;
export const twinBidOutputSchema = z.object({ summary: z.string(), bids: z.array(bidProposalSchema).max(5) });
export type TwinBidOutput = z.infer<typeof twinBidOutputSchema>;
export interface TwinBid { id: string; title: string; brand: string; budget_minor: number; due_at: string; matches: Array<{ twin_id: string; score: number }> }

/* ───────── zod şemaları ───────── */
export const roleSchema = z.enum(ROLES);
export const taskStateSchema = z.enum(TASK_STATES);
export const taskCreateSchema = z.object({
  project_id: z.string().min(1),
  title: z.string().trim().min(2).max(200),
  assignee_id: z.string().nullable().optional(),
  priority: z.enum(['low', 'normal', 'high']).default('normal'),
  due_at: z.string().min(8),
  planned_minutes: z.number().int().min(0).max(100000).default(0),
  task_type: z.string().min(1).default('general'),
  qty: z.number().int().min(1).max(500).default(1),
  source_ref: z.string().nullable().optional(),
  state: taskStateSchema.default('brief'),
});
export type TaskCreate = z.input<typeof taskCreateSchema>;
export const taskPatchSchema = z.object({
  title: z.string().trim().min(2).max(200).optional(),
  assignee_id: z.string().min(1).nullable().optional(),
  priority: z.enum(['low', 'normal', 'high']).optional(),
  due_at: z.string().min(8).nullable().optional(),
  description: z.string().max(20000).nullable().optional(),
  cover: z.object({ color: z.enum(COVER_COLORS).nullable().optional(), attachment_id: z.string().min(1).nullable().optional() }).nullable().optional(),
}).strict();
export const commentBodySchema = z.string().trim().min(1, 'Yorum boş olamaz').max(20000);
export const checklistNameSchema = z.string().trim().min(1, 'Ad boş olamaz').max(500);
export const checkItemCreateSchema = z.object({ name: z.string().trim().min(1, 'Madde boş olamaz').max(1000), due_at: z.string().min(8).nullable().optional(), assignee_id: z.string().min(1).nullable().optional() });
export const checkItemPatchSchema = z.object({
  name: z.string().trim().min(1).max(1000).optional(), checked: z.boolean().optional(),
  due_at: z.string().min(8).nullable().optional(), assignee_id: z.string().min(1).nullable().optional(),
}).strict();
export type CheckItemCreate = z.input<typeof checkItemCreateSchema>;
export type CheckItemPatch = z.input<typeof checkItemPatchSchema>;
/** Ek ekleme girdisi: dosya (Blob/File) ya da bağlantı. Dosya >25 MB reddedilir. */
export interface AttachmentInput { name?: string; url?: string; file?: Blob; mime?: string }
export type TaskPatch = z.input<typeof taskPatchSchema>;
export const taskMoveSchema = z.object({ id: z.string().min(1), state: taskStateSchema });
export const approvalCreateSchema = z.object({
  action_type: z.enum(['content', 'budget', 'scope', 'client_decision', 'access']),
  title: z.string().trim().min(2).max(200),
  subject: z.object({ project_id: z.string().optional(), brand_id: z.string().optional(), amount_minor: z.number().int().optional(), version: z.string().optional(), note: z.string().optional(), bid_id: z.string().optional(), task_id: z.string().optional() }).default({}),
  required_role: roleSchema,
  due_at: z.string().min(8),
});
export type ApprovalCreate = z.input<typeof approvalCreateSchema>;
export const approvalDecisionSchema = z.object({ decision: z.enum(['approved', 'rejected']), note: z.string().max(1000).optional() });
export const boardAnswerSchema = z.enum(['EVET', 'HAYIR', 'ERTELE']);

export const agentNameSchema = z.enum(AGENTS);
export const agentRunRequestSchema = z.object({ agent: agentNameSchema, input: z.record(z.string(), z.unknown()).default({}),
  /** Yalnızca demo: sunucu durumsuz olduğundan istemci ay içi harcamasını bildirir (Supabase'de yok sayılır). */
  demo_spend_usd: z.number().min(0).optional(), demo_cap_usd: z.number().min(0).optional() });
export const inboxDraftSchema = z.object({
  title: z.string().min(2).max(200),
  task_type: z.string().min(1),
  qty: z.number().int().min(1).max(500).default(1),
  priority: z.enum(['low', 'normal', 'high']).default('normal'),
  due_at: z.string().min(8),
  rationale: z.string().default(''),
});
export type InboxDraft = z.infer<typeof inboxDraftSchema>;
export const inboxDraftsOutputSchema = z.object({ summary: z.string(), drafts: z.array(inboxDraftSchema).max(10) });
export type InboxDraftsOutput = z.infer<typeof inboxDraftsOutputSchema>;
export const boardProposalOutputSchema = z.object({
  summary: z.string(),
  proposals: z.array(z.object({
    action: z.string(), rationale: z.string(), level: z.number().int().min(1).max(3), risk: z.enum(['low', 'medium', 'high']),
  })).max(10),
});
export type BoardProposalOutput = z.infer<typeof boardProposalOutputSchema>;
export const twinOutputSchema = z.object({ summary: z.string(), fit: z.number().min(0).max(100).optional(), notes: z.array(z.string()).default([]) });
export const AGENT_OUTPUT_SCHEMAS = {
  studio_draft: studioDraftOutputSchema,
  inbox_drafts: inboxDraftsOutputSchema,
  twin_person: twinOutputSchema,
  twin_role: twinOutputSchema,
  twin_bid: twinBidOutputSchema,
} as const;
export const outputSchemaFor = (a: AgentName) => (a in AGENT_OUTPUT_SCHEMAS ? AGENT_OUTPUT_SCHEMAS[a as keyof typeof AGENT_OUTPUT_SCHEMAS] : boardProposalOutputSchema);

export const orgSettingsSchema = z.object({
  general: z.object({ name: z.string().min(1), locale: z.string().default('tr-TR'), timezone: z.string().default('Europe/Istanbul'), currency: z.string().default('TRY'), logo_url: z.string().max(500).optional() }),
  notifications: z.object({ rules: z.array(z.object({ event: z.string(), channel: z.enum(['in_app', 'email', 'slack']), enabled: z.boolean() })) }),
  structure: z.object({ flow_stages: z.array(z.string()), work_hours: z.string().default('09:00-18:00') }),
  /** monthly_cap_usd: 0 = tavan yok. usd_try: ₺ gösterimi için kur (varsayılan 40). */
  ai: z.object({ monthly_cap_usd: z.number().min(0), default_model: z.string(), board_enabled: z.boolean(), usd_try: z.number().positive().optional() }),
  security: z.object({
    mfa_required: z.boolean(), session_hours: z.number().int().min(1).max(720), ip_allowlist: z.array(z.string()),
    /** Ana Yönetim Paneli: true → kullanıcı uygulaması her kullanıcıdan TOTP (MFA) kaydı/doğrulaması ister. Varsayılan kapalı (eski `mfa_required` yalnızca bilgi amaçlıydı). */
    require_mfa: z.boolean().optional(),
    /** Google ile girişte izin verilen e-posta alan adları (boş/yok = kısıtlama yok). */
    allowed_email_domains: z.array(z.string()).optional(),
    /** API anahtarı politikası: en uzun ömür (gün; 0/yok = sınırsız izinli) ve izinli kapsamlar (yok = hepsi). */
    token_max_days: z.number().int().min(0).max(3650).optional(),
    token_allowed_scopes: z.array(z.string()).optional(),
  }),
  /** Modül yetkilendirmesi: false → ilgili modül menüden düşer, rotası genel bakışa yönlenir. Anahtar = ürün kimliği (MODULE_PRODUCT) ya da modül kimliği. */
  feature_flags: z.record(z.string(), z.boolean()).optional(),
  /** Modül içi özellik anahtarları (`<modül>.<özellik>`, bkz. FEATURES). false → ilgili düğme/sekme gizlenir. Yoksa açık. */
  feature_toggles: z.record(z.string(), z.boolean()).optional(),
  plan: z.object({ name: z.string(), seats: z.number().int().min(1), period: z.enum(['monthly', 'yearly']) }).optional(),
  industry_packs: z.array(z.string()).optional(),
  white_label: z.object({ enabled: z.boolean(), name: z.string(), color: z.string(), domain: z.string() }).optional(),
});
export type OrgSettings = z.infer<typeof orgSettingsSchema>;
export const orgSettingsPatchSchema = orgSettingsSchema.partial();

export const applySchema = z.object({
  name: z.string().trim().min(2).max(120),
  email: z.string().email(),
  portfolio: z.string().url().optional().or(z.literal('')),
  note: z.string().max(2000).optional(),
  consent: z.literal(true),
});

/* MCP / JSON-RPC */
export const jsonRpcRequestSchema = z.object({
  jsonrpc: z.literal('2.0'),
  id: z.union([z.string(), z.number(), z.null()]).optional(),
  method: z.string(),
  params: z.record(z.string(), z.unknown()).optional(),
});
export type JsonRpcRequest = z.infer<typeof jsonRpcRequestSchema>;
export const mcpCreateTaskDraftArgs = z.object({
  project_id: z.string().min(1), title: z.string().trim().min(2).max(200),
  task_type: z.string().optional(), priority: z.enum(['low', 'normal', 'high']).optional(), due_at: z.string().optional(),
});
export const mcpProjectStatusArgs = z.object({ project_id: z.string().optional() });

export * from './modules';
export * from './admin';

/* ───────── Trello entegrasyonu ───────── */
/** integrations.config (provider='trello'). Gizli alanlar yalnızca sunucuda (servis rolü) okunur/yazılır; istemciye `maskTrelloConfig` görünümü gider. */
export const trelloConfigSchema = z.object({
  api_key: z.string().trim().min(16).max(64),
  token: z.string().trim().min(20).max(200),
  board_ids: z.array(z.string().min(1)).optional(),
  last_sync_at: z.string().optional(),
  /** boardId → Trello webhook id */
  webhook_ids: z.record(z.string()).optional(),
  /** normalize Trello adı → employee id (içe aktarmada yeniden kullanılır) */
  member_map: z.record(z.string()).optional(),
  /** Webhook geri çağrısındaki gizli `k` parametresi (TRELLO_API_SECRET yokken doğrulama) ve kayıtlı callback URL'si. */
  webhook_key: z.string().optional(),
  callback_url: z.string().optional(),
  member_name: z.string().optional(),
  /** Entegrasyonun token sahibi Trello üye id'si: kendi eylemlerimizin webhook yankısı yok sayılır (döngü koruması). */
  token_member_id: z.string().optional(),
  /** Geçiş dönemi anahtarı: iki yönlü / yalnızca Trello→JS / kapalı. */
  mode: z.enum(['two_way', 'pull_only', 'off']).default('two_way'),
  /** İçe aktarmada kurulan tersinir liste eşlemesi: listId → {board, kind, person|stage}. */
  list_map: z.record(z.object({
    board: z.string(), kind: z.enum(['approval', 'delivery', 'production', 'paused', 'plan', 'person', 'ideas', 'other']),
    stage: z.string(), person: z.string().optional(), employee: z.string().optional(), review: z.boolean().optional(),
  })).optional(),
  /** employee id → Trello üye id (member_map'in tersi; kart üyeleri yazılırken kullanılır). */
  member_ids: z.record(z.string()).optional(),
});
export type TrelloConfig = z.infer<typeof trelloConfigSchema>;
export type TrelloMode = 'two_way' | 'pull_only' | 'off';
export const TRELLO_MODES: TrelloMode[] = ['two_way', 'pull_only', 'off'];
export const TRELLO_MODE_LABELS: Record<TrelloMode, string> = { two_way: 'İki yönlü', pull_only: 'Yalnızca Trello → JS', off: 'Kapalı' };
/** public.integration_sync_log satırı. */
export interface SyncLogEntry {
  id?: string; org_id?: string; provider: string; direction: 'push' | 'pull' | 'reconcile'; entity: string; entity_id: string | null;
  external_id: string | null; action: string; ok: boolean; message: string; created_at: string;
}
const NON_CHANGE = new Set(['mode', 'reconcile', 'demo_noop']);
/** "Son senkron · n değişiklik · m hata" için özet: uygulanan değişiklikler (atlananlar ve bilgi satırları hariç) ve hatalar. */
export function summarizeSyncLog(log: ReadonlyArray<Pick<SyncLogEntry, 'ok' | 'action'>>): { changes: number; errors: number } {
  return { changes: log.filter((e) => e.ok && !e.action.startsWith('skipped') && !NON_CHANGE.has(e.action)).length, errors: log.filter((e) => !e.ok).length };
}
export interface TrelloPublicState {
  mode?: TrelloMode; sync_log?: SyncLogEntry[];
  connected: boolean; member_name: string | null; api_key: string | null; token: string | null;
  board_ids: string[]; last_sync_at: string | null; webhook_ids: Record<string, string>; member_map: Record<string, string>;
  boards: Array<{ id: string; name: string }>;
}
const maskTail = (s: string, head: number) => `${s.slice(0, head)}••••${s.slice(-4)}`;
/** İstemciye dönen maskeli görünüm: tam anahtar/token asla yok. */
export function maskTrelloConfig(c: Partial<TrelloConfig> | null | undefined, boards: Array<{ id: string; name: string }> = []): TrelloPublicState {
  const has = !!c?.api_key && !!c?.token;
  return {
    mode: c?.mode ?? 'two_way', connected: has, member_name: c?.member_name ?? null,
    api_key: c?.api_key ? maskTail(c.api_key, 4) : null, token: c?.token ? maskTail(c.token, 0) : null,
    board_ids: c?.board_ids ?? [], last_sync_at: c?.last_sync_at ?? null, webhook_ids: c?.webhook_ids ?? {}, member_map: c?.member_map ?? {}, boards,
  };
}
export interface TrelloImportResult {
  boards: number; lists: number; cards_seen: number; skipped_templates: number;
  brands_created: string[]; projects_created: number; projects_updated: number;
  /** Marka başına tek projeye birleştirilen (boşaltılıp 'done' yapılan) eski proje sayısı. */
  projects_merged?: number;
  tasks_created: number; tasks_updated: number; tasks_unchanged: number;
  /** Son-yazan-kazanır kuralı gereği atlanan (JS'te daha yeni) görev sayısı. */
  tasks_skipped?: number;
  /** Eşlenemeyen kişi adları (kart üyesi veya kişi listesi) ve etkilenen kart sayısı. */
  unmapped_members: Array<{ name: string; cards: number }>;
  /** Kart ayrıntıları (0012): bu çalıştırmada DEĞİŞEN açıklama / kapak / yorum / checklist / madde / ek sayıları. */
  details?: { cards: number; description: number; cover: number; comments: number; checklists: number; check_items: number; attachments: number; skipped_conflicts: number; errors: number };
  errors: string[];
}
export const trelloMemberMapSchema = z.object({ member_map: z.record(z.string().min(1), z.string().min(1)) });
export * from './board-chat';
