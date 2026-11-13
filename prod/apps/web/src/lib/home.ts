import { TASK_STATES, canDecideApproval, type Approval, type Role, type Task, type TaskState, type TeamMember } from '@jscore/contracts';
import { byDue, isDone, isOverdue } from '@/components/work/work-utils';

/** Yönetici görünümü (Ekip nabzı, Kurul & ajanlar) kimlere açık. */
export const MANAGER_ROLES: Role[] = ['owner', 'org_admin', 'operations', 'account', 'pm'];
export const isManager = (r: Role) => MANAGER_ROLES.includes(r);

const addDays = (day: string, n: number) => new Date(new Date(`${day}T00:00:00Z`).getTime() + n * 86400000).toISOString().slice(0, 10);

/** "Bugünün planı": kişinin açık görevleri → geciken / bugün / bu hafta / sonrası, aşamaya göre sayım. */
export interface PlanBuckets { overdue: Task[]; today: Task[]; week: Task[]; later: Task[]; byStage: Array<{ stage: TaskState; count: number }>; total: number }
export function planBuckets(tasks: Task[], employeeId: string | undefined, today: string): PlanBuckets {
  const mine = tasks.filter((t) => !isDone(t) && (!employeeId || t.assignee_id === employeeId)).sort(byDue);
  const weekEnd = addDays(today, 7);
  const b: PlanBuckets = { overdue: [], today: [], week: [], later: [], byStage: [], total: mine.length };
  for (const t of mine) {
    const d = t.due_at?.slice(0, 10) ?? null;
    if (d && d < today) b.overdue.push(t); else if (d === today) b.today.push(t); else if (d && d <= weekEnd) b.week.push(t); else b.later.push(t);
  }
  b.byStage = TASK_STATES.filter((s) => s !== 'archive').map((stage) => ({ stage, count: mine.filter((t) => t.state === stage).length })).filter((x) => x.count > 0);
  return b;
}

/** "Devam eden & sırada": üretim/iç revize/onay'dakiler devam eden; brief/kapsam/plan'dakiler sırada (kişiye ya da herkese). */
export function inProgressAndNext(tasks: Task[], employeeId: string | undefined, limit = 5) {
  const mine = tasks.filter((t) => !isDone(t) && (!employeeId || t.assignee_id === employeeId)).sort(byDue);
  const running = new Set<TaskState>(['production', 'internal_review', 'approval']);
  return { inProgress: mine.filter((t) => running.has(t.state)).slice(0, limit), next: mine.filter((t) => !running.has(t.state)).slice(0, limit) };
}

/** "Senden bekleyenler": karar verebileceğim onaylar + engellenmiş (waiting etiketli ya da gecikmiş yüksek öncelikli) görevler. */
export function needsYou(role: Role, approvals: Approval[], tasks: Task[], employeeId: string | undefined, today: string) {
  const decide = approvals.filter((a) => a.status === 'pending' && canDecideApproval(role, a.required_role)).sort((a, b) => a.due_at.localeCompare(b.due_at));
  const blocked = tasks.filter((t) => !isDone(t) && (!employeeId || t.assignee_id === employeeId) && (t.labels.includes('waiting') || (t.priority === 'high' && isOverdue(t, today)))).sort(byDue);
  return { decide, blocked };
}

/** "Ekip nabzı": kişi başına açık / geciken görev ve haftalık saat yükü (planned_minutes toplamı / weekly_hours). */
export interface PulseRow { member: TeamMember; open: number; overdue: number; loadPct: number }
export function teamPulse(tasks: Task[], team: TeamMember[], today: string): PulseRow[] {
  return team.filter((m) => m.status === 'active').map((member) => {
    const mine = tasks.filter((t) => t.assignee_id === member.id && !isDone(t));
    const minutes = mine.reduce((a, t) => a + (t.planned_minutes || 0), 0);
    const loadPct = member.weekly_hours > 0 ? Math.round((minutes / 60 / member.weekly_hours) * 100) : 0;
    return { member, open: mine.length, overdue: mine.filter((t) => isOverdue(t, today)).length, loadPct };
  }).filter((r) => r.open > 0).sort((a, b) => b.overdue - a.overdue || b.loadPct - a.loadPct);
}
export const greeting = (hour: number) => (hour < 6 ? 'İyi geceler' : hour < 12 ? 'Günaydın' : hour < 18 ? 'İyi günler' : 'İyi akşamlar');
