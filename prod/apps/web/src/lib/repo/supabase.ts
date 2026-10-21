import type { SupabaseClient } from '@supabase/supabase-js';
import {
  COLLECTIONS, DEAL_STAGES, LEAVE_DECIDERS, canWriteColl, type AuditEvent, type Checklist, type CollKey, type Deal, type DealStage, type Leave, type Records, type SaveInput, type TeamMember,
  approvalCreateSchema, canDecideApproval, orgSettingsPatchSchema, taskCreateSchema, taskPatchSchema, type AgentRun, type Approval, type ApprovalCreate, type BoardAnswer,
  TOKEN_ADMIN_ROLES, bidProposalSchema, tokenCreateSchema, type AccessToken, type BidAssignResult, type BidProposal, type TaskAssignment, type TaskBid, type TokenCreate,
  checkItemCreateSchema, checkItemPatchSchema, checklistNameSchema, commentBodySchema, MAX_ATTACHMENT_BYTES, type AttachmentInput, type CheckItemCreate, type CheckItemPatch,
  type TaskAttachment, type TaskBadges, type TaskCheckItem, type TaskChecklist, type TaskComment,
  type BoardDecision, type ConnectData, type Integration, type Me, type Message, type OrgSettings, type Role, type Task, type TaskCreate, type TaskPatch, type TaskState,
} from '@jscore/contracts';
import { DEFAULT_SETTINGS } from './defaults';
import { addDaysIso, generateToken, sha256Hex, tokenPrefix } from '../token';
import { ForbiddenError, NotFoundError, type Repo } from './types';
import { validateRecord } from './validate';

type Row = Record<string, unknown>;
const FILES_BUCKET = 'task-files';
const TOKEN_COLS = 'id,org_id,name,token_prefix,scopes,created_at,last_used_at,user_id,expires_at,revoked_at';
/** RLS bilinçli: her sorgu kullanıcının JWT'si ile çalışır; ek filtre yalnızca aktif organizasyonu seçmek içindir. */
export class SupabaseRepo implements Repo {
  readonly mode = 'supabase' as const;
  constructor(private sb: SupabaseClient, private orgId: string | null = null) {}

  private async ok<T>(p: PromiseLike<{ data: T | null; error: { message: string; code?: string } | null }>): Promise<T> {
    const { data, error } = await p;
    if (error) throw error.code === '42501' ? new ForbiddenError(error.message) : new Error(error.message);
    return data as T;
  }
  private async org(): Promise<string> {
    if (this.orgId) return this.orgId;
    const orgs = await this.listOrgs();
    if (!orgs[0]) throw new NotFoundError('Organizasyon');
    return (this.orgId = orgs[0].id);
  }

  async listOrgs() { return this.ok<{ id: string; name: string; slug: string }[]>(this.sb.from('organizations').select('id,name,slug').order('name')); }
  async me(): Promise<Me | null> {
    const { data: { user } } = await this.sb.auth.getUser();
    if (!user) return null;
    const org_id = await this.org();
    const mem = await this.ok<Row | null>(this.sb.from('memberships').select('role,scopes').eq('user_id', user.id).eq('org_id', org_id).maybeSingle());
    const emp = await this.ok<Row | null>(this.sb.from('employees').select('id,name,role_title').eq('auth_user_id', user.id).eq('org_id', org_id).maybeSingle());
    const scopes = (mem?.scopes ?? {}) as { client_ids?: string[]; brand_ids?: string[] };
    const name = (emp?.name as string) ?? (user.user_metadata?.full_name as string) ?? user.email ?? 'Kullanıcı';
    return {
      id: user.id, name, email: user.email ?? '', initials: name.split(/\s+/).map((s) => s[0]).slice(0, 2).join('').toUpperCase(),
      title: (emp?.role_title as string) ?? '', role: ((mem?.role as Role) ?? 'client_viewer'), org_id, employee_id: emp?.id as string | undefined,
      client_id: scopes.client_ids?.[0], brand_ids: scopes.brand_ids ?? [], scopes: [],
    };
  }
  async team() { return this.ok(this.sb.from('employees').select('id,org_id,name,role_title,app_role,status,weekly_hours').eq('org_id', await this.org())); }
  async listMembers() {
    const rows = await this.ok<Row[]>(this.sb.from('memberships').select('user_id,role').eq('org_id', await this.org()));
    return rows.map((r) => ({ user_id: r.user_id as string, name: String(r.user_id).slice(0, 8), email: '', role: r.role as Role, status: 'active' as const }));
  }

  async listBrands() { return this.ok(this.sb.from('brands').select('*').eq('org_id', await this.org()).order('name')); }
  async listProjects() { return this.ok(this.sb.from('projects').select('*').eq('org_id', await this.org()).order('due_at')); }
  async getProject(id: string) { return this.ok(this.sb.from('projects').select('*').eq('id', id).maybeSingle()); }
  async listTaskTypes() { return this.ok(this.sb.from('task_types').select('*').eq('org_id', await this.org())); }
  async listTasks(filter?: { project_id?: string }) {
    let q = this.sb.from('tasks').select('*').eq('org_id', await this.org()).order('due_at');
    if (filter?.project_id) q = q.eq('project_id', filter.project_id);
    return this.ok<Task[]>(q);
  }
  async createTask(input: TaskCreate) {
    const v = taskCreateSchema.parse(input);
    return this.pushSoon(await this.ok<Task>(this.sb.from('tasks').insert({ ...v, org_id: await this.org() }).select().single()));
  }
  async moveTask(id: string, state: TaskState) { return this.pushSoon(await this.ok<Task>(this.sb.from('tasks').update({ state }).eq('id', id).select().single())); }
  async updateTask(id: string, patch: TaskPatch) {
    const v = taskPatchSchema.parse(patch);
    return this.pushSoon(await this.ok<Task>(this.sb.from('tasks').update(v).eq('id', id).select().single()));
  }
  /** Best-effort satır içi JS → Trello itmesi (tarayıcıda, beklemeden). Kaçırılırsa /api/events/dispatch cron'u olaydan yeniden itiyor; itme idempotent. */
  private pushSoon(t: Task): Task {
    if (typeof window !== 'undefined') {
      void fetch('/api/integrations/trello/push', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ task_id: t.id }), keepalive: true }).catch(() => undefined);
    }
    return t;
  }

  /* ───────── Görev ayrıntıları (0012): yorum, checklist, ek. RLS ile korunur; 0 satır etkilenirse yetki/yok hatası verir. ───────── */
  /** Best-effort satır içi itme: son dakikaların ayrıntı olaylarını Trello'ya iter (cron aynı olayları yeniden işler; idempotent). */
  private detailsSoon<T>(v: T): T {
    if (typeof window !== 'undefined') void fetch('/api/integrations/trello/push', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ details: true }), keepalive: true }).catch(() => undefined);
    return v;
  }
  private async one<T>(p: PromiseLike<{ data: T[] | null; error: { message: string; code?: string } | null }>, what = 'Kayıt'): Promise<T> {
    const rows = await this.ok<T[]>(p);
    if (!rows?.length) throw new ForbiddenError(`${what} bulunamadı ya da değiştirme yetkin yok`);
    return rows[0];
  }
  async listComments(taskId: string) { return this.ok<TaskComment[]>(this.sb.from('task_comments').select('*').eq('task_id', taskId).order('created_at')); }
  async addComment(taskId: string, body: string) {
    const me = await this.me();
    if (!me) throw new ForbiddenError();
    const row = { org_id: me.org_id, task_id: taskId, author_id: me.id, author_name: me.name, body: commentBodySchema.parse(body) };
    return this.detailsSoon(await this.one<TaskComment>(this.sb.from('task_comments').insert(row).select(), 'Görev'));
  }
  async updateComment(id: string, body: string) { return this.detailsSoon(await this.one<TaskComment>(this.sb.from('task_comments').update({ body: commentBodySchema.parse(body) }).eq('id', id).select(), 'Yorum')); }
  async deleteComment(id: string) { await this.one(this.sb.from('task_comments').delete().eq('id', id).select('id'), 'Yorum'); this.detailsSoon(0); }

  private withItems(r: Row): TaskChecklist {
    const { task_check_items, ...rest } = r;
    return { ...(rest as Omit<TaskChecklist, 'items'>), items: ((task_check_items as TaskCheckItem[] | null) ?? []).slice().sort((a, b) => a.position - b.position) };
  }
  async listChecklists(taskId: string) {
    const rows = await this.ok<Row[]>(this.sb.from('task_checklists').select('*, task_check_items(*)').eq('task_id', taskId).order('position'));
    return rows.map((r) => this.withItems(r));
  }
  async addChecklist(taskId: string, name: string) {
    const cur = await this.ok<Array<{ position: number }>>(this.sb.from('task_checklists').select('position').eq('task_id', taskId).order('position', { ascending: false }).limit(1));
    const row = await this.one<Row>(this.sb.from('task_checklists').insert({ org_id: await this.org(), task_id: taskId, name: checklistNameSchema.parse(name), position: (cur[0]?.position ?? -1) + 1 }).select('*, task_check_items(*)'), 'Görev');
    return this.detailsSoon(this.withItems(row));
  }
  async updateChecklist(id: string, patch: { name: string }) {
    return this.detailsSoon(this.withItems(await this.one<Row>(this.sb.from('task_checklists').update({ name: checklistNameSchema.parse(patch.name) }).eq('id', id).select('*, task_check_items(*)'), 'Checklist')));
  }
  async deleteChecklist(id: string) { await this.one(this.sb.from('task_checklists').delete().eq('id', id).select('id'), 'Checklist'); this.detailsSoon(0); }
  async addCheckItem(checklistId: string, input: CheckItemCreate) {
    const v = checkItemCreateSchema.parse(input);
    const cur = await this.ok<Array<{ position: number }>>(this.sb.from('task_check_items').select('position').eq('checklist_id', checklistId).order('position', { ascending: false }).limit(1));
    return this.detailsSoon(await this.one<TaskCheckItem>(this.sb.from('task_check_items').insert({ org_id: await this.org(), checklist_id: checklistId, name: v.name, due_at: v.due_at ?? null, assignee_id: v.assignee_id ?? null, position: (cur[0]?.position ?? -1) + 1 }).select(), 'Checklist'));
  }
  async updateCheckItem(id: string, patch: CheckItemPatch) { return this.detailsSoon(await this.one<TaskCheckItem>(this.sb.from('task_check_items').update(checkItemPatchSchema.parse(patch)).eq('id', id).select(), 'Madde')); }
  async deleteCheckItem(id: string) { await this.one(this.sb.from('task_check_items').delete().eq('id', id).select('id'), 'Madde'); this.detailsSoon(0); }

  async listAttachments(taskId: string) { return this.ok<TaskAttachment[]>(this.sb.from('task_attachments').select('*').eq('task_id', taskId).order('created_at')); }
  /** Dosya: Storage `task-files` (<org>/<görev>/<uuid>-<ad>) + satır; bağlantı: yalnızca satır. Satır yazılamazsa yüklenen dosya geri silinir. */
  async addAttachment(taskId: string, input: AttachmentInput) {
    const me = await this.me();
    if (!me) throw new ForbiddenError();
    let row: Row;
    let path: string | null = null;
    if (input.file) {
      if (input.file.size > MAX_ATTACHMENT_BYTES) throw new Error('Dosya 25 MB sınırını aşıyor');
      const f = input.file as Blob & { name?: string };
      const name = (input.name?.trim() || f.name || 'dosya').slice(0, 500);
      const safe = name.normalize('NFKD').replace(/[^\w.-]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 100) || 'dosya';
      path = `${me.org_id}/${taskId}/${crypto.randomUUID()}-${safe}`;
      const mime = input.mime || f.type || 'application/octet-stream';
      const up = await this.sb.storage.from(FILES_BUCKET).upload(path, input.file, { contentType: mime, upsert: false });
      if (up.error) throw new Error(`Dosya yüklenemedi: ${up.error.message}`);
      row = { name, mime, bytes: f.size, storage_path: path, url: '' };
    } else {
      const url = input.url?.trim() ?? '';
      if (!/^https?:\/\/\S+$/i.test(url)) throw new Error('Geçerli bir http(s) bağlantısı gir');
      row = { name: (input.name?.trim() || url.replace(/^https?:\/\//i, '').split('/')[0]).slice(0, 500), url, mime: '', bytes: 0, storage_path: null };
    }
    try {
      return this.detailsSoon(await this.one<TaskAttachment>(this.sb.from('task_attachments').insert({ ...row, org_id: me.org_id, task_id: taskId, uploaded_by: me.id }).select(), 'Görev'));
    } catch (e) {
      if (path) await this.sb.storage.from(FILES_BUCKET).remove([path]).then(() => undefined, () => undefined);
      throw e;
    }
  }
  async updateAttachment(id: string, patch: { name: string }) { return this.detailsSoon(await this.one<TaskAttachment>(this.sb.from('task_attachments').update({ name: checklistNameSchema.parse(patch.name) }).eq('id', id).select(), 'Dosya')); }
  async deleteAttachment(id: string) {
    const a = await this.one<TaskAttachment>(this.sb.from('task_attachments').select('*').eq('id', id), 'Dosya');
    await this.one(this.sb.from('task_attachments').delete().eq('id', id).select('id'), 'Dosya');
    if (a.storage_path) await this.sb.storage.from(FILES_BUCKET).remove([a.storage_path]).then(() => undefined, () => undefined);
    // Kapak olarak kullanılan ek silindiyse kapağı kaldır.
    const t = await this.ok<Row | null>(this.sb.from('tasks').select('cover').eq('id', a.task_id).maybeSingle());
    if ((t?.cover as { attachment_id?: string } | null)?.attachment_id === id) await this.ok(this.sb.from('tasks').update({ cover: {} }).eq('id', a.task_id).select('id'));
    this.detailsSoon(0);
  }
  async attachmentUrl(a: TaskAttachment, opts: { download?: boolean } = {}) {
    if (!a.storage_path) return a.url;
    const { data, error } = await this.sb.storage.from(FILES_BUCKET).createSignedUrl(a.storage_path, 3600, opts.download ? { download: a.name } : undefined);
    if (error || !data) throw new Error(`Dosya adresi alınamadı: ${error?.message ?? ''}`);
    return data.signedUrl;
  }
  async taskBadges(taskIds: string[]) {
    const out: Record<string, TaskBadges> = Object.fromEntries(taskIds.map((id) => [id, { comments: 0, attachments: 0, checkTotal: 0, checkDone: 0 }]));
    // PostgREST satır sınırı (1000) için sayfalı okuma
    const pages = async <T,>(mk: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: { message: string; code?: string } | null }>) => {
      const rows: T[] = [];
      for (let from = 0; ; from += 1000) { const r = await this.ok<T[]>(mk(from, from + 999)); rows.push(...r); if (r.length < 1000) return rows; }
    };
    for (let i = 0; i < taskIds.length; i += 100) {
      const ids = taskIds.slice(i, i + 100);
      const [cm, at, cl] = await Promise.all([
        pages<{ task_id: string }>((f, t) => this.sb.from('task_comments').select('task_id').in('task_id', ids).order('id').range(f, t)),
        pages<{ task_id: string }>((f, t) => this.sb.from('task_attachments').select('task_id').in('task_id', ids).order('id').range(f, t)),
        pages<{ task_id: string; task_check_items: Array<{ checked: boolean }> | null }>((f, t) => this.sb.from('task_checklists').select('task_id, task_check_items(checked)').in('task_id', ids).order('id').range(f, t)),
      ]);
      for (const r of cm) out[r.task_id].comments++;
      for (const r of at) out[r.task_id].attachments++;
      for (const r of cl) for (const it of r.task_check_items ?? []) { out[r.task_id].checkTotal++; if (it.checked) out[r.task_id].checkDone++; }
    }
    return out;
  }

  async listApprovals() { return this.ok(this.sb.from('approvals').select('*').eq('org_id', await this.org()).order('created_at', { ascending: false })); }
  async createApproval(input: ApprovalCreate) {
    const v = approvalCreateSchema.parse(input);
    return this.ok<Approval>(this.sb.from('approvals').insert({ ...v, org_id: await this.org() }).select().single());
  }
  async decideApproval(id: string, decision: 'approved' | 'rejected', note?: string) {
    const me = await this.me();
    const cur = await this.ok<Approval | null>(this.sb.from('approvals').select('*').eq('id', id).maybeSingle());
    if (!cur) throw new NotFoundError('Onay');
    if (cur.status !== 'pending') throw new ForbiddenError('Bu onay zaten karara bağlanmış');
    if (!me || !canDecideApproval(me.role, cur.required_role)) throw new ForbiddenError();
    return this.ok<Approval>(this.sb.from('approvals').update({ status: decision, decided_by: me.id, decided_at: new Date().toISOString(), decision_note: note ?? null }).eq('id', id).eq('status', 'pending').select().single());
  }

  async listInbox() {
    const ch = await this.ok<{ id: string }[]>(this.sb.from('channels').select('id').eq('org_id', await this.org()).eq('kind', 'inbox'));
    if (!ch.length) return [];
    return this.ok<Message[]>(this.sb.from('messages').select('*').in('channel_id', ch.map((c) => c.id)).order('created_at', { ascending: false }).limit(100));
  }
  async listChannels() { return this.ok(this.sb.from('channels').select('*').eq('org_id', await this.org()).neq('kind', 'inbox').order('name')); }
  async listMessages(channelId: string) { return this.ok<Message[]>(this.sb.from('messages').select('*').eq('channel_id', channelId).order('created_at').limit(200)); }
  async sendMessage(channelId: string, body: string) {
    const me = await this.me();
    if (!me) throw new ForbiddenError();
    return this.ok<Message>(this.sb.from('messages').insert({ channel_id: channelId, org_id: me.org_id, author_id: me.id, author_name: me.name, body: body.trim() }).select().single());
  }
  subscribeMessages(channelId: string, cb: (m: Message) => void) {
    const ch = this.sb.channel(`msg:${channelId}`).on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages', filter: `channel_id=eq.${channelId}` }, (p) => cb(p.new as Message)).subscribe();
    return () => { void this.sb.removeChannel(ch); };
  }

  async getSettings(): Promise<OrgSettings> {
    const row = await this.ok<Row | null>(this.sb.from('organizations').select('name,settings').eq('id', await this.org()).maybeSingle());
    const s = (row?.settings ?? {}) as Partial<OrgSettings>;
    return { ...DEFAULT_SETTINGS, ...s, general: { ...DEFAULT_SETTINGS.general, name: (row?.name as string) ?? DEFAULT_SETTINGS.general.name, ...s.general } };
  }
  async saveSettings(patch: Partial<OrgSettings>) {
    const merged = { ...(await this.getSettings()), ...orgSettingsPatchSchema.parse(patch) };
    await this.ok(this.sb.from('organizations').update({ settings: merged, name: merged.general.name }).eq('id', await this.org()).select('id'));
    return merged;
  }
  async getConnect(): Promise<ConnectData> {
    const org = await this.org();
    const [integrations, mcp_servers, webhooks, tokens] = await Promise.all([
      this.ok<ConnectData['integrations']>(this.sb.from('integrations').select('id,org_id,provider,name,status,scopes,secret_ref').eq('org_id', org)),
      this.ok<ConnectData['mcp_servers']>(this.sb.from('mcp_servers').select('*').eq('org_id', org)),
      this.ok<ConnectData['webhooks']>(this.sb.from('webhooks').select('*').eq('org_id', org)),
      this.ok<ConnectData['tokens']>(this.sb.from('access_tokens').select(TOKEN_COLS).eq('org_id', org).is('revoked_at', null)),
    ]);
    return { integrations, mcp_servers, webhooks, tokens };
  }
  async setIntegrationStatus(id: string, status: Integration['status']) { await this.ok(this.sb.from('integrations').update({ status }).eq('id', id).select('id')); }
  async createToken(input: TokenCreate) {
    const me = await this.me();
    if (!me || !TOKEN_ADMIN_ROLES.includes(me.role)) throw new ForbiddenError('API anahtarı yalnızca owner / org_admin / entegrasyon admin oluşturabilir');
    const v = tokenCreateSchema.parse(input);
    const plaintext = generateToken();
    // Yalnızca sha256 özeti saklanır; düz token bu çağrının dönüşünden başka hiçbir yerde bulunmaz.
    const token = await this.ok<AccessToken>(this.sb.from('access_tokens').insert({
      org_id: me.org_id, name: v.name, scopes: v.scopes, token_prefix: tokenPrefix(plaintext), token_hash: await sha256Hex(plaintext), user_id: me.id,
      expires_at: v.expires_in_days ? addDaysIso(new Date().toISOString(), v.expires_in_days) : null,
    }).select(TOKEN_COLS).single());
    await this.audit('token.create', `access_tokens/${token.id}`, { name: v.name, scopes: v.scopes });
    return { token, plaintext };
  }
  async revokeToken(id: string) {
    const rows = await this.ok<Row[]>(this.sb.from('access_tokens').update({ revoked_at: new Date().toISOString() }).eq('id', id).is('revoked_at', null).select('id'));
    if (!rows.length) throw new NotFoundError('Anahtar');
    await this.audit('token.revoke', `access_tokens/${id}`);
  }

  async listAgentPrompts() { return this.ok(this.sb.from('agent_prompts').select('*').or(`org_id.is.null,org_id.eq.${await this.org()}`).order('agent')); }
  async getActivePrompt(agent: string) {
    const rows = await this.ok<Array<{ org_id: string | null } & Record<string, unknown>>>(this.sb.from('agent_prompts').select('*').eq('agent', agent).eq('is_active', true).or(`org_id.is.null,org_id.eq.${await this.org()}`));
    const row = rows.find((r) => r.org_id) ?? rows[0];
    return (row as never) ?? null;
  }
  async listAgentRuns() { return this.ok(this.sb.from('agent_runs').select('*').eq('org_id', await this.org()).order('created_at', { ascending: false }).limit(50)); }
  async logAgentRun(run: Omit<AgentRun, 'id' | 'org_id' | 'created_at'>) { await this.ok(this.sb.from('agent_runs').insert({ ...run, org_id: await this.org() }).select('id')); }
  async monthlyAgentSpend(month: string) {
    const [y, m] = month.split('-').map(Number);
    const next = m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, '0')}`;
    const rows = await this.ok<Row[]>(this.sb.from('agent_runs').select('cost_usd').eq('org_id', await this.org()).gte('created_at', `${month}-01T00:00:00Z`).lt('created_at', `${next}-01T00:00:00Z`));
    return rows.reduce((a, r) => a + Number(r.cost_usd), 0);
  }
  async listBoardDecisions() { return this.ok<BoardDecision[]>(this.sb.from('board_decisions').select('*').eq('org_id', await this.org()).order('created_at', { ascending: false })); }
  async decideBoard(id: string, answer: BoardAnswer) {
    const status = answer === 'EVET' ? 'approved' : answer === 'HAYIR' ? 'rejected' : 'deferred';
    return this.ok<BoardDecision>(this.sb.from('board_decisions').update({ founder_answer: answer, status, decided_at: new Date().toISOString() }).eq('id', id).select().single());
  }
  async listTwins() { return this.ok(this.sb.from('employee_twins').select('*').eq('org_id', await this.org())); }
  async listTwinBids() { return []; /* eski 'iş ihaleleri' demo listesi; gerçek teklifler: listTaskBids */ }

  /* ───────── İhale (public.twin_bids = twins.bids) ───────── */
  async listTaskBids(taskId?: string) {
    let q = this.sb.from('twin_bids').select('*').eq('org_id', await this.org()).order('confidence', { ascending: false });
    if (taskId) q = q.eq('task_id', taskId);
    return this.ok<TaskBid[]>(q);
  }
  async listTaskAssignments(taskId?: string) {
    let q = this.sb.from('task_assignments').select('*').eq('org_id', await this.org()).order('created_at', { ascending: false });
    if (taskId) q = q.eq('task_id', taskId);
    return this.ok<TaskAssignment[]>(q);
  }
  /** Teklifler `twin_bid` ajanından (POST /api/agents/run) gelir; burada doğrulanıp yazılır. */
  async openTaskForBids(taskId: string, proposed?: BidProposal[]): Promise<TaskBid[]> {
    if (!proposed) throw new Error('Teklifler yok: önce twin_bid ajanı çalıştırılmalı');
    if (!proposed.length) throw new Error('Uygun ikiz teklif vermedi');
    const props = proposed.map((p) => bidProposalSchema.parse(p));
    const org = await this.org();
    const twins = await this.ok<Array<{ id: string; employee_id: string | null }>>(this.sb.from('employee_twins').select('id,employee_id').eq('org_id', org).eq('kind', 'person').eq('opt_out', false).not('approved_by_owner_at', 'is', null).in('id', props.map((p) => p.twin_id)));
    const emp = new Map(twins.map((t) => [t.id, t.employee_id]));
    if (props.some((p) => !emp.get(p.twin_id))) throw new Error('Teklif yalnızca onaylı, opt-out olmayan kişi ikizlerinden gelebilir');
    await this.ok(this.sb.from('twin_bids').update({ status: 'withdrawn' }).eq('task_id', taskId).eq('status', 'open').select('id'));
    const rows = props.map((p) => ({ org_id: org, task_id: taskId, twin_id: p.twin_id, employee_id: emp.get(p.twin_id), confidence: Math.round(p.confidence), eta_hours: p.eta_hours, rationale: p.rationale, status: 'open' }));
    return this.ok<TaskBid[]>(this.sb.from('twin_bids').insert(rows).select());
  }
  /** Yetki + yüksek öncelik onay kapısı SQL tarafında (assign_bid, security definer). */
  async assignFromBid(bidId: string): Promise<BidAssignResult> {
    const r = await this.ok<{ status: 'assigned' | 'pending_approval'; approval_id?: string; assignment_id?: string }>(this.sb.rpc('assign_bid', { p_bid: bidId }));
    if (r.status === 'pending_approval') return { status: 'pending_approval', approval_id: r.approval_id as string };
    const a = await this.ok<TaskAssignment>(this.sb.from('task_assignments').select('*').eq('id', r.assignment_id as string).single());
    return { status: 'assigned', assignment: a };
  }

  /* ───────── Modül koleksiyonları: {id, org_id, brand_id?, data jsonb, created_at} + COLLECTIONS.native kolonları ───────── */
  private native(kind: CollKey): string[] { return ((COLLECTIONS[kind] as { native?: string[] }).native ?? ['brand_id']); }
  private fromRow<K extends CollKey>(row: Row): Records[K] {
    const { data, ...rest } = row;
    return { ...rest, ...((data as Row | null) ?? {}) } as unknown as Records[K];
  }
  private toRow(kind: CollKey, rec: Row): Row {
    const nat = new Set(this.native(kind));
    const col: Row = {}; const data: Row = {};
    for (const [k, v] of Object.entries(rec)) {
      if (k === 'id' || k === 'org_id' || k === 'created_at') continue;
      (nat.has(k) ? col : data)[k] = v;
    }
    return { ...col, data };
  }
  async list<K extends CollKey>(kind: K): Promise<Records[K][]> {
    const rows = await this.ok<Row[]>(this.sb.from(COLLECTIONS[kind].table).select('*').eq('org_id', await this.org()).order('created_at'));
    return rows.map((r) => this.fromRow<K>(r));
  }
  async save<K extends CollKey>(kind: K, input: SaveInput<K>): Promise<Records[K]> {
    const table = COLLECTIONS[kind].table;
    let merged: Row = input as Row;
    if (input.id) {
      const cur = await this.ok<Row | null>(this.sb.from(table).select('*').eq('id', input.id).maybeSingle());
      if (!cur) throw new NotFoundError('Kayıt');
      merged = { ...this.fromRow(cur), ...input };
    }
    validateRecord(kind, merged);
    const row = this.toRow(kind, merged);
    const saved = input.id
      ? await this.ok<Row>(this.sb.from(table).update(row).eq('id', input.id).select().single())
      : await this.ok<Row>(this.sb.from(table).insert({ ...row, org_id: await this.org() }).select().single());
    await this.audit(`${kind}.${input.id ? 'update' : 'create'}`, `${kind}/${saved.id as string}`);
    return this.fromRow<K>(saved);
  }
  async remove(kind: CollKey, id: string) {
    const me = await this.me();
    if (!me || !canWriteColl(me.role, kind)) throw new ForbiddenError();
    await this.ok(this.sb.from(COLLECTIONS[kind].table).delete().eq('id', id).select('id'));
    await this.audit(`${kind}.delete`, `${kind}/${id}`);
  }
  async audit(action: string, resource: string, meta: Record<string, unknown> = {}) {
    const { data: { user } } = await this.sb.auth.getUser();
    await this.ok(this.sb.from('audit_events').insert({ org_id: await this.org(), actor: user?.id ?? null, action, resource, meta }).select('id'));
  }
  async listAudit(): Promise<AuditEvent[]> {
    const rows = await this.ok<Row[]>(this.sb.from('audit_events').select('*').eq('org_id', await this.org()).order('occurred_at', { ascending: false }).limit(200));
    return rows.map((r) => ({ id: r.id as string, org_id: r.org_id as string, actor: (r.actor as string) ?? '', actor_name: (r.actor as string)?.slice(0, 8) ?? 'sistem', action: r.action as string, resource: r.resource as string, meta: (r.meta as Record<string, unknown>) ?? {}, occurred_at: r.occurred_at as string }));
  }
  async moveDeal(id: string, stage: DealStage): Promise<Deal> {
    if (!(DEAL_STAGES as readonly string[]).includes(stage)) throw new Error('Geçersiz aşama');
    const me = await this.me();
    if (!me || !canWriteColl(me.role, 'crm_deals')) throw new ForbiddenError('Pipeline kartını taşıma yetkin yok');
    return this.save('crm_deals', { id, stage } as SaveInput<'crm_deals'>);
  }
  async decideLeave(id: string, decision: 'approved' | 'rejected'): Promise<Leave> {
    const me = await this.me();
    if (!me || !LEAVE_DECIDERS.includes(me.role)) throw new ForbiddenError('İzin kararı için yetkin yok');
    return this.save('leaves', { id, status: decision } as SaveInput<'leaves'>);
  }
  async hireCandidate(candidateId: string): Promise<{ member: TeamMember; checklist: Checklist[] }> {
    const r = await this.ok<{ employee_id: string }>(this.sb.rpc('hire_candidate', { p_candidate: candidateId }));
    const org = await this.org();
    const [team, checklist] = await Promise.all([this.team(), this.list('checklists')]);
    const member = (team as TeamMember[]).find((t) => t.id === r.employee_id);
    if (!member) throw new NotFoundError('Çalışan');
    return { member: { ...member, org_id: org }, checklist: checklist.filter((c) => c.employee_id === r.employee_id) };
  }
  async approveSocialBatch(brandId: string) { return this.ok<number>(this.sb.rpc('approve_social_batch', { p_brand: brandId })); }
  async submitApplication(jobSlug: string, input: { name: string; email: string; portfolio?: string; note?: string }) {
    const job = await this.ok<Row | null>(this.sb.from('jobs').select('id,org_id').filter('data->>slug', 'eq', jobSlug).maybeSingle());
    if (!job) throw new NotFoundError('Pozisyon');
    await this.ok(this.sb.from('candidates').insert({
      org_id: job.org_id, data: { job_id: job.id, name: input.name, email: input.email, portfolio: input.portfolio ?? '', note: input.note ?? '', stage: 'applied', score: 0, source: 'apply', talent_pool: false, employee_id: null },
    }));
  }
  async ingestApplications() { return 0; /* Supabase'de başvuru doğrudan candidates'a yazılır */ }
}
