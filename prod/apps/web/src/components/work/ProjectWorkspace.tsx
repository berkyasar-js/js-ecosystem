'use client';
import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { ArrowRight, FolderOpen, MessageSquare, Sparkles } from 'lucide-react';
import { TASK_STATES, TASK_STATE_LABELS, isClientRole, type MediaAsset, type Task } from '@jscore/contracts';
import { Avatar } from '../avatar';
import { useSession } from '../session';
import { ErrorBox, fmtDate, money, todayFor, useData, APPROVAL_STATUS } from '../ui';
import { TaskWorkArea } from './TaskWorkArea';
import { WorkViewSwitcher } from './WorkViewSwitcher';
import { STAGE_COUNT, focusTask, isLate, memberName, progressOf, type WorkView } from './work-utils';

const STATUS: Record<string, string> = { planning: 'Planlamada', active: 'Aktif', done: 'Tamamlandı', paused: 'Durduruldu' };

/** ORBIT proje ekranı: başlık + sekmeler + liste/pano/özet/dosyalar. Tüm veri repo'dan gelir (demo ve Supabase). */
export function ProjectWorkspace({ projectId, backHref = '/app/projects' }: { projectId: string; backHref?: string | null }) {
  const { me, mode, repo } = useSession();
  const [view, setView] = useState<WorkView>('list');
  const [tasks, setTasks] = useState<Task[]>([]);
  const [openReq, setOpenReq] = useState<{ id: string; n: number } | null>(null);
  const q = useData(async (r) => {
    const project = await r.getProject(projectId);
    if (!project) return null;
    const safe = <T,>(p: Promise<T[]>) => p.catch(() => [] as T[]);
    const [tasks, team, brands, taskTypes, approvals, assets] = await Promise.all([r.listTasks({ project_id: projectId }), r.team(), r.listBrands(), safe(r.listTaskTypes()), safe(r.listApprovals()), safe(r.list('media_assets'))]);
    return { project, tasks, team, brand: brands.find((b) => b.id === project.brand_id), taskTypes, approvals: approvals.filter((a) => a.subject.project_id === projectId), assets: (assets as MediaAsset[]).filter((a) => a.project_id === projectId) };
  }, [projectId]);
  useEffect(() => { if (q.data) setTasks(q.data.tasks); }, [q.data]);
  const today = todayFor(mode);
  const prog = useMemo(() => progressOf(tasks), [tasks]);

  if (q.loading || !repo) return <div className="wk-app orbit-work"><div className="wk-loading" aria-busy="true" role="status"><span className="wk-sr">Yükleniyor</span><div /><div /><div /></div></div>;
  if (q.error) return <ErrorBox message={q.error} />;
  if (!q.data) return <div className="wk-app orbit-work"><div className="wk-empty"><h2>Proje bulunamadı</h2><p>Proje silinmiş olabilir ya da erişimin yok.</p><Link className="wk-btn" href="/app/projects">Projelere dön</Link></div></div>;

  const { project, team, brand, taskTypes } = q.data;
  const owner = team.find((m) => m.id === project.flow_owner);
  const memberIds = [...new Set(tasks.map((t) => t.assignee_id).filter((x): x is string => !!x))];
  const focus = focusTask(tasks, today);
  const late = tasks.filter((t) => isLate(t, today)).length;
  const client = !!me && isClientRole(me.role);

  return (
    <div className="wk-app orbit-work" data-js-theme="orbit">
      <header className="wk-project-header">
        {backHref && <Link href={backHref} className="wk-eyebrow" style={{ display: 'inline-block', marginBottom: 12 }}>← Projeler</Link>}
        <div className="wk-project-heading">
          <div className="wk-title-block">
            <span className="wk-emblem" aria-hidden="true">{(brand?.name ?? project.name).slice(0, 1).toUpperCase()}</span>
            <div style={{ minWidth: 0 }}>
              <h1>{brand?.name ?? 'Marka'}<span aria-hidden="true">/</span><span className="wk-sr"> – </span>{project.name}</h1>
              {project.summary && <p className="wk-sub">{project.summary}</p>}
            </div>
          </div>
          <div className="wk-head-actions">
            {memberIds.length > 0 && (
              <div className="wk-members" role="img" aria-label={`Ekip: ${memberIds.map((id) => memberName(team, id)).join(', ')}`}>
                {memberIds.slice(0, 4).map((id) => <Avatar key={id} id={id} name={memberName(team, id)} size="sm" />)}
                {memberIds.length > 4 && <span className="wk-more">+{memberIds.length - 4}</span>}
              </div>
            )}
            <Link href="/app/messages" className="wk-btn"><MessageSquare size={15} aria-hidden />Ekiple konuş</Link>
          </div>
        </div>
        <div className="wk-project-meta">
          <span className="wk-health"><i aria-hidden="true" />{STATUS[project.status] ?? project.status}</span><span className="wk-sep" aria-hidden="true" />
          {owner && <><span>Proje sahibi<b>{owner.name}</b></span><span className="wk-sep" aria-hidden="true" /></>}
          <span>Teslim<b>{fmtDate(project.due_at)}</b></span><span className="wk-sep" aria-hidden="true" />
          <span>Aşama<b>{TASK_STATE_LABELS[project.flow_stage]}</b></span>
          {project.client_visible && <span className="wk-chip">Müşteriye açık</span>}
          <span className="wk-progress">
            <span>%{prog.pct}</span>
            <span className="wk-progress-bar" role="progressbar" aria-label="Proje ilerlemesi" aria-valuemin={0} aria-valuemax={100} aria-valuenow={prog.pct}><span style={{ width: `${prog.pct}%` }} /></span>
          </span>
        </div>
      </header>
      <WorkViewSwitcher value={view} onChange={setView} />

      {focus && (view === 'list' || view === 'board') && (
        <div className="wk-banner">
          <Sparkles size={16} aria-hidden style={{ color: 'var(--js-work-accent-text)' }} />
          <p><strong>Bugünün odağı:</strong> {focus.title} · {isLate(focus, today) ? 'gecikmiş, bitiş ' : 'bitiş '}{fmtDate(focus.due_at)}</p>
          <button type="button" className="wk-btn" data-sm onClick={() => { setView('list'); setOpenReq({ id: focus.id, n: Date.now() }); }}>Ayrıntı<ArrowRight size={13} aria-hidden /></button>
        </div>
      )}

      {(view === 'list' || view === 'board') && (
        <TaskWorkArea tasks={tasks} setTasks={(fn) => setTasks(fn)} team={team} projects={[project]} taskTypes={taskTypes} view={view} projectId={project.id} today={today} canBid={!client} openRequest={openReq} />
      )}

      {view === 'summary' && (
        <div className="wk-summary">
          <div className="wk-summary-grid">
            <article><span>Görev</span><strong>{prog.total}</strong><small>{STAGE_COUNT} aşama · {prog.done} tamamlandı</small></article>
            <article><span>İlerleme</span><strong>%{prog.pct}</strong><small>Teslim ve arşivdeki görev oranı</small></article>
            <article><span>Geciken</span><strong style={late ? { color: 'var(--js-work-urgent)' } : undefined}>{late}</strong><small>{late ? 'Bitiş tarihi geçmiş açık görev' : 'Geciken görev yok'}</small></article>
            <article><span>Bütçe</span><strong style={{ fontSize: 22 }}>{money(project.budget_minor)}</strong><small>Teslim {fmtDate(project.due_at)}</small></article>
          </div>
          <section className="wk-box" aria-label="Akış zaman çizelgesi">
            <h3>Akış zaman çizelgesi</h3>
            {project.stage_plan.length === 0 ? <p className="wk-muted">Bu proje için aşama planı girilmemiş.</p> : (
              <ol className="wk-stages">
                {project.stage_plan.map((s) => (
                  <li key={s.stage} aria-current={s.stage === project.flow_stage ? 'step' : undefined}>
                    <b data-done={s.done}>{s.done ? '✓ ' : ''}{TASK_STATE_LABELS[s.stage]}</b>
                    <small>{fmtDate(s.due_at)} · {team.find((t) => t.id === s.owner)?.name.split(' ')[0] ?? s.owner}</small>
                    <small style={{ display: 'block' }}>{tasks.filter((t) => t.state === s.stage).length} görev</small>
                  </li>
                ))}
              </ol>
            )}
          </section>
          <section className="wk-box" aria-label="Aşamalara göre görevler">
            <h3>Aşamalara göre görevler</h3>
            <ul className="wk-list">{TASK_STATES.map((s) => <li key={s}><span>{TASK_STATE_LABELS[s]}</span><span className="wk-chip">{tasks.filter((t) => t.state === s).length}</span></li>)}</ul>
          </section>
          <section className="wk-box" aria-label="Onaylar">
            <h3>Onaylar</h3>
            {q.data.approvals.length === 0 ? <p className="wk-muted">Bu projeye bağlı onay kaydı yok.</p> : (
              <ul className="wk-list">{q.data.approvals.map((a) => <li key={a.id}><span>{a.title}</span><span className="wk-chip" data-tone={a.status === 'approved' ? 'ok' : undefined}>{APPROVAL_STATUS[a.status]?.[0] ?? a.status}</span></li>)}</ul>
            )}
            <p style={{ marginTop: 10 }}><Link className="wk-filter" href="/app/approvals" style={{ display: 'inline-flex' }}>Onaylara git</Link></p>
          </section>
        </div>
      )}

      {view === 'files' && (
        <div className="wk-pad">
          {q.data.assets.length === 0 ? (
            <div className="wk-empty"><FolderOpen size={40} aria-hidden /><h2>Bu projede henüz dosya yok</h2><p>Medya kütüphanesine yüklenen ve bu projeye bağlanan dosyalar burada listelenir.</p><Link className="wk-btn" href="/app/media">Medya kütüphanesi</Link></div>
          ) : (
            <section className="wk-box" aria-label="Proje dosyaları"><h3>Dosyalar ({q.data.assets.length})</h3>
              <ul className="wk-list">{q.data.assets.map((a) => <li key={a.id}><span>{a.name}</span><span style={{ display: 'flex', gap: 6 }}><span className="wk-chip">{a.kind}</span><span className="wk-chip">v{a.version}</span><span className="wk-chip">{a.size_mb} MB</span>{a.client_visible && <span className="wk-chip">Müşteriye açık</span>}</span></li>)}</ul>
            </section>
          )}
        </div>
      )}
    </div>
  );
}
