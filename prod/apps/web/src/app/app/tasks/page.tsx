'use client';
import { useEffect, useState } from 'react';
import { DndContext, PointerSensor, useDraggable, useDroppable, useSensor, useSensors, type DragEndEvent } from '@dnd-kit/core';
import { TASK_STATES, TASK_STATE_LABELS, isClientRole, type Task, type TaskState } from '@jscore/contracts';
import { Async, PageHeader, PRIORITY, fmtDate, todayFor, useData } from '@/components/ui';
import { useSession } from '@/components/session';

function Card({ t, who, late }: { t: Task; who: string; late: boolean }) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({ id: t.id });
  return (
    <div ref={setNodeRef} {...listeners} {...attributes} className={`nested cursor-grab touch-none ${isDragging ? 'z-10 opacity-80 shadow-xl' : ''}`}
      style={transform ? { transform: `translate3d(${transform.x}px,${transform.y}px,0)` } : undefined}>
      <div className="text-[13px] font-semibold leading-snug">{t.title}</div>
      <div className="mt-2 flex flex-wrap items-center gap-1.5">
        <span className={`chip ${PRIORITY[t.priority][1]}`}>{PRIORITY[t.priority][0]}</span>
        <span className={`chip ${late ? 'chip-bad' : ''}`}>{fmtDate(t.due_at)}</span>
        {t.qty > 1 && <span className="chip">×{t.qty}</span>}
        <span className="ml-auto text-[11px] text-muted">{who}</span>
      </div>
    </div>
  );
}
function Column({ state, children, count }: { state: TaskState; children: React.ReactNode; count: number }) {
  const { setNodeRef, isOver } = useDroppable({ id: state });
  return (
    <section ref={setNodeRef} aria-label={TASK_STATE_LABELS[state]} className={`w-64 shrink-0 rounded-card border p-3 ${isOver ? 'border-accent' : 'border-line'} bg-card`}>
      <h2 className="mb-3 flex items-center justify-between text-xs font-bold uppercase tracking-wide text-muted">{TASK_STATE_LABELS[state]}<span className="chip">{count}</span></h2>
      <div className="grid min-h-16 gap-2">{children}</div>
    </section>
  );
}

export default function Tasks() {
  const { me, mode, repo, bump } = useSession();
  const q = useData(async (r) => ({ tasks: await r.listTasks(), projects: await r.listProjects(), team: await r.team() }));
  const [tasks, setTasks] = useState<Task[]>([]);
  const [project, setProject] = useState('');
  const [title, setTitle] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));
  useEffect(() => { if (q.data) setTasks(q.data.tasks); }, [q.data]);
  const readonly = !me || isClientRole(me.role) || me.role === 'auditor';
  const today = todayFor(mode);

  const onDragEnd = async (e: DragEndEvent) => {
    const to = e.over?.id as TaskState | undefined;
    const t = tasks.find((x) => x.id === e.active.id);
    if (!to || !t || t.state === to || readonly || !repo) return;
    const prev = tasks;
    setTasks((ts) => ts.map((x) => (x.id === t.id ? { ...x, state: to } : x)));
    try { await repo.moveTask(t.id, to); setErr(null); } catch (ex) { setTasks(prev); setErr(ex instanceof Error ? ex.message : 'Taşınamadı'); }
  };
  const add = async (e: React.FormEvent) => {
    e.preventDefault();
    const pid = project || q.data?.projects[0]?.id;
    if (!repo || !pid || title.trim().length < 2) return;
    try { await repo.createTask({ project_id: pid, title, due_at: today }); setTitle(''); setErr(null); bump(); } catch (ex) { setErr(ex instanceof Error ? ex.message : 'Oluşturulamadı'); }
  };

  return (
    <>
      <PageHeader title="Görevler" sub="8 kolonlu akış — kartı sürükleyerek aşama değiştir" />
      <Async q={q}>{({ projects, team }) => (
        <>
          {!readonly && (
            <form onSubmit={add} className="mb-4 flex flex-wrap gap-2">
              <input className="input max-w-sm" placeholder="Yeni görev başlığı" aria-label="Yeni görev başlığı" value={title} onChange={(e) => setTitle(e.target.value)} />
              <select className="input w-auto" aria-label="Proje" value={project} onChange={(e) => setProject(e.target.value)}>
                {projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
              <button className="btn btn-primary">Ekle</button>
            </form>
          )}
          {err && <p role="alert" className="mb-3 text-sm text-magenta">{err}</p>}
          <DndContext sensors={sensors} onDragEnd={onDragEnd}>
            <div className="flex gap-3 overflow-x-auto pb-4">
              {TASK_STATES.map((s) => {
                const col = tasks.filter((t) => t.state === s);
                return (
                  <Column key={s} state={s} count={col.length}>
                    {col.map((t) => <Card key={t.id} t={t} who={team.find((m) => m.id === t.assignee_id)?.name.split(' ')[0] ?? '—'} late={s !== 'archive' && t.due_at.slice(0, 10) < today} />)}
                  </Column>
                );
              })}
            </div>
          </DndContext>
        </>
      )}</Async>
    </>
  );
}
