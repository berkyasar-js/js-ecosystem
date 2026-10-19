'use client';
import { useId } from 'react';
import { Check, X } from 'lucide-react';
import { TASK_STATES, TASK_STATE_LABELS, type AuditEvent, type Priority, type Task, type TaskPatch, type TaskState, type TeamMember } from '@jscore/contracts';
import { Avatar } from '../avatar';
import { fmtTime } from '../ui';
import { PRIORITY_LABEL, isDone, isTrello } from './work-utils';

/** Kontrollü ayrıntı paneli. Sunucu durumu üst bileşende kalır; pending / error görünür. */
export function TaskDetails({ task, team, context, typeLabel, activity, readonly = false, pending = false, error, onClose, onComplete, onStage, onPatch, headingRef }: {
  task: Task; team: TeamMember[]; context: string; typeLabel: string; activity: AuditEvent[] | null; readonly?: boolean; pending?: boolean; error?: string;
  onClose: () => void; onComplete: () => void; onStage: (s: TaskState) => void; onPatch: (p: TaskPatch) => void; headingRef?: React.Ref<HTMLHeadingElement>;
}) {
  const id = useId();
  const done = isDone(task);
  const disabled = pending || readonly;
  const assignee = team.find((m) => m.id === task.assignee_id);
  return (
    <aside className="wk-task-detail" aria-labelledby={`${id}-title`} aria-busy={pending}>
      <header className="wk-detail-toolbar">
        <button type="button" className="wk-detail-complete" disabled={disabled || done} aria-pressed={done} onClick={onComplete}><Check size={15} aria-hidden />{done ? 'Tamamlandı' : 'Tamamla'}</button>
        <button type="button" className="wk-ib" onClick={onClose} aria-label="Görev ayrıntısını kapat"><X size={18} aria-hidden /></button>
      </header>
      <div className="wk-detail-content">
        <span className="wk-eyebrow">{task.id.toUpperCase()} / {context}</span>
        <h2 id={`${id}-title`} tabIndex={-1} ref={headingRef}>{task.title}</h2>
        <div className="wk-detail-props">
          <div>
            <label htmlFor={`${id}-as`}>Sorumlu</label>
            <span style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
              {assignee && <Avatar id={assignee.id} name={assignee.name} size="sm" />}
              <select id={`${id}-as`} className="wk-field" value={task.assignee_id ?? ''} disabled={disabled} onChange={(e) => onPatch({ assignee_id: e.target.value || null })}>
                <option value="">Atanmamış</option>
                {team.filter((m) => m.status === 'active' || m.id === task.assignee_id).map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
              </select>
            </span>
          </div>
          <div>
            <label htmlFor={`${id}-due`}>Bitiş tarihi</label>
            <input id={`${id}-due`} type="date" className="wk-field" value={task.due_at.slice(0, 10)} disabled={disabled} onChange={(e) => { if (e.target.value) onPatch({ due_at: e.target.value }); }} />
          </div>
          <div>
            <label htmlFor={`${id}-st`}>Aşama</label>
            <select id={`${id}-st`} className="wk-field" value={task.state} disabled={disabled} onChange={(e) => onStage(e.target.value as TaskState)}>
              {TASK_STATES.map((s) => <option key={s} value={s}>{TASK_STATE_LABELS[s]}</option>)}
            </select>
          </div>
          <div>
            <label htmlFor={`${id}-pr`}>Öncelik</label>
            <select id={`${id}-pr`} className="wk-field" value={task.priority} disabled={disabled} onChange={(e) => onPatch({ priority: e.target.value as Priority })}>
              {(Object.keys(PRIORITY_LABEL) as Priority[]).map((p) => <option key={p} value={p}>{PRIORITY_LABEL[p]}</option>)}
            </select>
          </div>
        </div>
        {error && <p role="alert" className="wk-detail-note" data-tone="error">{error}</p>}
        {pending && <p role="status" className="wk-detail-note wk-muted">Değişiklik kaydediliyor…</p>}
        {readonly && <p className="wk-detail-note wk-muted">Bu rolle görevler salt okunurdur.</p>}
        <section className="wk-detail-section">
          <h3>Detaylar</h3>
          <ul className="wk-list">
            <li><span className="wk-muted">Tür</span><span>{typeLabel}</span></li>
            <li><span className="wk-muted">Planlanan süre</span><span>{task.planned_minutes ? `${Math.round((task.planned_minutes / 60) * 10) / 10} sa` : '—'}</span></li>
            {task.qty > 1 && <li><span className="wk-muted">Adet</span><span>×{task.qty}</span></li>}
            {task.labels.length > 0 && <li><span className="wk-muted">Etiketler</span><span style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>{task.labels.map((l) => <span key={l} className="wk-chip">{l}</span>)}</span></li>}
            {isTrello(task) && <li><span className="wk-muted">Kaynak</span><span className="wk-chip" data-tone="info">Trello</span></li>}
            <li><span className="wk-muted">Görünürlük</span><span>{task.client_visible ? 'Müşteriye açık' : 'Yalnızca ekip'}</span></li>
          </ul>
        </section>
        <section className="wk-detail-section" aria-label="Etkinlik">
          <h3>Etkinlik</h3>
          {activity === null ? <p>Etkinlik geçmişini görme yetkin yok.</p>
            : activity.length === 0 ? <p>Bu görev için henüz etkinlik kaydı yok.</p>
            : <ul className="wk-activity">{activity.slice(0, 8).map((a) => <li key={a.id}><strong>{a.actor_name}</strong> · {a.action}<small>{fmtTime(a.occurred_at)}</small></li>)}</ul>}
        </section>
      </div>
    </aside>
  );
}
