import { agentActionPayloadSchema, type AgentActionPayload, type Approval } from '@jscore/contracts';
import type { Repo } from '../repo/types';

export interface ExecuteResult { project_id: string; task_ids: string[]; milestones: number; members: number }

/**
 * Onaylanan ajan yazma önerisini (action_type='agent', subject.payload) uygular: proje (gerekirse) → kilometre taşları → görevler → proje üyeleri.
 * Her yazma onaylayanın Repo'su (JWT/RLS) ile yapılır; böylece "kim onayladı" = "kim yazdı". İdempotent değil: subject.executed doluysa çağıran tekrar etmemeli.
 */
export async function executeAgentAction(repo: Repo, payloadIn: AgentActionPayload | undefined, opts: { today: string }): Promise<ExecuteResult> {
  const p = agentActionPayloadSchema.parse(payloadIn);
  let projectId = p.project_id ?? null;
  if (!projectId && p.new_project) projectId = (await repo.createProject({ brand_id: p.new_project.brand_id, name: p.new_project.name, type: 'kurul', due_at: null, summary: 'Kurul planı' })).id;
  if (!projectId) throw new Error('Ajan önerisinde proje yok');
  const msIds = new Map<string, string>();
  for (const m of p.milestones ?? []) {
    const row = await repo.save('milestones', { project_id: projectId, name: m.name, due_at: m.due_at, status: 'planned' });
    msIds.set(m.name, row.id);
  }
  const task_ids: string[] = [];
  for (const t of p.tasks) {
    const row = await repo.createTask({ project_id: projectId, title: t.title, assignee_id: t.assignee_id, priority: t.priority, planned_minutes: t.planned_minutes, due_at: t.due_at ?? opts.today, task_type: 'general', qty: 1, source_ref: 'agent:board_plan', state: 'brief' });
    const patch: Record<string, unknown> = {};
    if (t.description) patch.description = t.description;
    if (t.labels.length) patch.labels = t.labels;
    if (t.milestone && msIds.has(t.milestone)) patch.milestone_id = msIds.get(t.milestone);
    if (Object.keys(patch).length) await repo.updateTask(row.id, patch).catch(() => undefined);
    task_ids.push(row.id);
  }
  let members = 0;
  const want = new Set([...(p.members ?? []), ...p.tasks.map((t) => t.assignee_id).filter((x): x is string => !!x)]);
  if (want.size) {
    const have = new Set((await repo.list('project_members').catch(() => [])).filter((m) => m.project_id === projectId).map((m) => m.employee_id));
    for (const id of want) if (!have.has(id)) { await repo.save('project_members', { project_id: projectId, employee_id: id, role: 'collaborator' }).catch(() => undefined); members++; }
  }
  return { project_id: projectId, task_ids, milestones: msIds.size, members };
}

export const isAgentApproval = (a: Pick<Approval, 'action_type' | 'subject'>) => a.action_type === 'agent' && !!a.subject.payload && !a.subject.executed;
