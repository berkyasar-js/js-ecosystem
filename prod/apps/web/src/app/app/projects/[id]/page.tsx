'use client';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useState } from 'react';
import { TASK_STATE_LABELS, isClientRole } from '@jscore/contracts';
import { TaskBids } from '@/components/modules/bids';
import { useSession } from '@/components/session';
import { Async, Empty, PageHeader, PRIORITY, fmtDate, money, useData } from '@/components/ui';

export default function ProjectDetail() {
  const { id } = useParams<{ id: string }>();
  const { me } = useSession();
  const [bidOpen, setBidOpen] = useState<string | null>(null);
  const q = useData(async (r) => {
    const project = await r.getProject(id);
    if (!project) return null;
    const [tasks, team, brands] = await Promise.all([r.listTasks({ project_id: id }), r.team(), r.listBrands()]);
    return { project, tasks, team, brand: brands.find((b) => b.id === project.brand_id) };
  }, [id]);
  return (
    <Async q={q}>{(d) => !d ? <Empty>Proje bulunamadı veya erişimin yok. <Link className="font-semibold text-brand-ink" href="/app/projects">Projelere dön</Link></Empty> : (
      <>
        <PageHeader title={d.project.name} sub={`${d.brand?.name ?? ''} · ${d.project.type} · Teslim ${fmtDate(d.project.due_at)} · ${money(d.project.budget_minor)}`} actions={<Link className="btn" href="/app/projects">← Projeler</Link>} />
        <p className="mb-5 max-w-3xl text-sm text-muted">{d.project.summary}</p>
        <section className="card mb-5" aria-label="Akış zaman çizelgesi">
          <h2 className="mb-4 font-bold">Akış zaman çizelgesi</h2>
          <ol className="grid gap-3 sm:grid-cols-7">
            {d.project.stage_plan.map((s) => {
              const current = s.stage === d.project.flow_stage;
              return (
                <li key={s.stage} className={`nested ${current ? 'ring-2 ring-accent' : ''}`} aria-current={current ? 'step' : undefined}>
                  <div className={`text-xs font-bold ${s.done ? 'text-[#3ddc97]' : current ? 'text-accent' : 'text-muted'}`}>{s.done ? '✓ ' : ''}{TASK_STATE_LABELS[s.stage]}</div>
                  <div className="mt-1 text-xs text-muted">{fmtDate(s.due_at)} · {d.team.find((t) => t.id === s.owner)?.name.split(' ')[0] ?? s.owner}</div>
                </li>
              );
            })}
          </ol>
        </section>
        <section className="card">
          <h2 className="mb-3 font-bold">Görevler ({d.tasks.length})</h2>
          {d.tasks.length === 0 ? <Empty>Bu projede görev yok.</Empty> : (
            <ul className="grid gap-2">
              {d.tasks.map((t) => (
                <li key={t.id} className="nested">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="font-medium">{t.title}{t.assignee_id && <span className="ml-2 text-xs text-muted">· {d.team.find((m) => m.id === t.assignee_id)?.name ?? t.assignee_id}</span>}</span>
                    <span className="flex flex-wrap items-center gap-2"><span className="chip">{TASK_STATE_LABELS[t.state]}</span><span className={`chip ${PRIORITY[t.priority][1]}`}>{PRIORITY[t.priority][0]}</span><span className="chip">{fmtDate(t.due_at)}</span>
                      {me && !isClientRole(me.role) && <button className="btn btn-sm" aria-expanded={bidOpen === t.id} onClick={() => setBidOpen(bidOpen === t.id ? null : t.id)}>İhale</button>}</span>
                  </div>
                  {bidOpen === t.id && <TaskBids task={t} />}
                </li>
              ))}
            </ul>
          )}
        </section>
      </>
    )}</Async>
  );
}
