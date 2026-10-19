'use client';
import { useEffect, useMemo, useState } from 'react';
import type { Project, Task, TeamMember } from '@jscore/contracts';
import { useSession } from '../session';
import { useData } from '../ui';
import { TaskWorkArea } from './TaskWorkArea';

/** Benim İşlerim → "Görevlerim": aynı liste/ayrıntı bileşenleri, yalnızca bana atanan açık görevler. */
export function MyTasks({ allTasks, employeeId, team, projects, today }: { allTasks: Task[]; employeeId: string; team: TeamMember[]; projects: Project[]; today: string }) {
  const { repo } = useSession();
  const [tasks, setTasks] = useState<Task[]>(allTasks);
  useEffect(() => setTasks(allTasks), [allTasks]);
  const mine = useMemo(() => tasks.filter((t) => t.assignee_id === employeeId && t.state !== 'archive'), [tasks, employeeId]);
  const types = useData(async (r) => r.listTaskTypes().catch(() => []));
  if (!repo) return null;
  return (
    <section className="wk-app orbit-work" data-js-theme="orbit" aria-label="Görevlerim">
      <div className="wk-pad" style={{ paddingBottom: 0 }}><h2 style={{ fontSize: 16, fontWeight: 700 }}>Görevlerim</h2><p className="wk-muted">Bana atanan açık görevler · satıra tıklayınca ayrıntı açılır</p></div>
      <TaskWorkArea tasks={mine} setTasks={setTasks} team={team} projects={projects} taskTypes={types.data ?? []} view="list" showProject today={today} allowCreate={false} hideMineFilter emptyText="Sana atanmış açık görev yok" />
    </section>
  );
}
