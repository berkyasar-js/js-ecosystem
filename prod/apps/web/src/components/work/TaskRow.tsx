'use client';
import { Check } from 'lucide-react';
import { TASK_STATE_LABELS, type Task, type TaskBadges } from '@jscore/contracts';
import { Avatar } from '../avatar';
import { fmtDate } from '../ui';
import { TaskBadgeList } from './task-badges';
import { PRIORITY_LABEL, isDone, isLate, isTrello } from './work-utils';

/** Kontrollü görev satırı. Görev adı gerçek düğmedir; tamamlama ayrı kontroldür (iç içe etkileşim yok). */
export function TaskRow({ task, assignee, category, today, selected = false, pending = false, readonly = false, onOpen, onComplete, extra, badges }: {
  task: Task; badges?: TaskBadges; assignee: string; category: string; today: string; selected?: boolean; pending?: boolean; readonly?: boolean;
  onOpen: () => void; onComplete: () => void; extra?: React.ReactNode;
}) {
  const done = isDone(task);
  const late = isLate(task, today);
  return (
    <tr aria-selected={selected} aria-busy={pending} onClick={(e) => { if (!(e.target as HTMLElement).closest('button')) onOpen(); }}>
      <td>
        <button type="button" className={`wk-complete ${done ? 'done' : ''}`} aria-label={done ? `${task.title} tamamlandı` : `${task.title} görevini tamamla`} aria-pressed={done} disabled={pending || done || readonly} onClick={onComplete}>
          <Check aria-hidden strokeWidth={3} />
        </button>
      </td>
      <th scope="row" style={{ fontWeight: 'inherit', padding: '12px 10px' }} data-cover={task.cover?.color ?? undefined} className={task.cover?.color ? 'wk-x-rowcover' : undefined}>
        <button type="button" className="wk-task-title" data-task-open={task.id} onClick={onOpen}>{task.title}</button>
        <span className="wk-category">
          {category}
          {isTrello(task) && <span className="wk-chip" data-tone="info">Trello</span>}
          {task.client_visible && <span className="wk-chip">Müşteriye açık</span>}
        </span>
        <TaskBadgeList task={task} badges={badges} />
      </th>
      <td><span className="wk-person">{task.assignee_id ? <Avatar id={task.assignee_id} name={assignee} size="sm" /> : null}<span>{assignee}</span></span></td>
      <td><span className={`wk-date ${late ? 'late' : ''}`}>{fmtDate(task.due_at)}{late && <span className="wk-sr"> (gecikmiş)</span>}</span></td>
      <td><span className="wk-chip">{TASK_STATE_LABELS[task.state]}</span></td>
      <td><span className={`wk-priority ${task.priority === 'high' ? 'urgent' : ''}`}><i aria-hidden="true" />{PRIORITY_LABEL[task.priority]}</span></td>
      {extra !== undefined && <td>{extra}</td>}
    </tr>
  );
}
