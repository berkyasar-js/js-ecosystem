'use client';
import Link from 'next/link';
import { isClientRole } from '@jscore/contracts';
import { ArrowRight, Sparkles, Users } from 'lucide-react';
import { Avatar } from '@/components/avatar';
import { Async, PageHeader, Stat, fmtDate, money, todayFor, useData } from '@/components/ui';
import { useSession } from '@/components/session';

export default function Overview() {
  const { me, mode } = useSession();
  const q = useData(async (r) => {
    const [projects, tasks, approvals, brands, team] = await Promise.all([r.listProjects(), r.listTasks(), r.listApprovals(), r.listBrands(), r.team()]);
    return { projects, tasks, approvals, brands, team };
  });
  const today = todayFor(mode);
  return (
    <>
      <PageHeader eyebrow={`${fmtDate(today)} · ANKARA`} title={`Merhaba, ${me?.name.split(' ')[0] ?? ''}`} sub={me?.title ?? ''} />
      <Async q={q}>{({ projects, tasks, approvals, brands, team }) => {
        const open = tasks.filter((t) => t.state !== 'archive');
        const overdue = open.filter((t) => t.due_at.slice(0, 10) < today);
        const pending = approvals.filter((a) => a.status === 'pending');
        const mine = open.filter((t) => t.assignee_id && t.assignee_id === me?.employee_id);
        const focus = (mine.length ? mine : open.filter((t) => t.priority === 'high')).sort((a, b) => a.due_at.localeCompare(b.due_at)).slice(0, 5);
        const scope = pending.filter((a) => a.action_type === 'scope');
        const risky = brands.filter((b) => b.status === 'risky');
        const client = isClientRole(me?.role ?? 'client_viewer');
        const top = focus[0];
        const people = team.filter((t) => t.status === 'active');
        const hours = people.reduce((a, t) => a + t.weekly_hours, 0);
        return (
          <div className="grid gap-5">
            <section className="overview-hero">
              <div className="focus-card">
                <img className="orbit-art" src="/brand/orbit-studio.svg" alt="" aria-hidden="true" />
                <div className="focus-content">
                  <div className="eyebrow">BUGÜNÜN ODAĞI{top ? ' / ' + fmtDate(top.due_at).toUpperCase() : ''}</div>
                  <h2>{top ? top.title : 'Bugün sakin bir gün.'}</h2>
                  <p>{top ? `${open.length} açık görev, ${overdue.length} gecikme ve ${pending.length} bekleyen onay var. Sıradaki teslim ${fmtDate(top.due_at)}.` : 'Açık görev yok; yeni bir proje başlatmak için iyi bir an.'}</p>
                  <div className="twin-note"><Sparkles size={15} aria-hidden /><span>İkiz tahmini: teslim güveni %82 · darboğaz: copy</span></div>
                  <div><Link href="/app/projects" className="btn">Proje alanına git <ArrowRight size={15} aria-hidden /></Link></div>
                </div>
              </div>
              <div className="signal-card">
                <div className="signal-header"><span className="signal-icon"><Sparkles size={17} aria-hidden /></span><span className="badge ai">AI önerisi</span></div>
                <div>
                  <h3>{client ? 'Onayınız bekleniyor.' : scope.length ? 'Kapsam dışı talep var.' : overdue.length ? 'Plan biraz daha net olabilir.' : 'Plan yolunda.'}</h3>
                  <p>{client ? `${pending.length} kalem karar bekliyor.` : scope.length ? `${scope.length} talep sözleşme kotasını aşıyor; ek teklif önerilir.` : overdue.length ? `${overdue.length} görev gecikmiş; akış ekranından darboğaza bak.` : 'Bugün için kritik öneri yok.'}</p>
                </div>
                <Link href={client ? '/app/approvals' : scope.length ? '/app/approvals' : '/app/flow'} className="text-button">Öneriyi incele <ArrowRight size={15} aria-hidden /></Link>
              </div>
            </section>
            <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
              <Stat label="Aktif proje" value={projects.filter((p) => p.status === 'active').length} hint={`${money(projects.reduce((s, p) => s + p.budget_minor, 0))} toplam bütçe`} />
              <Stat label="Açık görev" value={open.length} />
              <Stat label="Geciken" value={overdue.length} tone={overdue.length ? 'bad' : 'ok'} hint="Teslim tarihi geçmiş" />
              <Stat label="Bekleyen onay" value={pending.length} tone={pending.length ? 'warn' : 'ok'} href={me?.role === 'owner' ? '/app/board' : '/app/approvals'} hint={me?.role === 'owner' ? 'Yönetim Kurulu →' : 'Onay Merkezi →'} />
            </div>
            <div className="grid gap-5 lg:grid-cols-[1.4fr_1fr]">
              <section className="card">
                <h2 className="mb-3 font-bold">Öncelik listesi</h2>
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
            {!client && people.length > 0 && (
              <div className="lower-strip">
                <Users size={18} aria-hidden />
                <div><strong>Birlikte daha fazlası.</strong><span className="text-muted"> &nbsp; {people.length} kişi · ekip doluluğu %{Math.round((hours / (people.length * 40)) * 100)} · {projects.filter((p) => p.status === 'active').length} aktif proje</span></div>
                <div className="stack">{people.slice(0, 8).map((t) => <Avatar key={t.id} id={t.id} name={t.name} />)}</div>
              </div>
            )}
          </div>
        );
      }}</Async>
    </>
  );
}
