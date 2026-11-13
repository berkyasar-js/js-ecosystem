'use client';
import Link from 'next/link';
import { TASK_STATE_LABELS, buildDashboards, isClientRole, nextSetupStep, setupProgress, showSetupCard, type AgentRun, type BoardDecision, type ChartId, type Notification } from '@jscore/contracts';
import { AnnouncementBanner } from '@/components/announcements';
import { DashChart } from '@/components/dash-chart';
import { ArrowRight, CheckCircle2, Landmark, Settings2, Sparkles } from 'lucide-react';
import { Avatar } from '@/components/avatar';
import { Async, PageHeader, Stat, fmtDate, todayFor, useData } from '@/components/ui';
import { useSession } from '@/components/session';
import { Bar, toneOf } from '@/components/mod';
import { byDue, isDone, isOverdue } from '@/components/work/work-utils';
import { greeting, inProgressAndNext, isManager, needsYou, planBuckets, teamPulse } from '@/lib/home';
import { buildInbox } from '@/lib/inbox';

const ADMIN_URL = process.env.NEXT_PUBLIC_ADMIN_URL ?? '';

export default function Home() {
  const { me, mode, features, prefs } = useSession();
  const q = useData(async (r) => {
    const safe = <T,>(p: Promise<T[]>) => p.catch(() => [] as T[]);
    const [projects, tasks, approvals, brands, team, notifications, board, runs] = await Promise.all([
      safe(r.listProjects()), safe(r.listTasks()), safe(r.listApprovals()), safe(r.listBrands()), safe(r.team()), safe(r.list('notifications')), safe(r.listBoardDecisions()), safe(r.listAgentRuns()),
    ]);
    return { projects, tasks, approvals, brands, team, notifications: notifications as Notification[], board: board as BoardDecision[], runs: runs as AgentRun[] };
  });
  const today = todayFor(mode);
  const hour = mode === 'demo' ? 10 : new Date().getHours();
  if (!me) return null;
  const client = isClientRole(me.role);
  const manager = isManager(me.role);
  const setup = features.setup;
  const prog = setupProgress(setup);
  return (
    <>
      <PageHeader eyebrow={`${fmtDate(today)} · ${features.orgName ?? 'JS Ecosystem'}`} title={`${greeting(hour)}, ${me.name.split(' ')[0]}`} sub={me.title || undefined} />
      <Async q={q}>{({ projects, tasks, approvals, brands, team, notifications, board, runs }) => {
        const pinnedCharts = client ? [] : buildDashboards({ tasks, team, brands, approvals, runs, today }).filter((c) => prefs.pinned_charts.includes(c.id as ChartId));
        const plan = planBuckets(tasks, me.employee_id, today);
        const pn = inProgressAndNext(tasks, me.employee_id);
        const ny = needsYou(me.role, approvals, tasks, me.employee_id, today);
        const mentions = buildInbox({ me, tasks, approvals, notifications, today, done: prefs.inbox_done }).filter((x) => x.kind === 'mention').slice(0, 3);
        const pulse = manager ? teamPulse(tasks, team, today) : [];
        const open = tasks.filter((t) => !isDone(t));
        const overdueAll = open.filter((t) => isOverdue(t, today));
        const pending = approvals.filter((a) => a.status === 'pending');
        const nameOf = (id: string | null) => (id ? team.find((m) => m.id === id)?.name ?? '—' : 'Atanmamış');
        const projName = (id: string) => projects.find((p) => p.id === id)?.name ?? '';
        const Row = ({ t }: { t: typeof tasks[number] }) => (
          <Link href={`/app/projects/${t.project_id}?task=${t.id}`} className="home-row">
            <span className="min-w-0 flex-1 truncate"><span className="font-semibold">{t.title}</span><span className="ml-2 text-xs text-muted">{projName(t.project_id)}</span></span>
            <span className="hidden text-xs text-muted sm:inline">{TASK_STATE_LABELS[t.state]}</span>
            <span className={`chip ${isOverdue(t, today) ? 'chip-bad' : t.due_at?.slice(0, 10) === today ? 'chip-warn' : ''}`}>{fmtDate(t.due_at)}</span>
          </Link>
        );
        const focus = plan.overdue[0] ?? plan.today[0] ?? plan.week[0] ?? open.sort(byDue)[0];
        return (
          <div className="home-grid">
            {showSetupCard(me.role, setup) && (
              <section className="card flex flex-wrap items-center justify-between gap-4" aria-label="Kurulum">
                <div className="flex items-center gap-3"><span className="signal-icon"><Settings2 size={17} aria-hidden /></span>
                  <div><h2 className="font-bold">Çalışma alanı kurulumu %{prog.pct}</h2><p className="text-sm text-muted">{prog.done}/{prog.total} adım tamamlandı · sıradaki: {nextSetupStep(setup) === 'summary' ? 'Özet' : nextSetupStep(setup)}</p></div></div>
                <div className="flex items-center gap-3"><div className="w-40"><Bar pct={prog.pct} tone="ok" /></div><Link href="/app/setup" className="btn btn-primary">Devam et <ArrowRight size={15} aria-hidden /></Link></div>
              </section>
            )}

            {!client && <AnnouncementBanner />}

            <section className="focus-card home-col-8" aria-label="Bugünün planı">
              <img className="orbit-art" src="/brand/orbit-studio.svg" alt="" aria-hidden="true" />
              <div className="focus-content">
                <div className="eyebrow">BUGÜNÜN PLANI</div>
                <h2>{focus ? focus.title : 'Bugün sakin bir gün.'}</h2>
                <p>{client ? `${pending.length} kalem kararınızı bekliyor.` : plan.total ? `${plan.overdue.length} gecikmiş, ${plan.today.length} bugün, ${plan.week.length} bu hafta · toplam ${plan.total} açık görev.` : 'Sana atanmış açık görev yok.'}</p>
                {plan.byStage.length > 0 && <div className="twin-note"><Sparkles size={15} aria-hidden /><span>{plan.byStage.map((s) => `${TASK_STATE_LABELS[s.stage]} ${s.count}`).join(' · ')}</span></div>}
                <div><Link href={client ? '/app/portal' : '/app/mywork'} className="btn">{client ? 'Portala git' : 'Görevlerime git'} <ArrowRight size={15} aria-hidden /></Link></div>
              </div>
            </section>

            <section className="card home-col-4" aria-label="Senden bekleyenler">
              <h2 className="mb-3 font-bold">Senden bekleyenler</h2>
              <div className="home-list">
                {ny.decide.slice(0, 4).map((a) => <Link key={a.id} href="/app/approvals" className="home-row"><span className="min-w-0 flex-1 truncate font-semibold">{a.title}</span><span className="chip chip-warn">Karar · {fmtDate(a.due_at)}</span></Link>)}
                {mentions.map((m) => <Link key={m.id} href={m.href} className="home-row"><span className="min-w-0 flex-1 truncate">@ {m.title}</span><span className="chip">Anma</span></Link>)}
                {ny.blocked.slice(0, 3).map((t) => <Link key={t.id} href={`/app/projects/${t.project_id}?task=${t.id}`} className="home-row"><span className="min-w-0 flex-1 truncate">{t.title}</span><span className="chip chip-bad">Engelli</span></Link>)}
                {!ny.decide.length && !mentions.length && !ny.blocked.length && <p className="flex items-center gap-2 text-sm text-muted"><CheckCircle2 size={16} aria-hidden /> Seni bekleyen bir şey yok.</p>}
              </div>
              <Link href="/app/inbox" className="text-button mt-3">Gelen kutusu <ArrowRight size={14} aria-hidden /></Link>
            </section>

            <div className="grid grid-cols-2 gap-4 lg:grid-cols-4" style={{ gridColumn: 'span 12' }}>
              <Stat label="Aktif proje" value={projects.filter((p) => p.status === 'active').length} href="/app/projects" />
              <Stat label="Açık görev" value={open.length} href="/app/tasks" />
              <Stat label="Geciken" value={overdueAll.length} tone={overdueAll.length ? 'bad' : 'ok'} hint="Teslim tarihi geçmiş" href="/app/tasks" />
              <Stat label="Bekleyen onay" value={pending.length} tone={pending.length ? 'warn' : 'ok'} href="/app/approvals" />
            </div>

            {!client && (
              <section className="card home-col-6" aria-label="Devam eden ve sırada">
                <h2 className="mb-3 font-bold">Devam eden & sırada</h2>
                <div className="eyebrow mb-2">Devam eden</div>
                <div className="home-list">{pn.inProgress.length ? pn.inProgress.map((t) => <Row key={t.id} t={t} />) : <p className="text-sm text-muted">Üretimde görev yok.</p>}</div>
                <div className="eyebrow mb-2 mt-4">Sırada</div>
                <div className="home-list">{pn.next.length ? pn.next.map((t) => <Row key={t.id} t={t} />) : <p className="text-sm text-muted">Sırada görev yok.</p>}</div>
              </section>
            )}

            {manager && (
              <section className="card home-col-6" aria-label="Ekip nabzı">
                <h2 className="mb-3 font-bold">Ekip nabzı</h2>
                {pulse.length === 0 ? <p className="text-sm text-muted">Atanmış açık görev yok.</p> : (
                  <ul className="home-list">
                    {pulse.slice(0, 8).map((r) => (
                      <li key={r.member.id} className="home-row">
                        <Avatar id={r.member.id} name={r.member.name} size="sm" />
                        <span className="min-w-0 flex-1 truncate"><span className="font-semibold">{r.member.name}</span><span className="ml-2 text-xs text-muted">{r.open} açık</span></span>
                        <div className="w-24"><Bar pct={r.loadPct} tone={toneOf(r.loadPct)} /></div>
                        <span className={`chip ${r.overdue ? 'chip-bad' : 'chip-ok'}`}>{r.overdue ? `${r.overdue} gecikmiş` : 'Yolunda'}</span>
                      </li>
                    ))}
                  </ul>
                )}
                <Link href="/app/resources" className="text-button mt-3">Kaynak planı <ArrowRight size={14} aria-hidden /></Link>
              </section>
            )}

            {me.role === 'owner' && (
              <section className="card home-col-6" aria-label="Kurul ve ajanlar">
                <h2 className="mb-3 flex items-center gap-2 font-bold"><Landmark size={16} aria-hidden /> Kurul & ajanlar</h2>
                {board.length === 0 ? <p className="text-sm text-muted">Henüz kurul kararı yok.</p> : (
                  <ul className="home-list">{board.slice(0, 4).map((d) => <li key={d.id} className="home-row"><span className="min-w-0 flex-1 truncate"><span className="font-semibold">{d.action}</span><span className="ml-2 text-xs text-muted">{d.proposed_by.toUpperCase()}</span></span><span className={`chip ${d.status === 'approved' ? 'chip-ok' : d.status === 'rejected' ? 'chip-bad' : 'chip-warn'}`}>{d.founder_answer ?? d.status}</span></li>)}</ul>
                )}
                {ADMIN_URL ? <a className="text-button mt-3" href={`${ADMIN_URL}/admin/board`} target="_blank" rel="noreferrer">Yönetim Kurulu (panel) <ArrowRight size={14} aria-hidden /></a> : <p className="mt-3 text-xs text-muted">Kurul yalnızca Ana Yönetim Paneli’nde (NEXT_PUBLIC_ADMIN_URL tanımlı değil).</p>}
              </section>
            )}

            {pinnedCharts.length > 0 && (
              <section className="home-col-12" aria-label="Panolarım" style={{ gridColumn: 'span 12' }}>
                <div className="mb-2 flex items-center justify-between"><h2 className="font-bold">Panolarım</h2><Link href="/app/dashboards" className="text-button">Tüm panolar <ArrowRight size={14} aria-hidden /></Link></div>
                <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">{pinnedCharts.map((c) => <DashChart key={c.id} chart={c} compact />)}</div>
              </section>
            )}

            {!client && brands.some((b) => b.status === 'risky') && (
              <section className="card home-col-6" aria-label="Riskli markalar">
                <h2 className="mb-3 font-bold">Riskli markalar</h2>
                <ul className="home-list">{brands.filter((b) => b.status === 'risky').slice(0, 4).map((b) => <li key={b.id}><Link href={`/app/crm/${b.id}`} className="home-row"><span className="font-semibold">{b.name}</span><span className="chip chip-bad">Sağlık {b.health}</span></Link></li>)}</ul>
              </section>
            )}
            {client && (
              <section className="card home-col-6" aria-label="Projeleriniz">
                <h2 className="mb-3 font-bold">Projeleriniz</h2>
                <ul className="home-list">{projects.slice(0, 6).map((p) => <li key={p.id}><Link href={`/app/projects/${p.id}`} className="home-row"><span className="font-semibold">{p.name}</span><span className="chip">{TASK_STATE_LABELS[p.flow_stage]}</span></Link></li>)}</ul>
                <p className="mt-3 text-xs text-muted">Sorumlu: {nameOf(projects[0]?.flow_owner ?? null)}</p>
              </section>
            )}
          </div>
        );
      }}</Async>
    </>
  );
}
