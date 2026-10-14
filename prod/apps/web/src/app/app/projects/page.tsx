'use client';
import Link from 'next/link';
import { TASK_STATE_LABELS } from '@jscore/contracts';
import { Async, Empty, PageHeader, fmtDate, money, useData } from '@/components/ui';

export default function Projects() {
  const q = useData(async (r) => ({ projects: await r.listProjects(), brands: await r.listBrands() }));
  return (
    <>
      <PageHeader title="Projeler" sub="Marka, akış aşaması, teslim ve bütçe" />
      <Async q={q}>{({ projects, brands }) => projects.length === 0 ? <Empty>Görünür proje yok.</Empty> : (
        <div className="card overflow-x-auto p-2">
          <table className="table">
            <thead><tr><th>Proje</th><th>Marka</th><th>Aşama</th><th>İlerleme</th><th>Teslim</th><th>Bütçe</th></tr></thead>
            <tbody>
              {projects.map((p) => {
                const done = p.stage_plan.filter((s) => s.done).length;
                return (
                  <tr key={p.id}>
                    <td><Link href={`/app/projects/${p.id}`} className="font-semibold hover:underline">{p.name}</Link></td>
                    <td className="text-muted">{brands.find((b) => b.id === p.brand_id)?.name}</td>
                    <td><span className="chip chip-brand">{TASK_STATE_LABELS[p.flow_stage]}</span></td>
                    <td className="min-w-28"><div className="h-2 rounded-full bg-nested"><div className="h-2 rounded-full bg-accent" style={{ width: `${(done / Math.max(1, p.stage_plan.length)) * 100}%` }} /></div></td>
                    <td>{fmtDate(p.due_at)}</td>
                    <td>{money(p.budget_minor)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}</Async>
    </>
  );
}
