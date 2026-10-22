import {
  COLLECTIONS, DEAL_STAGES, LEAVE_DECIDERS, canReadColl, canWriteColl, type AuditEvent, type Checklist, type CollKey, type Deal, type DealStage, type Leave, type Records, type SaveInput,
  approvalCreateSchema, canDecideApproval, isClientRole, checkItemCreateSchema, checkItemPatchSchema, checklistNameSchema, commentBodySchema, MAX_ATTACHMENT_BYTES, orgSettingsPatchSchema, taskCreateSchema, taskPatchSchema, boardAnswerSchema,
  type AgentRun, type Approval, type ApprovalCreate, type BoardAnswer, type ConnectData, type Integration, type Me, type Message,
  type OrgSettings, type Task, type Project, type Brand, type TrelloImportResult, type TrelloPublicState, type TrelloMode, type SyncLogEntry, TRELLO_MODES, maskTrelloConfig, type TaskCreate, type TaskPatch, type TaskState, type BoardDecision, type Role,
  type AttachmentInput, type CheckItemCreate, type CheckItemPatch, type TaskAttachment, type TaskBadges, type TaskCheckItem, type TaskChecklist, type TaskComment,
  BID_ROLES, TOKEN_ADMIN_ROLES, bidProposalSchema, checkTokenPolicy, tokenCreateSchema, type AccessToken, type BidAssignResult, type BidProposal, type TaskAssignment, type TaskBid, type TokenCreate,
} from '@jscore/contracts';
import { TRELLO_FIXTURE } from '../integrations/trello-fixture';
import { addDetails, emptyDetailsSummary, syncCardDetails, type DetailStore } from '../integrations/trello-details';
import { memberKey, resolveEmployee, runImport, type CardDetailsHook, type StoreTask, type TaskDraft, type TrelloSnapshot, type TrelloStore } from '../integrations/trello-map';
import { demoTwinBids, type TwinBidInput } from '../agents/demo';
import { dispatchEvent, type AutomationEvent, type DispatchPorts } from '../automations/dispatch';
import { addDaysIso, generateToken, tokenPrefix } from '../token';
import { DEMO_ACCOUNTS, ORG_JOBS, accountToMe, makeDemoDb, type DemoAccount, type DemoDb, type DemoDetails } from '../demo-seed';
import { makeModuleSeed } from '../demo-seed-modules';
import { offerToEmployee } from '../domain';
import { validateRecord } from './validate';
import { ForbiddenError, NotFoundError, type Repo } from './types';

export interface KV { getItem(k: string): string | null; setItem(k: string, v: string): void }
export const DEMO_STORAGE_KEY = 'js_demo_db_v1';
/** /apply/[job] başvuruları buraya düşer; hire sayfası açılınca `ingestApplications()` aday olarak alır. */
export const APPLY_QUEUE_KEY = 'js_apply_queue_v1';
const listeners = new Map<string, Set<(m: Message) => void>>();

/** Otomasyon bildirimlerinin alıcıları (in-app). */
const NOTIFY_ROLES: Role[] = ['owner', 'org_admin', 'operations'];
/** 0012 RLS: yorum / checklist / ek yazabilen iç roller (freelancer yalnızca kendi ya da atanmamış görevde). */
const DETAIL_WRITE_ROLES: Role[] = ['owner', 'org_admin', 'operations', 'account', 'pm', 'creative', 'freelancer'];

export interface DemoOptions { accountId?: string; orgId?: string; storage?: KV | null; now?: () => string }

/**
 * Bellek içi demo veri katmanı. Tarayıcıda localStorage'a yazar; sunucuda (storage yok) her istek
 * taze seed ile başlar — kalıcı değildir.
 */
export class DemoRepo implements Repo {
  readonly mode = 'demo' as const;
  private mem: DemoDb | null = null;
  private account: DemoAccount;
  private orgId: string;
  private storage: KV | null;
  private now: () => string;

  constructor(opts: DemoOptions = {}) {
    this.account = DEMO_ACCOUNTS.find((a) => a.id === opts.accountId) ?? DEMO_ACCOUNTS[0];
    this.orgId = opts.orgId ?? ORG_JOBS;
    this.storage = opts.storage ?? null;
    this.now = opts.now ?? (() => new Date().toISOString());
  }

  private db(): DemoDb {
    if (this.storage) {
      try {
        const raw = this.storage.getItem(DEMO_STORAGE_KEY);
        if (raw) {
          const db = JSON.parse(raw) as DemoDb;
          if (!db.cols) { db.cols = makeModuleSeed(); db.audit = []; this.persist(db); } // eski kayıt: modül verisini ekle
          return db;
        }
      } catch { /* bozuk kayıt → yeniden seed */ }
      const fresh = makeDemoDb();
      this.persist(fresh);
      return fresh;
    }
    return (this.mem ??= makeDemoDb());
  }
  private persist(db: DemoDb) {
    if (this.storage) { try { this.storage.setItem(DEMO_STORAGE_KEY, JSON.stringify(db)); } catch { /* kota */ } }
    else this.mem = db;
  }
  private get role() { return this.account.role; }
  private nextId(prefix: string, ids: string[]) {
    const n = ids.map((i) => Number(i.replace(/\D/g, '')) || 0).reduce((a, b) => Math.max(a, b), 0);
    return `${prefix}${n + 1}`;
  }
  /** Müşteri rolleri yalnızca kendi marka + client_visible kayıtlarını görür. */
  private visibleBrand = (brandId: string) => !isClientRole(this.role) || this.account.brand_ids.includes(brandId);

  async listOrgs() { return this.db().orgs; }
  async me(): Promise<Me> { return accountToMe(this.account, this.orgId); }
  async team() { return this.db().team.filter((t) => t.org_id === ORG_JOBS || t.org_id === this.orgId); }
  async listMembers() { if (isClientRole(this.role)) throw new ForbiddenError(); return this.db().members; }

  async listBrands() { return this.db().brands.filter((b) => b.org_id === this.orgId && this.visibleBrand(b.id)); }
  async listProjects() {
    return this.db().projects.filter((p) => p.org_id === this.orgId && this.visibleBrand(p.brand_id) && (!isClientRole(this.role) || p.client_visible));
  }
  async getProject(id: string) { return (await this.listProjects()).find((p) => p.id === id) ?? null; }
  async listTaskTypes() { return this.db().taskTypes; }
  async listTasks(filter?: { project_id?: string }) {
    const visible = new Set((await this.listProjects()).map((p) => p.id));
    return this.db().tasks.filter((t) => visible.has(t.project_id) && (!filter?.project_id || t.project_id === filter.project_id) && (!isClientRole(this.role) || t.client_visible));
  }
  async createTask(input: TaskCreate): Promise<Task> {
    if (isClientRole(this.role) || this.role === 'auditor') throw new ForbiddenError();
    const v = taskCreateSchema.parse(input);
    const db = this.db();
    const project = db.projects.find((p) => p.id === v.project_id && p.org_id === this.orgId);
    if (!project) throw new NotFoundError('Proje');
    const task: Task = {
      id: this.nextId('t', db.tasks.map((t) => t.id)), org_id: this.orgId, project_id: v.project_id, title: v.title, assignee_id: v.assignee_id ?? null,
      state: v.state, priority: v.priority, due_at: v.due_at, planned_minutes: v.planned_minutes, task_type: v.task_type, qty: v.qty,
      source_ref: v.source_ref ?? null, labels: [], client_visible: false, created_at: this.now(),
    };
    db.tasks.push(task);
    this.log(db, 'task.create', `tasks/${task.id}`, { title: task.title });
    await this.fire(db, 'tasks.insert', 'tasks', task);
    this.persist(db);
    return task;
  }
  async moveTask(id: string, state: TaskState): Promise<Task> {
    if (isClientRole(this.role) || this.role === 'auditor') throw new ForbiddenError();
    const db = this.db();
    const t = db.tasks.find((x) => x.id === id && x.org_id === this.orgId);
    if (!t) throw new NotFoundError('Görev');
    const before = { ...t };
    t.state = state;
    this.log(db, 'task.move', `tasks/${id}`, { state });
    await this.fire(db, 'tasks.update', 'tasks', t, before);
    this.persist(db);
    return { ...t };
  }
  async updateTask(id: string, patch: TaskPatch): Promise<Task> {
    if (isClientRole(this.role) || this.role === 'auditor') throw new ForbiddenError();
    const v = taskPatchSchema.parse(patch);
    const db = this.db();
    const t = db.tasks.find((x) => x.id === id && x.org_id === this.orgId);
    if (!t) throw new NotFoundError('Görev');
    const before = { ...t };
    Object.assign(t, v);
    this.log(db, 'task.update', `tasks/${id}`, v);
    await this.fire(db, 'tasks.update', 'tasks', t, before);
    this.persist(db);
    return { ...t };
  }

  /* ───────── Görev ayrıntıları (0012): yorum, checklist, ek — bellek içi; RLS kuralları DemoRepo'da yeniden uygulanır ───────── */
  private det(db: DemoDb): DemoDetails { return (db.details ??= { comments: [], checklists: [], items: [], attachments: [] }); }
  private detailTask(db: DemoDb, taskId: string, write: boolean): Task {
    if (isClientRole(this.role)) throw new ForbiddenError();
    const t = db.tasks.find((x) => x.id === taskId && x.org_id === this.orgId);
    if (!t) throw new NotFoundError('Görev');
    if (write && (!DETAIL_WRITE_ROLES.includes(this.role) || (this.role === 'freelancer' && t.assignee_id && t.assignee_id !== this.account.employee_id))) throw new ForbiddenError('Bu görevde değişiklik yetkin yok');
    return t;
  }
  private detailId(prefix: string, rows: Array<{ id: string }>) { return this.nextId(prefix, rows.map((r) => r.id)); }
  private checklistWithItems(d: DemoDetails, c: Omit<TaskChecklist, 'items'>): TaskChecklist { return { ...c, items: d.items.filter((i) => i.checklist_id === c.id).sort((a, b) => a.position - b.position) }; }
  async listComments(taskId: string) { const db = this.db(); this.detailTask(db, taskId, false); return this.det(db).comments.filter((c) => c.task_id === taskId).sort((a, b) => a.created_at.localeCompare(b.created_at)); }
  async addComment(taskId: string, body: string) {
    const db = this.db(); const t = this.detailTask(db, taskId, true);
    const c: TaskComment = { id: this.detailId('tcm', this.det(db).comments), org_id: this.orgId, task_id: taskId, author_id: `u_${this.account.id}`, author_name: this.account.name, body: commentBodySchema.parse(body), created_at: this.now(), updated_at: this.now(), external_id: null };
    this.det(db).comments.push(c);
    this.log(db, 'task.comment', `tasks/${taskId}`, { comment: c.id });
    await this.fire(db, 'task.commented', 'tasks', { ...c, id: t.id });
    this.persist(db);
    return { ...c };
  }
  private ownComment(db: DemoDb, id: string): TaskComment {
    const c = this.det(db).comments.find((x) => x.id === id && x.org_id === this.orgId);
    if (!c) throw new NotFoundError('Yorum');
    this.detailTask(db, c.task_id, true);
    if (c.author_id !== `u_${this.account.id}` && !['owner', 'org_admin', 'operations'].includes(this.role)) throw new ForbiddenError('Yalnızca kendi yorumunu düzenleyebilirsin');
    return c;
  }
  async updateComment(id: string, body: string) { const db = this.db(); const c = this.ownComment(db, id); c.body = commentBodySchema.parse(body); c.updated_at = this.now(); this.persist(db); return { ...c }; }
  async deleteComment(id: string) { const db = this.db(); const c = this.ownComment(db, id); this.det(db).comments = this.det(db).comments.filter((x) => x.id !== c.id); this.persist(db); }
  async listChecklists(taskId: string) {
    const db = this.db(); this.detailTask(db, taskId, false); const d = this.det(db);
    return d.checklists.filter((c) => c.task_id === taskId).sort((a, b) => a.position - b.position).map((c) => this.checklistWithItems(d, c));
  }
  async addChecklist(taskId: string, name: string) {
    const db = this.db(); this.detailTask(db, taskId, true); const d = this.det(db);
    const mine = d.checklists.filter((c) => c.task_id === taskId);
    const c = { id: this.detailId('tcl', d.checklists), org_id: this.orgId, task_id: taskId, name: checklistNameSchema.parse(name), position: mine.reduce((m, x) => Math.max(m, x.position + 1), 0), external_id: null as string | null, updated_at: this.now() };
    d.checklists.push(c); this.persist(db);
    return this.checklistWithItems(d, c);
  }
  private checklistOf(db: DemoDb, id: string) {
    const c = this.det(db).checklists.find((x) => x.id === id && x.org_id === this.orgId);
    if (!c) throw new NotFoundError('Checklist');
    this.detailTask(db, c.task_id, true);
    return c;
  }
  async updateChecklist(id: string, patch: { name: string }) { const db = this.db(); const c = this.checklistOf(db, id); c.name = checklistNameSchema.parse(patch.name); c.updated_at = this.now(); this.persist(db); return this.checklistWithItems(this.det(db), c); }
  async deleteChecklist(id: string) {
    const db = this.db(); const c = this.checklistOf(db, id); const d = this.det(db);
    d.checklists = d.checklists.filter((x) => x.id !== c.id); d.items = d.items.filter((i) => i.checklist_id !== c.id); this.persist(db);
  }
  async addCheckItem(checklistId: string, input: CheckItemCreate) {
    const db = this.db(); const c = this.checklistOf(db, checklistId); const d = this.det(db); const v = checkItemCreateSchema.parse(input);
    const it: TaskCheckItem = { id: this.detailId('tci', d.items), org_id: this.orgId, checklist_id: c.id, name: v.name, checked: false, position: d.items.filter((i) => i.checklist_id === c.id).reduce((m, x) => Math.max(m, x.position + 1), 0), due_at: v.due_at ?? null, assignee_id: v.assignee_id ?? null, external_id: null, updated_at: this.now() };
    d.items.push(it); this.persist(db);
    return { ...it };
  }
  private itemOf(db: DemoDb, id: string) {
    const it = this.det(db).items.find((x) => x.id === id && x.org_id === this.orgId);
    if (!it) throw new NotFoundError('Madde');
    this.checklistOf(db, it.checklist_id);
    return it;
  }
  async updateCheckItem(id: string, patch: CheckItemPatch) { const db = this.db(); const it = this.itemOf(db, id); Object.assign(it, checkItemPatchSchema.parse(patch), { updated_at: this.now() }); this.persist(db); return { ...it }; }
  async deleteCheckItem(id: string) { const db = this.db(); const it = this.itemOf(db, id); this.det(db).items = this.det(db).items.filter((x) => x.id !== it.id); this.persist(db); }
  async listAttachments(taskId: string) { const db = this.db(); this.detailTask(db, taskId, false); return this.det(db).attachments.filter((a) => a.task_id === taskId).sort((a, b) => a.created_at.localeCompare(b.created_at)); }
  async addAttachment(taskId: string, input: AttachmentInput) {
    const db = this.db(); this.detailTask(db, taskId, true); const d = this.det(db);
    let url = input.url?.trim() ?? ''; let name = input.name?.trim() ?? ''; let mime = input.mime ?? ''; let bytes = 0;
    if (input.file) {
      if (input.file.size > MAX_ATTACHMENT_BYTES) throw new Error('Dosya 25 MB sınırını aşıyor');
      const f = input.file as Blob & { name?: string };
      name ||= f.name ?? 'dosya'; mime ||= f.type; bytes = f.size;
      url = typeof URL !== 'undefined' && typeof URL.createObjectURL === 'function' ? URL.createObjectURL(input.file) : '';
    } else {
      if (!/^https?:\/\/\S+$/i.test(url)) throw new Error('Geçerli bir http(s) bağlantısı gir');
      name ||= url.replace(/^https?:\/\//i, '').split('/')[0];
    }
    const a: TaskAttachment = { id: this.detailId('tat', d.attachments), org_id: this.orgId, task_id: taskId, name: name.slice(0, 500), url, mime, bytes, storage_path: null, uploaded_by: `u_${this.account.id}`, created_at: this.now(), external_id: null };
    d.attachments.push(a); this.log(db, 'task.attach', `tasks/${taskId}`, { name: a.name }); this.persist(db);
    return { ...a };
  }
  private attachmentOf(db: DemoDb, id: string) {
    const a = this.det(db).attachments.find((x) => x.id === id && x.org_id === this.orgId);
    if (!a) throw new NotFoundError('Dosya');
    this.detailTask(db, a.task_id, true);
    return a;
  }
  async updateAttachment(id: string, patch: { name: string }) { const db = this.db(); const a = this.attachmentOf(db, id); a.name = checklistNameSchema.parse(patch.name); this.persist(db); return { ...a }; }
  async deleteAttachment(id: string) {
    const db = this.db(); const a = this.attachmentOf(db, id); const t = db.tasks.find((x) => x.id === a.task_id);
    this.det(db).attachments = this.det(db).attachments.filter((x) => x.id !== a.id);
    if (t?.cover?.attachment_id === a.id) t.cover = {};
    this.persist(db);
  }
  async attachmentUrl(a: TaskAttachment) { return a.url; }
  async taskBadges(taskIds: string[]) {
    const db = this.db(); const d = this.det(db); const out: Record<string, TaskBadges> = {};
    if (isClientRole(this.role)) return Object.fromEntries(taskIds.map((id) => [id, { comments: 0, attachments: 0, checkTotal: 0, checkDone: 0 }]));
    for (const id of taskIds) {
      const lists = d.checklists.filter((c) => c.task_id === id).map((c) => c.id);
      const items = d.items.filter((i) => lists.includes(i.checklist_id));
      out[id] = { comments: d.comments.filter((c) => c.task_id === id).length, attachments: d.attachments.filter((a) => a.task_id === id).length, checkTotal: items.length, checkDone: items.filter((i) => i.checked).length };
    }
    return out;
  }

  async listApprovals() {
    return this.db().approvals.filter((a) => {
      if (a.org_id !== this.orgId) return false;
      if (!isClientRole(this.role)) return true;
      return a.required_role.startsWith('client') && !!a.subject.brand_id && this.account.brand_ids.includes(a.subject.brand_id);
    });
  }
  async createApproval(input: ApprovalCreate): Promise<Approval> {
    if (isClientRole(this.role)) throw new ForbiddenError();
    const v = approvalCreateSchema.parse(input);
    const db = this.db();
    const a = await this.pushApproval(db, v);
    this.persist(db);
    return a;
  }
  private async pushApproval(db: DemoDb, v: ReturnType<typeof approvalCreateSchema.parse>): Promise<Approval> {
    const a: Approval = {
      id: this.nextId('a', db.approvals.map((x) => x.id)), org_id: this.orgId, action_type: v.action_type, title: v.title, subject: v.subject,
      required_role: v.required_role, status: 'pending', requested_by: this.account.employee_id || this.account.id, decided_by: null, decided_at: null,
      decision_note: null, due_at: v.due_at, created_at: this.now(),
    };
    db.approvals.push(a);
    await this.fire(db, 'approvals.insert', 'approvals', a);
    return a;
  }
  async decideApproval(id: string, decision: 'approved' | 'rejected', note?: string): Promise<Approval> {
    const db = this.db();
    const a = db.approvals.find((x) => x.id === id && x.org_id === this.orgId);
    if (!a) throw new NotFoundError('Onay');
    if (a.status !== 'pending') throw new ForbiddenError('Bu onay zaten karara bağlanmış');
    if (!canDecideApproval(this.role, a.required_role)) throw new ForbiddenError(`Bu onay ${a.required_role} rolü içindir`);
    const before = { ...a };
    a.status = decision; a.decided_by = `u_${this.account.id}`; a.decided_at = this.now(); a.decision_note = note ?? null;
    this.log(db, `approval.${decision}`, `approvals/${id}`, { note: note ?? null });
    await this.fire(db, 'approvals.update', 'approvals', a, before);
    // Onay kapısı: yüksek öncelikli ihale ataması onaylanınca gerçekleşir (SQL'de approvals tetikleyicisi).
    if (decision === 'approved' && a.subject.bid_id) {
      const bid = (db.taskBids ??= []).find((b) => b.id === a.subject.bid_id && b.status === 'open');
      if (bid) await this.finalizeAssignment(db, bid);
    }
    this.persist(db);
    return { ...a };
  }

  async listInbox() {
    if (isClientRole(this.role)) throw new ForbiddenError();
    const ids = new Set(this.db().channels.filter((c) => c.kind === 'inbox' && c.org_id === this.orgId).map((c) => c.id));
    return this.db().messages.filter((m) => ids.has(m.channel_id)).sort((a, b) => b.created_at.localeCompare(a.created_at));
  }
  async listChannels() {
    return this.db().channels.filter((c) => c.org_id === this.orgId && c.kind !== 'inbox' && (!c.brand_id || this.visibleBrand(c.brand_id)));
  }
  async listMessages(channelId: string) {
    const ch = (await this.listChannels()).find((c) => c.id === channelId);
    if (!ch) throw new NotFoundError('Kanal');
    return this.db().messages.filter((m) => m.channel_id === channelId).sort((a, b) => a.created_at.localeCompare(b.created_at));
  }
  async sendMessage(channelId: string, body: string): Promise<Message> {
    const text = body.trim();
    if (!text) throw new Error('Mesaj boş');
    if (!(await this.listChannels()).some((c) => c.id === channelId)) throw new NotFoundError('Kanal');
    const db = this.db();
    const m: Message = { id: this.nextId('m', db.messages.map((x) => x.id)), org_id: this.orgId, channel_id: channelId, author_id: `u_${this.account.id}`, author_name: this.account.name, body: text, meta: {}, created_at: this.now() };
    db.messages.push(m);
    this.persist(db);
    listeners.get(channelId)?.forEach((cb) => cb(m));
    return m;
  }
  subscribeMessages(channelId: string, cb: (m: Message) => void) {
    const set = listeners.get(channelId) ?? new Set();
    set.add(cb); listeners.set(channelId, set);
    return () => { set.delete(cb); };
  }

  async getSettings(): Promise<OrgSettings> { return this.db().settings[this.orgId]; }
  async saveSettings(patch: Partial<OrgSettings>): Promise<OrgSettings> {
    if (!['owner', 'org_admin'].includes(this.role)) throw new ForbiddenError();
    const v = orgSettingsPatchSchema.parse(patch);
    const db = this.db();
    db.settings[this.orgId] = { ...db.settings[this.orgId], ...v };
    this.persist(db);
    return db.settings[this.orgId];
  }
  async getConnect(): Promise<ConnectData> {
    if (!['owner', 'org_admin', 'integration_admin', 'operations', 'account', 'pm', 'finance', 'auditor'].includes(this.role)) throw new ForbiddenError();
    const c = this.db().connect;
    return { ...c, tokens: c.tokens.filter((t) => t.org_id === this.orgId && !t.revoked_at) };
  }
  async createToken(input: TokenCreate) {
    if (!TOKEN_ADMIN_ROLES.includes(this.role)) throw new ForbiddenError('API anahtarı yalnızca owner / org_admin / entegrasyon admin oluşturabilir');
    const v = tokenCreateSchema.parse(input);
    const violation = checkTokenPolicy((await this.getSettings()).security, { scopes: v.scopes, expires_in_days: v.expires_in_days });
    if (violation) throw new ForbiddenError(violation);
    const db = this.db();
    const plaintext = generateToken();
    const now = this.now();
    const token: AccessToken = {
      id: this.nextId('tok', db.connect.tokens.map((t) => t.id)), org_id: this.orgId, name: v.name, token_prefix: tokenPrefix(plaintext), scopes: v.scopes,
      created_at: now, last_used_at: null, user_id: `u_${this.account.id}`, expires_at: v.expires_in_days ? addDaysIso(now, v.expires_in_days) : null, revoked_at: null,
    };
    db.connect.tokens.push(token); // demo: yalnızca meta; düz token ve özet bile tutulmaz
    this.log(db, 'token.create', `access_tokens/${token.id}`, { name: v.name, scopes: v.scopes });
    this.persist(db);
    return { token: { ...token }, plaintext };
  }
  async revokeToken(id: string) {
    if (!TOKEN_ADMIN_ROLES.includes(this.role)) throw new ForbiddenError();
    const db = this.db();
    const t = db.connect.tokens.find((x) => x.id === id && x.org_id === this.orgId && !x.revoked_at);
    if (!t) throw new NotFoundError('Anahtar');
    t.revoked_at = this.now();
    this.log(db, 'token.revoke', `access_tokens/${id}`);
    this.persist(db);
  }
  /* ───────── Trello (demo): örnek veriyle aynı içe aktarma çekirdeği ───────── */
  async trelloState(): Promise<TrelloPublicState> {
    if (!TOKEN_ADMIN_ROLES.includes(this.role)) throw new ForbiddenError();
    const t = this.db().trello;
    return { ...maskTrelloConfig(t ? { member_map: t.member_map, last_sync_at: t.last_sync_at ?? undefined, mode: t.mode ?? 'two_way' } : null), connected: !!t?.last_sync_at, sync_log: t?.sync_log ?? [] };
  }
  async trelloSetMode(mode: TrelloMode) {
    if (!TOKEN_ADMIN_ROLES.includes(this.role)) throw new ForbiddenError();
    if (!TRELLO_MODES.includes(mode)) throw new NotFoundError('Mod');
    const db = this.db();
    const t = (db.trello ??= { last_sync_at: null, member_map: {} });
    this.demoSyncLog(db, { direction: 'reconcile', entity: 'integration', entity_id: null, external_id: null, action: 'mode', ok: true, message: `${t.mode ?? 'two_way'} → ${mode}` });
    t.mode = mode;
    this.persist(db);
  }
  /** Demo ayrıntı deposu: aynı çekirdek (`syncCardDetails`) bellek içi tablolara yazar. Trello kaynaklı satırlar `sync_origin='trello'`. */
  private demoDetailStore(db: DemoDb): DetailStore {
    const d = this.det(db); const org = this.orgId; const now = () => this.now();
    const tag = { sync_origin: 'trello', synced_at: this.now() };
    return {
      load: async (taskId) => {
        const t = db.tasks.find((x) => x.id === taskId);
        return {
          description: t?.description ?? null, cover: t?.cover ?? null, comments: d.comments.filter((c) => c.task_id === taskId), attachments: d.attachments.filter((a) => a.task_id === taskId),
          checklists: d.checklists.filter((c) => c.task_id === taskId).sort((a, b) => a.position - b.position).map((c) => this.checklistWithItems(d, c)),
        };
      },
      setTaskFields: async (taskId, patch) => { const t = db.tasks.find((x) => x.id === taskId); if (t) Object.assign(t, patch); },
      addComment: async (taskId, c) => { const r: TaskComment = { id: this.detailId('tcm', d.comments), org_id: org, task_id: taskId, author_id: null, updated_at: now(), ...tag, ...c }; d.comments.push(r); return { id: r.id }; },
      updateComment: async (id, p) => { const r = d.comments.find((x) => x.id === id); if (r) Object.assign(r, p, tag); },
      deleteComment: async (id) => { d.comments = d.comments.filter((x) => x.id !== id); },
      addChecklist: async (taskId, c) => { const r = { id: this.detailId('tcl', d.checklists), org_id: org, task_id: taskId, updated_at: now(), ...tag, ...c }; d.checklists.push(r); return { id: r.id }; },
      updateChecklist: async (id, p) => { const r = d.checklists.find((x) => x.id === id); if (r) Object.assign(r, p, tag); },
      deleteChecklist: async (id) => { d.checklists = d.checklists.filter((x) => x.id !== id); d.items = d.items.filter((i) => i.checklist_id !== id); },
      addCheckItem: async (checklistId, i) => { const r: TaskCheckItem = { id: this.detailId('tci', d.items), org_id: org, checklist_id: checklistId, updated_at: now(), ...tag, ...i }; d.items.push(r); return { id: r.id }; },
      updateCheckItem: async (id, p) => { const r = d.items.find((x) => x.id === id); if (r) Object.assign(r, p, tag); },
      deleteCheckItem: async (id) => { d.items = d.items.filter((x) => x.id !== id); },
      addAttachment: async (taskId, a) => { const r: TaskAttachment = { id: this.detailId('tat', d.attachments), org_id: org, task_id: taskId, uploaded_by: null, updated_at: now(), ...tag, ...a }; d.attachments.push(r); return { id: r.id }; },
      updateAttachment: async (id, p) => { const r = d.attachments.find((x) => x.id === id); if (r) Object.assign(r, p, tag); },
      deleteAttachment: async (id) => { d.attachments = d.attachments.filter((x) => x.id !== id); },
    };
  }
  private importing = false;
  private demoSyncLog(db: DemoDb, e: Omit<SyncLogEntry, 'provider' | 'created_at'>) {
    const t = (db.trello ??= { last_sync_at: null, member_map: {} });
    t.sync_log = [{ ...e, provider: 'trello', created_at: this.now() }, ...(t.sync_log ?? [])].slice(0, 50);
  }
  async trelloSetMember(name: string, employeeId: string) {
    if (!TOKEN_ADMIN_ROLES.includes(this.role)) throw new ForbiddenError();
    const db = this.db();
    if (!db.team.some((m) => m.id === employeeId && m.org_id === this.orgId)) throw new NotFoundError('Çalışan');
    const t = (db.trello ??= { last_sync_at: null, member_map: {} });
    const k = memberKey(name);
    if (k) t.member_map[k] = employeeId;
    this.log(db, 'trello.map_member', 'integrations/trello', { name, employeeId });
    this.persist(db);
  }
  async trelloImport(fixture: TrelloSnapshot = TRELLO_FIXTURE): Promise<TrelloImportResult> {
    if (!TOKEN_ADMIN_ROLES.includes(this.role)) throw new ForbiddenError('Trello içe aktarma yalnızca owner / org_admin / entegrasyon admin');
    const db = this.db();
    const org = this.orgId;
    const toDraft = (t: Task): StoreTask => ({ id: t.id, source_ref: t.source_ref ?? '', project_id: t.project_id, title: t.title, assignee_id: t.assignee_id, state: t.state, priority: t.priority, due_at: t.due_at ?? null, planned_minutes: t.planned_minutes, task_type: t.task_type, labels: t.labels });
    const store: TrelloStore = {
      load: async () => ({
        employees: db.team.filter((m) => m.org_id === org && m.status === 'active').map((m) => ({ id: m.id, name: m.name })),
        brands: db.brands.filter((b) => b.org_id === org).map((b) => ({ id: b.id, name: b.name })),
        projects: db.projects.filter((p) => p.org_id === org).map((p) => ({ id: p.id, name: p.name, brand_id: p.brand_id, source_ref: p.source_ref ?? null, status: p.status })),
        tasks: db.tasks.filter((t) => t.org_id === org && t.source_ref?.startsWith('trello:')).map(toDraft),
      }),
      createBrand: async (name) => {
        let n = db.brands.length + 1;
        while (db.brands.some((b) => b.id === `c_tr${n}`)) n++;
        const b: Brand = { id: `c_tr${n}`, org_id: org, client_id: `cl_tr${n}`, name, sector: '', status: 'prospect', account_owner: '', art_director: '', copywriter: '', compliance_flags: [], monthly_quota: {}, health: 60, internal: false };
        db.brands.push(b);
        return { id: b.id, name: b.name };
      },
      createProject: async (p) => {
        const id = this.nextId('p', db.projects.map((x) => x.id));
        const row: Project = { id, org_id: org, brand_id: p.brand_id, name: p.name, type: p.type, status: 'active', flow_stage: 'brief', flow_owner: '', stage_plan: [], due_at: null, budget_minor: 0, summary: 'Trello içe aktarma', client_visible: false, source_ref: p.source_ref ?? null };
        db.projects.push(row);
        return { id };
      },
      moveProjectTasks: async (fromId, toId) => {
        const rows = db.tasks.filter((t) => t.org_id === org && t.project_id === fromId);
        for (const t of rows) t.project_id = toId;
        return rows.length;
      },
      updateProject: async (id, patch) => {
        const pr = db.projects.find((x) => x.id === id && x.org_id === org);
        if (!pr) throw new NotFoundError('Proje');
        Object.assign(pr, patch as Partial<Project>);
      },
      createTasks: async (rows: TaskDraft[]) => {
        for (const r of rows) {
          const t: Task = { id: this.nextId('t', db.tasks.map((x) => x.id)), org_id: org, ...r, due_at: r.due_at ?? null, qty: 1, client_visible: false, created_at: this.now() };
          db.tasks.push(t);
          await this.fire(db, 'tasks.insert', 'tasks', t);
        }
      },
      updateTask: async (id, patch) => {
        const t = db.tasks.find((x) => x.id === id && x.org_id === org);
        if (!t) throw new NotFoundError('Görev');
        const before = { ...t };
        Object.assign(t, patch, patch.due_at !== undefined ? { due_at: patch.due_at ?? null } : {});
        await this.fire(db, 'tasks.update', 'tasks', t, before);
      },
    };
    const tr = (db.trello ??= { last_sync_at: null, member_map: {} });
    const employees = db.team.filter((m) => m.org_id === org && m.status === 'active').map((m) => ({ id: m.id, name: m.name }));
    const memberEmployees: Record<string, string> = {};
    for (const m of fixture.members) { const e = resolveEmployee(m.fullName, employees, tr.member_map); if (e) memberEmployees[m.id] = e; }
    const dsum = emptyDetailsSummary();
    const detailStore = this.demoDetailStore(db);
    const details: CardDetailsHook = async ({ card, taskId, jsNewer }) => {
      // Tam kart çekimi gibi: yoksa boş liste (Trello'da silinmişler JS'ten kalkar); JS'te açılmış (external_id'siz) satırlara dokunulmaz.
      const raw = { desc: card.desc ?? '', cover: card.cover ?? null, checklists: [], comments: [], attachments: [], ...(fixture.details?.[card.id] ?? {}) };
      addDetails(dsum, await syncCardDetails(detailStore, taskId, raw, { memberEmployees, jsNewer, cardActivity: card.dateLastActivity, log: (e) => this.demoSyncLog(db, e) }));
    };
    this.importing = true;
    let res: TrelloImportResult;
    try { res = await runImport(fixture, store, { now: this.now(), memberMap: tr.member_map, concurrency: 1, onLog: (e) => this.demoSyncLog(db, e), details }); res.details = dsum; }
    finally { this.importing = false; }
    tr.last_sync_at = this.now();
    this.log(db, 'trello.import', 'integrations/trello', { tasks_created: res.tasks_created, tasks_updated: res.tasks_updated, cards: res.cards_seen });
    this.persist(db);
    return res;
  }
  async setIntegrationStatus(id: string, status: Integration['status']) {
    if (!['owner', 'org_admin', 'integration_admin'].includes(this.role)) throw new ForbiddenError();
    const db = this.db();
    const i = db.connect.integrations.find((x) => x.id === id);
    if (!i) throw new NotFoundError('Entegrasyon');
    i.status = status; i.secret_ref = status === 'connected' ? `vault:${i.provider}` : null;
    this.persist(db);
  }

  async listAgentPrompts() { return this.db().prompts; }
  async getActivePrompt(agent: string) { return this.db().prompts.find((p) => p.agent === agent && p.is_active) ?? null; }
  async listAgentRuns() { return this.db().runs.filter((r) => r.org_id === this.orgId).sort((a, b) => b.created_at.localeCompare(a.created_at)); }
  async logAgentRun(run: Omit<AgentRun, 'id' | 'org_id' | 'created_at'>) {
    const db = this.db();
    db.runs.push({ ...run, id: this.nextId('r', db.runs.map((x) => x.id)), org_id: this.orgId, created_at: this.now() });
    this.persist(db);
  }
  async monthlyAgentSpend(month: string) {
    return this.db().runs.filter((r) => r.org_id === this.orgId && r.created_at.startsWith(month)).reduce((a, r) => a + Number(r.cost_usd), 0);
  }
  async listBoardDecisions(): Promise<BoardDecision[]> {
    if (!['owner', 'org_admin', 'auditor'].includes(this.role)) throw new ForbiddenError();
    return this.db().board.filter((b) => b.org_id === this.orgId);
  }
  async decideBoard(id: string, answer: BoardAnswer): Promise<BoardDecision> {
    if (this.role !== 'owner') throw new ForbiddenError('Kurul kararlarını yalnızca kurucu verir');
    const a = boardAnswerSchema.parse(answer);
    const db = this.db();
    const d = db.board.find((x) => x.id === id && x.org_id === this.orgId);
    if (!d) throw new NotFoundError('Karar');
    d.founder_answer = a; d.status = a === 'EVET' ? 'approved' : a === 'HAYIR' ? 'rejected' : 'deferred'; d.decided_at = this.now();
    this.persist(db);
    return { ...d };
  }
  async listTwins() { return this.db().twins.filter((t) => t.org_id === this.orgId && (!t.opt_out || this.role === 'owner' || t.employee_id === this.account.employee_id)); }
  async listTwinBids() { return this.db().bids; }

  /* ───────── İhale (twins.bids) ───────── */
  async listTaskBids(taskId?: string) {
    if (isClientRole(this.role)) throw new ForbiddenError();
    return ((this.db().taskBids ??= []).filter((b) => b.org_id === this.orgId && (!taskId || b.task_id === taskId))).sort((a, b) => b.confidence - a.confidence);
  }
  async listTaskAssignments(taskId?: string) {
    if (isClientRole(this.role)) throw new ForbiddenError();
    return (this.db().assignments ??= []).filter((a) => a.org_id === this.orgId && (!taskId || a.task_id === taskId));
  }
  async openTaskForBids(taskId: string, proposed?: BidProposal[]): Promise<TaskBid[]> {
    if (!BID_ROLES.includes(this.role)) throw new ForbiddenError('İhaleye açma yetkin yok');
    const db = this.db();
    const task = db.tasks.find((t) => t.id === taskId && t.org_id === this.orgId);
    if (!task) throw new NotFoundError('Görev');
    if (task.state === 'archive') throw new ForbiddenError('Arşivdeki görev ihaleye açılamaz');
    const eligible = db.twins.filter((t) => t.org_id === this.orgId && t.kind === 'person' && !t.opt_out && t.employee_id && t.approved_by_owner_at);
    const input: TwinBidInput = {
      task: { id: task.id, title: task.title, task_type: task.task_type, priority: task.priority, planned_minutes: task.planned_minutes },
      twins: eligible.map((t) => ({ id: t.id, employee_id: t.employee_id, name: t.name, skills: (t.profile.skills as string[]) ?? [], weekly_hours: Number(t.defaults.weekly_hours ?? 36) })),
    };
    const props = (proposed ?? demoTwinBids(input).bids).map((p) => bidProposalSchema.parse(p));
    const byId = new Map(eligible.map((t) => [t.id, t]));
    if (!props.length) throw new Error('Uygun ikiz teklif vermedi');
    if (props.some((p) => !byId.has(p.twin_id))) throw new Error('Teklif yalnızca onaylı, opt-out olmayan kişi ikizlerinden gelebilir');
    const bids = (db.taskBids ??= []);
    bids.filter((b) => b.task_id === taskId && b.status === 'open').forEach((b) => { b.status = 'withdrawn'; });
    const created: TaskBid[] = props.map((p) => {
      const bid: TaskBid = {
        id: this.nextId('bd', bids.map((b) => b.id)), org_id: this.orgId, task_id: taskId, twin_id: p.twin_id, employee_id: byId.get(p.twin_id)?.employee_id ?? null,
        confidence: Math.round(p.confidence), eta_hours: p.eta_hours, rationale: p.rationale, status: 'open', created_at: this.now(),
      };
      bids.push(bid);
      return bid;
    });
    this.log(db, 'twin_bid.open', `tasks/${taskId}`, { bids: created.length });
    for (const b of created) await this.fire(db, 'twin_bids.insert', 'twin_bids', b);
    this.persist(db);
    return created.map((b) => ({ ...b }));
  }
  async assignFromBid(bidId: string): Promise<BidAssignResult> {
    if (!BID_ROLES.includes(this.role)) throw new ForbiddenError('Atama yetkin yok');
    const db = this.db();
    const bid = (db.taskBids ??= []).find((b) => b.id === bidId && b.org_id === this.orgId);
    if (!bid) throw new NotFoundError('Teklif');
    if (bid.status !== 'open') throw new ForbiddenError('Bu teklif artık açık değil');
    const task = db.tasks.find((t) => t.id === bid.task_id);
    if (!task) throw new NotFoundError('Görev');
    if (task.priority === 'high') {
      const gate = db.approvals.filter((a) => a.subject.bid_id === bidId).sort((a, b) => b.created_at.localeCompare(a.created_at))[0];
      if (gate?.status === 'pending') return { status: 'pending_approval', approval_id: gate.id };
      if (gate?.status !== 'approved') {
        const who = db.team.find((m) => m.id === bid.employee_id)?.name ?? 'ikiz';
        const a = await this.pushApproval(db, approvalCreateSchema.parse({
          action_type: 'scope', title: `Yüksek öncelikli atama: ${task.title} → ${who}`, required_role: 'operations', due_at: task.due_at ?? this.now().slice(0, 10),
          subject: { project_id: task.project_id, task_id: task.id, bid_id: bid.id, note: `Güven %${bid.confidence} · tahmini ${bid.eta_hours} sa` },
        }));
        this.log(db, 'twin_bid.approval_requested', `tasks/${task.id}`, { bid: bid.id, approval: a.id });
        this.persist(db);
        return { status: 'pending_approval', approval_id: a.id };
      }
    }
    const assignment = await this.finalizeAssignment(db, bid);
    this.persist(db);
    return { status: 'assigned', assignment };
  }
  /** task_assignments yazar, görevi atar, teklifi 'won' / diğerlerini 'lost' yapar ve olay üretir. */
  private async finalizeAssignment(db: DemoDb, bid: TaskBid): Promise<TaskAssignment> {
    if (!bid.employee_id) throw new Error('Bu ikizin bağlı çalışanı yok');
    const task = db.tasks.find((t) => t.id === bid.task_id);
    if (!task) throw new NotFoundError('Görev');
    const list = (db.assignments ??= []);
    const a: TaskAssignment = { id: this.nextId('as', list.map((x) => x.id)), org_id: this.orgId, task_id: task.id, employee_id: bid.employee_id, bid_id: bid.id, assigned_by: `u_${this.account.id}`, created_at: this.now() };
    list.push(a);
    const before = { ...task };
    task.assignee_id = bid.employee_id;
    const losers = (db.taskBids ??= []).filter((b) => b.task_id === task.id && b.status === 'open' && b.id !== bid.id);
    bid.status = 'won'; losers.forEach((b) => { b.status = 'lost'; });
    this.log(db, 'twin_bid.assigned', `tasks/${task.id}`, { bid: bid.id, employee: bid.employee_id });
    await this.fire(db, 'task_assignments.insert', 'task_assignments', a);
    await this.fire(db, 'tasks.update', 'tasks', task, before);
    return a;
  }

  /* ───────── Otomasyon: olay → dispatcher (senkron) ───────── */
  /** Yazma olayı üretir (core.events muadili) ve yayımlanmış kuralları hemen değerlendirir. Otomasyon hataları yazmayı bozmaz. */
  private async fire(db: DemoDb, type: string, aggregate: string, row: object, old?: object) {
    const ev: AutomationEvent = { org_id: this.orgId, type, aggregate, aggregate_id: String((row as { id: string }).id), payload: { new: { ...row } as Record<string, unknown>, old: old ? { ...old } as Record<string, unknown> : null } };
    try { await dispatchEvent(ev, this.ports(db)); } catch { /* otomasyon yazmayı engellemez */ }
  }
  private ports(db: DemoDb): DispatchPorts {
    const now = this.now;
    return {
      now: () => now(),
      rules: async (org) => this.col(db, 'automations').filter((a) => a.org_id === org),
      logRun: async (org, run) => { const rows = this.col(db, 'automation_runs'); rows.push({ ...run, id: this.nextId('ar', rows.map((r) => r.id)), org_id: org, created_at: now() }); },
      touchRule: async (_o, rule, at) => { const r = this.col(db, 'automations').find((x) => x.id === rule.id); if (r) { r.runs += 1; r.last_fired_at = at; } },
      notify: async (org, n) => {
        const rows = this.col(db, 'notifications');
        for (const m of db.team.filter((t) => (t.org_id === org || t.org_id === ORG_JOBS) && NOTIFY_ROLES.includes(t.app_role as Role))) {
          rows.push({ id: this.nextId('n', rows.map((r) => r.id)), org_id: org, created_at: now(), employee_id: m.id, kind: 'system', title: n.title, body: n.body, read: false, href: n.href });
        }
      },
      createTask: async (org, input) => {
        const v = taskCreateSchema.parse(input);
        const t: Task = { id: this.nextId('t', db.tasks.map((x) => x.id)), org_id: org, project_id: v.project_id, title: v.title, assignee_id: null, state: v.state, priority: v.priority, due_at: v.due_at, planned_minutes: v.planned_minutes, task_type: v.task_type, qty: v.qty, source_ref: v.source_ref ?? null, labels: [], client_visible: false, created_at: now() };
        if (!db.projects.some((p) => p.id === v.project_id && p.org_id === org)) throw new NotFoundError('Proje');
        db.tasks.push(t);
        return { id: t.id };
      },
      setTaskState: async (org, id, state) => { const t = db.tasks.find((x) => x.id === id && x.org_id === org); if (!t) throw new NotFoundError('Görev'); t.state = state; },
      // Entegrasyon senkronu (demo): Trello'ya yazma yok → yalnızca Trello kaynaklı görev değişikliklerini günlüğe "no-op" olarak yazar.
      integrationSync: async (ev) => {
        const n = ev.payload.new as { source_ref?: string | null; id?: string } | null | undefined;
        if (this.importing || ev.aggregate !== 'tasks' || !n?.source_ref?.startsWith('trello:') || (db.trello?.mode ?? 'two_way') !== 'two_way') return;
        this.demoSyncLog(db, { direction: 'push', entity: 'task', entity_id: n.id ?? ev.aggregate_id, external_id: n.source_ref.slice(7), action: 'demo_noop', ok: true, message: 'Demo: Trello’ya yazılmadı (canlı modda kart güncellenir)' });
      },
      webhook: async () => { /* demo: ağ çağrısı yok (sunucuda gerçek HMAC imzalı çağrı yapılır) */ },
    };
  }

  /* ───────── Modül koleksiyonları ───────── */
  private log(db: DemoDb, action: string, resource: string, meta: Record<string, unknown> = {}) {
    const ev: AuditEvent = { id: `au_${db.audit.length + 1}`, org_id: this.orgId, actor: `u_${this.account.id}`, actor_name: this.account.name, action, resource, meta, occurred_at: this.now() };
    db.audit.push(ev);
  }
  private col<K extends CollKey>(db: DemoDb, kind: K): Records[K][] { return ((db.cols[kind] ??= []) as unknown) as Records[K][]; }
  private clientSees(kind: CollKey, r: { brand_id?: string | null; client_visible?: boolean }) {
    const m = COLLECTIONS[kind] as { read: unknown; nullBrand?: boolean };
    if (!r.brand_id) return !!m.nullBrand;
    if (!this.account.brand_ids.includes(r.brand_id)) return false;
    return m.read === 'brand_visible' ? r.client_visible === true : true;
  }
  async list<K extends CollKey>(kind: K): Promise<Records[K][]> {
    if (!canReadColl(this.role, kind)) throw new ForbiddenError();
    const rows = this.col(this.db(), kind).filter((r) => r.org_id === this.orgId);
    return isClientRole(this.role) ? rows.filter((r) => this.clientSees(kind, r as never)) : rows;
  }
  async save<K extends CollKey>(kind: K, input: SaveInput<K>): Promise<Records[K]> {
    const db = this.db();
    const rows = this.col(db, kind);
    const cur = input.id ? rows.find((r) => r.id === input.id && r.org_id === this.orgId) : undefined;
    if (input.id && !cur) throw new NotFoundError('Kayıt');
    const meta = COLLECTIONS[kind] as { clientWrite?: string[]; update?: string[]; write: string[] };
    const staff = (cur ? (meta.update ?? meta.write) : meta.write).includes(this.role);
    const client = !cur && !!meta.clientWrite?.includes(this.role);
    if (!staff && !client) throw new ForbiddenError();
    if (client) {
      const b = (input as { brand_id?: string | null }).brand_id;
      if (!b || !this.account.brand_ids.includes(b)) throw new ForbiddenError('Bu marka için yetkin yok');
    }
    const merged = { ...(cur ?? {}), ...input } as Records[K];
    validateRecord(kind, merged);
    if (cur) {
      const before = { ...cur };
      Object.assign(cur, input);
      this.log(db, `${kind}.update`, `${kind}/${cur.id}`);
      if (kind !== 'automation_runs' && kind !== 'automations') await this.fire(db, `${COLLECTIONS[kind].table}.update`, COLLECTIONS[kind].table, cur, before);
      this.persist(db);
      return { ...cur };
    }
    const rec = { ...input, id: this.nextId(COLLECTIONS[kind].prefix, rows.map((r) => r.id)), org_id: this.orgId, created_at: this.now() } as Records[K];
    rows.push(rec);
    this.log(db, `${kind}.create`, `${kind}/${rec.id}`);
    // Otomasyon çalıştırma günlüğü / otomasyonların kendisi olay üretmez (döngü önleme).
    if (kind !== 'automation_runs' && kind !== 'automations') await this.fire(db, `${COLLECTIONS[kind].table}.insert`, COLLECTIONS[kind].table, rec);
    this.persist(db);
    return { ...rec };
  }
  async remove(kind: CollKey, id: string) {
    if (!canWriteColl(this.role, kind) || isClientRole(this.role)) throw new ForbiddenError();
    const db = this.db();
    const rows = this.col(db, kind) as Array<{ id: string; org_id: string }>;
    const i = rows.findIndex((r) => r.id === id && r.org_id === this.orgId);
    if (i < 0) throw new NotFoundError('Kayıt');
    rows.splice(i, 1);
    this.log(db, `${kind}.delete`, `${kind}/${id}`);
    this.persist(db);
  }
  async audit(action: string, resource: string, meta: Record<string, unknown> = {}) { const db = this.db(); this.log(db, action, resource, meta); this.persist(db); }
  async listAudit() {
    if (!['owner', 'org_admin', 'auditor', 'hr'].includes(this.role)) throw new ForbiddenError();
    const rows = this.db().audit.filter((e) => e.org_id === this.orgId);
    return (this.role === 'hr' ? rows.filter((e) => e.resource.startsWith('hr') || e.action.startsWith('hr')) : rows).sort((a, b) => b.occurred_at.localeCompare(a.occurred_at));
  }
  async moveDeal(id: string, stage: DealStage): Promise<Deal> {
    if (!(DEAL_STAGES as readonly string[]).includes(stage)) throw new Error('Geçersiz aşama');
    if (!canWriteColl(this.role, 'crm_deals') || isClientRole(this.role)) throw new ForbiddenError('Pipeline kartını taşıma yetkin yok');
    const db = this.db();
    const d = this.col(db, 'crm_deals').find((x) => x.id === id && x.org_id === this.orgId);
    if (!d) throw new NotFoundError('Fırsat');
    const from = d.stage; const before = { ...d }; d.stage = stage;
    this.log(db, 'crm.deal.move', `crm_deals/${id}`, { from, to: stage });
    await this.fire(db, 'crm_deals.update', 'crm_deals', d, before);
    this.persist(db);
    return { ...d };
  }
  async decideLeave(id: string, decision: 'approved' | 'rejected'): Promise<Leave> {
    if (!LEAVE_DECIDERS.includes(this.role)) throw new ForbiddenError('İzin kararı için yetkin yok');
    const db = this.db();
    const l = this.col(db, 'leaves').find((x) => x.id === id && x.org_id === this.orgId);
    if (!l) throw new NotFoundError('İzin');
    if (l.status !== 'pending') throw new ForbiddenError('İzin zaten karara bağlanmış');
    if (l.employee_id === this.account.employee_id && this.role !== 'owner') throw new ForbiddenError('Kendi iznini onaylayamazsın');
    const before = { ...l };
    l.status = decision;
    this.log(db, `leave.${decision}`, `leaves/${id}`, { employee: l.employee_id, days: l.days });
    await this.fire(db, 'leaves.update', 'leaves', l, before);
    this.persist(db);
    return { ...l };
  }
  async hireCandidate(candidateId: string) {
    if (!canWriteColl(this.role, 'candidates') || isClientRole(this.role)) throw new ForbiddenError();
    const db = this.db();
    const cand = this.col(db, 'candidates').find((c) => c.id === candidateId && c.org_id === this.orgId);
    if (!cand) throw new NotFoundError('Aday');
    const offer = this.col(db, 'offers').find((o) => o.candidate_id === candidateId);
    if (!offer || cand.stage === 'hired') throw new ForbiddenError('Önce teklif oluşturulmalı (veya aday zaten işe alınmış)');
    const r = offerToEmployee(cand, offer, db.team);
    const member = { ...r.member, org_id: this.orgId };
    db.team.push(member);
    this.col(db, 'hr_profiles').push({ ...r.profile, id: this.nextId('hp', this.col(db, 'hr_profiles').map((x) => x.id)), org_id: this.orgId, created_at: this.now() });
    const list = this.col(db, 'checklists');
    const checklist: Checklist[] = r.tasks.map((t) => { const c = { ...t, id: this.nextId('ck', list.map((x) => x.id)), org_id: this.orgId, created_at: this.now() }; list.push(c); return c; });
    const proj = db.projects.find((p) => p.org_id === this.orgId && p.status === 'active');
    if (proj) db.tasks.push({ id: this.nextId('t', db.tasks.map((t) => t.id)), org_id: this.orgId, project_id: proj.id, title: `İlk görev · ${cand.name}: projeyi incele ve sunum yap`, assignee_id: member.id, state: 'brief', priority: 'normal', due_at: r.tasks[4].due, planned_minutes: 240, task_type: 'general', qty: 1, source_ref: `candidate:${cand.id}`, labels: ['onboarding'], client_visible: false, created_at: this.now() });
    cand.stage = 'hired'; cand.employee_id = member.id; offer.status = 'accepted';
    this.log(db, 'hire.offer_accepted', `candidates/${cand.id}`, { employee: member.id });
    this.persist(db);
    return { member, checklist };
  }
  async approveSocialBatch(brandId: string) {
    if (this.role !== 'client_admin' || !this.account.brand_ids.includes(brandId)) throw new ForbiddenError('Toplu onay yalnızca Client Admin için');
    const db = this.db();
    const posts = this.col(db, 'social_posts').filter((p) => p.org_id === this.orgId && p.brand_id === brandId && p.status === 'review' && p.client_visible);
    posts.forEach((p) => { p.status = 'approved'; });
    this.log(db, 'social.batch_approved', `brands/${brandId}`, { count: posts.length });
    this.persist(db);
    return posts.length;
  }
  async submitApplication(jobSlug: string, input: { name: string; email: string; portfolio?: string; note?: string }) {
    const item = { job: jobSlug, ...input, at: this.now() };
    if (this.storage) {
      let q: unknown[] = [];
      try { q = JSON.parse(this.storage.getItem(APPLY_QUEUE_KEY) ?? '[]') as unknown[]; } catch { q = []; }
      this.storage.setItem(APPLY_QUEUE_KEY, JSON.stringify([...q, item]));
    }
  }
  async ingestApplications() {
    if (!this.storage) return 0;
    let q: Array<{ job: string; name: string; email: string; portfolio?: string; note?: string }> = [];
    try { q = JSON.parse(this.storage.getItem(APPLY_QUEUE_KEY) ?? '[]') as typeof q; } catch { q = []; }
    if (!q.length) return 0;
    const db = this.db();
    const jobs = this.col(db, 'jobs'); const cands = this.col(db, 'candidates');
    let n = 0;
    for (const a of q) {
      const job = jobs.find((j) => j.slug === a.job) ?? jobs[0];
      if (!job) continue;
      cands.push({ id: this.nextId('cd', cands.map((c) => c.id)), org_id: job.org_id, created_at: this.now(), job_id: job.id, name: a.name, email: a.email, portfolio: a.portfolio ?? '', note: a.note ?? '', stage: 'applied', score: 0, source: 'apply', talent_pool: false, employee_id: null });
      n++;
    }
    this.log(db, 'hire.apply_ingested', 'candidates', { count: n });
    this.persist(db);
    this.storage.setItem(APPLY_QUEUE_KEY, '[]');
    return n;
  }
}
