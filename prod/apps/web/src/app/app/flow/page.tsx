'use client';
import Link from 'next/link';
import { useState } from 'react';
import { TASK_STATES, TASK_STATE_LABELS, blockedMap } from '@jscore/contracts';
import { Async, PageHeader, fmtDate, todayFor, useData } from '@/components/ui';
import { useSession } from '@/components/session';
import { isOverdue } from '@/components/work/work-utils';

export default function Flow() {
  const { mode } = useSession();
  const q = useData(async (r) => ({ projects: await r.listProjects(), tasks: await r.listTasks(), team: await r.team(), links: await r.list('task_links').catch(() => []) }));
  const today = todayFor(mode);
  const [onlyBlocked, setOnlyBlocked] = useState(false);
  return (
    <>
      <PageHeader title="JS Flow" sub="Aşama planı, sahipler ve darboğazlar" />
      <Async q={q}>{({ projects, tasks: allTasks, team, links }) => {
        const blocked = blockedMap(allTasks, links);
        const tasks = onlyBlocked ? allTasks.filter((t) => blocked[t.id]) : allTasks;
        const max = Math.max(1, ...TASK_STATES.map((s) => tasks.filter((t) => t.state === s).length));
        const blockedIn = (pid: string) => allTasks.filter((t) => t.project_id === pid && blocked[t.id]).length;
        return (
          <div className="grid gap-5">
            <div className="flex flex-wrap items-center gap-2">
              <button className={`btn btn-sm ${onlyBlocked ? 'btn-primary' : ''}`} aria-pressed={onlyBlocked} onClick={() => setOnlyBlocked((v) => !v)}>🔒 Engelli {Object.keys(blocked).length > 0 && <span className="chip">{Object.keys(blocked).length}</span>}</button>
              <span className="text-xs text-muted">Engelli görev: teslim edilmemiş bir “engelliyor” bağı olan görev; üretime geçemez.</span>
            </div>
            <section className="card">
              <h2 className="mb-4 font-bold">Aşamalara göre görev yükü</h2>
              <div className="grid grid-cols-4 gap-3 sm:grid-cols-8">
                {TASK_STATES.map((s) => {
                  const n = tasks.filter((t) => t.state === s).length;
                  const late = tasks.filter((t) => t.state === s && s !== 'archive' && isOverdue(t, today)).length;
                  return (
                    <div key={s} className="text-center">
                      <div className="mx-auto flex h-24 w-8 items-end rounded-md bg-nested"><div className={`w-full rounded-md ${late ? 'bg-magenta' : 'bg-brand'}`} style={{ height: `${(n / max) * 100}%` }} /></div>
                      <div className="mt-2 text-[11px] font-semibold text-muted">{TASK_STATE_LABELS[s]}</div>
                      <div className="text-sm font-bold">{n}{late ? <span className="text-magenta"> ({late} gecik.)</span> : null}</div>
                    </div>
                  );
                })}
              </div>
            </section>
            <section className="card">
              <h2 className="mb-3 font-bold">Proje akışları</h2>
              <ul className="grid gap-3">
                {projects.filter((p) => !onlyBlocked || blockedIn(p.id) > 0).map((p) => (
                  <li key={p.id} className="nested">
                    <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                      <span className="flex items-center gap-2"><Link href={`/app/projects/${p.id}`} className="font-semibold hover:underline">{p.name}</Link>{blockedIn(p.id) > 0 && <span className="chip chip-warn">🔒 {blockedIn(p.id)} engelli</span>}</span>
                      <span className="text-xs text-muted">Sahip: {team.find((t) => t.id === p.flow_owner)?.name ?? p.flow_owner} · Teslim {fmtDate(p.due_at)}</span>
                    </div>
                    <div className="grid grid-cols-7 gap-1" role="img" aria-label={`Aşama: ${TASK_STATE_LABELS[p.flow_stage]}`}>
                      {p.stage_plan.map((s) => <div key={s.stage} title={`${TASK_STATE_LABELS[s.stage]} · ${fmtDate(s.due_at)}`} className={`h-2 rounded-full ${s.done ? 'bg-[#3ddc97]' : s.stage === p.flow_stage ? 'bg-accent' : 'bg-line'}`} />)}
                    </div>
                  </li>
                ))}
              </ul>
            </section>
          </div>
        );
      }}</Async>
    </>
  );
}
