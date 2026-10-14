import {
  COLLECTIONS, DEAL_STAGES, LEAVE_DECIDERS, canReadColl, canWriteColl, type AuditEvent, type Checklist, type CollKey, type Deal, type DealStage, type Leave, type Records, type SaveInput,
  approvalCreateSchema, canDecideApproval, isClientRole, orgSettingsPatchSchema, taskCreateSchema, boardAnswerSchema,
  type AgentRun, type Approval, type ApprovalCreate, type BoardAnswer, type ConnectData, type Integration, type Me, type Message,
  type OrgSettings, type Task, type TaskCreate, type TaskState, type BoardDecision,
} from '@jscore/contracts';
import { DEMO_ACCOUNTS, ORG_JOBS, accountToMe, makeDemoDb, type DemoAccount, type DemoDb } from '../demo-seed';
import { makeModuleSeed } from '../demo-seed-modules';
import { offerToEmployee } from '../domain';
import { validateRecord } from './validate';
import { ForbiddenError, NotFoundError, type Repo } from './types';

export interface KV { getItem(k: string): string | null; setItem(k: string, v: string): void }
export const DEMO_STORAGE_KEY = 'js_demo_db_v1';
/** /apply/[job] başvuruları buraya düşer; hire sayfası açılınca `ingestApplications()` aday olarak alır. */
export const APPLY_QUEUE_KEY = 'js_apply_queue_v1';
const listeners = new Map<string, Set<(m: Message) => void>>();

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
    this.persist(db);
    return task;
  }
  async moveTask(id: string, state: TaskState): Promise<Task> {
    if (isClientRole(this.role) || this.role === 'auditor') throw new ForbiddenError();
    const db = this.db();
    const t = db.tasks.find((x) => x.id === id && x.org_id === this.orgId);
    if (!t) throw new NotFoundError('Görev');
    t.state = state;
    this.log(db, 'task.move', `tasks/${id}`, { state });
    this.persist(db);
    return { ...t };
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
    const a: Approval = {
      id: this.nextId('a', db.approvals.map((x) => x.id)), org_id: this.orgId, action_type: v.action_type, title: v.title, subject: v.subject,
      required_role: v.required_role, status: 'pending', requested_by: this.account.employee_id || this.account.id, decided_by: null, decided_at: null,
      decision_note: null, due_at: v.due_at, created_at: this.now(),
    };
    db.approvals.push(a);
    this.persist(db);
    return a;
  }
  async decideApproval(id: string, decision: 'approved' | 'rejected', note?: string): Promise<Approval> {
    const db = this.db();
    const a = db.approvals.find((x) => x.id === id && x.org_id === this.orgId);
    if (!a) throw new NotFoundError('Onay');
    if (a.status !== 'pending') throw new ForbiddenError('Bu onay zaten karara bağlanmış');
    if (!canDecideApproval(this.role, a.required_role)) throw new ForbiddenError(`Bu onay ${a.required_role} rolü içindir`);
    a.status = decision; a.decided_by = `u_${this.account.id}`; a.decided_at = this.now(); a.decision_note = note ?? null;
    this.log(db, `approval.${decision}`, `approvals/${id}`, { note: note ?? null });
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
    return this.db().connect;
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
      Object.assign(cur, input);
      this.log(db, `${kind}.update`, `${kind}/${cur.id}`);
      this.persist(db);
      return { ...cur };
    }
    const rec = { ...input, id: this.nextId(COLLECTIONS[kind].prefix, rows.map((r) => r.id)), org_id: this.orgId, created_at: this.now() } as Records[K];
    rows.push(rec);
    this.log(db, `${kind}.create`, `${kind}/${rec.id}`);
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
    const from = d.stage; d.stage = stage;
    this.log(db, 'crm.deal.move', `crm_deals/${id}`, { from, to: stage });
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
    l.status = decision;
    this.log(db, `leave.${decision}`, `leaves/${id}`, { employee: l.employee_id, days: l.days });
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
