import {
  approvalCreateSchema, canDecideApproval, isClientRole, orgSettingsPatchSchema, taskCreateSchema, boardAnswerSchema,
  type AgentRun, type Approval, type ApprovalCreate, type BoardAnswer, type ConnectData, type Integration, type Me, type Message,
  type OrgSettings, type Task, type TaskCreate, type TaskState, type BoardDecision,
} from '@jscore/contracts';
import { DEMO_ACCOUNTS, ORG_JOBS, accountToMe, makeDemoDb, type DemoAccount, type DemoDb } from '../demo-seed';
import { ForbiddenError, NotFoundError, type Repo } from './types';

export interface KV { getItem(k: string): string | null; setItem(k: string, v: string): void }
export const DEMO_STORAGE_KEY = 'js_demo_db_v1';
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
        if (raw) return JSON.parse(raw) as DemoDb;
      } catch { /* bozuk kayıt → yeniden seed */ }
      const fresh = makeDemoDb();
      this.save(fresh);
      return fresh;
    }
    return (this.mem ??= makeDemoDb());
  }
  private save(db: DemoDb) {
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
    this.save(db);
    return task;
  }
  async moveTask(id: string, state: TaskState): Promise<Task> {
    if (isClientRole(this.role) || this.role === 'auditor') throw new ForbiddenError();
    const db = this.db();
    const t = db.tasks.find((x) => x.id === id && x.org_id === this.orgId);
    if (!t) throw new NotFoundError('Görev');
    t.state = state;
    this.save(db);
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
    this.save(db);
    return a;
  }
  async decideApproval(id: string, decision: 'approved' | 'rejected', note?: string): Promise<Approval> {
    const db = this.db();
    const a = db.approvals.find((x) => x.id === id && x.org_id === this.orgId);
    if (!a) throw new NotFoundError('Onay');
    if (a.status !== 'pending') throw new ForbiddenError('Bu onay zaten karara bağlanmış');
    if (!canDecideApproval(this.role, a.required_role)) throw new ForbiddenError(`Bu onay ${a.required_role} rolü içindir`);
    a.status = decision; a.decided_by = `u_${this.account.id}`; a.decided_at = this.now(); a.decision_note = note ?? null;
    this.save(db);
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
    this.save(db);
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
    this.save(db);
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
    this.save(db);
  }

  async listAgentPrompts() { return this.db().prompts; }
  async getActivePrompt(agent: string) { return this.db().prompts.find((p) => p.agent === agent && p.is_active) ?? null; }
  async listAgentRuns() { return this.db().runs.filter((r) => r.org_id === this.orgId).sort((a, b) => b.created_at.localeCompare(a.created_at)); }
  async logAgentRun(run: Omit<AgentRun, 'id' | 'org_id' | 'created_at'>) {
    const db = this.db();
    db.runs.push({ ...run, id: this.nextId('r', db.runs.map((x) => x.id)), org_id: this.orgId, created_at: this.now() });
    this.save(db);
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
    this.save(db);
    return { ...d };
  }
  async listTwins() { return this.db().twins.filter((t) => t.org_id === this.orgId && (!t.opt_out || this.role === 'owner' || t.employee_id === this.account.employee_id)); }
  async listTwinBids() { return this.db().bids; }
}
