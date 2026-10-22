import { z } from 'zod';
import type { Role } from './index';

const isClientRole = (r: Role) => r === 'client_admin' || r === 'client_viewer';

/* ───────── Koleksiyon kaydı (tek doğruluk kaynağı: Repo, RLS üretici, testler) ───────── */
export type ReadMode = 'internal' | 'brand_all' | 'brand_visible' | Role[];
export interface CollMeta {
  table: string; prefix: string; module: string;
  read: ReadMode; write: Role[]; clientWrite?: Role[];
  /** Gerçek kolon olarak tutulan alanlar (geri kalanı `data jsonb` içinde). */
  native?: string[];
  /** Güncelleme için ayrı rol listesi (varsayılan: write). */
  update?: Role[];
  /** Müşteri rolleri brand_id'si boş kayıtları da görür (ör. anket tanımları). */
  nullBrand?: boolean;
}
const OPS: Role[] = ['owner', 'org_admin', 'operations', 'account', 'pm'];
const OPS_CR: Role[] = [...OPS, 'creative'];
const FIN: Role[] = ['owner', 'org_admin', 'finance'];
const HRW: Role[] = ['owner', 'org_admin', 'hr'];
const CLIENT_W: Role[] = ['client_admin', 'client_viewer'];
/** İzin kararını verebilen roller; çalışan kendi talebini onaylayamaz (UI + Repo kontrol eder). */
export const LEAVE_DECIDERS: Role[] = ['owner', 'org_admin', 'operations', 'account', 'pm', 'hr'];
const C = (table: string, prefix: string, module: string, read: ReadMode, write: Role[], extra: Partial<CollMeta> = {}): CollMeta => ({ table, prefix, module, read, write, ...extra });

export const COLLECTIONS = {
  crm_deals: C('crm_deals', 'd', 'crm', 'internal', OPS),
  crm_contacts: C('crm_contacts', 'ct', 'crm', 'brand_all', OPS),
  crm_proposals: C('crm_proposals', 'pr', 'crm', [...OPS, 'finance', 'auditor'], [...OPS, 'finance']),
  crm_contracts: C('crm_contracts', 'co', 'crm', [...OPS, 'finance', 'auditor'], OPS),
  time_entries: C('time_entries', 'te', 'mywork', 'internal', [...OPS_CR, 'finance', 'hr', 'freelancer'], { native: ['employee_id', 'task_id', 'minutes', 'note', 'worked_on'] }),
  notifications: C('notifications', 'n', 'mywork', 'internal', [...OPS_CR, 'finance', 'hr', 'payroll', 'freelancer']),
  task_requests: C('task_requests', 'tr', 'mywork', 'internal', [...OPS_CR, 'finance', 'hr', 'freelancer']),
  allocations: C('allocations', 'al', 'resources', 'internal', OPS),
  leaves: C('leaves', 'lv', 'resources', 'internal', [...OPS_CR, 'finance', 'hr', 'freelancer'], { update: LEAVE_DECIDERS }),
  skills: C('skills', 'sk', 'resources', 'internal', [...OPS, 'hr']),
  equipment: C('equipment', 'eq', 'resources', 'internal', OPS),
  equipment_bookings: C('equipment_bookings', 'eb', 'resources', 'internal', [...OPS_CR]),
  rate_cards: C('rate_cards', 'rc', 'resources', [...OPS, 'finance', 'auditor'], [...OPS, 'finance']),
  budgets: C('budgets', 'bu', 'finance', [...FIN, 'operations', 'account', 'pm', 'auditor'], [...FIN]),
  expenses: C('expenses', 'ex', 'finance', [...FIN, 'operations', 'auditor'], [...FIN, 'operations']),
  purchase_requests: C('purchase_requests', 'pu', 'finance', [...FIN, 'operations', 'auditor'], [...FIN, 'operations']),
  suppliers: C('suppliers', 'su', 'finance', [...FIN, 'operations', 'auditor'], [...FIN, 'operations']),
  invoices: C('invoices', 'inv', 'finance', [...FIN, 'account', 'auditor', 'payroll'], FIN, { native: ['brand_id', 'project_id', 'number', 'amount_minor', 'status', 'issued_at', 'due_at', 'paid_at'] }),
  ledger_entries: C('ledger_entries', 'le', 'finance', [...FIN, 'auditor'], FIN),
  cost_rates: C('cost_rates', 'cr', 'finance', [...FIN, 'auditor'], FIN),
  hr_profiles: C('hr_profiles', 'hp', 'people', 'internal', HRW),
  hr_docs: C('hr_docs', 'hd', 'people', ['hr'], ['hr']),
  hr_assets: C('hr_assets', 'ha', 'people', ['owner', 'org_admin', 'hr', 'operations'], HRW),
  trainings: C('trainings', 'tn', 'people', ['owner', 'org_admin', 'hr', 'operations'], HRW),
  perf_reviews: C('perf_reviews', 'pf', 'people', ['hr', 'payroll'], ['hr']),
  shifts: C('shifts', 'sh', 'people', ['owner', 'org_admin', 'hr', 'operations', 'payroll'], HRW),
  advances: C('advances', 'av', 'people', ['owner', 'org_admin', 'hr', 'finance', 'payroll'], [...HRW, 'finance']),
  checklists: C('checklists', 'ck', 'people', ['owner', 'org_admin', 'hr', 'operations'], HRW),
  payroll_runs: C('payroll_runs', 'pay', 'people', ['payroll'], ['payroll']),
  import_batches: C('import_batches', 'ib', 'people', ['owner', 'org_admin', 'hr'], HRW),
  jobs: C('jobs', 'jb', 'hire', ['owner', 'org_admin', 'hr', 'operations'], HRW),
  candidates: C('candidates', 'cd', 'hire', ['owner', 'org_admin', 'hr', 'operations'], HRW),
  interviews: C('interviews', 'iv', 'hire', ['owner', 'org_admin', 'hr', 'operations'], [...HRW, 'operations']),
  offers: C('offers', 'of', 'hire', ['owner', 'org_admin', 'hr'], HRW),
  client_requests: C('client_requests', 'rq', 'portal', 'brand_all', OPS, { clientWrite: ['client_admin'] }),
  surveys: C('surveys', 'sv', 'portal', 'brand_all', [...OPS, 'hr'], { native: ['title'], nullBrand: true }),
  survey_responses: C('survey_responses', 'sr', 'portal', 'brand_all', OPS, { clientWrite: CLIENT_W, native: ['survey_id', 'brand_id'] }),
  media_assets: C('media_assets', 'ma', 'media', 'brand_visible', OPS_CR),
  review_comments: C('review_comments', 'rcm', 'review', 'brand_visible', OPS_CR, { clientWrite: CLIENT_W }),
  share_links: C('share_links', 'sl', 'transfer', 'brand_visible', [...OPS_CR, 'freelancer']),
  transfers: C('transfers', 'tf', 'transfer', 'internal', [...OPS_CR, 'freelancer']),
  studio_items: C('studio_items', 'st', 'studio', 'internal', OPS_CR),
  social_posts: C('social_posts', 'sp', 'social', 'brand_visible', OPS_CR),
  decks: C('decks', 'dk', 'present', 'internal', OPS_CR),
  campaigns: C('campaigns', 'cp', 'marketing', 'internal', OPS),
  segments: C('segments', 'sg', 'marketing', 'internal', OPS),
  newsletters: C('newsletters', 'nl', 'marketing', 'internal', OPS),
  mkt_leads: C('mkt_leads', 'ml', 'marketing', 'internal', OPS),
  event_items: C('event_items', 'ev', 'events', 'internal', OPS_CR),
  automations: C('automations', 'au', 'automations', ['owner', 'org_admin', 'operations', 'integration_admin', 'auditor'], ['owner', 'org_admin', 'operations', 'integration_admin']),
  automation_runs: C('automation_runs', 'ar', 'automations', ['owner', 'org_admin', 'operations', 'integration_admin', 'auditor'], ['owner', 'org_admin', 'operations', 'integration_admin']),
} as const satisfies Record<string, CollMeta>;
export type CollKey = keyof typeof COLLECTIONS;
export const COLL_KEYS = Object.keys(COLLECTIONS) as CollKey[];

/** Rolün koleksiyonu okuyup yazabilmesi — DemoRepo, UI ve RLS üretici aynı kuralı paylaşır. */
export function canReadColl(role: Role, kind: CollKey): boolean {
  const m: CollMeta = COLLECTIONS[kind];
  if (Array.isArray(m.read)) return m.read.includes(role);
  if (m.read === 'internal') return !isClientRole(role);
  return m.read === 'brand_all' || m.read === 'brand_visible' ? true : false;
}
export function canWriteColl(role: Role, kind: CollKey): boolean {
  const m: CollMeta = COLLECTIONS[kind];
  return m.write.includes(role) || (m.clientWrite?.includes(role) ?? false);
}

/* ───────── Kayıt tipleri ───────── */
interface Base { id: string; org_id: string; created_at: string }
export const DEAL_STAGES = ['new', 'talk', 'proposal', 'won', 'lost'] as const;
export type DealStage = (typeof DEAL_STAGES)[number];
export const DEAL_STAGE_LABELS: Record<DealStage, string> = { new: 'Yeni', talk: 'Görüşme', proposal: 'Teklif', won: 'Kazanıldı', lost: 'Kaybedildi' };
export interface Deal extends Base { brand_id: string | null; company: string; title: string; stage: DealStage; value_minor: number; owner: string; source: string; next_step: string }
export interface Contact extends Base { brand_id: string; name: string; title: string; email: string; phone: string; primary: boolean; client_visible?: boolean }
export interface QuoteLine { desc: string; qty: number; unit_minor: number }
export interface Proposal extends Base {
  brand_id: string; deal_id: string | null; number: string; title: string; version: number; status: 'draft' | 'sent' | 'accepted' | 'rejected';
  lines: QuoteLine[]; vat_pct: number; payment_terms_days: number; valid_until: string; history: Array<{ version: number; total_minor: number; at: string }>;
}
export interface Contract extends Base {
  brand_id: string; title: string; type: 'retainer' | 'project'; start: string; end: string; monthly_fee_minor: number;
  inclusions: Record<string, number>; revision_limit: number; revisions_used: number; auto_renew: boolean; status: 'active' | 'expiring' | 'ended';
}
export interface TimeEntry extends Base { employee_id: string; task_id: string | null; minutes: number; note: string; worked_on: string; started_at: string | null; ended_at: string | null }
export interface Notification extends Base { employee_id: string; kind: 'task' | 'approval' | 'system' | 'mention'; title: string; body: string; read: boolean; href?: string }
export interface TaskRequest extends Base { task_id: string; employee_id: string; kind: 'snooze' | 'reschedule' | 'help'; note: string; new_due: string | null; to_employee: string | null; status: 'open' | 'done' }
export interface Allocation extends Base { employee_id: string; week: string; hours: number; project_id: string | null; note?: string }
export const LEAVE_TYPES = { yillik: 'Yıllık izin', hastalik: 'Hastalık', mazeret: 'Mazeret', ucretsiz: 'Ücretsiz' } as const;
export interface Leave extends Base { employee_id: string; type: keyof typeof LEAVE_TYPES; start: string; end: string; days: number; status: 'pending' | 'approved' | 'rejected'; note: string }
export interface Skill extends Base { employee_id: string; skill: string; level: number }
export interface Equipment extends Base { name: string; category: string; status: 'available' | 'maintenance' }
export interface EquipmentBooking extends Base { equipment_id: string; employee_id: string; start: string; end: string; project_id: string | null }
export interface RateCard extends Base { name: string; discipline: string; unit: 'saat' | 'gün' | 'iş'; rate_minor: number; level: 'junior' | 'mid' | 'senior'; status: 'active' | 'paused' }
export interface Budget extends Base { project_id: string; brand_id: string; planned_minor: number; note: string }
export interface Expense extends Base { project_id: string | null; brand_id: string | null; category: string; amount_minor: number; supplier_id: string | null; date: string; status: 'pending' | 'approved' | 'paid' | 'rejected'; note: string; company: string }
export interface PurchaseRequest extends Base {
  title: string; project_id: string | null; amount_minor: number; stage: 'request' | 'compare' | 'approval' | 'ordered';
  quotes: Array<{ supplier_id: string; amount_minor: number; days: number }>; chosen_supplier: string | null; approval_id: string | null; requested_by: string;
}
export interface Supplier extends Base { name: string; category: string; contact: string; email: string; rating: number; terms_days: number; status: 'active' | 'blocked' }
export interface Invoice extends Base { brand_id: string; project_id: string | null; number: string; amount_minor: number; status: 'pending' | 'paid' | 'overdue'; issued_at: string; due_at: string; paid_at: string | null }
export interface LedgerEntry extends Base { company: string; date: string; kind: 'income' | 'expense' | 'intercompany'; account: string; amount_minor: number; memo: string }
export interface CostRate extends Base { employee_id: string; hourly_cost_minor: number }
export interface HrProfile extends Base { employee_id: string; dept: string; manager: string; start_date: string; end_date: string | null; status: 'active' | 'offboarding' | 'left'; employment: 'full' | 'part' | 'intern'; phone: string; email: string; leave_total: number }
export const HR_DOC_TYPES = ['Kimlik', 'İş sözleşmesi', 'SGK işe giriş', 'Sağlık raporu', 'Diploma', 'Gizlilik taahhüdü', 'KVKK aydınlatma', 'Adli sicil'] as const;
export interface HrDoc extends Base { employee_id: string; doc_type: string; status: 'ok' | 'missing' | 'expired'; expires_at: string | null; retention_until: string | null }
export interface HrAsset extends Base { employee_id: string; item: string; serial: string; assigned_at: string; returned_at: string | null }
export interface Training extends Base { employee_id: string; title: string; status: 'planned' | 'done'; date: string; hours: number }
export interface PerfReview extends Base { employee_id: string; period: string; score: number; note: string }
export interface Shift extends Base { employee_id: string; date: string; start: string; end: string; kind: 'vardiya' | 'mesai'; hours: number }
export interface Advance extends Base { employee_id: string; kind: 'masraf' | 'avans'; amount_minor: number; status: 'pending' | 'approved' | 'paid'; note: string }
export interface Checklist extends Base { employee_id: string; flow: 'onboarding' | 'offboarding'; title: string; done: boolean; due: string; owner: string }
export interface PayrollRun extends Base { period: string; status: 'draft' | 'approved' | 'paid'; employee_count: number; note: string }
export interface ImportBatch extends Base { phase: 'A' | 'B' | 'C' | 'D'; title: string; rows: number; ok: number; failed: number; status: 'pending' | 'running' | 'done' }
export interface Job extends Base { slug: string; title: string; dept: string; location: string; type: string; status: 'open' | 'draft' | 'closed'; headcount: number; description: string }
export const CANDIDATE_STAGES = ['applied', 'interview', 'case', 'offer', 'hired', 'rejected'] as const;
export type CandidateStage = (typeof CANDIDATE_STAGES)[number];
export const CANDIDATE_STAGE_LABELS: Record<CandidateStage, string> = { applied: 'Başvuru', interview: 'Görüşme', case: 'Case', offer: 'Teklif', hired: 'İşe alındı', rejected: 'Elendi' };
export interface Candidate extends Base { job_id: string; name: string; email: string; portfolio: string; note: string; stage: CandidateStage; score: number; source: 'apply' | 'referral' | 'manual'; talent_pool: boolean; employee_id: string | null }
export interface Interview extends Base { candidate_id: string; at: string; interviewer: string; kind: string; scores: Record<string, number>; notes: string; recommendation: 'hire' | 'hold' | 'no' | '' }
export interface Offer extends Base { candidate_id: string; role_title: string; app_role: Role; start_date: string; status: 'draft' | 'sent' | 'accepted' | 'declined' }
export interface ClientRequest extends Base {
  brand_id: string; title: string; status: 'new' | 'review' | 'accepted' | 'rejected'; created_by: string;
  brief: { goal: string; audience: string; deliverable: string; message: string; deadline: string };
}
export interface Survey extends Base { title: string; kind: 'csat' | 'nps'; brand_id: string | null; threshold: number }
export interface SurveyResponse extends Base { survey_id: string; brand_id: string; score: number; comment: string }
export interface MediaAsset extends Base {
  brand_id: string; project_id: string | null; name: string; kind: 'video' | 'image' | 'doc' | 'audio'; size_mb: number; storage: 'minio' | 'vimeo' | 's3';
  status: 'ok' | 'migrating' | 'archived'; retention_until: string; client_visible: boolean; version: number; versions: Array<{ v: number; at: string; note: string }>; duration_s: number;
}
export interface ReviewComment extends Base { asset_id: string; version: number; timecode_s: number; author: string; body: string; resolved: boolean; client_visible: boolean; brand_id: string }
export interface ShareLink extends Base { brand_id: string | null; asset_ids: string[]; token: string; expires_at: string; password: boolean; downloads: number; max_downloads: number; status: 'active' | 'expired' | 'revoked'; client_visible: boolean }
export interface Transfer extends Base { name: string; size_mb: number; progress: number; status: 'uploading' | 'done' | 'failed' }
export interface StudioItem extends Base { kind: 'memory' | 'brief' | 'draft'; brand_id: string | null; title: string; body: string; data: Record<string, unknown> }
export const SOCIAL_STATUS = ['idea', 'draft', 'review', 'approved', 'scheduled', 'published'] as const;
export interface SocialPost extends Base { brand_id: string; date: string; channel: string; format: string; copy: string; status: (typeof SOCIAL_STATUS)[number]; client_visible: boolean }
export interface Deck extends Base { title: string; brand_id: string | null; template: boolean; slides: number; status: 'draft' | 'final' }
export interface Campaign extends Base { name: string; brand_id: string | null; channel: string; budget_minor: number; spend_minor: number; leads: number; status: 'planned' | 'running' | 'done'; start: string; end: string }
export interface Segment extends Base { name: string; rule: string; size: number }
export interface Newsletter extends Base { subject: string; segment_id: string | null; status: 'draft' | 'scheduled' | 'sent'; sent_at: string | null; open_rate: number }
export interface MktLead extends Base { name: string; email: string; source: string; campaign_id: string | null; status: 'new' | 'mql' | 'sql' | 'customer'; score: number }
export interface EventItem extends Base { event: string; kind: 'portfolio' | 'show' | 'vendor' | 'budget'; title: string; at: string; owner: string; status: string; amount_minor: number; note: string }
export interface Automation extends Base {
  name: string; trigger: string; condition: string; action: string; status: 'draft' | 'published'; version: number; template: string | null; runs: number;
  history: Array<{ version: number; at: string; status: 'draft' | 'published' }>;
  /** Olay türü (core.events.type): tasks.update, approvals.insert, invoices.update … Boşsa `trigger` metninden türetilir. */
  event?: string;
  /** Eşitlik filtresi: noktalı yol → değer (ör. {"new.state":"delivery"}); `new.x` bulunamazsa `new.data.x` denenir. */
  filter?: Record<string, string>;
  action_kind?: AutomationActionKind;
  action_config?: { title?: string; message?: string; state?: string; url?: string; project_id?: string; task_type?: string };
  last_fired_at?: string | null;
}
export const AUTOMATION_ACTION_KINDS = ['create_task', 'notify', 'set_status', 'webhook'] as const;
export type AutomationActionKind = (typeof AUTOMATION_ACTION_KINDS)[number];
export interface AutomationRun extends Base { automation_id: string; status: 'ok' | 'error' | 'pending_approval'; error: string | null; payload: string; event_type?: string | null; event_id?: string | null }

export interface Records {
  crm_deals: Deal; crm_contacts: Contact; crm_proposals: Proposal; crm_contracts: Contract; time_entries: TimeEntry; notifications: Notification;
  task_requests: TaskRequest; allocations: Allocation; leaves: Leave; skills: Skill; equipment: Equipment; equipment_bookings: EquipmentBooking;
  rate_cards: RateCard; budgets: Budget; expenses: Expense; purchase_requests: PurchaseRequest; suppliers: Supplier; invoices: Invoice;
  ledger_entries: LedgerEntry; cost_rates: CostRate; hr_profiles: HrProfile; hr_docs: HrDoc; hr_assets: HrAsset; trainings: Training;
  perf_reviews: PerfReview; shifts: Shift; advances: Advance; checklists: Checklist; payroll_runs: PayrollRun; import_batches: ImportBatch;
  jobs: Job; candidates: Candidate; interviews: Interview; offers: Offer; client_requests: ClientRequest; surveys: Survey; survey_responses: SurveyResponse;
  media_assets: MediaAsset; review_comments: ReviewComment; share_links: ShareLink; transfers: Transfer; studio_items: StudioItem; social_posts: SocialPost;
  decks: Deck; campaigns: Campaign; segments: Segment; newsletters: Newsletter; mkt_leads: MktLead; event_items: EventItem; automations: Automation;
  automation_runs: AutomationRun;
}
type Fields<K extends CollKey> = Omit<Records[K], 'id' | 'org_id' | 'created_at'>;
/** Yeni kayıt: tüm alanlar; güncelleme: id + değişen alanlar. */
export type SaveInput<K extends CollKey> = (Fields<K> & { id?: undefined }) | (Partial<Fields<K>> & { id: string });

export interface AuditEvent { id: string; org_id: string; actor: string; actor_name: string; action: string; resource: string; meta: Record<string, unknown>; occurred_at: string }

/* ───────── zod ───────── */
const money = z.number().int().min(0).max(1e12);
export const quoteLineSchema = z.object({ desc: z.string().trim().min(1).max(200), qty: z.number().min(0).max(100000), unit_minor: money });
export const proposalSchema = z.object({
  brand_id: z.string().min(1), deal_id: z.string().nullable(), number: z.string().min(1), title: z.string().trim().min(2).max(200), version: z.number().int().min(1),
  status: z.enum(['draft', 'sent', 'accepted', 'rejected']), lines: z.array(quoteLineSchema).min(1), vat_pct: z.number().min(0).max(100),
  payment_terms_days: z.number().int().min(0).max(365), valid_until: z.string().min(8), history: z.array(z.object({ version: z.number(), total_minor: z.number(), at: z.string() })),
});
export const dealSchema = z.object({
  brand_id: z.string().nullable(), company: z.string().trim().min(2).max(120), title: z.string().trim().min(2).max(200), stage: z.enum(DEAL_STAGES),
  value_minor: money, owner: z.string().min(1), source: z.string().max(60), next_step: z.string().max(200),
});
export const leaveSchema = z.object({
  employee_id: z.string().min(1), type: z.enum(['yillik', 'hastalik', 'mazeret', 'ucretsiz']), start: z.string().min(8), end: z.string().min(8),
  days: z.number().min(0.5).max(60), status: z.enum(['pending', 'approved', 'rejected']), note: z.string().max(500),
}).refine((v) => v.end >= v.start, { message: 'Bitiş başlangıçtan önce olamaz' });
export const expenseSchema = z.object({
  project_id: z.string().nullable(), brand_id: z.string().nullable(), category: z.string().min(1), amount_minor: money, supplier_id: z.string().nullable(),
  date: z.string().min(8), status: z.enum(['pending', 'approved', 'paid', 'rejected']), note: z.string().max(300), company: z.string().min(1),
});
export const clientRequestSchema = z.object({
  brand_id: z.string().min(1), title: z.string().trim().min(2).max(200), status: z.enum(['new', 'review', 'accepted', 'rejected']), created_by: z.string(),
  brief: z.object({ goal: z.string().trim().min(3), audience: z.string().trim().min(3), deliverable: z.string().trim().min(3), message: z.string().trim().min(3), deadline: z.string().min(8) }),
});
export const surveyResponseSchema = z.object({ survey_id: z.string().min(1), brand_id: z.string().min(1), score: z.number().int().min(0).max(10), comment: z.string().max(1000) });
export const reviewCommentSchema = z.object({
  asset_id: z.string().min(1), version: z.number().int().min(1), timecode_s: z.number().min(0), author: z.string(), body: z.string().trim().min(1).max(1000),
  resolved: z.boolean(), client_visible: z.boolean(), brand_id: z.string(),
});
export const automationSchema = z.object({
  name: z.string().trim().min(3).max(120), trigger: z.string().min(1), condition: z.string().max(300), action: z.string().min(1),
  status: z.enum(['draft', 'published']), version: z.number().int().min(1), template: z.string().nullable(), runs: z.number().int().min(0),
  history: z.array(z.object({ version: z.number(), at: z.string(), status: z.enum(['draft', 'published']) })),
  event: z.string().optional(),
  filter: z.record(z.string(), z.string()).optional(),
  action_kind: z.enum(AUTOMATION_ACTION_KINDS).optional(),
  action_config: z.object({ title: z.string().max(200), message: z.string().max(500), state: z.string(), url: z.string().url(), project_id: z.string(), task_type: z.string() }).partial().optional(),
  last_fired_at: z.string().nullable().optional(),
});
export const studioDraftOutputSchema = z.object({ summary: z.string(), concepts: z.array(z.object({ title: z.string(), idea: z.string(), tone: z.string() })).min(1).max(6) });

/* ───────── Entitlement (feature_flags) → menü ───────── */
/** Modül → ürün paketi. Listede olmayan modüller her zaman açıktır. */
export const MODULE_PRODUCT: Record<string, string> = {
  crm: 'crm', resources: 'resources', finance: 'finance', people: 'people', hire: 'hire', portal: 'portal', insights: 'insights', automations: 'automations',
  studio: 'studio', social: 'social', media: 'media', review: 'review', transfer: 'transfer', present: 'present', marketing: 'marketing', events: 'events',
};
export interface Product { id: string; name: string; desc: string; price_minor: number; group: string }
export const PRODUCTS: Product[] = [
  { id: 'crm', name: 'JS CRM', desc: 'Pipeline, teklif, sözleşme', price_minor: 249000, group: 'Operasyon' },
  { id: 'resources', name: 'JS Resources', desc: 'Kapasite ve izin planı', price_minor: 189000, group: 'Operasyon' },
  { id: 'finance', name: 'JS Finance', desc: 'Bütçe, gider, fatura, marj', price_minor: 289000, group: 'Operasyon' },
  { id: 'people', name: 'JS People', desc: 'HRIS ve özlük arşivi', price_minor: 219000, group: 'İnsan' },
  { id: 'hire', name: 'JS Hire', desc: 'ATS ve aday havuzu', price_minor: 129000, group: 'İnsan' },
  { id: 'portal', name: 'JS Client Portal', desc: 'Müşteri portalı', price_minor: 159000, group: 'İnsan' },
  { id: 'insights', name: 'JS Insights', desc: 'Raporlar ve analitik', price_minor: 169000, group: 'Zekâ' },
  { id: 'automations', name: 'JS Automation', desc: 'Otomasyon ve tetikleyiciler', price_minor: 139000, group: 'Zekâ' },
  { id: 'studio', name: 'JS Studio', desc: 'Brand Memory ve AI taslak', price_minor: 149000, group: 'Üretim' },
  { id: 'social', name: 'JS Social', desc: 'İçerik takvimi', price_minor: 99000, group: 'Üretim' },
  { id: 'media', name: 'JS Media', desc: 'Medya kütüphanesi', price_minor: 99000, group: 'Üretim' },
  { id: 'review', name: 'JS Review', desc: 'Zaman kodlu inceleme', price_minor: 99000, group: 'Üretim' },
  { id: 'transfer', name: 'JS Transfer', desc: 'Dosya paylaşımı', price_minor: 69000, group: 'Üretim' },
  { id: 'present', name: 'JS Present', desc: 'Sunum ve rapor', price_minor: 69000, group: 'Üretim' },
  { id: 'marketing', name: 'JS Marketing', desc: 'Kampanya ve bülten', price_minor: 119000, group: 'Üretim' },
  { id: 'events', name: 'JS Events', desc: 'Etkinlik yönetimi', price_minor: 119000, group: 'Üretim' },
];
/** Hiçbir zaman kapatılamayan modüller (gezinme iskeleti). */
export const ALWAYS_ON_MODULES = ['overview', 'profile', 'apps', 'approvals', 'marketplace', 'admin', 'integrations', 'board', 'automations'] as const;
/** feature_flags anahtarı: ürün paketi varsa ürün kimliği, yoksa modül kimliği. */
export const moduleFlagKey = (moduleId: string) => MODULE_PRODUCT[moduleId] ?? moduleId;
/** feature_flags'te açıkça false olan modül (ürün) menüden düşer; ALWAYS_ON_MODULES hiçbir zaman gizlenmez. */
export const moduleEntitled = (moduleId: string, flags: Record<string, boolean> | undefined) => {
  if ((ALWAYS_ON_MODULES as readonly string[]).includes(moduleId)) return true;
  return flags?.[moduleFlagKey(moduleId)] !== false;
};
