import { describe, expect, it } from 'vitest';
import type { Task } from '@jscore/contracts';
import { taskPatchSchema } from '@jscore/contracts';
import { byDue, dueDay, focusTask, isLate, isOverdue } from '../../components/work/work-utils';
import { fmtDate } from '../../components/ui';
import { usedThisMonth } from '../quota';

const mk = (id: string, due_at: string | null, extra: Partial<Task> = {}): Task => ({
  id, org_id: 'o', project_id: 'p', title: id, assignee_id: null, state: 'brief', priority: 'normal', due_at, planned_minutes: 0,
  task_type: 'general', qty: 1, source_ref: null, labels: [], client_visible: false, created_at: '2026-10-01T00:00:00Z', ...extra,
});
const today = '2026-10-22';

describe('null due_at', () => {
  const tasks = [mk('a', null), mk('b', '2026-10-25'), mk('c', '2026-10-01T10:00:00Z'), mk('d', null, { priority: 'high' })];
  it('dueDay / isOverdue / isLate', () => {
    expect(dueDay(tasks[0])).toBeNull();
    expect(dueDay(tasks[2])).toBe('2026-10-01');
    expect(isOverdue(tasks[0], today)).toBe(false);
    expect(tasks.filter((t) => isOverdue(t, today)).map((t) => t.id)).toEqual(['c']);
    expect(isLate(tasks[0], today)).toBe(false);
  });
  it('byDue sorts null last (overview focus sort)', () => {
    expect([...tasks].sort(byDue).map((t) => t.id)).toEqual(['c', 'b', 'a', 'd']);
  });
  it('focusTask does not throw', () => {
    expect(focusTask(tasks, today)?.id).toBe('c');
    expect(focusTask([mk('x', null)], today)?.id).toBe('x');
  });
  it('fmtDate returns dash for null', () => {
    expect(fmtDate(null)).toBe('—');
    expect(fmtDate('2026-10-05')).toBe('5 Eki');
  });
  it('quota and patch schema tolerate null', () => {
    expect(usedThisMonth([mk('a', null)], { p: 'b' }, 'b', new Date('2026-10-10'))).toEqual({ general: 1 });
    expect(taskPatchSchema.parse({ due_at: null }).due_at).toBeNull();
  });
});
