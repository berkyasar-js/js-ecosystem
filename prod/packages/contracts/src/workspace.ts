import { TASK_STATES, TASK_STATE_LABELS, type Approval, type Brand, type Role, type Task, type TaskState, type TeamMember } from './index';
import type { AgentMode, AgentPolicy, Announcement, AnnouncementAudience, Milestone, SavedViewQuery, WorkRequest } from './modules';

/* ─────────────────────────────────────────────────────────────────────────
 * V8 (0017) saf yardımcılar — Repo, UI ve testler aynı kuralı paylaşır.
 * Kayıtlı görünümler · İş yükü · Talep → görev · Duyuru hedef kitlesi · Ajan politikası · Kilometre taşı · Akış · Slash komutları · Ajanda · Panolar
 * ───────────────────────────────────────────────────────────────────────── */

export const DONE_TASK_STATES: readonly TaskState[] = ['delivery', 'archive'];
const isDone = (t: Pick<Task, 'state'>) => DONE_TASK_STATES.includes(t.state);
const day = (iso: string | null | undefined) => (iso ? iso.slice(0, 10) : null);
const addDays = (d: string, n: number) => new Date(new Date(`${d}T00:00:00Z`).getTime() + n * 86400000).toISOString().slice(0, 10);

/* ───────── 1) Kayıtlı görünümler ───────── */
const VIEW_KEYS: Array<keyof SavedViewQuery> = ['mine', 'high', 'q', 'states', 'assignee', 'project', 'sort', 'group', 'view'];
/** Sorguyu URL parametresine çevirir (kararlı sıra, boşlar atlanır): `mine=1&states=brief,plan&sort=due`. */
export function serializeViewQuery(q: SavedViewQuery): string {
  const p = new URLSearchParams();
  for (const k of VIEW_KEYS) {
    const v = q[k];
    if (v === undefined || v === null || v === '' || v === false) continue;
    if (Array.isArray(v)) { if (v.length) p.set(k, v.join(',')); continue; }
    p.set(k, v === true ? '1' : String(v));
  }
  return p.toString();
}
/** `serializeViewQuery` tersi; bilinmeyen anahtarlar ve geçersiz değerler atlanır. */
export function parseViewQuery(s: string | URLSearchParams | null | undefined): SavedViewQuery {
  const p = typeof s === 'string' ? new URLSearchParams(s) : s ?? new URLSearchParams();
  const out: SavedViewQuery = {};
  if (p.get('mine') === '1') out.mine = true;
  if (p.get('high') === '1') out.high = true;
  const q = p.get('q'); if (q) out.q = q.slice(0, 200);
  const st = p.get('states'); if (st) { const arr = st.split(',').filter((x): x is TaskState => (TASK_STATES as readonly string[]).includes(x)); if (arr.length) out.states = arr; }
  const as = p.get('assignee'); if (as) out.assignee = as;
  const pr = p.get('project'); if (pr) out.project = pr;
  const sort = p.get('sort'); if (sort && ['due', 'priority', 'title', 'created'].includes(sort)) out.sort = sort as SavedViewQuery['sort'];
  const group = p.get('group'); if (group && ['none', 'state', 'assignee', 'project'].includes(group)) out.group = group as SavedViewQuery['group'];
  const view = p.get('view'); if (view === 'list' || view === 'board') out.view = view;
  return out;
}
/** İki sorgu aynı mı (sıra bağımsız)? */
export const sameViewQuery = (a: SavedViewQuery, b: SavedViewQuery) => serializeViewQuery(a) === serializeViewQuery(b);
const PRIO: Record<string, number> = { high: 0, normal: 1, low: 2 };
const byDue = (a: { due_at: string | null }, b: { due_at: string | null }) => { const x = day(a.due_at), y = day(b.due_at); return x === y ? 0 : x === null ? 1 : y === null ? -1 : x < y ? -1 : 1; };
/** Filtre + sıralama (gruplama ayrı). `employeeId` "bana atanan" için. */
export function applyViewQuery(tasks: Task[], q: SavedViewQuery, employeeId?: string): Task[] {
  const text = (q.q ?? '').trim().toLocaleLowerCase('tr');
  const states = q.states?.length ? new Set(q.states) : null;
  const out = tasks.filter((t) =>
    (!q.mine || (!!employeeId && t.assignee_id === employeeId)) && (!q.high || t.priority === 'high') && (!states || states.has(t.state))
    && (!q.assignee || (q.assignee === 'none' ? !t.assignee_id : t.assignee_id === q.assignee)) && (!q.project || t.project_id === q.project)
    && (!text || t.title.toLocaleLowerCase('tr').includes(text) || t.labels.some((l) => l.toLocaleLowerCase('tr').includes(text))));
  const sort = q.sort ?? 'due';
  return out.sort((a, b) => sort === 'priority' ? (PRIO[a.priority] - PRIO[b.priority]) || byDue(a, b) : sort === 'title' ? a.title.localeCompare(b.title, 'tr') : sort === 'created' ? b.created_at.localeCompare(a.created_at) : byDue(a, b));
}
export interface TaskGroup { key: string; label: string; tasks: Task[] }
/** Gruplama: aşama (akış sırası), sorumlu (ad sırası, atanmamış sonda) ya da proje. */
export function groupTasks(tasks: Task[], group: SavedViewQuery['group'] | undefined, names: { member?: (id: string | null) => string; project?: (id: string) => string } = {}): TaskGroup[] {
  if (!group || group === 'none') return [{ key: 'all', label: '', tasks }];
  const m = new Map<string, Task[]>();
  for (const t of tasks) { const k = group === 'state' ? t.state : group === 'assignee' ? t.assignee_id ?? '' : t.project_id; (m.get(k) ?? m.set(k, []).get(k)!).push(t); }
  const label = (k: string) => group === 'state' ? TASK_STATE_LABELS[k as TaskState] ?? k : group === 'assignee' ? (k ? names.member?.(k) ?? k : 'Atanmamış') : names.project?.(k) ?? k;
  const keys = [...m.keys()].sort((a, b) => group === 'state' ? TASK_STATES.indexOf(a as TaskState) - TASK_STATES.indexOf(b as TaskState) : a === '' ? 1 : b === '' ? -1 : label(a).localeCompare(label(b), 'tr'));
  return keys.map((key) => ({ key, label: label(key), tasks: m.get(key)! }));
}

/* ───────── 2) İş yükü ───────── */
/** Pazartesi–Pazar aralığı (ISO gün). */
export function weekRange(today: string): { start: string; end: string } {
  const d = new Date(`${today}T00:00:00Z`);
  const dow = (d.getUTCDay() + 6) % 7; // Pzt=0
  const start = addDays(today, -dow);
  return { start, end: addDays(start, 6) };
}
export interface WorkloadRow { member: TeamMember; capacity_min: number; planned_min: number; pct: number; open: number; overdue: number; week: Task[]; tone: 'ok' | 'warn' | 'bad' }
/**
 * Kişi başına haftalık kapasite (weekly_hours×60) ve bu haftaya düşen açık iş (bitişi bu hafta içinde ya da gecikmiş) dakikası.
 * Tarihsiz görevler sayılmaz; `includeNoDue` ile eklenebilir. Çıkış yapmış kişiler yalnızca açık görevi varsa listelenir.
 */
export function workloadRows(tasks: Task[], team: TeamMember[], today: string, opts: { includeNoDue?: boolean } = {}): WorkloadRow[] {
  const { end } = weekRange(today);
  return team.map((member) => {
    const open = tasks.filter((t) => t.assignee_id === member.id && !isDone(t));
    const week = open.filter((t) => { const d = day(t.due_at); return d ? d <= end : !!opts.includeNoDue; });
    const planned_min = week.reduce((a, t) => a + (t.planned_minutes || 0), 0);
    const capacity_min = Math.max(0, member.weekly_hours) * 60;
    const pct = capacity_min ? Math.round((planned_min / capacity_min) * 100) : planned_min ? 999 : 0;
    const overdue = open.filter((t) => { const d = day(t.due_at); return !!d && d < today; }).length;
    return { member, capacity_min, planned_min, pct, open: open.length, overdue, week, tone: pct > 100 ? 'bad' : pct >= 85 ? 'warn' : 'ok' } as WorkloadRow;
  }).filter((r) => r.member.status === 'active' || r.open > 0).sort((a, b) => b.pct - a.pct || b.overdue - a.overdue);
}
/** Yeniden atama önerisi: en düşük yüzdeli aktif kişi (kendisi hariç). */
export const leastLoaded = (rows: WorkloadRow[], exceptId?: string | null) => [...rows].filter((r) => r.member.status === 'active' && r.member.id !== exceptId).sort((a, b) => a.pct - b.pct)[0]?.member ?? null;

/* ───────── 3) Talep → görev ───────── */
export interface RequestToTaskOpts { project_id: string; today: string; brand?: Pick<Brand, 'default_assignee_id' | 'account_owner'> | null; assignee_id?: string | null; due_in_days?: number }
/** Talepten görev girdisi: başlık korunur, açıklama gövde + talep kaynağı, sorumlu = verilen ∥ markanın alan sahibi ∥ hesap sahibi. */
export function requestToTask(req: Pick<WorkRequest, 'id' | 'kind' | 'title' | 'body' | 'requester_name'>, o: RequestToTaskOpts) {
  const assignee = o.assignee_id !== undefined ? o.assignee_id : (o.brand?.default_assignee_id ?? o.brand?.account_owner ?? null) || null;
  const kindLabel: Record<string, string> = { bug: 'hata', idea: 'fikir', brief: 'brief', client: 'müşteri talebi' };
  return {
    project_id: o.project_id, title: req.title.slice(0, 200), assignee_id: assignee, priority: (req.kind === 'bug' ? 'high' : 'normal') as 'high' | 'normal',
    due_at: addDays(o.today, o.due_in_days ?? (req.kind === 'bug' ? 2 : 7)), planned_minutes: 0, task_type: 'general', qty: 1, source_ref: `request:${req.id}`, state: 'brief' as const,
    description: [req.body.trim(), `— Talep (${kindLabel[req.kind] ?? req.kind})${req.requester_name ? ` · ${req.requester_name}` : ''}`].filter(Boolean).join('\n\n'),
  };
}
/** Görev teslim/arşive geçince bu göreve bağlı açık talepler kapanır (saf: kapanacak talep kimlikleri). */
export function requestsToClose(requests: WorkRequest[], task: Pick<Task, 'id' | 'state'>): string[] {
  if (!isDone(task)) return [];
  return requests.filter((r) => r.task_id === task.id && (r.status === 'converted' || r.status === 'triaged' || r.status === 'new')).map((r) => r.id);
}

/* ───────── 4) Duyuru hedef kitlesi ───────── */
export interface AudienceViewer { role: Role; team?: string | null; employee_id?: string | null; project_ids?: string[] }
/** Boş hedef kitle ya da `all` → herkes. Aksi halde ekip ∨ rol ∨ proje üyeliği eşleşmeli. */
export function audienceMatches(a: AnnouncementAudience | null | undefined, v: AudienceViewer): boolean {
  if (!a || a.all || (!a.teams?.length && !a.roles?.length && !a.project_ids?.length)) return true;
  if (a.roles?.includes(v.role)) return true;
  if (v.team && a.teams?.some((t) => t.toLocaleLowerCase('tr') === v.team!.toLocaleLowerCase('tr'))) return true;
  if (v.project_ids?.length && a.project_ids?.some((p) => v.project_ids!.includes(p))) return true;
  return false;
}
/** Bana görünen ve henüz onaylamadığım duyurular (yeni → eski). */
export function pendingAnnouncements(list: Announcement[], acks: Array<{ announcement_id: string; user_id: string }>, userId: string, viewer: AudienceViewer): Announcement[] {
  const mine = new Set(acks.filter((x) => x.user_id === userId).map((x) => x.announcement_id));
  return list.filter((a) => !mine.has(a.id) && audienceMatches(a.audience, viewer)).sort((a, b) => b.created_at.localeCompare(a.created_at));
}
export const audienceLabel = (a: AnnouncementAudience | null | undefined): string => {
  if (!a || a.all || (!a.teams?.length && !a.roles?.length && !a.project_ids?.length)) return 'Herkes';
  return [a.teams?.length ? `Ekip: ${a.teams.join(', ')}` : '', a.roles?.length ? `Rol: ${a.roles.join(', ')}` : '', a.project_ids?.length ? `${a.project_ids.length} proje` : ''].filter(Boolean).join(' · ');
};

/* ───────── 5) Ajan politikası ───────── */
export const DEFAULT_AGENT_MODE: AgentMode = 'ask';
export type AgentWriteVerdict = { verdict: 'execute' } | { verdict: 'approval'; reason: string } | { verdict: 'blocked'; reason: string };
/**
 * Ajan yazma önerisi ne olur? Politika yoksa 'ask' (salt okunur) → onay. 'plan' → onay. 'act' → bütçe içinde ve otomatik onay
 * kuralı eylemi kapsıyorsa doğrudan uygulanır; aksi halde onay kartı. Bütçe aşımı (₺) her modda engeller (0 = sınırsız).
 */
export function decideAgentWrite(policy: Pick<AgentPolicy, 'mode' | 'monthly_budget_try' | 'auto_approve'> | null | undefined, ctx: { action: string; items: number; spent_try: number; estimate_try?: number }): AgentWriteVerdict {
  const budget = policy?.monthly_budget_try ?? 0;
  if (budget > 0 && ctx.spent_try + (ctx.estimate_try ?? 0) > budget) return { verdict: 'blocked', reason: `Aylık ajan bütçesi aşıldı (₺${Math.round(ctx.spent_try)} / ₺${budget})` };
  const mode = policy?.mode ?? DEFAULT_AGENT_MODE;
  if (mode === 'ask') return { verdict: 'approval', reason: 'Ajan "Sor" modunda: yazma önerileri onay ister' };
  if (mode === 'plan') return { verdict: 'approval', reason: 'Ajan "Planla" modunda: plan onaylanınca uygulanır' };
  const rule = policy?.auto_approve;
  if (!rule?.actions.includes(ctx.action)) return { verdict: 'approval', reason: `"${ctx.action}" için otomatik onay kuralı yok` };
  if (rule.max_items !== undefined && rule.max_items > 0 && ctx.items > rule.max_items) return { verdict: 'approval', reason: `Otomatik onay sınırı ${rule.max_items} kalem; öneri ${ctx.items}` };
  return { verdict: 'execute' };
}
/** Ay içi ajan harcaması (₺): agent_runs cost_usd × kur. */
export const agentSpendTry = (runs: Array<{ agent: string; cost_usd: number | string; created_at: string }>, agent: string, month: string, usdTry: number) =>
  runs.filter((r) => r.agent === agent && r.created_at.startsWith(month)).reduce((a, r) => a + Number(r.cost_usd), 0) * usdTry;

/* ───────── 6) Kilometre taşı ───────── */
export interface MilestoneProgress { milestone: Milestone; total: number; done: number; pct: number; overdue: boolean }
export function milestoneProgress(ms: Milestone[], tasks: Task[], today: string): MilestoneProgress[] {
  return [...ms].sort((a, b) => byDue(a, b)).map((milestone) => {
    const mine = tasks.filter((t) => t.milestone_id === milestone.id);
    const done = mine.filter(isDone).length;
    const d = day(milestone.due_at);
    return { milestone, total: mine.length, done, pct: mine.length ? Math.round((done / mine.length) * 100) : milestone.status === 'done' ? 100 : 0, overdue: !!d && d < today && milestone.status !== 'done' };
  });
}

/* ───────── 7) Akış (zaman çizelgesi) ───────── */
export type ActorKind = 'human' | 'agent' | 'trello' | 'system';
export interface ActivityEntry { id: string; at: string; actor: string; actor_kind: ActorKind; text: string; href?: string; task_id?: string | null; project_id?: string | null; source: 'audit' | 'comment' | 'sync' | 'event' }
export interface ActivityParts {
  audit?: Array<{ id: string; occurred_at: string; actor_name: string; action: string; resource: string; meta?: Record<string, unknown> }> | null;
  comments?: Array<{ id: string; created_at: string; author_name: string; author_id: string | null; body: string; task_id: string; sync_origin?: string | null }>;
  sync?: Array<{ id?: string; created_at: string; direction: string; entity: string; entity_id: string | null; action: string; ok: boolean; message: string }>;
}
const ACTION_TR: Record<string, string> = {
  'task.create': 'görevi oluşturdu', 'task.move': 'aşamayı değiştirdi', 'task.update': 'görevi güncelledi', 'task.comment': 'yorum yaptı', 'task.attach': 'dosya ekledi',
  'project.create': 'projeyi oluşturdu', 'twin_bid.open': 'ihaleye açtı', 'twin_bid.assigned': 'ihaleden atadı', 'approval.approved': 'onayladı', 'approval.rejected': 'reddetti',
  'milestones.create': 'kilometre taşı ekledi', 'milestones.update': 'kilometre taşını güncelledi', 'requests.create': 'talep açtı', 'requests.update': 'talebi güncelledi', 'project_members.create': 'üye ekledi', 'project_members.delete': 'üye çıkardı',
  'agent.execute': 'ajan planını uyguladı', 'board.chat.apply': 'kurul planını aktardı',
};
const actorKindOf = (name: string, action?: string): ActorKind => (/^(kurul|chair|agent|ajan)/i.test(name) || !!action?.startsWith('agent.') ? 'agent' : /trello/i.test(name) ? 'trello' : !name || name === 'sistem' ? 'system' : 'human');
/** Denetim + yorum + senkron günlüğünü tek zaman çizelgesinde birleştirir (yeni → eski). `taskIds` verilirse yalnızca o görevlerin kayıtları alınır. */
export function buildTimeline(parts: ActivityParts, opts: { taskIds?: Set<string> | null; projectId?: string | null; limit?: number } = {}): ActivityEntry[] {
  const out: ActivityEntry[] = [];
  const tid = (res: string) => (res.startsWith('tasks/') ? res.slice(6) : null);
  for (const a of parts.audit ?? []) {
    const taskId = tid(a.resource);
    if (opts.taskIds && !(taskId && opts.taskIds.has(taskId)) && !(opts.projectId && a.resource === `projects/${opts.projectId}`)) continue;
    const meta = a.meta ?? {};
    const extra = typeof meta.state === 'string' ? ` → ${TASK_STATE_LABELS[meta.state as TaskState] ?? meta.state}` : typeof meta.title === 'string' ? `: ${meta.title}` : typeof meta.name === 'string' ? `: ${meta.name}` : '';
    out.push({ id: `a:${a.id}`, at: a.occurred_at, actor: a.actor_name || 'sistem', actor_kind: actorKindOf(a.actor_name, a.action), text: `${ACTION_TR[a.action] ?? a.action}${extra}`, task_id: taskId, source: 'audit' });
  }
  for (const c of parts.comments ?? []) {
    if (opts.taskIds && !opts.taskIds.has(c.task_id)) continue;
    const trello = c.sync_origin === 'trello' || !c.author_id;
    out.push({ id: `c:${c.id}`, at: c.created_at, actor: c.author_name || (trello ? 'Trello' : 'sistem'), actor_kind: trello ? 'trello' : 'human', text: `yorum: ${c.body.slice(0, 120)}${c.body.length > 120 ? '…' : ''}`, task_id: c.task_id, source: 'comment' });
  }
  for (const s of parts.sync ?? []) {
    if (s.action === 'demo_noop' || s.action === 'mode') continue;
    if (opts.taskIds && !(s.entity === 'task' && s.entity_id && opts.taskIds.has(s.entity_id))) continue;
    out.push({ id: `s:${s.id ?? `${s.created_at}-${s.entity_id}`}`, at: s.created_at, actor: 'Trello', actor_kind: 'trello', text: `${s.direction === 'push' ? 'JS → Trello' : 'Trello → JS'} · ${s.entity} ${s.action}${s.message ? ` — ${s.message.slice(0, 100)}` : ''}${s.ok ? '' : ' (hata)'}`, task_id: s.entity === 'task' ? s.entity_id : null, source: 'sync' });
  }
  const seen = new Set<string>();
  return out.filter((e) => (seen.has(e.id) ? false : (seen.add(e.id), true))).sort((a, b) => b.at.localeCompare(a.at)).slice(0, opts.limit ?? 100);
}

/* ───────── 8) Slash komutları (Spotlight) ───────── */
export type SlashCmd = 'task' | 'request' | 'announce' | 'board' | 'go' | 'help';
export const SLASH_COMMANDS: Array<{ cmd: SlashCmd; aliases: string[]; label: string; hint: string; roles?: Role[] }> = [
  { cmd: 'task', aliases: ['görev', 'gorev', 'task'], label: '/görev <başlık>', hint: 'Yeni görev aç' },
  { cmd: 'request', aliases: ['talep', 'request'], label: '/talep <başlık>', hint: 'İş talebi oluştur' },
  { cmd: 'announce', aliases: ['duyuru', 'announce'], label: '/duyuru', hint: 'Duyuru yaz', roles: ['owner', 'org_admin', 'operations', 'hr'] },
  { cmd: 'board', aliases: ['kurul', 'board'], label: '/kurul <soru>', hint: 'Kurul Sohbeti’ne sor (panel)', roles: ['owner'] },
  { cmd: 'go', aliases: ['git', 'go', 'g'], label: '/git <modül>', hint: 'Modüle git' },
  { cmd: 'help', aliases: ['yardım', 'yardim', 'help', '?'], label: '/yardım', hint: 'Kısayollar' },
];
const trLower = (s: string) => s.toLocaleLowerCase('tr');
/** `/görev Wellana ana görsel` → {cmd:'task', arg:'Wellana ana görsel'}; eşleşmeyen `/x` → null. Tam sözcük gerekli (`/gö` eşleşmez). */
export function parseSlash(q: string): { cmd: SlashCmd; arg: string } | null {
  const m = q.trim().match(/^\/(\S+)\s*(.*)$/s);
  if (!m) return null;
  const word = trLower(m[1]);
  const def = SLASH_COMMANDS.find((c) => c.aliases.includes(word));
  return def ? { cmd: def.cmd, arg: m[2].trim() } : null;
}
/** Slash komutu için hedef rota (admin bağlantısı dışa açılır). */
export function slashHref(cmd: SlashCmd, arg: string, o: { adminUrl?: string; modules: Array<{ id: string; name: string; slug: string }> }): string | null {
  const enc = encodeURIComponent(arg);
  switch (cmd) {
    case 'task': return `/app/tasks?new=1${arg ? `&title=${enc}` : ''}`;
    case 'request': return `/app/requests?new=1${arg ? `&title=${enc}` : ''}`;
    case 'announce': return `/app/announcements?new=1${arg ? `&title=${enc}` : ''}`;
    case 'board': return o.adminUrl ? `${o.adminUrl}/admin/board/sohbet${arg ? `?q=${enc}` : ''}` : null;
    case 'help': return '/app/overview?help=keys';
    case 'go': {
      const t = trLower(arg);
      if (!t) return '/app/apps';
      const m = o.modules.find((x) => trLower(x.slug) === t || trLower(x.id) === t) ?? o.modules.find((x) => trLower(x.name).includes(t));
      return m ? `/app/${m.slug}` : null;
    }
  }
}

/* ───────── 9) Ajanda ───────── */
export interface AgendaItem { id: string; kind: 'task' | 'milestone' | 'calendar'; title: string; day: string; href?: string; done?: boolean; overdue?: boolean; meta?: string }
/** `days` gün (bugünden) için günlük kovalar: bana atanan görevler (bitiş), kilometre taşları; gecikmişler ilk güne. */
export function agendaDays(o: { tasks: Task[]; milestones: Milestone[]; employeeId?: string | null; today: string; days: number; projectName?: (id: string) => string }): Array<{ day: string; items: AgendaItem[] }> {
  const out = Array.from({ length: o.days }, (_, i) => ({ day: addDays(o.today, i), items: [] as AgendaItem[] }));
  const last = out[out.length - 1].day;
  const put = (it: AgendaItem) => { const slot = out.find((d) => d.day === it.day) ?? (it.day < o.today ? out[0] : null); slot?.items.push(it); };
  for (const t of o.tasks) {
    if (o.employeeId && t.assignee_id !== o.employeeId) continue;
    const d = day(t.due_at); if (!d || isDone(t) || d > last) continue;
    put({ id: `t:${t.id}`, kind: 'task', title: t.title, day: d, href: `/app/projects/${t.project_id}?task=${t.id}`, overdue: d < o.today, meta: o.projectName?.(t.project_id) });
  }
  for (const m of o.milestones) {
    const d = day(m.due_at); if (!d || m.status === 'done' || d > last) continue;
    put({ id: `m:${m.id}`, kind: 'milestone', title: m.name, day: d, href: `/app/projects/${m.project_id}`, overdue: d < o.today, meta: o.projectName?.(m.project_id) });
  }
  for (const d of out) d.items.sort((a, b) => Number(b.overdue ?? false) - Number(a.overdue ?? false) || a.title.localeCompare(b.title, 'tr'));
  return out;
}

/* ───────── 10) Panolar ───────── */
export interface ChartBar { label: string; value: number; tone?: 'ok' | 'warn' | 'bad'; hint?: string }
export interface ChartDef { id: string; title: string; unit?: string; bars: ChartBar[]; empty?: string }
export const CHART_IDS = ['tasks_by_state', 'overdue_by_person', 'workload', 'brand_health', 'approvals_aging', 'agent_cost'] as const;
export type ChartId = (typeof CHART_IDS)[number];
export interface DashboardInput { tasks: Task[]; team: TeamMember[]; brands: Brand[]; approvals: Approval[]; runs: Array<{ agent: string; cost_usd: number | string; created_at: string }>; today: string; usdTry?: number }
/** 6 yerleşik grafik (saf veri; çizim SVG/CSS ile). */
export function buildDashboards(i: DashboardInput): ChartDef[] {
  const open = i.tasks.filter((t) => !isDone(t));
  const name = (id: string | null) => i.team.find((m) => m.id === id)?.name.split(' ')[0] ?? 'Atanmamış';
  const ageDays = (iso: string) => Math.max(0, Math.round((new Date(`${i.today}T00:00:00Z`).getTime() - new Date(iso).getTime()) / 86400000));
  const months = Array.from({ length: 6 }, (_, k) => { const d = new Date(`${i.today.slice(0, 7)}-01T00:00:00Z`); d.setUTCMonth(d.getUTCMonth() - (5 - k)); return d.toISOString().slice(0, 7); });
  const wl = workloadRows(i.tasks, i.team, i.today);
  const overdueBy = new Map<string, number>();
  for (const t of open) { const d = day(t.due_at); if (d && d < i.today) overdueBy.set(t.assignee_id ?? '', (overdueBy.get(t.assignee_id ?? '') ?? 0) + 1); }
  const pending = i.approvals.filter((a) => a.status === 'pending');
  const buckets: Array<[string, (d: number) => boolean]> = [['0–2 gün', (d) => d <= 2], ['3–7 gün', (d) => d > 2 && d <= 7], ['8–14 gün', (d) => d > 7 && d <= 14], ['14+ gün', (d) => d > 14]];
  return [
    { id: 'tasks_by_state', title: 'Aşamaya göre görevler', bars: TASK_STATES.map((s) => ({ label: TASK_STATE_LABELS[s], value: i.tasks.filter((t) => t.state === s).length })) },
    { id: 'overdue_by_person', title: 'Kişiye göre geciken', bars: [...overdueBy.entries()].map(([id, v]): ChartBar => ({ label: name(id || null), value: v, tone: v >= 3 ? 'bad' : 'warn' })).sort((a, b) => b.value - a.value).slice(0, 10), empty: 'Geciken görev yok.' },
    { id: 'workload', title: 'İş yükü (bu hafta, % kapasite)', unit: '%', bars: wl.filter((r) => r.open > 0).slice(0, 10).map((r) => ({ label: r.member.name.split(' ')[0], value: r.pct, tone: r.tone, hint: `${Math.round(r.planned_min / 60)} / ${Math.round(r.capacity_min / 60)} sa` })), empty: 'Atanmış açık görev yok.' },
    { id: 'brand_health', title: 'Marka sağlığı', unit: '/100', bars: [...i.brands].filter((b) => !b.internal).sort((a, b) => a.health - b.health).slice(0, 10).map((b): ChartBar => ({ label: b.name, value: b.health, tone: b.health < 55 ? 'bad' : b.health < 70 ? 'warn' : 'ok' })) },
    { id: 'approvals_aging', title: 'Bekleyen onay yaşı', bars: buckets.map(([label, f]): ChartBar => ({ label, value: pending.filter((a) => f(ageDays(a.created_at))).length, tone: label === '14+ gün' ? 'bad' : label === '8–14 gün' ? 'warn' : undefined })), empty: 'Bekleyen onay yok.' },
    { id: 'agent_cost', title: 'Aylık ajan maliyeti (₺)', unit: '₺', bars: months.map((m) => ({ label: m.slice(2).replace('-', '/'), value: Math.round(i.runs.filter((r) => r.created_at.startsWith(m)).reduce((a, r) => a + Number(r.cost_usd), 0) * (i.usdTry ?? 40)) })) },
  ];
}

/* ───────── 11) Klavye kısayolları ───────── */
export const SHORTCUTS: Array<{ keys: string; label: string }> = [
  { keys: '⌘K', label: 'Spotlight: ara ve eylemler (/görev, /talep, /git …)' }, { keys: '⌘J', label: 'Sor' }, { keys: '?', label: 'Bu yardım' },
  { keys: 'c', label: 'Yeni görev' }, { keys: 'j / k', label: 'Görev listesinde aşağı / yukarı' }, { keys: 'Enter', label: 'Seçili görevi aç' }, { keys: 'x', label: 'Görevi seç (toplu düzenleme)' },
  { keys: 'g h', label: 'Ana Sayfa' }, { keys: 'g i', label: 'Gelen Kutusu' }, { keys: 'g p', label: 'Projeler' }, { keys: 'g t', label: 'Pano' }, { keys: 'g a', label: 'Ajanda' }, { keys: 'g r', label: 'Talepler' },
];
export const GO_TARGETS: Record<string, string> = { h: '/app/overview', i: '/app/inbox', p: '/app/projects', t: '/app/tasks', a: '/app/agenda', r: '/app/requests', m: '/app/messages', w: '/app/workload', d: '/app/dashboards' };
