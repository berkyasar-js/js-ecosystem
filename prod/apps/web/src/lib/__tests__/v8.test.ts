import { describe, expect, it } from 'vitest';
import {
  MODULES, NAV_GROUPS, agendaDays, agentSpendTry, applyViewQuery, audienceMatches, buildDashboards, buildTimeline, decideAgentWrite, groupTasks, leastLoaded, milestoneProgress, parseSlash, parseViewQuery,
  pendingAnnouncements, requestToTask, requestsToClose, sameViewQuery, serializeViewQuery, slashHref, weekRange, workloadRows,
  type Announcement, type Approval, type Brand, type Milestone, type SavedViewQuery, type Task, type TeamMember, type WorkRequest,
} from '@jscore/contracts';
import { DemoRepo } from '@jscore/core/repo/demo';
import { ForbiddenError } from '@jscore/core/repo/types';
import { buildInbox } from '../inbox';
import { slashHits } from '@/components/spotlight';

const task = (p: Partial<Task>): Task => ({ id: 't', org_id: 'o', project_id: 'p1', title: 'Görev', assignee_id: 'SK', state: 'production', priority: 'normal', due_at: '2026-10-14', planned_minutes: 60, task_type: 'general', qty: 1, source_ref: null, labels: [], client_visible: false, created_at: '2026-10-01T09:00:00Z', ...p });
const member = (id: string, hours = 40, extra: Partial<TeamMember> = {}): TeamMember => ({ id, org_id: 'o', name: `Kişi ${id}`, role_title: 'AD', app_role: 'creative', status: 'active', weekly_hours: hours, ...extra });
const TODAY = '2026-10-14'; // Çarşamba

describe('kayıtlı görünümler', () => {
  it('sorgu serileştirme kararlı ve tersinir; boşlar düşer', () => {
    const q: SavedViewQuery = { mine: true, states: ['brief', 'plan'], sort: 'priority', group: 'assignee', q: 'wellana', assignee: 'SK' };
    const s = serializeViewQuery(q);
    expect(s).toBe('mine=1&q=wellana&states=brief%2Cplan&assignee=SK&sort=priority&group=assignee');
    expect(parseViewQuery(s)).toEqual(q);
    expect(serializeViewQuery({ mine: false, q: '', states: [] })).toBe('');
    expect(parseViewQuery('states=brief,yok&sort=x&view=board&high=1')).toEqual({ states: ['brief'], view: 'board', high: true });
    expect(sameViewQuery({ high: true, mine: true }, { mine: true, high: true })).toBe(true);
  });
  it('filtre + sıralama + gruplama', () => {
    const tasks = [task({ id: 'a', priority: 'high', due_at: '2026-10-20', state: 'brief' }), task({ id: 'b', due_at: '2026-10-10', assignee_id: 'OE', labels: ['acil'] }), task({ id: 'c', priority: 'high', due_at: null, state: 'brief', assignee_id: null })];
    expect(applyViewQuery(tasks, { high: true, sort: 'due' }).map((t) => t.id)).toEqual(['a', 'c']);
    expect(applyViewQuery(tasks, { sort: 'priority' }).map((t) => t.id)).toEqual(['a', 'c', 'b']);
    expect(applyViewQuery(tasks, { mine: true }, 'OE').map((t) => t.id)).toEqual(['b']);
    expect(applyViewQuery(tasks, { assignee: 'none' }).map((t) => t.id)).toEqual(['c']);
    expect(applyViewQuery(tasks, { q: 'ACİL' }).map((t) => t.id)).toEqual(['b']);
    expect(applyViewQuery(tasks, { states: ['brief'] }).length).toBe(2);
    const g = groupTasks(tasks, 'assignee', { member: (id) => (id === 'SK' ? 'Seda' : 'Öykü') });
    expect(g.map((x) => x.label)).toEqual(['Öykü', 'Seda', 'Atanmamış']);
    expect(groupTasks(tasks, 'state').map((x) => x.key)).toEqual(['brief', 'production']);
    expect(groupTasks(tasks, 'none')).toHaveLength(1);
  });
});

describe('iş yükü', () => {
  it('hafta aralığı Pazartesi–Pazar', () => { expect(weekRange(TODAY)).toEqual({ start: '2026-10-12', end: '2026-10-18' }); expect(weekRange('2026-10-18').start).toBe('2026-10-12'); });
  it('kapasite = saat×60; bu hafta biten + gecikmiş açık görevler sayılır, tarihsiz ve bitenler sayılmaz', () => {
    const team = [member('SK', 10), member('OE', 0), member('BK', 40, { status: 'left' })];
    const tasks = [
      task({ id: '1', planned_minutes: 300, due_at: '2026-10-16' }), task({ id: '2', planned_minutes: 200, due_at: '2026-10-01' }), // gecikmiş
      task({ id: '3', planned_minutes: 999, due_at: '2026-10-30' }), task({ id: '4', planned_minutes: 999, due_at: null }), task({ id: '5', planned_minutes: 999, state: 'delivery', due_at: TODAY }),
      task({ id: '6', assignee_id: 'OE', planned_minutes: 30, due_at: TODAY }),
    ];
    const rows = workloadRows(tasks, team, TODAY);
    const sk = rows.find((r) => r.member.id === 'SK')!;
    expect(sk.capacity_min).toBe(600); expect(sk.planned_min).toBe(500); expect(sk.pct).toBe(83); expect(sk.tone).toBe('ok'); expect(sk.open).toBe(4); expect(sk.overdue).toBe(1);
    const oe = rows.find((r) => r.member.id === 'OE')!;
    expect(oe.pct).toBe(999);
    expect(rows.some((r) => r.member.id === 'BK')).toBe(false); // ayrılmış, görevi yok
    expect(rows[0].member.id).toBe('OE'); // yüzdeye göre azalan
    expect(leastLoaded(rows, 'OE')?.id).toBe('SK');
    expect(workloadRows([task({ id: 'x', planned_minutes: 60, due_at: null })], [member('SK', 1)], TODAY, { includeNoDue: true })[0].pct).toBe(100);
  });
});

describe('talep → görev', () => {
  const req: WorkRequest = { id: 'req1', org_id: 'o', created_at: '2026-10-13', kind: 'bug', title: 'Video oynamıyor', body: 'Safari’de autoplay yok', status: 'new', requester_employee_id: 'OE', requester_name: 'Öykü', brand_id: 'c_anova', project_id: 'p3', task_id: null };
  it('sorumlu: verilen ∥ alan sahibi ∥ hesap sahibi; hata → yüksek öncelik + 2 gün', () => {
    const brand = { default_assignee_id: 'DO', account_owner: 'OE' } as Pick<Brand, 'default_assignee_id' | 'account_owner'>;
    const t = requestToTask(req, { project_id: 'p3', today: TODAY, brand });
    expect(t.assignee_id).toBe('DO'); expect(t.priority).toBe('high'); expect(t.due_at).toBe('2026-10-16'); expect(t.source_ref).toBe('request:req1'); expect(t.description).toContain('Safari’de autoplay yok'); expect(t.description).toContain('Öykü');
    expect(requestToTask(req, { project_id: 'p3', today: TODAY, brand: { default_assignee_id: null, account_owner: 'OE' } }).assignee_id).toBe('OE');
    expect(requestToTask(req, { project_id: 'p3', today: TODAY, brand, assignee_id: null }).assignee_id).toBeNull();
    expect(requestToTask({ ...req, kind: 'idea' }, { project_id: 'p3', today: TODAY }).priority).toBe('normal');
  });
  it('görev teslim/arşive gelince bağlı açık talepler kapanır', () => {
    const list = [{ ...req, task_id: 't1', status: 'converted' as const }, { ...req, id: 'req2', task_id: 't1', status: 'closed' as const }, { ...req, id: 'req3', task_id: 't2', status: 'converted' as const }];
    expect(requestsToClose(list, { id: 't1', state: 'delivery' })).toEqual(['req1']);
    expect(requestsToClose(list, { id: 't1', state: 'production' })).toEqual([]);
  });
});

describe('duyuru hedef kitlesi', () => {
  const viewer = { role: 'creative' as const, team: 'Kreatif', employee_id: 'SK', project_ids: ['p1'] };
  it('boş/all herkes; ekip ∨ rol ∨ proje eşleşir', () => {
    expect(audienceMatches(null, viewer)).toBe(true); expect(audienceMatches({ all: true }, viewer)).toBe(true); expect(audienceMatches({}, viewer)).toBe(true);
    expect(audienceMatches({ teams: ['kreatif'] }, viewer)).toBe(true); expect(audienceMatches({ teams: ['Hesap'] }, viewer)).toBe(false);
    expect(audienceMatches({ roles: ['creative'] }, viewer)).toBe(true); expect(audienceMatches({ roles: ['finance'], project_ids: ['p1'] }, viewer)).toBe(true);
    expect(audienceMatches({ project_ids: ['p9'] }, viewer)).toBe(false);
  });
  it('bekleyenler: onayladıklarım düşer, yeni → eski', () => {
    const a = (id: string, created_at: string, audience: Announcement['audience'] = { all: true }): Announcement => ({ id, org_id: 'o', created_at, author_user_id: 'u', author_name: 'BY', title: id, body: '', audience, requires_ack: true, poll: null });
    const list = [a('x', '2026-10-01'), a('y', '2026-10-03'), a('z', '2026-10-02', { teams: ['Hesap'] })];
    expect(pendingAnnouncements(list, [{ announcement_id: 'x', user_id: 'me' }], 'me', viewer).map((x) => x.id)).toEqual(['y']);
    expect(pendingAnnouncements(list, [{ announcement_id: 'x', user_id: 'other' }], 'me', viewer).map((x) => x.id)).toEqual(['y', 'x']);
  });
});

describe('ajan politikası', () => {
  it('politika yok → Sor → onay; Planla → onay; bütçe aşımı → engel', () => {
    expect(decideAgentWrite(null, { action: 'task.create', items: 3, spent_try: 0 }).verdict).toBe('approval');
    expect(decideAgentWrite({ mode: 'plan', monthly_budget_try: 0, auto_approve: { actions: ['task.create'] } }, { action: 'task.create', items: 3, spent_try: 0 }).verdict).toBe('approval');
    const v = decideAgentWrite({ mode: 'act', monthly_budget_try: 100, auto_approve: { actions: ['task.create'] } }, { action: 'task.create', items: 1, spent_try: 90, estimate_try: 20 });
    expect(v.verdict).toBe('blocked'); expect((v as { reason: string }).reason).toContain('bütçe');
  });
  it('Uygula: kural kapsamında ve sınır içinde → uygula; değilse onay', () => {
    const p = { mode: 'act' as const, monthly_budget_try: 1000, auto_approve: { actions: ['task.create'], max_items: 5 } };
    expect(decideAgentWrite(p, { action: 'task.create', items: 5, spent_try: 10 }).verdict).toBe('execute');
    expect(decideAgentWrite(p, { action: 'task.create', items: 6, spent_try: 10 }).verdict).toBe('approval');
    expect(decideAgentWrite(p, { action: 'project.create', items: 1, spent_try: 10 }).verdict).toBe('approval');
    expect(decideAgentWrite({ ...p, auto_approve: { actions: ['task.create'], max_items: 0 } }, { action: 'task.create', items: 50, spent_try: 10 }).verdict).toBe('execute'); // 0 = sınırsız
  });
  it('ay içi ajan harcaması ₺', () => {
    const runs = [{ agent: 'chair', cost_usd: 0.5, created_at: '2026-10-11T07:00:00Z' }, { agent: 'chair', cost_usd: '0.25', created_at: '2026-09-11T07:00:00Z' }, { agent: 'cfo', cost_usd: 9, created_at: '2026-10-11T07:00:00Z' }];
    expect(agentSpendTry(runs, 'chair', '2026-10', 40)).toBe(20);
  });
});

describe('kilometre taşı, akış, ajanda, panolar', () => {
  const ms: Milestone[] = [{ id: 'm1', org_id: 'o', created_at: '', project_id: 'p1', name: 'Konsept', due_at: '2026-10-10', status: 'active' }, { id: 'm2', org_id: 'o', created_at: '', project_id: 'p1', name: 'Teslim', due_at: '2026-10-30', status: 'planned' }];
  it('ilerleme bağlı görevlerden; geçmiş bitiş ve bitmemiş → gecikmiş', () => {
    const r = milestoneProgress(ms, [task({ id: 'a', milestone_id: 'm1', state: 'delivery' }), task({ id: 'b', milestone_id: 'm1' }), task({ id: 'c', milestone_id: 'm2' })], TODAY);
    expect(r[0]).toMatchObject({ total: 2, done: 1, pct: 50, overdue: true }); expect(r[1]).toMatchObject({ total: 1, pct: 0, overdue: false });
  });
  it('akış birleştirir, görev kümesine süzer, aktör türünü ayırır, yeni → eski', () => {
    const tl = buildTimeline({
      audit: [{ id: '1', occurred_at: '2026-10-10T10:00:00Z', actor_name: 'Öykü', action: 'task.move', resource: 'tasks/t1', meta: { state: 'approval' } }, { id: '2', occurred_at: '2026-10-11T10:00:00Z', actor_name: 'Kurul', action: 'agent.execute', resource: 'tasks/t9' }, { id: '3', occurred_at: '2026-10-12T10:00:00Z', actor_name: 'BY', action: 'project.create', resource: 'projects/p1', meta: { name: 'X' } }],
      comments: [{ id: 'c1', created_at: '2026-10-13T10:00:00Z', author_name: 'Trello Bot', author_id: null, body: 'merhaba', task_id: 't1', sync_origin: 'trello' }],
      sync: [{ id: 's1', created_at: '2026-10-09T10:00:00Z', direction: 'push', entity: 'task', entity_id: 't1', action: 'update', ok: true, message: '' }, { created_at: '2026-10-09T11:00:00Z', direction: 'push', entity: 'task', entity_id: 't1', action: 'demo_noop', ok: true, message: '' }],
    }, { taskIds: new Set(['t1']), projectId: 'p1' });
    expect(tl.map((e) => e.id)).toEqual(['c:c1', 'a:3', 'a:1', 's:s1']);
    expect(tl[0].actor_kind).toBe('trello'); expect(tl[2].text).toContain('Onay'); expect(tl[1].actor_kind).toBe('human');
    expect(buildTimeline({ audit: [{ id: '2', occurred_at: '2026-10-11T10:00:00Z', actor_name: 'Kurul', action: 'agent.execute', resource: 'tasks/t9' }] })[0].actor_kind).toBe('agent');
  });
  it('ajanda: gecikmişler ilk güne, aralık dışı düşer, kilometre taşları dahil', () => {
    const days = agendaDays({ tasks: [task({ id: 'a', due_at: '2026-10-01' }), task({ id: 'b', due_at: '2026-10-15' }), task({ id: 'c', due_at: '2026-11-15' }), task({ id: 'd', due_at: TODAY, assignee_id: 'OE' })], milestones: ms, employeeId: 'SK', today: TODAY, days: 7 });
    expect(days).toHaveLength(7);
    expect(days[0].items.map((i) => i.id)).toEqual(['t:a', 'm:m1']); expect(days[0].items[0].overdue).toBe(true);
    expect(days[1].items.map((i) => i.id)).toEqual(['t:b']);
    expect(days.flatMap((d) => d.items).some((i) => i.id === 't:c' || i.id === 't:d' || i.id === 'm:m2')).toBe(false);
  });
  it('6 pano grafiği üretilir', () => {
    const brands = [{ id: 'b', name: 'Wellana', health: 52, internal: false } as Brand];
    const approvals = [{ id: 'a', status: 'pending', created_at: '2026-09-20T00:00:00Z' } as Approval];
    const charts = buildDashboards({ tasks: [task({ id: 'a', due_at: '2026-10-01' })], team: [member('SK')], brands, approvals, runs: [{ agent: 'chair', cost_usd: 1, created_at: '2026-10-01T00:00:00Z' }], today: TODAY, usdTry: 40 });
    expect(charts.map((c) => c.id)).toEqual(['tasks_by_state', 'overdue_by_person', 'workload', 'brand_health', 'approvals_aging', 'agent_cost']);
    expect(charts[1].bars[0]).toMatchObject({ label: 'Kişi', value: 1 });
    expect(charts[4].bars.find((b) => b.label === '14+ gün')?.value).toBe(1);
    expect(charts[5].bars.at(-1)?.value).toBe(40);
  });
});

describe('slash komutları', () => {
  const mods = MODULES.map((m) => ({ id: m.id, name: m.name, slug: m.slug }));
  it('ayrıştırma ve hedefler', () => {
    expect(parseSlash('/görev Wellana afiş')).toEqual({ cmd: 'task', arg: 'Wellana afiş' });
    expect(parseSlash('/gorev x')?.cmd).toBe('task'); expect(parseSlash('/gö x')).toBeNull(); expect(parseSlash('görev')).toBeNull();
    expect(slashHref('task', 'Wellana afiş', { modules: mods })).toBe('/app/tasks?new=1&title=Wellana%20afi%C5%9F');
    expect(slashHref('request', '', { modules: mods })).toBe('/app/requests?new=1');
    expect(slashHref('go', 'crm', { modules: mods })).toBe('/app/crm'); expect(slashHref('go', 'talep', { modules: mods })).toBe('/app/requests'); expect(slashHref('go', 'yok', { modules: mods })).toBeNull();
    expect(slashHref('board', 'bütçe', { modules: mods })).toBeNull(); expect(slashHref('board', 'bütçe', { adminUrl: 'https://a', modules: mods })).toBe('https://a/admin/board/sohbet?q=b%C3%BCt%C3%A7e');
  });
  it('Spotlight: rol süzgeci ve komut listesi', () => {
    expect(slashHits('yeni', { role: 'owner', modules: mods })).toBeNull();
    expect(slashHits('/', { role: 'creative', modules: mods })!.some((h) => h.label.startsWith('/kurul'))).toBe(false);
    expect(slashHits('/', { role: 'owner', modules: mods })!.some((h) => h.label.startsWith('/kurul'))).toBe(true);
    expect(slashHits('/tal', { role: 'owner', modules: mods })!.map((h) => h.label)).toEqual(['/talep <başlık>']);
    expect(slashHits('/kurul x', { role: 'creative', modules: mods })!.map((h) => h.id)).toEqual([]);
    expect(slashHits('/talep Afiş', { role: 'creative', modules: mods })![0].href).toBe('/app/requests?new=1&title=Afi%C5%9F');
  });
});

describe('gezinme + DemoRepo (0017)', () => {
  it('yeni modüller gruplarda; müşteri talep görür ama iş yükü görmez', () => {
    expect(NAV_GROUPS.find((g) => g.id === 'home')!.children.map((c) => c.module)).toEqual(['overview', 'agenda', 'announcements', 'dashboards']);
    expect(NAV_GROUPS.find((g) => g.id === 'projects')!.modules).toContain('requests');
    expect(NAV_GROUPS.find((g) => g.id === 'team')!.modules).toContain('workload');
  });
  it('kayıtlı görünüm, kilometre taşı, talep, duyuru, üye ve politika koleksiyonları tohumlu', async () => {
    const owner = new DemoRepo({ accountId: 'owner' });
    expect((await owner.list('saved_views')).length).toBeGreaterThan(0);
    expect((await owner.list('milestones')).filter((m) => m.project_id === 'p1')).toHaveLength(3);
    expect((await owner.list('requests')).some((r) => r.status === 'converted' && r.task_id === 't2')).toBe(true);
    expect((await owner.list('announcements')).length).toBe(3);
    expect((await owner.list('project_members')).filter((m) => m.project_id === 'p1')).toHaveLength(3);
    expect((await owner.list('agent_policies')).find((p) => p.agent === 'chair')?.mode).toBe('plan');
    expect((await owner.listTasks()).find((t) => t.id === 't1')?.milestone_id).toBe('ms2');
    expect((await owner.listBrands()).find((b) => b.id === 'c_wellana')?.default_assignee_id).toBe('OE');
    await expect(new DemoRepo({ accountId: 'creative' }).list('agent_policies')).rejects.toBeInstanceOf(ForbiddenError);
  });
  it('müşteri yalnızca kendi markasının taleplerini görür ve client_admin talep açar', async () => {
    const viewer = new DemoRepo({ accountId: 'client_viewer' });
    const reqs = await viewer.list('requests');
    expect(reqs.length).toBeGreaterThan(0); expect(reqs.every((r) => r.brand_id === 'c_anova')).toBe(true);
    const admin = new DemoRepo({ accountId: 'client_admin' });
    const r = await admin.save('requests', { kind: 'client', title: 'Yeni afiş', body: '', status: 'new', requester_employee_id: null, requester_name: 'Anova', brand_id: 'c_anova', project_id: null, task_id: null, client_visible: true });
    expect(r.id).toBeTruthy();
    await expect(admin.save('requests', { kind: 'client', title: 'Yetkisiz', body: '', status: 'new', requester_employee_id: null, requester_name: 'X', brand_id: 'c_badem', project_id: null, task_id: null })).rejects.toBeInstanceOf(ForbiddenError);
  });
  it('alan sahibi güncellenir; görev teslim olunca bağlı talep kapanır', async () => {
    const repo = new DemoRepo({ accountId: 'account' });
    expect((await repo.updateBrand('c_badem', { default_assignee_id: 'SK' })).default_assignee_id).toBe('SK');
    await expect(new DemoRepo({ accountId: 'creative' }).updateBrand('c_badem', { default_assignee_id: 'SK' })).rejects.toBeInstanceOf(ForbiddenError);
    const t = await repo.createTask({ project_id: 'p2', title: 'Yönlendirme tasarımı', due_at: '2026-10-20' });
    const req = await repo.save('requests', { kind: 'brief', title: 'Brief', body: '', status: 'converted', requester_employee_id: 'OE', requester_name: 'Öykü', brand_id: 'c_clayton', project_id: 'p2', task_id: t.id });
    await repo.moveTask(t.id, 'delivery');
    expect((await repo.list('requests')).find((r) => r.id === req.id)?.status).toBe('closed');
  });
  it('ajan onayı: owner onaylayınca plan görevleri, kilometre taşı ve üyeler oluşur; subject.executed yazılır', async () => {
    const repo = new DemoRepo({ accountId: 'owner' });
    const a = await repo.createApproval({ action_type: 'agent', title: 'Kurul planı', required_role: 'owner', due_at: '2026-10-20', subject: { project_id: 'p2', agent: 'chair', payload: { kind: 'board_plan_apply', project_id: 'p2', tasks: [{ title: 'Konsept sunumu', assignee_id: 'DO', priority: 'high', planned_minutes: 120, due_at: '2026-10-21T12:00:00.000Z', labels: ['kurul'], description: 'Açıklama', milestone: 'Sunum' }, { title: 'Bütçe tablosu', assignee_id: null, priority: 'normal', planned_minutes: 60, due_at: null, labels: [] }], milestones: [{ name: 'Sunum', due_at: '2026-10-25' }], members: ['OE'] } } });
    expect(a.status).toBe('pending');
    const before = (await repo.listTasks({ project_id: 'p2' })).length;
    const d = await repo.decideApproval(a.id, 'approved');
    expect(d.subject.executed?.task_ids).toHaveLength(2);
    const tasks = await repo.listTasks({ project_id: 'p2' });
    expect(tasks.length).toBe(before + 2);
    const created = tasks.find((t) => t.title === 'Konsept sunumu')!;
    expect(created.description).toBe('Açıklama'); expect(created.labels).toEqual(['kurul']); expect(created.milestone_id).toBeTruthy();
    expect((await repo.list('milestones')).some((m) => m.project_id === 'p2' && m.name === 'Sunum')).toBe(true);
    expect((await repo.list('project_members')).some((m) => m.project_id === 'p2' && m.employee_id === 'DO')).toBe(true);
    const inbox = buildInbox({ me: { role: 'owner', employee_id: 'BY', name: 'BY' }, tasks: [], approvals: [{ ...a, status: 'pending' }], notifications: [], today: TODAY, done: [] });
    expect(inbox[0]).toMatchObject({ kind: 'approval', urgent: true }); expect(inbox[0].approval?.id).toBe(a.id); expect(inbox[0].body).toContain('2 görev');
    // Reddedilen öneri uygulanmaz
    const b = await repo.createApproval({ action_type: 'agent', title: 'Plan 2', required_role: 'owner', due_at: '2026-10-20', subject: { agent: 'chair', payload: { kind: 'board_plan_apply', project_id: 'p2', tasks: [{ title: 'Olmayacak görev', assignee_id: null, priority: 'low', planned_minutes: 0, due_at: null, labels: [] }] } } });
    await repo.decideApproval(b.id, 'rejected');
    expect((await repo.listTasks({ project_id: 'p2' })).some((t) => t.title === 'Olmayacak görev')).toBe(false);
  });
  it('akış: görev yorumu, denetim ve rol kısıtı; çevrimiçi aboneliği', async () => {
    const owner = new DemoRepo({ accountId: 'owner' });
    const t = (await owner.listTasks({ project_id: 'p1' }))[0];
    await owner.addComment(t.id, 'Akış testi');
    const tl = await owner.listActivity({ task_id: t.id });
    expect(tl.some((e) => e.source === 'comment' && e.text.includes('Akış testi'))).toBe(true);
    expect(tl.some((e) => e.source === 'audit' && e.text.includes('yorum'))).toBe(true);
    const creative = new DemoRepo({ accountId: 'creative' });
    expect((await creative.listActivity({ project_id: 'p1' })).every((e) => e.source !== 'audit')).toBe(true);
    let got: string[] = [];
    const off = owner.subscribePresence((ids) => { got = ids; });
    expect(got).toContain('BY'); off();
  });
});
