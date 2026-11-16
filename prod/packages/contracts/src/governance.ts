import { z } from 'zod';
import { ROLES, canDecideApproval, isClientRole, type Role } from './roles';
import type { Approval, ApprovalAction, Brand, Task, TaskState, TeamMember } from './index';
import type { ProjectRole } from './modules';

/* ─────────────────────────────────────────────────────────────────────────
 * 0018 — Ekip içi bağımlılık, yetki ve onay mekanizmaları (saf çekirdek).
 * A) Görev bağımlılıkları (task_links)  B) Yetki matrisi + delegasyon (can)  C) Onay zincirleri (approval_policies / approval_steps)
 * Repo (Demo + Supabase), UI ve testler aynı kuralı paylaşır; SQL tetikleyicileri/RLS sert taban olarak aynı kuralı tekrarlar.
 * ───────────────────────────────────────────────────────────────────────── */

const HOUR = 3600000;
const addHours = (iso: string, h: number) => new Date(new Date(iso).getTime() + h * HOUR).toISOString();

/* ═══════════════ A) Görev bağımlılıkları ═══════════════ */
export const TASK_LINK_KINDS = ['blocks', 'relates', 'duplicates'] as const;
export type TaskLinkKind = (typeof TASK_LINK_KINDS)[number];
export const TASK_LINK_LABELS: Record<TaskLinkKind, { forward: string; backward: string }> = {
  blocks: { forward: 'Bunu engelliyor', backward: 'Buna bağlı' },
  relates: { forward: 'İlgili', backward: 'İlgili' },
  duplicates: { forward: 'Kopyası', backward: 'Kopyalanan' },
};
/** from_task_id → to_task_id. `blocks`: from bitmeden to üretime geçemez. */
export interface TaskLink { id: string; org_id: string; from_task_id: string; to_task_id: string; kind: TaskLinkKind; created_by: string | null; created_at: string }
export const taskLinkSchema = z.object({ from_task_id: z.string().min(1), to_task_id: z.string().min(1), kind: z.enum(TASK_LINK_KINDS), created_by: z.string().nullable().optional() }).refine((v) => v.from_task_id !== v.to_task_id, { message: 'Görev kendine bağlanamaz' });
/** Bu aşamalardan itibaren engelli görev ilerleyemez (production ve sonrası). */
export const DEP_GUARDED_STATES: readonly TaskState[] = ['production', 'internal_review', 'approval', 'delivery', 'archive'];
const DEP_DONE: readonly TaskState[] = ['delivery', 'archive'];
export const isDepDone = (t: Pick<Task, 'state'>) => DEP_DONE.includes(t.state);
type TaskLite = Pick<Task, 'id' | 'state'>;

/** Açık engelleyiciler: `blocks` bağıyla bu göreve gelen ve henüz teslim/arşivde olmayan görevler. */
export function blockersOf(taskId: string, links: ReadonlyArray<Pick<TaskLink, 'from_task_id' | 'to_task_id' | 'kind'>>, tasks: ReadonlyArray<TaskLite>): TaskLite[] {
  const by = new Map(tasks.map((t) => [t.id, t]));
  const out: TaskLite[] = [];
  for (const l of links) if (l.kind === 'blocks' && l.to_task_id === taskId) { const t = by.get(l.from_task_id); if (t && !isDepDone(t)) out.push(t); }
  return out;
}
export const isBlocked = (taskId: string, links: ReadonlyArray<Pick<TaskLink, 'from_task_id' | 'to_task_id' | 'kind'>>, tasks: ReadonlyArray<TaskLite>) => blockersOf(taskId, links, tasks).length > 0;
/** Görev kimliği → açık engel sayısı (0 olanlar yok). */
export function blockedMap(tasks: ReadonlyArray<TaskLite>, links: ReadonlyArray<Pick<TaskLink, 'from_task_id' | 'to_task_id' | 'kind'>>): Record<string, number> {
  const out: Record<string, number> = {};
  for (const t of tasks) { const n = blockersOf(t.id, links, tasks).length; if (n) out[t.id] = n; }
  return out;
}
/** Bu geçiş engellenir mi? Engelli görev `production`+ aşamaya taşınamaz (geri hareket serbest). */
export const moveNeedsOverride = (to: TaskState, blockers: number) => blockers > 0 && DEP_GUARDED_STATES.includes(to);
/** Bağ eklemek döngü yaratır mı? (`from` → … → `to` zaten varsa, `to blocks from` döngüdür.) */
export function wouldCycle(from: string, to: string, links: ReadonlyArray<Pick<TaskLink, 'from_task_id' | 'to_task_id' | 'kind'>>): boolean {
  if (from === to) return true;
  const next = new Map<string, string[]>();
  for (const l of links) if (l.kind === 'blocks') (next.get(l.from_task_id) ?? next.set(l.from_task_id, []).get(l.from_task_id)!).push(l.to_task_id);
  const seen = new Set<string>(); const stack = [to];
  while (stack.length) { const x = stack.pop()!; if (x === from) return true; if (seen.has(x)) continue; seen.add(x); stack.push(...(next.get(x) ?? [])); }
  return false;
}
/** `done` görevi bitince engeli tamamen kalkan görevler (son engel buydu). */
export function newlyUnblocked(doneTaskId: string, links: ReadonlyArray<Pick<TaskLink, 'from_task_id' | 'to_task_id' | 'kind'>>, tasksAfter: ReadonlyArray<TaskLite>): string[] {
  const dependents = links.filter((l) => l.kind === 'blocks' && l.from_task_id === doneTaskId).map((l) => l.to_task_id);
  return [...new Set(dependents)].filter((id) => tasksAfter.some((t) => t.id === id) && !isBlocked(id, links, tasksAfter));
}
export interface ChainRow { task: Task; depth: number; blockers: number; blockedBy: string[]; cycle?: boolean }
/**
 * Zincir görünümü (kritik yol-light): Kahn topolojik sıralaması; engelleyicisi olan görevler engelleyicisinin altında girintili.
 * Döngüdeki görevler sona `cycle: true` ile eklenir. Girintisiz kökler bitiş tarihine göre sıralanır.
 */
export function chainOrder(tasks: Task[], links: ReadonlyArray<Pick<TaskLink, 'from_task_id' | 'to_task_id' | 'kind'>>): ChainRow[] {
  const ids = new Set(tasks.map((t) => t.id));
  const preds = new Map<string, string[]>(); const succs = new Map<string, string[]>();
  for (const l of links) {
    if (l.kind !== 'blocks' || !ids.has(l.from_task_id) || !ids.has(l.to_task_id)) continue;
    (preds.get(l.to_task_id) ?? preds.set(l.to_task_id, []).get(l.to_task_id)!).push(l.from_task_id);
    (succs.get(l.from_task_id) ?? succs.set(l.from_task_id, []).get(l.from_task_id)!).push(l.to_task_id);
  }
  const byId = new Map(tasks.map((t) => [t.id, t]));
  const due = (id: string) => byId.get(id)?.due_at ?? '9999';
  const sortIds = (a: string[]) => [...a].sort((x, y) => due(x).localeCompare(due(y)) || (byId.get(x)?.title ?? '').localeCompare(byId.get(y)?.title ?? '', 'tr'));
  const indeg = new Map<string, number>(tasks.map((t) => [t.id, preds.get(t.id)?.length ?? 0]));
  const depth = new Map<string, number>();
  const out: ChainRow[] = [];
  const visited = new Set<string>();
  // DFS-benzeri topolojik yürüyüş: kökten başlayıp ardılları ancak tüm öncülleri işlenince (girintili) yaz.
  const emit = (id: string, d: number) => {
    if (visited.has(id)) return;
    visited.add(id);
    const t = byId.get(id)!;
    const open = blockersOf(id, links, tasks);
    out.push({ task: t, depth: d, blockers: open.length, blockedBy: (preds.get(id) ?? []) });
    for (const s of sortIds(succs.get(id) ?? [])) { indeg.set(s, (indeg.get(s) ?? 1) - 1); depth.set(s, Math.max(depth.get(s) ?? 0, d + 1)); if ((indeg.get(s) ?? 0) === 0) emit(s, depth.get(s) ?? d + 1); }
  };
  for (const id of sortIds(tasks.filter((t) => (indeg.get(t.id) ?? 0) === 0).map((t) => t.id))) emit(id, 0);
  for (const t of tasks) if (!visited.has(t.id)) out.push({ task: t, depth: 0, blockers: blockersOf(t.id, links, tasks).length, blockedBy: preds.get(t.id) ?? [], cycle: true });
  return out;
}
/** Kurul planı: `depends_on` başlıkları → task_links girdileri (eşleşmeyen başlıklar atlanır, kendine bağ yok). */
export function planDependencyLinks(plan: ReadonlyArray<{ title: string; depends_on?: string[] }>, idByTitle: ReadonlyMap<string, string> | Record<string, string>): Array<{ from_task_id: string; to_task_id: string; kind: 'blocks' }> {
  const get = (k: string) => (idByTitle instanceof Map ? idByTitle.get(k) : (idByTitle as Record<string, string>)[k]);
  const norm = (s: string) => s.trim().toLocaleLowerCase('tr');
  const lookup = new Map<string, string>();
  const entries = idByTitle instanceof Map ? [...idByTitle.entries()] : Object.entries(idByTitle);
  for (const [k, v] of entries) lookup.set(norm(k), v);
  const out: Array<{ from_task_id: string; to_task_id: string; kind: 'blocks' }> = [];
  const seen = new Set<string>();
  for (const t of plan) {
    const to = get(t.title) ?? lookup.get(norm(t.title));
    if (!to) continue;
    for (const dep of t.depends_on ?? []) {
      const from = get(dep) ?? lookup.get(norm(dep));
      if (!from || from === to || seen.has(`${from}>${to}`)) continue;
      seen.add(`${from}>${to}`);
      out.push({ from_task_id: from, to_task_id: to, kind: 'blocks' });
    }
  }
  return out;
}

/* ═══════════════ B) Yetki matrisi ═══════════════ */
export const CAPABILITIES = [
  'tasks.create', 'tasks.edit_any', 'tasks.edit_own', 'tasks.delete', 'tasks.assign', 'tasks.move_stage', 'tasks.link', 'tasks.override_block',
  'projects.create', 'projects.edit', 'projects.archive',
  'approvals.decide', 'approvals.request',
  'finance.view', 'finance.edit', 'people.view_salary', 'crm.edit', 'requests.triage', 'announcements.post',
  'integrations.manage', 'agents.run', 'board.view', 'delegations.manage',
] as const;
export type Capability = (typeof CAPABILITIES)[number];
export const CAP_GROUPS: Array<{ id: string; label: string; caps: Capability[] }> = [
  { id: 'tasks', label: 'Görevler', caps: ['tasks.create', 'tasks.edit_any', 'tasks.edit_own', 'tasks.delete', 'tasks.assign', 'tasks.move_stage', 'tasks.link', 'tasks.override_block'] },
  { id: 'projects', label: 'Projeler', caps: ['projects.create', 'projects.edit', 'projects.archive'] },
  { id: 'approvals', label: 'Onaylar', caps: ['approvals.decide', 'approvals.request'] },
  { id: 'business', label: 'İş alanları', caps: ['finance.view', 'finance.edit', 'people.view_salary', 'crm.edit', 'requests.triage', 'announcements.post'] },
  { id: 'system', label: 'Sistem', caps: ['integrations.manage', 'agents.run', 'board.view', 'delegations.manage'] },
];
export const CAP_LABELS: Record<Capability, string> = {
  'tasks.create': 'Görev oluştur', 'tasks.edit_any': 'Her görevi düzenle', 'tasks.edit_own': 'Kendi görevini düzenle', 'tasks.delete': 'Görev sil', 'tasks.assign': 'Görev ata / ihale',
  'tasks.move_stage': 'Aşama değiştir', 'tasks.link': 'Bağımlılık ekle/kaldır', 'tasks.override_block': 'Engelli görevi ilerlet',
  'projects.create': 'Proje oluştur', 'projects.edit': 'Proje düzenle', 'projects.archive': 'Proje arşivle / kapat',
  'approvals.decide': 'Onay kararı ver', 'approvals.request': 'Onay talep et',
  'finance.view': 'Finans görüntüle', 'finance.edit': 'Finans düzenle', 'people.view_salary': 'Maaş görüntüle', 'crm.edit': 'CRM düzenle', 'requests.triage': 'Talep triyajı', 'announcements.post': 'Duyuru yayımla',
  'integrations.manage': 'Entegrasyon yönet', 'agents.run': 'Ajan çalıştır', 'board.view': 'Kurul görüntüle', 'delegations.manage': 'Delegasyon yönet',
};
const OPS: Role[] = ['owner', 'org_admin', 'operations', 'account', 'pm'];
const ALL_INTERNAL: Role[] = ROLES.filter((r) => !isClientRole(r));
/** Varsayılan matris = mevcut davranış (ROLE_GRANTS, RLS politikaları, BID_ROLES, LEAVE_DECIDERS …). Geriye dönük uyumlu. */
const DEFAULT_ROWS: Record<Capability, Role[]> = {
  'tasks.create': [...OPS, 'creative'],
  'tasks.edit_any': OPS,
  'tasks.edit_own': [...OPS, 'creative', 'freelancer'],
  'tasks.delete': ['owner', 'org_admin', 'operations', 'pm'],
  'tasks.assign': OPS,
  'tasks.move_stage': [...OPS, 'creative', 'freelancer'],
  'tasks.link': [...OPS, 'creative'],
  'tasks.override_block': ['owner', 'org_admin', 'pm'],
  'projects.create': OPS,
  'projects.edit': OPS,
  'projects.archive': ['owner', 'org_admin', 'operations', 'pm'],
  'approvals.decide': [...OPS, 'hr', 'finance', 'client_admin'],
  'approvals.request': ALL_INTERNAL.filter((r) => r !== 'auditor'),
  'finance.view': ['owner', 'org_admin', 'finance', 'operations', 'account', 'pm', 'auditor', 'payroll'],
  'finance.edit': ['owner', 'org_admin', 'finance'],
  'people.view_salary': ['payroll'],
  'crm.edit': ['owner', 'org_admin', 'operations', 'account'],
  'requests.triage': [...OPS, 'creative', 'finance', 'hr', 'freelancer'],
  'announcements.post': ['owner', 'org_admin', 'operations', 'hr'],
  'integrations.manage': ['owner', 'org_admin', 'integration_admin'],
  'agents.run': [...OPS, 'creative', 'finance', 'hr'],
  'board.view': ['owner', 'org_admin'],
  'delegations.manage': ['owner', 'org_admin'],
};
export const DEFAULT_PERMISSIONS: Record<Role, Record<Capability, boolean>> = Object.fromEntries(ROLES.map((r) => [r, Object.fromEntries(CAPABILITIES.map((c) => [c, DEFAULT_ROWS[c].includes(r)])) as Record<Capability, boolean>])) as Record<Role, Record<Capability, boolean>>;
/** Müşteri rolleri ne olursa olsun bu yetkilerin dışında kalır (RLS tabanıyla uyum). */
const CLIENT_CEILING: Capability[] = ['approvals.decide', 'approvals.request'];
/** Proje üyeliği rolü → org rolünden bağımsız ek yetkiler (yalnızca o projede). viewer < collaborator < manager < admin. */
export const PROJECT_ROLE_CAPS: Record<ProjectRole, Capability[]> = {
  viewer: [],
  collaborator: ['tasks.create', 'tasks.edit_own', 'tasks.move_stage', 'tasks.link'],
  manager: ['tasks.create', 'tasks.edit_own', 'tasks.move_stage', 'tasks.link', 'tasks.edit_any', 'tasks.assign', 'projects.edit', 'requests.triage'],
  admin: ['tasks.create', 'tasks.edit_own', 'tasks.move_stage', 'tasks.link', 'tasks.edit_any', 'tasks.assign', 'projects.edit', 'requests.triage', 'tasks.delete', 'projects.archive', 'tasks.override_block'],
};
/** organizations.settings.permissions: {role: {cap: bool}} — yalnızca varsayılandan sapanlar saklanır. */
export type PermissionOverrides = Partial<Record<Role, Partial<Record<Capability, boolean>>>>;
export const permissionOverridesSchema = z.record(z.string(), z.record(z.string(), z.boolean()));
/** Tam matris + varsayılan → yalnızca farklar. */
export function diffPermissions(full: Record<string, Record<string, boolean>>): PermissionOverrides {
  const out: PermissionOverrides = {};
  for (const r of ROLES) for (const c of CAPABILITIES) { const v = full[r]?.[c]; if (v !== undefined && v !== DEFAULT_PERMISSIONS[r][c]) ((out[r] ??= {}) as Record<string, boolean>)[c] = v; }
  return out;
}
/** Varsayılan + sapmalar → tam matris. */
export function effectivePermissions(overrides: PermissionOverrides | null | undefined): Record<Role, Record<Capability, boolean>> {
  return Object.fromEntries(ROLES.map((r) => [r, { ...DEFAULT_PERMISSIONS[r], ...(overrides?.[r] ?? {}) }])) as Record<Role, Record<Capability, boolean>>;
}
/** İki sapma kümesi arasındaki fark (denetim/önizleme): [rol, yetki, eski, yeni]. */
export function permissionChanges(before: PermissionOverrides | null | undefined, after: PermissionOverrides | null | undefined): Array<{ role: Role; cap: Capability; from: boolean; to: boolean }> {
  const a = effectivePermissions(before), b = effectivePermissions(after);
  const out: Array<{ role: Role; cap: Capability; from: boolean; to: boolean }> = [];
  for (const r of ROLES) for (const c of CAPABILITIES) if (a[r][c] !== b[r][c]) out.push({ role: r, cap: c, from: a[r][c], to: b[r][c] });
  return out;
}

/* ───── Delegasyon ───── */
export const DELEGATION_STATUS = ['pending', 'active', 'revoked'] as const;
export interface Delegation {
  id: string; org_id: string; from_employee_id: string; to_employee_id: string; caps: string[]; starts_at: string; ends_at: string; reason: string;
  status: (typeof DELEGATION_STATUS)[number]; created_by?: string | null; approval_id?: string | null; created_at: string;
}
export const delegationSchema = z.object({
  from_employee_id: z.string().min(1), to_employee_id: z.string().min(1), caps: z.array(z.string().min(1)).min(1).max(CAPABILITIES.length + 1),
  starts_at: z.string().min(8), ends_at: z.string().min(8), reason: z.string().max(300).default(''), status: z.enum(DELEGATION_STATUS).default('active'),
  created_by: z.string().nullable().optional(), approval_id: z.string().nullable().optional(),
}).refine((v) => v.ends_at > v.starts_at, { message: 'Bitiş başlangıçtan sonra olmalı' }).refine((v) => v.from_employee_id !== v.to_employee_id, { message: 'Kendine delege edemezsin' });
/** Bu yetkiler için self-servis delegasyon owner onayı ister. */
export const delegationNeedsApproval = (caps: string[]) => caps.some((c) => c === '*' || c === 'approvals.decide' || c.startsWith('finance.'));
export const delegationActive = (d: Pick<Delegation, 'status' | 'starts_at' | 'ends_at'>, now: string) => d.status === 'active' && d.starts_at <= now && d.ends_at > now;
/** Bana gelen aktif delegasyonlar içinde `cap`'i kapsayan var mı? (`'*'` tümü) */
export function delegatedCaps(delegations: ReadonlyArray<Delegation> | null | undefined, employeeId: string | null | undefined, now: string): Set<string> {
  const out = new Set<string>();
  if (!employeeId) return out;
  for (const d of delegations ?? []) if (d.to_employee_id === employeeId && delegationActive(d, now)) for (const c of d.caps) out.add(c);
  return out;
}

export interface CanCtx {
  /** organizations.settings.permissions */
  overrides?: PermissionOverrides | null;
  /** Bağlamdaki projede üyelik rolü (project_members.role). */
  projectRole?: ProjectRole | null;
  delegations?: ReadonlyArray<Delegation> | null;
  now?: string;
  /** tasks.edit_own için: görev bana mı atanmış / atanmamış mı? */
  task?: Pick<Task, 'assignee_id'> | null;
}
type Viewer = Pick<TeamMemberLike, 'role'> & { employee_id?: string | null };
interface TeamMemberLike { role: Role }
/**
 * Yetki kararı: (1) müşteri tavanı → (2) org sapması ∥ varsayılan → (3) proje rolü ek yetkisi → (4) aktif delegasyon.
 * Sapma bir yetkiyi kapatıyorsa proje rolü/delegasyon yine açabilir (açıkça kapatılan rol değil, bağlam yetkisi).
 */
export function can(me: Viewer | null | undefined, cap: Capability, ctx: CanCtx = {}): boolean {
  if (!me) return false;
  if (isClientRole(me.role) && !CLIENT_CEILING.includes(cap)) return false;
  const base = ctx.overrides?.[me.role]?.[cap] ?? DEFAULT_PERMISSIONS[me.role]?.[cap] ?? false;
  if (base) return true;
  if (ctx.projectRole && PROJECT_ROLE_CAPS[ctx.projectRole]?.includes(cap)) return true;
  const del = delegatedCaps(ctx.delegations, me.employee_id, ctx.now ?? new Date().toISOString());
  return del.has('*') || del.has(cap);
}
/** Görevi düzenleyebilir mi: her görev ∥ (kendi görevi ve bana atanmış ya da atanmamış). */
export function canEditTask(me: Viewer | null | undefined, task: Pick<Task, 'assignee_id'>, ctx: CanCtx = {}): boolean {
  if (can(me, 'tasks.edit_any', ctx)) return true;
  return can(me, 'tasks.edit_own', ctx) && (!task.assignee_id || task.assignee_id === me?.employee_id);
}
export const CAP_DENIED_MESSAGE = (cap: Capability) => `Bu işlem için yetkin yok (${CAP_LABELS[cap]})`;

/* ═══════════════ C) Onay zincirleri ═══════════════ */
export const APPROVAL_ACTIONS: ApprovalAction[] = ['content', 'budget', 'scope', 'client_decision', 'access', 'agent', 'task_stage', 'request_convert', 'announcement_post'];
export const APPROVAL_ACTION_LABELS: Record<ApprovalAction, string> = {
  content: 'İçerik', budget: 'Bütçe', scope: 'Kapsam değişikliği', client_decision: 'Müşteri kararı', access: 'Yetki', agent: 'Ajan uygulama',
  task_stage: 'Teslim (aşama geçişi)', request_convert: 'Talep → görev', announcement_post: 'Duyuru yayını',
};
export interface PolicyCondition { min_amount_minor?: number; brand_ids?: string[]; brand_status?: Array<Brand['status']>; task_types?: string[]; labels?: string[]; to_states?: TaskState[] }
export const STEP_MODES = ['any', 'all'] as const;
/** Bir zincir adımı: rol ∥ kişi ∥ talep edenin yöneticisi. `all`: adımdaki tüm kişiler onaylamalı (rol adımında = o rolün tüm aktif çalışanları). */
export interface PolicyStep { role?: Role | null; employee_id?: string | null; manager_of_requester?: boolean; mode: (typeof STEP_MODES)[number]; sla_hours: number }
export interface PolicyEscalation { after_hours: number; to_role?: Role | null; to_employee_id?: string | null }
export interface ApprovalPolicy {
  id: string; org_id: string; name: string; action_type: ApprovalAction; condition: PolicyCondition; steps: PolicyStep[]; escalation: PolicyEscalation | null; active: boolean; created_at: string;
}
export const policyStepSchema = z.object({ role: z.enum(ROLES).nullable().optional(), employee_id: z.string().nullable().optional(), manager_of_requester: z.boolean().optional(), mode: z.enum(STEP_MODES).default('any'), sla_hours: z.number().min(1).max(24 * 60).default(48) })
  .refine((s) => !!s.role || !!s.employee_id || !!s.manager_of_requester, { message: 'Adımda rol, kişi ya da "talep edenin yöneticisi" seçilmeli' });
export const policyConditionSchema = z.object({
  min_amount_minor: z.number().int().min(0).optional(), brand_ids: z.array(z.string()).optional(), brand_status: z.array(z.enum(['active', 'risky', 'prospect'])).optional(),
  task_types: z.array(z.string()).optional(), labels: z.array(z.string()).optional(), to_states: z.array(z.enum(['brief', 'scope', 'plan', 'production', 'internal_review', 'approval', 'delivery', 'archive'])).optional(),
}).strict();
export const approvalPolicySchema = z.object({
  name: z.string().trim().min(2).max(120), action_type: z.enum(['content', 'budget', 'scope', 'client_decision', 'access', 'agent', 'task_stage', 'request_convert', 'announcement_post']),
  condition: policyConditionSchema.default({}), steps: z.array(policyStepSchema).min(1).max(8),
  escalation: z.object({ after_hours: z.number().min(1).max(24 * 30), to_role: z.enum(ROLES).nullable().optional(), to_employee_id: z.string().nullable().optional() }).nullable().default(null),
  active: z.boolean().default(true),
});
export interface ApprovalStep {
  id: string; org_id: string; approval_id: string; step_index: number; approver_role: Role | null;
  /** Adımın somut onaylayıcıları (çalışan kimlikleri). Boşsa rolü taşıyan herkes. */
  approvers: string[]; mode: 'any' | 'all'; status: 'pending' | 'approved' | 'rejected' | 'skipped';
  decisions: Array<{ by: string; answer: 'approved' | 'rejected'; at: string; note?: string | null }>;
  decided_by: string | null; decided_at: string | null; note: string | null; started_at: string | null; due_at: string | null; escalated_at: string | null; escalated_to: string[]; created_at: string;
}
export const approvalStepSchema = z.object({
  approval_id: z.string().min(1), step_index: z.number().int().min(0), approver_role: z.enum(ROLES).nullable(), approvers: z.array(z.string()), mode: z.enum(STEP_MODES),
  status: z.enum(['pending', 'approved', 'rejected', 'skipped']), decisions: z.array(z.object({ by: z.string(), answer: z.enum(['approved', 'rejected']), at: z.string(), note: z.string().nullable().optional() })),
  decided_by: z.string().nullable(), decided_at: z.string().nullable(), note: z.string().nullable(), started_at: z.string().nullable(), due_at: z.string().nullable(), escalated_at: z.string().nullable(), escalated_to: z.array(z.string()),
});

export interface PolicySubject { amount_minor?: number; brand_id?: string; task_type?: string; labels?: string[]; to_state?: TaskState; brand?: Pick<Brand, 'id' | 'status'> | null }
/** Koşul eşleşmesi: verilen her anahtar sağlanmalı. Dönüş: eşleşen koşul sayısı (özgüllük) ya da -1. */
export function policyScore(p: Pick<ApprovalPolicy, 'action_type' | 'condition' | 'active'>, action: ApprovalAction, s: PolicySubject): number {
  if (!p.active || p.action_type !== action) return -1;
  const c = p.condition ?? {};
  let n = 0;
  if (c.min_amount_minor !== undefined) { if ((s.amount_minor ?? 0) < c.min_amount_minor) return -1; n++; }
  if (c.brand_ids?.length) { if (!s.brand_id || !c.brand_ids.includes(s.brand_id)) return -1; n++; }
  if (c.brand_status?.length) { if (!s.brand?.status || !c.brand_status.includes(s.brand.status)) return -1; n++; }
  if (c.task_types?.length) { if (!s.task_type || !c.task_types.includes(s.task_type)) return -1; n++; }
  if (c.labels?.length) { if (!s.labels?.some((l) => c.labels!.includes(l))) return -1; n++; }
  if (c.to_states?.length) { if (!s.to_state || !c.to_states.includes(s.to_state)) return -1; n++; }
  return n;
}
/** En özgül (en çok koşul eşleşen) aktif politika; eşitlikte önce oluşturulan. Yoksa null → tek adımlı varsayılan davranış. */
export function resolvePolicy<P extends Pick<ApprovalPolicy, 'action_type' | 'condition' | 'active' | 'created_at'>>(policies: ReadonlyArray<P>, action: ApprovalAction, subject: PolicySubject): P | null {
  let best: P | null = null; let bestScore = -1;
  for (const p of [...policies].sort((a, b) => a.created_at.localeCompare(b.created_at))) { const sc = policyScore(p, action, subject); if (sc > bestScore) { best = p; bestScore = sc; } }
  return best;
}
export interface BuiltStep { step_index: number; approver_role: Role | null; approvers: string[]; mode: 'any' | 'all'; sla_hours: number; unresolved?: boolean }
/**
 * Politika adımlarını somutlar: rol → (mode=all ise rolün aktif çalışanları, any ise boş = rolü taşıyan herkes); kişi → [kişi];
 * talep edenin yöneticisi → [manager_id] (yoksa owner rolüne düşer, `unresolved`).
 */
export function buildSteps(steps: ReadonlyArray<PolicyStep>, o: { requesterEmployeeId?: string | null; team: ReadonlyArray<Pick<TeamMember, 'id' | 'app_role' | 'status' | 'manager_id'>> }): BuiltStep[] {
  return steps.map((s, i) => {
    if (s.manager_of_requester) {
      const me = o.team.find((m) => m.id === o.requesterEmployeeId);
      const mgr = me?.manager_id ? o.team.find((m) => m.id === me.manager_id && m.status === 'active') : null;
      return mgr ? { step_index: i, approver_role: null, approvers: [mgr.id], mode: 'any', sla_hours: s.sla_hours } : { step_index: i, approver_role: 'owner', approvers: [], mode: 'any', sla_hours: s.sla_hours, unresolved: true };
    }
    if (s.employee_id) return { step_index: i, approver_role: null, approvers: [s.employee_id], mode: 'any', sla_hours: s.sla_hours };
    const role = s.role as Role;
    const holders = s.mode === 'all' ? o.team.filter((m) => m.app_role === role && m.status === 'active').map((m) => m.id) : [];
    return { step_index: i, approver_role: role, approvers: holders, mode: holders.length > 1 ? 'all' : 'any', sla_hours: s.sla_hours };
  });
}
/** Varsayılan tek adım (politika yoksa): mevcut required_role davranışı. */
export const defaultStep = (required: Role, slaHours = 48): BuiltStep[] => [{ step_index: 0, approver_role: required, approvers: [], mode: 'any', sla_hours: slaHours }];
export const stepDueAt = (startedAt: string, slaHours: number) => addHours(startedAt, slaHours);
/** Zincir için approvals.required_role: ilk adımın rolü, kişi adımındaysa kişinin rolü, bilinmiyorsa owner. */
export function requiredRoleFor(first: BuiltStep | undefined, team: ReadonlyArray<Pick<TeamMember, 'id' | 'app_role'>>): Role {
  if (!first) return 'owner';
  if (first.approver_role) return first.approver_role;
  return team.find((m) => m.id === first.approvers[0])?.app_role ?? 'owner';
}

export interface DecideViewer { role: Role; employee_id?: string | null }
/** Bu adımda karar verebilir mi? Doğrudan (rol ∥ kişi ∥ yükseltme hedefi) ya da bana aktif `approvals.decide` delegesi veren kişi karar verebiliyorsa. */
export function canDecideStep(me: DecideViewer | null | undefined, step: Pick<ApprovalStep, 'approver_role' | 'approvers' | 'status' | 'escalated_to' | 'decisions' | 'mode'>, o: { team?: ReadonlyArray<Pick<TeamMember, 'id' | 'app_role'>>; delegations?: ReadonlyArray<Delegation> | null; now?: string } = {}): boolean {
  if (!me || step.status !== 'pending') return false;
  const direct = (v: DecideViewer) => {
    if (v.employee_id && step.mode === 'all' && step.decisions.some((d) => d.by === v.employee_id)) return false; // aynı kişi iki kez oy veremez
    if (v.employee_id && (step.approvers.includes(v.employee_id) || step.escalated_to.includes(v.employee_id))) return true;
    if (step.escalated_to.includes(`role:${v.role}`)) return true;
    if (v.role === 'owner') return true; // owner her adımı çözebilir (SQL core.can_decide_step ile aynı)
    if (step.approver_role && step.approvers.length === 0 && canDecideApproval(v.role, step.approver_role)) return true;
    return false;
  };
  if (direct(me)) return true;
  const now = o.now ?? new Date().toISOString();
  for (const d of o.delegations ?? []) {
    if (d.to_employee_id !== me.employee_id || !delegationActive(d, now) || !(d.caps.includes('*') || d.caps.includes('approvals.decide'))) continue;
    const from = o.team?.find((m) => m.id === d.from_employee_id);
    if (from && direct({ role: from.app_role, employee_id: from.id })) return true;
  }
  return false;
}
export type ChainOutcome = 'waiting' | 'advanced' | 'approved' | 'rejected';
/**
 * Adım kararı: `all` modunda herkes onaylayınca adım biter; tek ret adımı ve zinciri reddeder. Sonraki adım varsa 'advanced' (başlatılır), yoksa 'approved'.
 * Saf: yeni adım dizisi + sonuç döner.
 */
export function applyDecision(steps: ApprovalStep[], stepIndex: number, by: string, answer: 'approved' | 'rejected', now: string, note?: string | null): { steps: ApprovalStep[]; outcome: ChainOutcome; nextIndex: number | null } {
  const sorted = [...steps].sort((a, b) => a.step_index - b.step_index).map((s) => ({ ...s, decisions: [...s.decisions] }));
  const cur = sorted.find((s) => s.step_index === stepIndex);
  if (!cur || cur.status !== 'pending') throw new Error('Bu adım karara açık değil');
  cur.decisions.push({ by, answer, at: now, note: note ?? null });
  if (answer === 'rejected') {
    cur.status = 'rejected'; cur.decided_by = by; cur.decided_at = now; cur.note = note ?? null;
    for (const s of sorted) if (s.step_index > stepIndex && s.status === 'pending') s.status = 'skipped';
    return { steps: sorted, outcome: 'rejected', nextIndex: null };
  }
  const need = cur.mode === 'all' ? cur.approvers : [];
  const got = new Set(cur.decisions.filter((d) => d.answer === 'approved').map((d) => d.by));
  if (need.length && !need.every((a) => got.has(a))) return { steps: sorted, outcome: 'waiting', nextIndex: stepIndex };
  cur.status = 'approved'; cur.decided_by = by; cur.decided_at = now; cur.note = note ?? null;
  const next = sorted.find((s) => s.step_index > stepIndex && s.status === 'pending');
  if (!next) return { steps: sorted, outcome: 'approved', nextIndex: null };
  next.started_at = now;
  return { steps: sorted, outcome: 'advanced', nextIndex: next.step_index };
}
export interface ChainView { steps: ApprovalStep[]; current: ApprovalStep | null; done: number; total: number; overdue: boolean; hoursLeft: number | null }
/** Stepper verisi: mevcut adım, bitenler, SLA kalan saat (negatif = aşıldı). */
export function chainView(steps: ReadonlyArray<ApprovalStep>, now: string): ChainView {
  const sorted = [...steps].sort((a, b) => a.step_index - b.step_index);
  const current = sorted.find((s) => s.status === 'pending') ?? null;
  const due = current?.due_at ?? null;
  const hoursLeft = due ? Math.round(((new Date(due).getTime() - new Date(now).getTime()) / HOUR) * 10) / 10 : null;
  return { steps: sorted, current, done: sorted.filter((s) => s.status === 'approved').length, total: sorted.length, overdue: hoursLeft !== null && hoursLeft < 0, hoursLeft };
}
export const fmtSla = (hoursLeft: number | null): string => {
  if (hoursLeft === null) return '';
  const h = Math.abs(hoursLeft);
  const txt = h >= 48 ? `${Math.round(h / 24)} gün` : `${Math.round(h)} sa`;
  return hoursLeft < 0 ? `SLA ${txt} aşıldı` : `SLA ${txt} kaldı`;
};
export interface EscalationDue { approval_id: string; step: ApprovalStep; to_role: Role | null; to_employee_id: string | null }
/**
 * Yükseltilmesi gereken adımlar: bekleyen, henüz yükseltilmemiş ve `due_at + after_hours` geçmiş. Politikasız (varsayılan) onaylarda:
 * son tarihten 24 saat sonra owner'a yükselt.
 */
export function escalationsDue(approvals: ReadonlyArray<Pick<Approval, 'id' | 'status' | 'policy_id'>>, steps: ReadonlyArray<ApprovalStep>, policies: ReadonlyArray<Pick<ApprovalPolicy, 'id' | 'escalation'>>, now: string): EscalationDue[] {
  const out: EscalationDue[] = [];
  const t = new Date(now).getTime();
  for (const a of approvals) {
    if (a.status !== 'pending') continue;
    const cur = [...steps].filter((s) => s.approval_id === a.id && s.status === 'pending').sort((x, y) => x.step_index - y.step_index)[0];
    if (!cur || cur.escalated_at || !cur.due_at) continue;
    const pol = a.policy_id ? policies.find((p) => p.id === a.policy_id) : null;
    const esc: PolicyEscalation = pol?.escalation ?? { after_hours: 24, to_role: 'owner' };
    if (pol && !pol.escalation) continue; // politika yükseltme tanımlamamış
    if (t >= new Date(cur.due_at).getTime() + esc.after_hours * HOUR) out.push({ approval_id: a.id, step: cur, to_role: esc.to_role ?? null, to_employee_id: esc.to_employee_id ?? null });
  }
  return out;
}
/** Yükseltme uygulaması (saf): adıma hedef eklenir, `escalated_at` işaretlenir. */
export function applyEscalation(step: ApprovalStep, e: Pick<EscalationDue, 'to_role' | 'to_employee_id'>, now: string): ApprovalStep {
  const add = e.to_employee_id ? [e.to_employee_id] : e.to_role ? [`role:${e.to_role}`] : [];
  return { ...step, escalated_at: now, escalated_to: [...new Set([...step.escalated_to, ...add])] };
}
/** Bir rolün / kişinin bildirim alıcıları: approvers doluysa onlar; rol adımıysa rolü taşıyan aktif çalışanlar; yükseltilenler eklenir. */
export function stepRecipients(step: Pick<ApprovalStep, 'approver_role' | 'approvers' | 'escalated_to'>, team: ReadonlyArray<Pick<TeamMember, 'id' | 'app_role' | 'status'>>): string[] {
  const out = new Set<string>(step.approvers);
  if (step.approver_role && !step.approvers.length) for (const m of team) if (m.status === 'active' && m.app_role === step.approver_role) out.add(m.id);
  for (const x of step.escalated_to) { if (x.startsWith('role:')) { for (const m of team) if (m.status === 'active' && m.app_role === x.slice(5)) out.add(m.id); } else out.add(x); }
  return [...out];
}
/** Demo tohumu + 0018 varsayılanları (org 'jobs'). */
export const DEFAULT_APPROVAL_POLICIES: Array<Omit<ApprovalPolicy, 'id' | 'org_id' | 'created_at'>> = [
  { name: 'Bütçe > ₺25.000', action_type: 'budget', condition: { min_amount_minor: 2_500_000 }, steps: [{ manager_of_requester: true, mode: 'any', sla_hours: 24 }, { role: 'finance', mode: 'any', sla_hours: 48 }, { role: 'owner', mode: 'any', sla_hours: 48 }], escalation: { after_hours: 24, to_role: 'owner' }, active: true },
  { name: 'Müşteri kararı', action_type: 'client_decision', condition: {}, steps: [{ role: 'account', mode: 'any', sla_hours: 24 }, { role: 'owner', mode: 'any', sla_hours: 72 }], escalation: { after_hours: 48, to_role: 'owner' }, active: true },
  { name: 'Kapsam değişikliği', action_type: 'scope', condition: {}, steps: [{ role: 'pm', mode: 'any', sla_hours: 24 }, { role: 'owner', mode: 'any', sla_hours: 48 }], escalation: { after_hours: 24, to_role: 'owner' }, active: true },
  { name: 'Ajan uygulama', action_type: 'agent', condition: {}, steps: [{ role: 'owner', mode: 'any', sla_hours: 72 }], escalation: null, active: true },
  { name: 'Riskli marka teslimi', action_type: 'task_stage', condition: { brand_status: ['risky'], to_states: ['delivery'] }, steps: [{ role: 'account', mode: 'any', sla_hours: 24 }], escalation: { after_hours: 24, to_role: 'owner' }, active: true },
];
