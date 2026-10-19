'use client';
import { DndContext, KeyboardSensor, PointerSensor, useDraggable, useDroppable, useSensor, useSensors, type DragEndEvent } from '@dnd-kit/core';
import { GripVertical } from 'lucide-react';
import { TASK_STATES, TASK_STATE_LABELS, type Task, type TaskState } from '@jscore/contracts';
import { Avatar } from '../avatar';
import { fmtDate } from '../ui';
import { PRIORITY_LABEL, isLate } from './work-utils';

function Card({ t, who, today, selected, pending, readonly, onOpen }: { t: Task; who: string; today: string; selected: boolean; pending: boolean; readonly: boolean; onOpen: () => void }) {
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, isDragging } = useDraggable({ id: t.id, disabled: readonly || pending });
  const late = isLate(t, today);
  return (
    <div ref={setNodeRef} {...listeners} className="wk-card" data-selected={selected} data-dragging={isDragging} aria-busy={pending}
      style={{ ...(transform ? { transform: `translate3d(${transform.x}px,${transform.y}px,0)` } : {}), cursor: readonly ? 'default' : 'grab' }}>
      <div className="wk-card-top">
        <button type="button" className="wk-card-title" data-task-open={t.id} onClick={onOpen}>{t.title}</button>
        {!readonly && <button type="button" ref={setActivatorNodeRef} {...attributes} className="wk-grip" aria-label={`${t.title} kartını taşı (Boşluk ile tut, oklarla taşı)`}><GripVertical size={15} aria-hidden /></button>}
      </div>
      <div className="wk-card-bottom">
        {t.assignee_id ? <Avatar id={t.assignee_id} name={who} size="xs" /> : null}
        <span className="wk-muted" style={{ fontSize: 12 }}>{who.split(' ')[0]}</span>
        <span className={`wk-date ${late ? 'late' : ''}`} style={{ fontSize: 12 }}>{fmtDate(t.due_at)}{late && <span className="wk-sr"> (gecikmiş)</span>}</span>
        <span className={`wk-priority ${t.priority === 'high' ? 'urgent' : ''}`} style={{ marginLeft: 'auto' }}><i aria-hidden="true" />{PRIORITY_LABEL[t.priority]}</span>
      </div>
    </div>
  );
}

function Column({ state, count, children }: { state: TaskState; count: number; children: React.ReactNode }) {
  const { setNodeRef, isOver } = useDroppable({ id: state });
  return (
    <section ref={setNodeRef} className="wk-column" data-over={isOver} aria-label={`${TASK_STATE_LABELS[state]}, ${count} görev`}>
      <h3><i aria-hidden="true" />{TASK_STATE_LABELS[state]}<span>{count}</span></h3>
      <div className="wk-card-list">{children}</div>
    </section>
  );
}

/** Sekiz aşamalı pano (dnd-kit). Klavye eşdeğeri: kart tutamacı (Boşluk + oklar) ve ayrıntı panelindeki Aşama seçimi. */
export function TaskBoard({ tasks, nameOf, today, selectedId, pendingIds, readonly, onOpen, onMove }: {
  tasks: Task[]; nameOf: (id: string | null) => string; today: string; selectedId: string | null; pendingIds: ReadonlySet<string>; readonly: boolean;
  onOpen: (t: Task) => void; onMove: (t: Task, to: TaskState) => void;
}) {
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }), useSensor(KeyboardSensor));
  const onDragEnd = (e: DragEndEvent) => {
    const to = e.over?.id as TaskState | undefined;
    const t = tasks.find((x) => x.id === e.active.id);
    if (!to || !t || t.state === to || readonly) return;
    onMove(t, to);
  };
  return (
    <>
      <p className="wk-board-hint">{readonly ? 'Bu rolle pano salt okunurdur.' : 'Kartı sürükleyerek aşama değiştir. Klavyede: tutamaca odaklan, Boşluk ile tut, oklarla taşı. Alternatif: görev ayrıntısındaki Aşama seçimi.'}</p>
      <DndContext sensors={sensors} onDragEnd={onDragEnd}>
        <div className="wk-board">
          {TASK_STATES.map((s) => {
            const col = tasks.filter((t) => t.state === s);
            return (
              <Column key={s} state={s} count={col.length}>
                {col.map((t) => <Card key={t.id} t={t} who={nameOf(t.assignee_id)} today={today} selected={selectedId === t.id} pending={pendingIds.has(t.id)} readonly={readonly} onOpen={() => onOpen(t)} />)}
              </Column>
            );
          })}
        </div>
      </DndContext>
    </>
  );
}
