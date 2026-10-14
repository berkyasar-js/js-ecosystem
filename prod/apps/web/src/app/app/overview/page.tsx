'use client';
import Link from 'next/link';
import { isClientRole } from '@jscore/contracts';
import { Async, PageHeader, Stat, fmtDate, money, todayFor, useData } from '@/components/ui';
import { useSession } from '@/components/session';

export default function Overview() {
  const { me, mode } = useSession();
  const q = useData(async (r) => {
    const [projects, tasks, approvals, brands] = await Promise.all([r.listProjects(), r.listTasks(), r.listApprovals(), r.listBrands()]);
    return { projects, tasks, approvals, brands };
  });
  const today = todayFor(mode);
  return (
    <>
      <PageHeader title={`Merhaba, ${me?.name.split(' ')[0] ?? ''}`} sub={`${fmtDate(today)} · ${me?.title ?? ''}`} />
      <Async q={q}>{({ projects, tasks, approvals, brands }) => {
        const open = tasks.filter((t) => t.state !== 'archive');
        const overdue = open.filter((t) => t.due_at.slice(0, 10) < today);
        const pending = approvals.filter((a) => a.status === 'pending');
        const mine = open.filter((t) => t.assignee_id && t.assignee_id === me?.employee_id);
        const focus = (mine.length ? mine : open.filter((t) => t.priority === 'high')).sort((a, b) => a.due_at.localeCompare(b.due_at)).slice(0, 5);
        const scope = pending.filter((a) => a.action_type === 'scope');
        const risky = brands.filter((b) => b.status === 'risky');
        return (
          <div className="grid gap-5">
            <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
              <Stat label="Aktif proje" value={projects.filter((p) => p.status === 'active').length} hint={`${money(projects.reduce((s, p) => s + p.budget_minor, 0))} toplam bütçe`} />
              <Stat label="Açık görev" value={open.length} />
              <Stat label="Geciken" value={overdue.length} tone={overdue.length ? 'bad' : 'ok'} hint="Teslim tarihi geçmiş" />
              <Stat label="Bekleyen onay" value={pending.length} tone={pending.length ? 'warn' : 'ok'} />
            </div>
            <div className="grid gap-5 lg:grid-cols-[1.4fr_1fr]">
              <section className="card">
                <h2 className="mb-3 font-bold">Bugünün odağı</h2>
                {focus.length === 0 ? <p className="text-sm text-muted">Açık görev yok.</p> : (
                  <ul className="grid gap-2">
                    {focus.map((t) => (
                      <li key={t.id} className="nested flex items-center justify-between gap-3">
                        <span className="truncate">{t.title}</span>
                        <span className={`chip ${t.due_at.slice(0, 10) < today ? 'chip-bad' : ''}`}>{fmtDate(t.due_at)}</span>
                      </li>
                    ))}
                  </ul>
                )}
                <Link href="/app/tasks" className="mt-3 inline-block text-sm font-semibold text-brand-ink">Tüm görevler →</Link>
              </section>
              <section className="card">
                <h2 className="mb-3 font-bold">AI önerisi</h2>
                {isClientRole(me?.role ?? 'client_viewer') ? (
                  <p className="text-sm text-muted">Onayınızı bekleyen {pending.length} kalem var. Portal üzerinden karar verebilirsiniz.</p>
                ) : (
                  <ul className="grid gap-2 text-sm">
                    {scope.length > 0 && <li className="nested">{scope.length} kapsam dışı talep sözleşme kotasını aşıyor; ek teklif için <Link className="font-semibold text-brand-ink" href="/app/approvals">Onay Merkezi</Link>.</li>}
                    {risky.length > 0 && <li className="nested">Riskli marka: {risky.map((b) => `${b.name} (${b.health})`).join(', ')}.</li>}
                    {overdue.length > 0 && <li className="nested">{overdue.length} görev gecikmiş; <Link className="font-semibold text-brand-ink" href="/app/flow">akış</Link> ekranından darboğaza bak.</li>}
                    {!scope.length && !risky.length && !overdue.length && <li className="text-muted">Bugün için kritik öneri yok.</li>}
                  </ul>
                )}
              </section>
            </div>
          </div>
        );
      }}</Async>
    </>
  );
}
