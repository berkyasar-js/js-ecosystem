import {
  applyDecision, buildSteps, canDecideApproval, canDecideStep, chainView, defaultStep, requiredRoleFor, resolvePolicy, stepDueAt, stepRecipients,
  type Approval, type ApprovalAction, type ApprovalCreate, type ApprovalPolicy, type ApprovalStep, type Brand, type Delegation, type Me, type NotificationKind, type PolicySubject, type TeamMember,
} from '@jscore/contracts';
import { executeAgentAction, isAgentApproval } from '../agents/execute';
import { notify } from '../notify';
import { ForbiddenError, NotFoundError, type Repo } from '../repo/types';

/**
 * Onay zinciri motoru (0018). Repo'dan bağımsız parçalar `@jscore/contracts/governance`'ta (saf); burada veri erişimi Repo koleksiyonları üzerinden yapılır:
 * approval_policies (eşleşen politika) → approval_steps (adımlar) → notifications (sıradaki onaylayıcılar / talep eden).
 * Demo ve Supabase aynı akışı kullanır; approvals satırının kendisi (insert/patch) repo'ya özgü `io` ile yazılır.
 */
export interface ApprovalIO {
  repo: Repo; now(): string;
  insertApproval(row: ApprovalCreate & { policy_id: string | null; current_step: number | null; requested_by: string | null }): Promise<Approval>;
  patchApproval(id: string, patch: Partial<Pick<Approval, 'status' | 'decided_by' | 'decided_at' | 'decision_note' | 'current_step' | 'due_at' | 'subject'>>): Promise<Approval>;
  getApproval(id: string): Promise<Approval | null>;
  /** Onaylanan task_stage yan etkisi: onay kapısını atlayarak aşamayı değiştirir. */
  moveTaskApproved(taskId: string, state: Approval['subject']['to_state'] & string): Promise<unknown>;
}
const safe = async <T,>(p: Promise<T[]>): Promise<T[]> => p.catch(() => [] as T[]);
const NOTIFY_HREF = '/app/approvals';

/** Onay bildirimleri tek kapıdan (core/notify): org kuralı + 24 sa tekilleştirme; eylemi yapan hariç. */
export async function notifyEmployees(repo: Repo, ids: Iterable<string>, n: { kind: NotificationKind; title: string; body: string; href?: string; dedupe_key?: string }, except?: string | null) {
  await notify(repo, { kind: n.kind, employee_ids: [...new Set(ids)].filter(Boolean), except: except ?? null, title: n.title, body: n.body, href: n.href ?? NOTIFY_HREF, dedupe_key: n.dedupe_key }).catch(() => undefined);
}

/** Politika konusu: subject + marka durumu (brand_id → brands). */
export async function policySubjectOf(repo: Repo, subject: ApprovalCreate['subject'] | undefined, extra: Partial<PolicySubject> = {}): Promise<PolicySubject> {
  let brand: Pick<Brand, 'id' | 'status'> | null = null;
  const brandId = subject?.brand_id ?? extra.brand_id;
  if (brandId) brand = (await safe(repo.listBrands())).find((b) => b.id === brandId) ?? null;
  return { amount_minor: subject?.amount_minor, brand_id: brandId, task_type: subject?.task_type, labels: subject?.labels, to_state: subject?.to_state, brand, ...extra };
}
/** Bu eylem için eşleşen politika (yoksa null → tek adımlı varsayılan). */
export async function matchPolicy(repo: Repo, action: ApprovalAction, subject: PolicySubject): Promise<ApprovalPolicy | null> {
  return resolvePolicy(await safe(repo.list('approval_policies')), action, subject);
}

/** Onay oluşturur: politika → adımlar → ilk adım başlar → sıradakilere bildirim. Politika yoksa `required_role` ile tek adım. */
export async function createApprovalWithChain(io: ApprovalIO, input: ApprovalCreate, me: Me): Promise<Approval> {
  const now = io.now();
  const [team, subj] = await Promise.all([io.repo.team(), policySubjectOf(io.repo, input.subject)]);
  const policy = await matchPolicy(io.repo, input.action_type, subj);
  const built = policy ? buildSteps(policy.steps, { requesterEmployeeId: me.employee_id ?? null, team }) : defaultStep(input.required_role);
  const required = policy ? requiredRoleFor(built[0], team) : input.required_role;
  const firstDue = stepDueAt(now, built[0].sla_hours);
  const approval = await io.insertApproval({ ...input, required_role: required, due_at: policy ? firstDue : input.due_at, policy_id: policy?.id ?? null, current_step: 0, requested_by: me.employee_id ?? null });
  const rows: ApprovalStep[] = [];
  for (const b of built) {
    const row = await io.repo.save('approval_steps', {
      approval_id: approval.id, step_index: b.step_index, approver_role: b.approver_role, approvers: b.approvers, mode: b.mode, status: 'pending', decisions: [],
      decided_by: null, decided_at: null, note: null, started_at: b.step_index === 0 ? now : null, due_at: b.step_index === 0 ? firstDue : null, escalated_at: null, escalated_to: [],
    });
    rows.push(row);
  }
  await notifyEmployees(io.repo, stepRecipients(rows[0], team), { kind: 'approval_requested', title: `Onay sırası sende: ${approval.title}`, body: `${policy ? `${policy.name} · adım 1/${rows.length}` : 'Onay bekliyor'}`, dedupe_key: `approval:${approval.id}:step:0` }, me.employee_id);
  return approval;
}

export interface DecideResult { approval: Approval; outcome: 'waiting' | 'advanced' | 'approved' | 'rejected' }
/**
 * Karar: adımlı onaylarda sıradaki adımda yetki (rol / kişi / yükseltme / delegasyon) aranır; 'all' modunda herkes onaylayınca ilerler.
 * Son adım onaylanınca yan etki (ajan planı, teslim, talep→görev, duyuru, delegasyon) çalışır; ret talep edene bildirilir.
 * Adımsız (eski) onaylarda canDecideApproval kuralı aynen geçerlidir.
 */
export async function decideWithChain(io: ApprovalIO, id: string, decision: 'approved' | 'rejected', note: string | undefined, me: Me, opts: { /** Yetki matrisi `approvals.decide` (sapma + delegasyon). Kişi olarak açıkça adımda adı geçenler (yönetici, seçili kişi, yükseltme) matristen bağımsız karar verir. */ matrixAllows?: boolean } = {}): Promise<DecideResult> {
  const cur = await io.getApproval(id);
  if (!cur) throw new NotFoundError('Onay');
  if (cur.status !== 'pending') throw new ForbiddenError('Bu onay zaten karara bağlanmış');
  const now = io.now();
  const steps = (await safe(io.repo.list('approval_steps'))).filter((s) => s.approval_id === id);
  const [team, delegations] = await Promise.all([io.repo.team(), safe(io.repo.list('delegations')) as Promise<Delegation[]>]);
  const matrix = opts.matrixAllows ?? true;
  if (!steps.length) {
    if (!matrix) throw new ForbiddenError('Onay kararı yetkin yok (yetki matrisi)');
    if (!canDecideApproval(me.role, cur.required_role)) throw new ForbiddenError(`Bu onay ${cur.required_role} rolü içindir`);
    const row = await io.patchApproval(id, { status: decision, decided_by: me.id, decided_at: now, decision_note: note ?? null });
    const done = await finishApproval(io, row, decision, me, team);
    return { approval: done, outcome: decision };
  }
  const view = chainView(steps, now);
  if (!view.current) throw new ForbiddenError('Bu onayın bekleyen adımı yok');
  if (!canDecideStep({ role: me.role, employee_id: me.employee_id }, view.current, { team, delegations, now })) throw new ForbiddenError('Bu adımda karar yetkin yok (sıra başka bir onaylayıcıda)');
  const named = !!me.employee_id && (view.current.approvers.includes(me.employee_id) || view.current.escalated_to.includes(me.employee_id));
  if (!matrix && !named) throw new ForbiddenError('Onay kararı yetkin yok (yetki matrisi)');
  const by = me.employee_id ?? me.id;
  const r = applyDecision(steps, view.current.step_index, by, decision, now, note);
  // Önce onay satırı (RLS: adım bekliyorken karar yetkisi geçerli), sonra diğer adımlar, en son karar verilen adım.
  let approval = cur;
  if (r.outcome === 'advanced') {
    const next = r.steps.find((s) => s.step_index === r.nextIndex)!;
    const nextDue = stepDueAt(now, policySla(await safe(io.repo.list('approval_policies')), cur.policy_id, next.step_index));
    next.due_at = nextDue;
    approval = await io.patchApproval(id, { current_step: next.step_index, due_at: nextDue });
  } else if (r.outcome === 'approved' || r.outcome === 'rejected') {
    approval = await io.patchApproval(id, { status: r.outcome, decided_by: me.id, decided_at: now, decision_note: note ?? null, current_step: null });
  }
  const changed = r.steps.filter((s) => JSON.stringify(s) !== JSON.stringify(steps.find((x) => x.id === s.id)));
  const curId = view.current.id;
  for (const s of [...changed.filter((s) => s.id !== curId), ...changed.filter((s) => s.id === curId)]) {
    const { id: sid, org_id: _o, created_at: _c, approval_id: _a, ...rest } = s; void _o; void _c; void _a;
    await io.repo.save('approval_steps', { id: sid, ...rest });
  }
  if (r.outcome === 'advanced') {
    const next = r.steps.find((s) => s.step_index === r.nextIndex)!;
    await notifyEmployees(io.repo, stepRecipients(next, team), { kind: 'approval_requested', title: `Onay sırası sende: ${approval.title}`, body: `Adım ${next.step_index + 1}/${r.steps.length}`, dedupe_key: `approval:${approval.id}:step:${next.step_index}` }, me.employee_id);
    return { approval, outcome: 'advanced' };
  }
  if (r.outcome === 'waiting') return { approval, outcome: 'waiting' };
  const done = await finishApproval(io, approval, r.outcome, me, team);
  return { approval: done, outcome: r.outcome };
}
const policySla = (policies: ApprovalPolicy[], policyId: string | null | undefined, index: number) => policies.find((p) => p.id === policyId)?.steps[index]?.sla_hours ?? 48;

/** Nihai sonuç: talep edene bildirim + onaylandıysa eylem türüne göre yan etki (sonuç subject.effect / subject.executed'a yazılır). */
async function finishApproval(io: ApprovalIO, a: Approval, decision: 'approved' | 'rejected', me: Me, team: TeamMember[]): Promise<Approval> {
  const requester = team.find((t) => t.id === a.requested_by)?.id ?? null;
  if (decision === 'rejected') {
    if (requester) await notifyEmployees(io.repo, [requester], { kind: 'approval_decided', title: `Reddedildi: ${a.title}`, body: a.decision_note ? `Not: ${a.decision_note}` : `${me.name} reddetti`, href: sourceHref(a), dedupe_key: `approval:${a.id}:decided` }, me.employee_id);
    return a;
  }
  let out = a;
  try {
    const now = io.now();
    if (isAgentApproval(a)) {
      const r = await executeAgentAction(io.repo, a.subject.payload, { today: now.slice(0, 10) });
      out = await io.patchApproval(a.id, { subject: { ...a.subject, executed: { at: now, task_ids: r.task_ids } } });
      await io.repo.audit('agent.execute', `approvals/${a.id}`, { agent: a.subject.agent, tasks: r.task_ids.length, project: r.project_id });
    } else if (a.action_type === 'task_stage' && a.subject.task_id && a.subject.to_state) {
      await io.moveTaskApproved(a.subject.task_id, a.subject.to_state);
      out = await io.patchApproval(a.id, { subject: { ...a.subject, effect: { at: now, task_id: a.subject.task_id } } });
    } else if (a.action_type === 'request_convert' && a.subject.task_input) {
      const t = await io.repo.createTask(a.subject.task_input as never);
      const extra = a.subject.task_input as { description?: string; labels?: string[] };
      if (extra.description || extra.labels) await io.repo.updateTask(t.id, { description: extra.description, labels: extra.labels }).catch(() => undefined);
      for (const rid of a.subject.request_ids ?? []) await io.repo.save('requests', { id: rid, status: 'converted', task_id: t.id, project_id: t.project_id }).catch(() => undefined);
      out = await io.patchApproval(a.id, { subject: { ...a.subject, effect: { at: now, task_id: t.id } } });
    } else if (a.action_type === 'announcement_post' && a.subject.announcement) {
      const an = await io.repo.save('announcements', a.subject.announcement as never);
      out = await io.patchApproval(a.id, { subject: { ...a.subject, effect: { at: now, announcement_id: an.id } } });
    } else if (a.action_type === 'access' && a.subject.delegation_id) {
      await io.repo.save('delegations', { id: a.subject.delegation_id, status: 'active' });
      out = await io.patchApproval(a.id, { subject: { ...a.subject, effect: { at: now, delegation_id: a.subject.delegation_id } } });
    }
  } catch (e) {
    // Yan etki başarısızsa onay kararı korunur; hata notu düşülür (kullanıcı tekrar deneyebilir).
    out = await io.patchApproval(a.id, { decision_note: `${a.decision_note ? `${a.decision_note} · ` : ''}Yan etki hatası: ${e instanceof Error ? e.message : 'bilinmiyor'}` }).catch(() => a);
  }
  if (requester) await notifyEmployees(io.repo, [requester], { kind: 'approval_decided', title: `Onaylandı: ${a.title}`, body: `${me.name} onayladı`, href: sourceHref(a), dedupe_key: `approval:${a.id}:decided` }, me.employee_id);
  return out;
}
export const sourceHref = (a: Pick<Approval, 'subject'>) => (a.subject.task_id && a.subject.project_id ? `/app/projects/${a.subject.project_id}?task=${a.subject.task_id}` : a.subject.request_ids?.length ? '/app/requests' : a.subject.announcement ? '/app/announcements' : NOTIFY_HREF);

/** "Benim sıram": bekleyen ve mevcut adımında karar verebildiğim onaylar. Adımsız onaylarda canDecideApproval. */
export function myTurn(me: Pick<Me, 'role' | 'employee_id'>, approvals: Approval[], steps: ApprovalStep[], o: { team: TeamMember[]; delegations?: Delegation[]; now: string }): Set<string> {
  const out = new Set<string>();
  for (const a of approvals) {
    if (a.status !== 'pending') continue;
    const mine = steps.filter((s) => s.approval_id === a.id);
    if (!mine.length) { if (canDecideApproval(me.role, a.required_role)) out.add(a.id); continue; }
    const cur = chainView(mine, o.now).current;
    if (cur && canDecideStep(me, cur, { team: o.team, delegations: o.delegations, now: o.now })) out.add(a.id);
  }
  return out;
}
