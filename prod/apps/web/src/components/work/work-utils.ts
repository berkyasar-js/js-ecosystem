import { TASK_STATES, applyViewQuery, type SavedViewQuery, type Task, type TaskState, type TeamMember } from '@jscore/contracts';

export type WorkView = 'list' | 'board' | 'summary' | 'files' | 'activity' | 'members';
export const DONE_STATES: readonly TaskState[] = ['delivery', 'archive'];
export const isDone = (t: Pick<Task, 'state'>) => DONE_STATES.includes(t.state);
export const PRIORITY_LABEL = { high: 'Yüksek', normal: 'Normal', low: 'Düşük' } as const;
export const STAGE_COUNT = TASK_STATES.length;
/** 'YYYY-MM-DD' ya da null (tarihsiz görev, örn. Trello içe aktarımı). */
export const dueDay = (t: { due_at: string | null }): string | null => (t.due_at ? t.due_at.slice(0, 10) : null);
export const isOverdue = (t: { due_at: string | null }, today: string): boolean => { const d = dueDay(t); return !!d && d < today; };
/** Teslim tarihine göre sıralama; tarihsizler sona. */
export const byDue = (a: { due_at: string | null }, b: { due_at: string | null }): number => {
  const x = dueDay(a), y = dueDay(b);
  return x === y ? 0 : x === null ? 1 : y === null ? -1 : x < y ? -1 : 1;
};
export const isLate = (t: Task, today: string) => !isDone(t) && isOverdue(t, today);

export function progressOf(tasks: Task[]) {
  const done = tasks.filter(isDone).length;
  return { total: tasks.length, done, pct: tasks.length ? Math.round((done / tasks.length) * 100) : 0 };
}

/** Liste filtreleri = kayıtlı görünüm sorgusu (0017): mine/high/q + aşama, sorumlu, sıralama, gruplama. */
export type WorkFilters = SavedViewQuery & { mine: boolean; high: boolean; q: string };
export const EMPTY_FILTERS: WorkFilters = { mine: false, high: false, q: '' };
export const applyFilters = (tasks: Task[], f: WorkFilters, employeeId?: string): Task[] => applyViewQuery(tasks, f, employeeId);
export const isFiltered = (f: WorkFilters) => !!(f.mine || f.high || f.q.trim() || f.states?.length || f.assignee || f.project || (f.sort && f.sort !== 'due') || (f.group && f.group !== 'none'));

/** Bugünün odağı: açık görevler arasında gecikmiş → yüksek öncelik → en yakın tarih. */
export function focusTask(tasks: Task[], today: string): Task | undefined {
  const open = tasks.filter((t) => !isDone(t));
  const rank = (t: Task) => (isLate(t, today) ? 0 : 2) + (t.priority === 'high' ? 0 : 1);
  return [...open].sort((a, b) => rank(a) - rank(b) || byDue(a, b))[0];
}

export const memberName = (team: TeamMember[], id: string | null) => (id ? team.find((m) => m.id === id)?.name ?? id : 'Atanmamış');
export const isTrello = (t: Task) => !!t.source_ref?.startsWith('trello:');
