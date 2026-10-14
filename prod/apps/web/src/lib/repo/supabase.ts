import type { SupabaseClient } from '@supabase/supabase-js';
import {
  approvalCreateSchema, canDecideApproval, orgSettingsPatchSchema, taskCreateSchema, type AgentRun, type Approval, type ApprovalCreate, type BoardAnswer,
  type BoardDecision, type ConnectData, type Integration, type Me, type Message, type OrgSettings, type Role, type Task, type TaskCreate, type TaskState,
} from '@jscore/contracts';
import { DEFAULT_SETTINGS } from './defaults';
import { ForbiddenError, NotFoundError, type Repo } from './types';

type Row = Record<string, unknown>;
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
    return this.ok<Task>(this.sb.from('tasks').insert({ ...v, org_id: await this.org() }).select().single());
  }
  async moveTask(id: string, state: TaskState) { return this.ok<Task>(this.sb.from('tasks').update({ state }).eq('id', id).select().single()); }

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
      this.ok<ConnectData['tokens']>(this.sb.from('access_tokens').select('id,org_id,name,token_prefix,scopes,created_at,last_used_at').eq('org_id', org).is('revoked_at', null)),
    ]);
    return { integrations, mcp_servers, webhooks, tokens };
  }
  async setIntegrationStatus(id: string, status: Integration['status']) { await this.ok(this.sb.from('integrations').update({ status }).eq('id', id).select('id')); }

  async listAgentPrompts() { return this.ok(this.sb.from('agent_prompts').select('*').or(`org_id.is.null,org_id.eq.${await this.org()}`).order('agent')); }
  async getActivePrompt(agent: string) {
    const rows = await this.ok<Array<{ org_id: string | null } & Record<string, unknown>>>(this.sb.from('agent_prompts').select('*').eq('agent', agent).eq('is_active', true).or(`org_id.is.null,org_id.eq.${await this.org()}`));
    const row = rows.find((r) => r.org_id) ?? rows[0];
    return (row as never) ?? null;
  }
  async listAgentRuns() { return this.ok(this.sb.from('agent_runs').select('*').eq('org_id', await this.org()).order('created_at', { ascending: false }).limit(50)); }
  async logAgentRun(run: Omit<AgentRun, 'id' | 'org_id' | 'created_at'>) { await this.ok(this.sb.from('agent_runs').insert({ ...run, org_id: await this.org() }).select('id')); }
  async listBoardDecisions() { return this.ok<BoardDecision[]>(this.sb.from('board_decisions').select('*').eq('org_id', await this.org()).order('created_at', { ascending: false })); }
  async decideBoard(id: string, answer: BoardAnswer) {
    const status = answer === 'EVET' ? 'approved' : answer === 'HAYIR' ? 'rejected' : 'deferred';
    return this.ok<BoardDecision>(this.sb.from('board_decisions').update({ founder_answer: answer, status, decided_at: new Date().toISOString() }).eq('id', id).select().single());
  }
  async listTwins() { return this.ok(this.sb.from('employee_twins').select('*').eq('org_id', await this.org())); }
  async listTwinBids() { return []; /* ihale akışı henüz tablo değil; üretimde sırada */ }
}
