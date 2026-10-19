'use client';
import { useEffect, useMemo, useState } from 'react';
import type { Task } from '@jscore/contracts';
import { ErrorBox, todayFor, useData } from '@/components/ui';
import { useSession } from '@/components/session';
import { TaskWorkArea } from '@/components/work/TaskWorkArea';
import { WorkViewSwitcher } from '@/components/work/WorkViewSwitcher';
import { isDone, type WorkView } from '@/components/work/work-utils';

/** Tüm görevler: ORBIT liste + 8 aşamalı pano + ayrıntı paneli (proje sayfasıyla aynı bileşenler). */
export default function Tasks() {
  const { me, mode, repo } = useSession();
  const q = useData(async (r) => ({ tasks: await r.listTasks(), projects: await r.listProjects(), team: await r.team(), taskTypes: await r.listTaskTypes().catch(() => []) }));
  const [tasks, setTasks] = useState<Task[]>([]);
  const [view, setView] = useState<WorkView>('board');
  const [project, setProject] = useState('');
  useEffect(() => { if (q.data) setTasks(q.data.tasks); }, [q.data]);
  const shown = useMemo(() => (project ? tasks.filter((t) => t.project_id === project) : tasks), [tasks, project]);
  const today = todayFor(mode);

  if (q.error) return <ErrorBox message={q.error} />;
  if (q.loading || !q.data || !repo || !me) return <div className="wk-app orbit-work"><div className="wk-loading" aria-busy="true" role="status"><span className="wk-sr">Yükleniyor</span><div /><div /><div /></div></div>;
  const { projects, team, taskTypes } = q.data;
  return (
    <div className="wk-app orbit-work" data-js-theme="orbit">
      <header className="wk-project-header">
        <div className="wk-project-heading">
          <div>
            <h1>Görevler</h1>
            <p className="wk-sub">{shown.length} görev · 8 aşama · {shown.filter(isDone).length} tamamlandı</p>
          </div>
          <div className="wk-head-actions">
            <label className="wk-sr" htmlFor="wk-proj">Proje filtresi</label>
            <select id="wk-proj" className="wk-field" style={{ width: 'auto', maxWidth: 260 }} value={project} onChange={(e) => setProject(e.target.value)}>
              <option value="">Tüm projeler</option>
              {projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </div>
        </div>
      </header>
      <WorkViewSwitcher value={view} onChange={setView} views={['list', 'board']} />
      <TaskWorkArea tasks={shown} setTasks={setTasks} team={team} projects={projects} taskTypes={taskTypes} view={view === 'list' ? 'list' : 'board'} projectId={project || undefined} showProject today={today} emptyText="Henüz görev yok" />
    </div>
  );
}
