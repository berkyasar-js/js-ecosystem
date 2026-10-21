import { fail, json } from '@/lib/api';
import { DEMO_TODAY } from '@/lib/agents/demo';
import { getRepo } from '@/lib/repo';
import { isOverdue } from '@/components/work/work-utils';

/** Haftalık kurul veri paketi (CHAIR girdisi). Maaş/özlük/kişisel veri içermez; yalnızca toplulaştırılmış sayılar. */
export async function GET() {
  try {
    const repo = await getRepo();
    const me = await repo.me();
    if (!me) return json({ error: 'Oturum yok' }, 401);
    if (!['owner', 'org_admin', 'auditor'].includes(me.role)) return json({ error: 'Yetki yok' }, 403);
    const [projects, tasks, approvals, brands, decisions] = await Promise.all([repo.listProjects(), repo.listTasks(), repo.listApprovals(), repo.listBrands(), repo.listBoardDecisions()]);
    const today = repo.mode === 'demo' ? DEMO_TODAY : new Date().toISOString().slice(0, 10);
    const open = tasks.filter((t) => t.state !== 'archive');
    return json({
      generated_at: new Date().toISOString(), org_id: me.org_id,
      projects: { total: projects.length, active: projects.filter((p) => p.status === 'active').length, budget_minor: projects.reduce((s, p) => s + p.budget_minor, 0) },
      tasks: { open: open.length, overdue: open.filter((t) => isOverdue(t, today)).length, by_state: tasks.reduce<Record<string, number>>((m, t) => ({ ...m, [t.state]: (m[t.state] ?? 0) + 1 }), {}) },
      approvals: { pending: approvals.filter((a) => a.status === 'pending').length, pending_amount_minor: approvals.filter((a) => a.status === 'pending').reduce((s, a) => s + (a.subject.amount_minor ?? 0), 0) },
      brands: { risky: brands.filter((b) => b.status === 'risky').map((b) => ({ id: b.id, name: b.name, health: b.health })), avg_health: Math.round(brands.reduce((s, b) => s + b.health, 0) / Math.max(1, brands.length)) },
      pending_decisions: decisions.filter((d) => d.status === 'pending').length,
    });
  } catch (e) { return fail(e); }
}
