import { describe, expect, it } from 'vitest';
import {
  CAPABILITIES, DEFAULT_APPROVAL_POLICIES, DEFAULT_PERMISSIONS, ROLES, applyDecision, applyEscalation, blockedMap, blockersOf, buildSteps, can, canDecideStep, canEditTask, chainOrder, chainView,
  defaultStep, delegationNeedsApproval, diffPermissions, effectivePermissions, escalationsDue, fmtSla, isBlocked, moveNeedsOverride, newlyUnblocked, permissionChanges, planDependencyLinks, policyScore,
  requiredRoleFor, resolvePolicy, stepDueAt, stepRecipients, wouldCycle,
  type ApprovalPolicy, type ApprovalStep, type Delegation, type Task, type TaskLink, type TeamMember,
} from '@jscore/contracts';
import { DemoRepo } from '@jscore/core/repo/demo';
import { ForbiddenError, PendingApprovalError } from '@jscore/core/repo/types';
import { myTurn } from '@jscore/core/approvals/engine';
import { buildInbox } from '../inbox';

const task = (p: Partial<Task>): Task => ({ id: 't', org_id: 'o', project_id: 'p1', title: 'Görev', assignee_id: 'SK', state: 'production', priority: 'normal', due_at: '2026-10-14', planned_minutes: 60, task_type: 'general', qty: 1, source_ref: null, labels: [], client_visible: false, created_at: '2026-10-01T09:00:00Z', ...p });
const link = (from: string, to: string, kind: TaskLink['kind'] = 'blocks'): TaskLink => ({ id: `${from}>${to}`, org_id: 'o', from_task_id: from, to_task_id: to, kind, created_by: null, created_at: '2026-10-01T09:00:00Z' });
const member = (id: string, app_role: TeamMember['app_role'], extra: Partial<TeamMember> = {}): TeamMember => ({ id, org_id: 'o', name: `Kişi ${id}`, role_title: '', app_role, status: 'active', weekly_hours: 40, ...extra });
const NOW = '2026-10-14T10:00:00Z';

/* ═══════════ A) Bağımlılıklar ═══════════ */
describe('bağımlılık grafiği', () => {
  const tasks = [task({ id: 'a', state: 'archive', due_at: '2026-10-01' }), task({ id: 'b', state: 'production', due_at: '2026-10-05' }), task({ id: 'c', state: 'brief', due_at: '2026-10-10' }), task({ id: 'd', state: 'brief', due_at: '2026-10-12' }), task({ id: 'e', state: 'plan', due_at: '2026-10-03' })];
  const links = [link('a', 'c'), link('b', 'c'), link('c', 'd'), link('e', 'd', 'relates')];
  it('açık engelleyiciler yalnızca teslim/arşivde olmayan blocks öncülleri', () => {
    expect(blockersOf('c', links, tasks).map((t) => t.id)).toEqual(['b']);         // a arşivde → sayılmaz
    expect(isBlocked('d', links, tasks)).toBe(true);                                 // c açık
    expect(isBlocked('e', links, tasks)).toBe(false);                                // relates engellemez
    expect(blockedMap(tasks, links)).toEqual({ c: 1, d: 1 });
  });
  it('koruma yalnızca production ve sonrası için', () => {
    expect(moveNeedsOverride('production', 1)).toBe(true); expect(moveNeedsOverride('delivery', 2)).toBe(true);
    expect(moveNeedsOverride('plan', 1)).toBe(false); expect(moveNeedsOverride('production', 0)).toBe(false);
  });
  it('döngü tespiti', () => {
    expect(wouldCycle('d', 'a', links)).toBe(true);    // d→a eklenirse a→c→d→a
    expect(wouldCycle('c', 'a', links)).toBe(true);
    expect(wouldCycle('a', 'd', links)).toBe(false);
    expect(wouldCycle('x', 'x', [])).toBe(true);
  });
  it('son engel kalkınca "önü açılan" görevler', () => {
    const after = tasks.map((t) => (t.id === 'b' ? { ...t, state: 'delivery' as const } : t));
    expect(newlyUnblocked('b', links, after)).toEqual(['c']);
    const after2 = tasks.map((t) => (t.id === 'a' ? t : t)); // a zaten arşiv; b hâlâ açık → c engelli kalır
    expect(newlyUnblocked('a', links, after2)).toEqual([]);
  });
  it('zincir (topolojik) sırası: kökler tarihe göre, ardıllar girintili; döngü sona', () => {
    const rows = chainOrder(tasks, links);
    expect(rows.map((r) => `${r.task.id}:${r.depth}`)).toEqual(['a:0', 'e:0', 'b:0', 'c:1', 'd:2']);
    expect(rows.find((r) => r.task.id === 'c')).toMatchObject({ blockers: 1, blockedBy: ['a', 'b'] });
    const cyc = chainOrder([task({ id: 'x' }), task({ id: 'y' })], [link('x', 'y'), link('y', 'x')]);
    expect(cyc.every((r) => r.cycle)).toBe(true);
  });
  it('kurul planı depends_on → task_links (başlık eşleşmesi aksan/büyük-küçük duyarsız, tekrar yok)', () => {
    const plan = [{ title: 'Brief', depends_on: [] }, { title: 'Tasarım', depends_on: ['brief', 'Yok'] }, { title: 'Teslim', depends_on: ['Tasarım', 'Brief', 'Tasarım'] }];
    expect(planDependencyLinks(plan, { Brief: 't1', Tasarım: 't2', Teslim: 't3' })).toEqual([
      { from_task_id: 't1', to_task_id: 't2', kind: 'blocks' }, { from_task_id: 't2', to_task_id: 't3', kind: 'blocks' }, { from_task_id: 't1', to_task_id: 't3', kind: 'blocks' },
    ]);
  });
});

/* ═══════════ B) Yetki ═══════════ */
describe('yetki matrisi', () => {
  it('varsayılanlar mevcut davranışı korur', () => {
    expect(can({ role: 'creative' }, 'tasks.create')).toBe(true);
    expect(can({ role: 'creative' }, 'tasks.edit_any')).toBe(false);
    expect(can({ role: 'freelancer' }, 'tasks.create')).toBe(false);
    expect(can({ role: 'finance' }, 'finance.edit')).toBe(true);
    expect(can({ role: 'payroll' }, 'people.view_salary')).toBe(true); expect(can({ role: 'owner' }, 'people.view_salary')).toBe(false);
    expect(can({ role: 'client_admin' }, 'approvals.decide')).toBe(true); expect(can({ role: 'client_viewer' }, 'approvals.decide')).toBe(false);
    expect(can({ role: 'pm' }, 'tasks.override_block')).toBe(true); expect(can({ role: 'account' }, 'tasks.override_block')).toBe(false);
    for (const r of ROLES) for (const c of CAPABILITIES) expect(typeof DEFAULT_PERMISSIONS[r][c]).toBe('boolean');
  });
  it('org sapması açar/kapatır; müşteri tavanı aşılmaz', () => {
    const overrides = { creative: { 'tasks.edit_any': true }, pm: { 'tasks.delete': false }, client_admin: { 'tasks.create': true } };
    expect(can({ role: 'creative' }, 'tasks.edit_any', { overrides })).toBe(true);
    expect(can({ role: 'pm' }, 'tasks.delete', { overrides })).toBe(false);
    expect(can({ role: 'client_admin' }, 'tasks.create', { overrides })).toBe(false);
    expect(can(null, 'tasks.create')).toBe(false);
  });
  it('proje rolü yalnızca o projede ek yetki verir', () => {
    expect(can({ role: 'creative' }, 'tasks.assign', { projectRole: 'manager' })).toBe(true);
    expect(can({ role: 'creative' }, 'tasks.assign', { projectRole: 'collaborator' })).toBe(false);
    expect(can({ role: 'freelancer' }, 'tasks.delete', { projectRole: 'admin' })).toBe(true);
    expect(can({ role: 'creative' }, 'tasks.create', { projectRole: 'viewer' })).toBe(true); // org varsayılanı zaten açık
  });
  it('delegasyon: yalnızca aktif pencerede ve hedef kişiye', () => {
    const d: Delegation = { id: 'd1', org_id: 'o', from_employee_id: 'OE', to_employee_id: 'SK', caps: ['approvals.decide'], starts_at: '2026-10-13T00:00:00Z', ends_at: '2026-10-20T00:00:00Z', reason: 'izin', status: 'active', created_at: NOW };
    expect(can({ role: 'creative', employee_id: 'SK' }, 'approvals.decide', { delegations: [d], now: NOW })).toBe(true);
    expect(can({ role: 'creative', employee_id: 'SK' }, 'approvals.decide', { delegations: [d], now: '2026-10-21T00:00:00Z' })).toBe(false);
    expect(can({ role: 'creative', employee_id: 'DO' }, 'approvals.decide', { delegations: [d], now: NOW })).toBe(false);
    expect(can({ role: 'creative', employee_id: 'SK' }, 'approvals.decide', { delegations: [{ ...d, status: 'pending' }], now: NOW })).toBe(false);
    expect(can({ role: 'creative', employee_id: 'SK' }, 'finance.edit', { delegations: [{ ...d, caps: ['*'] }], now: NOW })).toBe(true);
    expect(delegationNeedsApproval(['tasks.assign'])).toBe(false); expect(delegationNeedsApproval(['finance.view'])).toBe(true); expect(delegationNeedsApproval(['approvals.decide'])).toBe(true);
  });
  it('kendi görevi / her görev', () => {
    const me = { role: 'creative' as const, employee_id: 'SK' };
    expect(canEditTask(me, { assignee_id: 'SK' })).toBe(true); expect(canEditTask(me, { assignee_id: null })).toBe(true); expect(canEditTask(me, { assignee_id: 'DO' })).toBe(false);
    expect(canEditTask({ role: 'pm', employee_id: 'X' }, { assignee_id: 'DO' })).toBe(true);
  });
  it('sapma farkı ve etkin matris', () => {
    const full = effectivePermissions(null);
    full.creative['tasks.delete'] = true; full.owner['tasks.create'] = false;
    const d = diffPermissions(full);
    expect(d).toEqual({ creative: { 'tasks.delete': true }, owner: { 'tasks.create': false } });
    expect(effectivePermissions(d).creative['tasks.delete']).toBe(true);
    expect(permissionChanges(null, d)).toEqual([{ role: 'owner', cap: 'tasks.create', from: true, to: false }, { role: 'creative', cap: 'tasks.delete', from: false, to: true }]);
    expect(diffPermissions(effectivePermissions(null))).toEqual({});
  });
});

/* ═══════════ C) Onay zincirleri ═══════════ */
const team = [member('BY', 'owner'), member('UC', 'creative', { manager_id: 'BY' }), member('SK', 'creative', { manager_id: 'UC' }), member('OE', 'account', { manager_id: 'BY' }), member('BA', 'finance', { manager_id: 'BY' }), member('SO', 'account', { manager_id: 'OE' })];
const pol = (p: Partial<ApprovalPolicy> & Pick<ApprovalPolicy, 'name' | 'action_type' | 'steps'>, i = 0): ApprovalPolicy => ({ id: `ap${i}`, org_id: 'o', condition: {}, escalation: null, active: true, created_at: `2026-10-0${i + 1}T00:00:00Z`, ...p });
const step = (p: Partial<ApprovalStep>): ApprovalStep => ({ id: 's', org_id: 'o', approval_id: 'a', step_index: 0, approver_role: null, approvers: [], mode: 'any', status: 'pending', decisions: [], decided_by: null, decided_at: null, note: null, started_at: NOW, due_at: null, escalated_at: null, escalated_to: [], created_at: NOW, ...p });

describe('politika eşleşmesi', () => {
  const policies = DEFAULT_APPROVAL_POLICIES.map((p, i) => pol(p as never, i));
  it('eşik ve en özgül kazanır', () => {
    expect(resolvePolicy(policies, 'budget', { amount_minor: 1_000_000 })).toBeNull();
    expect(resolvePolicy(policies, 'budget', { amount_minor: 3_000_000 })?.name).toBe('Bütçe > ₺25.000');
    const more = [...policies, pol({ name: 'Wellana bütçe', action_type: 'budget', condition: { min_amount_minor: 1000, brand_ids: ['c_wellana'] }, steps: [{ role: 'owner', mode: 'any', sla_hours: 1 }] }, 9)];
    expect(resolvePolicy(more, 'budget', { amount_minor: 3_000_000, brand_id: 'c_wellana' })?.name).toBe('Wellana bütçe');
    expect(resolvePolicy(more, 'budget', { amount_minor: 3_000_000, brand_id: 'c_anova' })?.name).toBe('Bütçe > ₺25.000');
    expect(policyScore(policies[4], 'task_stage', { to_state: 'delivery', brand: { id: 'b', status: 'risky' } })).toBe(2);
    expect(policyScore(policies[4], 'task_stage', { to_state: 'delivery', brand: { id: 'b', status: 'active' } })).toBe(-1);
    expect(policyScore(policies[4], 'task_stage', { to_state: 'production', brand: { id: 'b', status: 'risky' } })).toBe(-1);
    expect(resolvePolicy(policies.map((p) => ({ ...p, active: false })), 'scope', {})).toBeNull();
  });
  it('etiket / tür koşulları', () => {
    const p = pol({ name: 'x', action_type: 'content', condition: { labels: ['acil'], task_types: ['video_edit'] }, steps: [{ role: 'owner', mode: 'any', sla_hours: 1 }] });
    expect(policyScore(p, 'content', { labels: ['acil', 'kasım'], task_type: 'video_edit' })).toBe(2);
    expect(policyScore(p, 'content', { labels: ['kasım'], task_type: 'video_edit' })).toBe(-1);
  });
});

describe('zincir adımları', () => {
  it('rol / kişi / yönetici çözümleme; mode all → rolün tüm aktif çalışanları', () => {
    const built = buildSteps([{ manager_of_requester: true, mode: 'any', sla_hours: 24 }, { role: 'account', mode: 'all', sla_hours: 48 }, { employee_id: 'BA', mode: 'any', sla_hours: 1 }, { role: 'owner', mode: 'any', sla_hours: 1 }], { requesterEmployeeId: 'SK', team });
    expect(built[0]).toMatchObject({ approvers: ['UC'], approver_role: null });
    expect(built[1]).toMatchObject({ approver_role: 'account', approvers: ['OE', 'SO'], mode: 'all' });
    expect(built[2]).toMatchObject({ approvers: ['BA'] });
    expect(built[3]).toMatchObject({ approver_role: 'owner', approvers: [] });
    expect(buildSteps([{ manager_of_requester: true, mode: 'any', sla_hours: 1 }], { requesterEmployeeId: 'BY', team })[0]).toMatchObject({ approver_role: 'owner', unresolved: true });
    expect(requiredRoleFor(built[0], team)).toBe('creative'); expect(requiredRoleFor(built[1], team)).toBe('account'); expect(requiredRoleFor(undefined, team)).toBe('owner');
    expect(defaultStep('pm')[0]).toMatchObject({ approver_role: 'pm', sla_hours: 48 });
    expect(stepDueAt(NOW, 24)).toBe('2026-10-15T10:00:00.000Z');
  });
  it('kim karar verebilir: rol, kişi, yükseltme, delegasyon', () => {
    const roleStep = step({ approver_role: 'pm' });
    expect(canDecideStep({ role: 'account' }, roleStep)).toBe(true); expect(canDecideStep({ role: 'creative' }, roleStep)).toBe(false); expect(canDecideStep({ role: 'owner' }, roleStep)).toBe(true);
    const person = step({ approvers: ['BA'] });
    expect(canDecideStep({ role: 'finance', employee_id: 'BA' }, person)).toBe(true); expect(canDecideStep({ role: 'finance', employee_id: 'X' }, person)).toBe(false); expect(canDecideStep({ role: 'owner', employee_id: 'BY' }, person)).toBe(true);
    expect(canDecideStep({ role: 'creative', employee_id: 'SK' }, step({ approver_role: 'owner', escalated_to: ['SK'] }))).toBe(true);
    expect(canDecideStep({ role: 'account', employee_id: 'OE' }, step({ approver_role: 'finance', escalated_to: ['role:account'] }))).toBe(true);
    const d: Delegation = { id: 'd', org_id: 'o', from_employee_id: 'BA', to_employee_id: 'SK', caps: ['approvals.decide'], starts_at: '2026-10-13T00:00:00Z', ends_at: '2026-10-20T00:00:00Z', reason: '', status: 'active', created_at: NOW };
    expect(canDecideStep({ role: 'creative', employee_id: 'SK' }, person, { team, delegations: [d], now: NOW })).toBe(true);
    expect(canDecideStep({ role: 'creative', employee_id: 'SK' }, person, { team, delegations: [{ ...d, caps: ['tasks.assign'] }], now: NOW })).toBe(false);
    expect(canDecideStep({ role: 'owner' }, step({ status: 'approved' }))).toBe(false);
    const all = step({ approver_role: 'account', approvers: ['OE', 'SO'], mode: 'all', decisions: [{ by: 'OE', answer: 'approved', at: NOW }] });
    expect(canDecideStep({ role: 'account', employee_id: 'OE' }, all)).toBe(false); expect(canDecideStep({ role: 'account', employee_id: 'SO' }, all)).toBe(true);
  });
  it('ilerleme: any → sonraki adım başlar; all → herkes; ret → kalanlar atlanır', () => {
    const steps = [step({ id: 's0', step_index: 0, approvers: ['UC'] }), step({ id: 's1', step_index: 1, approver_role: 'account', approvers: ['OE', 'SO'], mode: 'all', started_at: null }), step({ id: 's2', step_index: 2, approver_role: 'owner', started_at: null })];
    const r1 = applyDecision(steps, 0, 'UC', 'approved', NOW);
    expect(r1.outcome).toBe('advanced'); expect(r1.nextIndex).toBe(1); expect(r1.steps[0].status).toBe('approved'); expect(r1.steps[1].started_at).toBe(NOW);
    const r2 = applyDecision(r1.steps, 1, 'OE', 'approved', NOW);
    expect(r2.outcome).toBe('waiting'); expect(r2.steps[1].status).toBe('pending');
    const r3 = applyDecision(r2.steps, 1, 'SO', 'approved', NOW);
    expect(r3.outcome).toBe('advanced'); expect(r3.nextIndex).toBe(2);
    const r4 = applyDecision(r3.steps, 2, 'BY', 'approved', NOW, 'tamam');
    expect(r4.outcome).toBe('approved'); expect(r4.steps[2]).toMatchObject({ status: 'approved', note: 'tamam', decided_by: 'BY' });
    const rej = applyDecision(r1.steps, 1, 'OE', 'rejected', NOW, 'hayır');
    expect(rej.outcome).toBe('rejected'); expect(rej.steps[1].status).toBe('rejected'); expect(rej.steps[2].status).toBe('skipped');
    expect(() => applyDecision(r4.steps, 2, 'BY', 'approved', NOW)).toThrow();
  });
  it('stepper görünümü ve SLA metni', () => {
    const v = chainView([step({ step_index: 0, status: 'approved' }), step({ step_index: 1, due_at: '2026-10-14T13:00:00Z' })], NOW);
    expect(v).toMatchObject({ done: 1, total: 2, overdue: false, hoursLeft: 3 }); expect(v.current?.step_index).toBe(1);
    expect(chainView([step({ due_at: '2026-10-13T10:00:00Z' })], NOW)).toMatchObject({ overdue: true, hoursLeft: -24 });
    expect(fmtSla(3)).toBe('SLA 3 sa kaldı'); expect(fmtSla(-50)).toBe('SLA 2 gün aşıldı'); expect(fmtSla(null)).toBe('');
  });
  it('SLA aşımı yükseltmesi: due + after_hours geçince, bir kez; politikasız onayda 24 sa sonra owner', () => {
    const policies = [pol({ name: 'p', action_type: 'scope', steps: [{ role: 'pm', mode: 'any', sla_hours: 24 }], escalation: { after_hours: 12, to_role: 'owner' } }, 1), pol({ name: 'q', action_type: 'scope', steps: [{ role: 'pm', mode: 'any', sla_hours: 24 }], escalation: null }, 2)];
    const approvals = [{ id: 'a1', status: 'pending' as const, policy_id: 'ap1' }, { id: 'a2', status: 'pending' as const, policy_id: 'ap2' }, { id: 'a3', status: 'pending' as const, policy_id: null }, { id: 'a4', status: 'approved' as const, policy_id: 'ap1' }];
    const steps = [
      step({ id: 'x1', approval_id: 'a1', due_at: '2026-10-13T20:00:00Z' }),   // +14 sa → yükselt (12 sa eşiği geçti)
      step({ id: 'x2', approval_id: 'a2', due_at: '2026-10-10T00:00:00Z' }),   // politika yükseltme tanımlamamış
      step({ id: 'x3', approval_id: 'a3', due_at: '2026-10-13T09:00:00Z' }),   // varsayılan 24 sa → +25 sa → owner
      step({ id: 'x4', approval_id: 'a4', due_at: '2026-10-01T00:00:00Z' }),   // karara bağlanmış
      step({ id: 'x5', approval_id: 'a1', step_index: 1, due_at: '2026-10-01T00:00:00Z' }), // ilk bekleyen adım x1; x5 sayılmaz
    ];
    const due = escalationsDue(approvals, steps, policies, NOW);
    expect(due.map((d) => d.step.id)).toEqual(['x1', 'x3']);
    expect(due[0].to_role).toBe('owner');
    const esc = applyEscalation(due[0].step, due[0], NOW);
    expect(esc).toMatchObject({ escalated_at: NOW, escalated_to: ['role:owner'] });
    expect(escalationsDue(approvals, steps.map((s) => (s.id === 'x1' ? esc : s)), policies, NOW).map((d) => d.step.id)).toEqual(['x3']);
    expect(escalationsDue(approvals, [step({ id: 'y', approval_id: 'a1', due_at: '2026-10-14T05:00:00Z' })], policies, NOW)).toEqual([]); // +5 sa < 12
    expect(stepRecipients({ approver_role: 'account', approvers: [], escalated_to: ['role:owner', 'SK'] }, team).sort()).toEqual(['BY', 'OE', 'SK', 'SO']);
  });
});

/* ═══════════ DemoRepo uçtan uca (hesaplar ortak bellek deposunu paylaşır) ═══════════ */
const kv = () => { const m = new Map<string, string>(); return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => { m.set(k, v); } }; };
describe('DemoRepo 0018', () => {
  const T = '2026-10-14T10:00:00Z';
  it('engelli görev üretime taşınamaz; pm/proje admini geçebilir; engel kalkınca "önün açıldı" bildirimi + olay', async () => {
    const storage = kv();
    const creative = new DemoRepo({ accountId: 'creative', now: () => T, storage });   // SK: p1 manager → t12'yi (OE) düzenleyebilir ama engeli aşamaz
    await expect(creative.moveTask('t12', 'production')).rejects.toThrow(/engelli/);  // t12: 2 engel (t1 + t4)
    expect((await creative.moveTask('t12', 'plan')).state).toBe('plan');               // plan'a kadar serbest
    const account = new DemoRepo({ accountId: 'account', now: () => T, storage });     // OE: p1 proje admini → tasks.override_block
    expect((await account.moveTask('t12', 'production')).state).toBe('production');
    await expect(new DemoRepo({ accountId: 'account', now: () => T, storage }).moveTask('t10', 'production')).rejects.toThrow(/engelli/); // p6'da üye değil
    const owner = new DemoRepo({ accountId: 'owner', now: () => T, storage });
    expect((await owner.moveTask('t10', 'production')).state).toBe('production');      // owner override
    // kapatılabilir
    await owner.saveSettings({ workflow: { enforce_dependencies: false } });
    expect((await new DemoRepo({ accountId: 'account', storage }).moveTask('t10', 'internal_review')).state).toBe('internal_review');
    await owner.saveSettings({ workflow: { enforce_dependencies: true } });
    // engel kalkınca bildirim
    const before = (await creative.list('notifications')).length;
    await creative.moveTask('t1', 'archive');                                          // t12 için t4 hâlâ açık → bildirim yok (archive: teslim kapısı değil)
    expect((await creative.list('notifications')).length).toBe(before);
    await account.moveTask('t4', 'archive');                                           // son engel → OE'ye bildirim
    const n = (await creative.list('notifications')).find((x) => x.kind === 'unblocked');
    expect(n).toMatchObject({ employee_id: 'OE', href: '/app/projects/p1?task=t12' });
    const inbox = buildInbox({ me: { role: 'account', employee_id: 'OE', name: 'Öykü' }, tasks: [], approvals: [], notifications: [n!], today: '2026-10-14', done: [] });
    expect(inbox[0]).toMatchObject({ kind: 'unblocked', title: expect.stringContaining('Önün açıldı') });
  });
  it('bağ ekleme: yetki + döngü yasağı', async () => {
    const storage = kv();
    const creative = new DemoRepo({ accountId: 'creative', storage });
    const l = await creative.save('task_links', { from_task_id: 't2', to_task_id: 't5', kind: 'blocks', created_by: 'SK' });
    expect(l.id).toBeTruthy();
    await expect(creative.save('task_links', { from_task_id: 't12', to_task_id: 't1', kind: 'blocks', created_by: 'SK' })).rejects.toThrow(/döngü/);
    await expect(new DemoRepo({ accountId: 'finance', storage }).save('task_links', { from_task_id: 't2', to_task_id: 't6', kind: 'relates', created_by: 'BA' })).rejects.toBeInstanceOf(ForbiddenError);
  });
  it('yetki matrisi sapması Repo yazmalarını kısıtlar; proje rolü açar', async () => {
    const storage = kv();
    const owner = new DemoRepo({ accountId: 'owner', storage });
    await owner.saveSettings({ permissions: { creative: { 'tasks.create': false } } });
    const creative = new DemoRepo({ accountId: 'creative', storage });
    await expect(creative.createTask({ project_id: 'p3', title: 'Yeni iş', due_at: '2026-10-20' })).rejects.toBeInstanceOf(ForbiddenError);
    expect((await creative.createTask({ project_id: 'p1', title: 'Yeni iş', due_at: '2026-10-20' })).title).toBe('Yeni iş'); // p1'de SK manager
    await expect(creative.updateTask('t3', { priority: 'low' })).rejects.toBeInstanceOf(ForbiddenError);                  // HO'nun görevi
    expect((await creative.updateTask('t1', { priority: 'low' })).priority).toBe('low');                                   // kendi görevi
  });
  it('delegasyon: self-servis, hassas yetkide owner onayı; aktif delege karar verir', async () => {
    const now = () => T; const storage = kv();
    const creative = new DemoRepo({ accountId: 'creative', now, storage });
    await expect(creative.save('delegations', { from_employee_id: 'OE', to_employee_id: 'SK', caps: ['tasks.assign'], starts_at: T, ends_at: '2026-10-20T00:00:00Z', reason: 'x', status: 'active' })).rejects.toBeInstanceOf(ForbiddenError);
    const d = await creative.save('delegations', { from_employee_id: 'SK', to_employee_id: 'DO', caps: ['approvals.decide'], starts_at: T, ends_at: '2026-10-20T00:00:00Z', reason: 'izin', status: 'active' });
    expect(d.status).toBe('pending');
    await expect(creative.save('delegations', { id: d.id, status: 'active' })).rejects.toBeInstanceOf(ForbiddenError);
    const ok = await creative.save('delegations', { from_employee_id: 'SK', to_employee_id: 'DO', caps: ['tasks.link'], starts_at: T, ends_at: '2026-10-20T00:00:00Z', reason: 'izin', status: 'active' });
    expect(ok.status).toBe('active');
    // tohum: OE → SO approvals.decide (13–19 Ekim). a1 account onayı: SO account zaten; a4 pm onayını operations/account verebilir → SO için delegasyonla owner-adımı?
    const steps = await new DemoRepo({ accountId: 'owner', now, storage }).list('approval_steps');
    const approvals = await new DemoRepo({ accountId: 'owner', now, storage }).listApprovals();
    const team = await creative.team();
    const dels = await creative.list('delegations');
    const turnSO = myTurn({ role: 'account', employee_id: 'SO' }, approvals, steps, { team, delegations: dels, now: T });
    expect(turnSO.has('a1')).toBe(true); expect(turnSO.has('a6')).toBe(false);   // a6 owner adımında
    const turnOwner = myTurn({ role: 'owner', employee_id: 'BY' }, approvals, steps, { team, delegations: dels, now: T });
    expect(turnOwner.has('a6')).toBe(true);
  });
  it('zincirli onay: politika → adımlar → ilerleme → bildirimler → yan etki (teslim kapısı)', async () => {
    const now = () => T; const storage = kv();
    const account = new DemoRepo({ accountId: 'account', now, storage });      // OE, yöneticisi BY
    const a = await account.createApproval({ action_type: 'budget', title: 'Wellana çekim ek bütçesi', required_role: 'pm', due_at: '2026-10-20', subject: { amount_minor: 4_000_000, project_id: 'p1', brand_id: 'c_wellana' } });
    expect(a.policy_id).toBe('ap1'); expect(a.current_step).toBe(0); expect(a.required_role).toBe('owner'); // yönetici adımı: BY (owner)
    const steps = (await account.list('approval_steps')).filter((s) => s.approval_id === a.id);
    expect(steps.map((s) => [s.approver_role, s.approvers])).toEqual([[null, ['BY']], ['finance', []], ['owner', []]]);
    expect(steps[0].due_at).toBe('2026-10-15T10:00:00.000Z');
    // finans sırada değil
    await expect(new DemoRepo({ accountId: 'finance', now, storage }).decideApproval(a.id, 'approved')).rejects.toBeInstanceOf(ForbiddenError);
    const owner = new DemoRepo({ accountId: 'owner', now, storage });
    const after1 = await owner.decideApproval(a.id, 'approved', 'olur');
    expect(after1).toMatchObject({ status: 'pending', current_step: 1, due_at: '2026-10-16T10:00:00.000Z' });
    const notif = (await owner.list('notifications')).filter((n) => n.title.includes('Wellana çekim ek bütçesi'));
    expect(notif.some((n) => n.employee_id === 'BA' && n.kind === 'approval')).toBe(true);           // finans bilgilendirildi
    const fin = new DemoRepo({ accountId: 'finance', now, storage });
    expect((await fin.decideApproval(a.id, 'approved')).current_step).toBe(2);
    const done = await owner.decideApproval(a.id, 'rejected', 'bütçe yok');
    expect(done.status).toBe('rejected');
    expect((await owner.list('notifications')).some((n) => n.employee_id === 'OE' && n.title.startsWith('Reddedildi'))).toBe(true);
    const st = (await owner.list('approval_steps')).filter((s) => s.approval_id === a.id).sort((x, y) => x.step_index - y.step_index);
    expect(st.map((s) => s.status)).toEqual(['approved', 'approved', 'rejected']);
    // teslim kapısı: Wellana (risky) görevi teslime taşınamaz → onay açılır; account onaylayınca teslim olur
    const creative = new DemoRepo({ accountId: 'creative', now, storage });
    let pending: PendingApprovalError | null = null;
    try { await creative.moveTask('t1', 'delivery'); } catch (e) { pending = e as PendingApprovalError; }
    expect(pending).toBeInstanceOf(PendingApprovalError);
    expect((await creative.listTasks()).find((t) => t.id === 't1')?.state).not.toBe('delivery');
    const gate = (await creative.listApprovals()).find((x) => x.id === pending!.approvalId)!;
    expect(gate).toMatchObject({ action_type: 'task_stage', policy_id: 'ap5', subject: { task_id: 't1', to_state: 'delivery' } });
    // aynı görev için ikinci deneme yeni onay açmaz
    try { await creative.moveTask('t1', 'delivery'); } catch (e) { expect((e as PendingApprovalError).approvalId).toBe(gate.id); }
    const r = await new DemoRepo({ accountId: 'account', now, storage }).decideApproval(gate.id, 'approved');
    expect(r.subject.effect?.task_id).toBe('t1');
    expect((await creative.listTasks()).find((t) => t.id === 't1')?.state).toBe('delivery');
    // yönetici adımı: SK'nın yöneticisi UC (creative) — matriste approvals.decide yok ama adımda adı geçtiği için karar verir
    const sk = new DemoRepo({ accountId: 'creative', now, storage });
    const b = await sk.createApproval({ action_type: 'budget', title: 'Çekim ekipman kirası', required_role: 'pm', due_at: '2026-10-20', subject: { amount_minor: 3_000_000, project_id: 'p1' } });
    expect((await sk.list('approval_steps')).find((s) => s.approval_id === b.id && s.step_index === 0)?.approvers).toEqual(['UC']);
    // politikasız (content) → tek adım, eski kural
    const c = await account.createApproval({ action_type: 'content', title: 'Anova görsel', required_role: 'account', due_at: '2026-10-20', subject: { brand_id: 'c_anova' } });
    expect(c.policy_id).toBeNull(); expect((await account.list('approval_steps')).filter((s) => s.approval_id === c.id)).toHaveLength(1);
    expect((await new DemoRepo({ accountId: 'account', now, storage }).decideApproval(c.id, 'approved')).status).toBe('approved');
  });
  it('SLA aşımı: demo listelemede yükseltir ve hedefe bildirim yazar', async () => {
    const late = new DemoRepo({ accountId: 'owner', now: () => '2026-10-17T12:00:00Z' });  // a6 owner adımı due 15 Ekim 12:00 + 24 sa
    await late.listApprovals();
    const s = (await late.list('approval_steps')).find((x) => x.approval_id === 'a6' && x.step_index === 1)!;
    expect(s.escalated_to).toEqual(['role:owner']); expect(s.escalated_at).toBe('2026-10-17T12:00:00Z');
    expect((await late.list('notifications')).some((n) => n.employee_id === 'BY' && n.title.startsWith('SLA aşıldı'))).toBe(true);
  });
});
