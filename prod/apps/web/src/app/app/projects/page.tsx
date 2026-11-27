'use client';
import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { TASK_STATES, TASK_STATE_LABELS, type Milestone } from '@jscore/contracts';
import { Async, Empty, PageHeader, fmtDate, money, todayFor, useData } from '@/components/ui';
import { QuickCreate } from '@/components/quick-create';
import { useCan, useSession } from '@/components/session';
import { AtelierIcon } from '@/components/atelier-icon';
import {
  DUE_FILTER_LABELS, EMPTY_FILTERS, PAGE_SIZE, PROJECT_STATUS_LABELS, SORT_LABELS, UNASSIGNED, activeFilterCount, buildRows, filterRows,
  filtersFromQuery, filtersToQuery, pageCount, type DueFilter, type PortfolioFilters, type PortfolioRow, type PortfolioSort,
} from '@/lib/portfolio';

const STATUS_CHIP: Record<string, string> = { active: 'chip-brand', planning: '', paused: 'chip-warn', done: 'chip-ok' };
const Missing = ({ children }: { children: string }) => <span className="text-muted">{children}</span>;

function DueCell({ row, today }: { row: PortfolioRow; today: string }) {
  const due = row.project.due_at;
  if (!due) return <Missing>Planlanmadı</Missing>;
  if (row.overdue) return <span className="chip chip-bad"><AtelierIcon id="alert" size={14} /> Gecikti · {fmtDate(due)}</span>;
  return <span className={due.slice(0, 10) === today ? 'font-semibold' : undefined}>{fmtDate(due)}{due.slice(0, 10) === today ? ' · bugün' : ''}</span>;
}
function MilestoneCell({ row }: { row: PortfolioRow }) {
  const m = row.nextMilestone;
  if (!m) return <Missing>Planlanmadı</Missing>;
  return <span><span className="block truncate">{m.name}</span><span className={`text-xs ${m.late ? 'text-danger' : 'text-muted'}`}>{fmtDate(m.due_at)}{m.late ? ' · gecikti' : ''}</span></span>;
}
function PlanCell({ row }: { row: PortfolioRow }) {
  if (!row.plan) return <Missing>Planlanmadı</Missing>;
  const { done, total } = row.plan;
  return (
    <span className="flex items-center gap-2">
      <span className="portfolio-bar" role="img" aria-label={`${total} aşamadan ${done} tamamlandı`}><span style={{ width: `${(done / total) * 100}%` }} /></span>
      <span className="num text-xs text-muted">{done}/{total}</span>
    </span>
  );
}

export default function Projects() {
  const { mode } = useSession();
  const today = todayFor(mode);
  // Bütçe yalnızca finans görme yetkisi olan rollerde (yetki matrisi: finance.view).
  const canSeeBudget = useCan('finance.view');
  const q = useData(async (r) => {
    const safe = <T,>(p: Promise<T[]>) => p.catch(() => [] as T[]);
    const [projects, brands, team, milestones] = await Promise.all([r.listProjects(), r.listBrands(), safe(r.team()), safe(r.list('milestones'))]);
    return { projects, brands, team, milestones: milestones as Milestone[] };
  });
  const [wantNew, setWantNew] = useState(false);
  const [filters, setFilters] = useState<PortfolioFilters>(EMPTY_FILTERS);
  const [page, setPage] = useState(1);
  const [ready, setReady] = useState(false);

  // Süzgeçler URL'de yaşar: bağlantı paylaşılabilir, yer imine eklenebilir. `?new=1` davranışı korunur.
  useEffect(() => {
    const search = window.location.search;
    setWantNew(new URLSearchParams(search).get('new') === '1');
    const parsed = filtersFromQuery(search, TASK_STATES);
    setFilters(parsed.filters); setPage(parsed.page); setReady(true);
  }, []);
  useEffect(() => {
    if (!ready) return;
    const qs = filtersToQuery(filters, page);
    window.history.replaceState(null, '', `${window.location.pathname}${qs ? `?${qs}` : ''}`);
  }, [filters, page, ready]);

  const set = <K extends keyof PortfolioFilters>(key: K, value: PortfolioFilters[K]) => { setFilters((f) => ({ ...f, [key]: value })); setPage(1); };
  const rows = useMemo(() => (q.data ? buildRows({ ...q.data, today }) : []), [q.data, today]);
  const shown = useMemo(() => filterRows(rows, filters, today), [rows, filters, today]);
  const pages = pageCount(shown.length);
  const current = Math.min(page, pages);
  const slice = shown.slice((current - 1) * PAGE_SIZE, current * PAGE_SIZE);
  const active = activeFilterCount(filters);
  const owners = useMemo(() => {
    const ids = new Set(rows.map((r) => r.project.flow_owner).filter(Boolean));
    return (q.data?.team ?? []).filter((m) => ids.has(m.id));
  }, [rows, q.data]);
  const chips: Array<{ key: keyof PortfolioFilters; label: string }> = [
    ...(filters.q.trim() ? [{ key: 'q' as const, label: `Arama: ${filters.q.trim()}` }] : []),
    ...(filters.status ? [{ key: 'status' as const, label: `Durum: ${PROJECT_STATUS_LABELS[filters.status]}` }] : []),
    ...(filters.stage ? [{ key: 'stage' as const, label: `Aşama: ${TASK_STATE_LABELS[filters.stage]}` }] : []),
    ...(filters.owner ? [{ key: 'owner' as const, label: `Sorumlu: ${filters.owner === UNASSIGNED ? 'Atanmamış' : q.data?.team.find((m) => m.id === filters.owner)?.name ?? 'Bilinmiyor'}` }] : []),
    ...(filters.due ? [{ key: 'due' as const, label: `Teslim: ${DUE_FILTER_LABELS[filters.due]}` }] : []),
  ];
  const overdueCount = rows.filter((r) => r.overdue).length;
  const hasUpdated = rows.some((r) => r.updatedAt);

  return (
    <>
      <PageHeader title="Projeler" sub="Portföy: durum, sorumlu, sonraki kilometre taşı ve teslim" />
      {q.data && <div className="mb-4"><QuickCreate key={String(wantNew)} brands={q.data.brands} autoOpen={wantNew} /></div>}
      <Async q={q}>{({ projects }) => projects.length === 0 ? <Empty>Görünür proje yok. Yukarıdan ilk projeni oluştur.</Empty> : (
        <>
          <form className="portfolio-toolbar" role="search" aria-label="Projeleri süz" onSubmit={(e) => e.preventDefault()}>
            <div className="portfolio-search"><label className="label" htmlFor="pf-q">Ara</label>
              <input id="pf-q" type="search" className="input" placeholder="Proje, marka ya da tür" value={filters.q} onChange={(e) => set('q', e.target.value)} /></div>
            <div><label className="label" htmlFor="pf-status">Durum</label>
              <select id="pf-status" className="input" value={filters.status} onChange={(e) => set('status', e.target.value as PortfolioFilters['status'])}>
                <option value="">Tümü</option>
                {Object.entries(PROJECT_STATUS_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select></div>
            <div><label className="label" htmlFor="pf-stage">Aşama</label>
              <select id="pf-stage" className="input" value={filters.stage} onChange={(e) => set('stage', e.target.value as PortfolioFilters['stage'])}>
                <option value="">Tümü</option>
                {TASK_STATES.map((s) => <option key={s} value={s}>{TASK_STATE_LABELS[s]}</option>)}
              </select></div>
            <div><label className="label" htmlFor="pf-owner">Sorumlu</label>
              <select id="pf-owner" className="input" value={filters.owner} onChange={(e) => set('owner', e.target.value)}>
                <option value="">Tümü</option>
                <option value={UNASSIGNED}>Atanmamış</option>
                {owners.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
              </select></div>
            <div><label className="label" htmlFor="pf-due">Teslim</label>
              <select id="pf-due" className="input" value={filters.due} onChange={(e) => set('due', e.target.value as DueFilter)}>
                <option value="">Tümü</option>
                {Object.entries(DUE_FILTER_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select></div>
            <div><label className="label" htmlFor="pf-sort">Sırala</label>
              <select id="pf-sort" className="input" value={filters.sort} onChange={(e) => set('sort', e.target.value as PortfolioSort)}>
                {Object.entries(SORT_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select></div>
          </form>

          <div className="portfolio-meta">
            <p aria-live="polite"><strong className="num">{shown.length}</strong> proje{active ? ` · ${rows.length} içinden` : ''}{overdueCount ? <> · <button type="button" className="link-button" onClick={() => set('due', filters.due === 'overdue' ? '' : 'overdue')} aria-pressed={filters.due === 'overdue'}>{overdueCount} gecikmiş</button></> : null}</p>
            {active > 0 && <button type="button" className="btn btn-sm" onClick={() => { setFilters({ ...EMPTY_FILTERS, sort: filters.sort }); setPage(1); }}>Süzgeçleri temizle ({active})</button>}
          </div>
          {chips.length > 0 && (
            <ul className="filter-chips mb-3" aria-label="Etkin süzgeçler">
              {chips.map((c) => <li key={c.key} className="filter-chip">{c.label}<button type="button" aria-label={`${c.label} süzgecini kaldır`} onClick={() => set(c.key, '' as never)}><AtelierIcon id="close" size={14} /></button></li>)}
            </ul>
          )}

          {shown.length === 0 ? <Empty>Bu süzgece uyan proje yok. Süzgeçleri temizleyip yeniden dene.</Empty> : (
            <>
              <div className="card portfolio-table-wrap">
                <table className="table portfolio-table">
                  <caption className="sr-only">Proje portföyü: {shown.length} proje, {SORT_LABELS[filters.sort]} sırasına göre</caption>
                  <thead><tr>
                    <th scope="col">Proje</th><th scope="col">Durum</th><th scope="col">Sorumlu</th><th scope="col">Sonraki kilometre taşı</th>
                    <th scope="col">Teslim</th><th scope="col">Aşama planı</th>{canSeeBudget && <th scope="col" className="num">Bütçe</th>}{hasUpdated && <th scope="col">Güncelleme</th>}
                  </tr></thead>
                  <tbody>
                    {slice.map((r) => { const p = r.project; return (
                      <tr key={p.id}>
                        <th scope="row"><Link href={`/app/projects/${p.id}`} className="portfolio-name">{p.name}</Link><span className="block text-xs font-normal text-muted">{r.brand ?? 'Marka yok'}</span></th>
                        <td><span className={`chip ${STATUS_CHIP[p.status] ?? ''}`}>{PROJECT_STATUS_LABELS[p.status] ?? p.status}</span><span className="mt-1 block text-xs text-muted">{TASK_STATE_LABELS[p.flow_stage] ?? p.flow_stage}</span></td>
                        <td>{r.owner ?? <Missing>Atanmamış</Missing>}</td>
                        <td className="portfolio-milestone"><MilestoneCell row={r} /></td>
                        <td><DueCell row={r} today={today} /></td>
                        <td><PlanCell row={r} /></td>
                        {canSeeBudget && <td className="num">{p.budget_minor > 0 ? money(p.budget_minor) : <Missing>Girilmedi</Missing>}</td>}
                        {hasUpdated && <td className="text-muted">{r.updatedAt ? fmtDate(r.updatedAt) : '—'}</td>}
                      </tr>
                    ); })}
                  </tbody>
                </table>
              </div>

              <ul className="portfolio-cards">
                {slice.map((r) => { const p = r.project; return (
                  <li key={p.id} className="card">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0"><Link href={`/app/projects/${p.id}`} className="portfolio-name">{p.name}</Link><p className="text-xs text-muted">{r.brand ?? 'Marka yok'} · {TASK_STATE_LABELS[p.flow_stage] ?? p.flow_stage}</p></div>
                      <span className={`chip ${STATUS_CHIP[p.status] ?? ''}`}>{PROJECT_STATUS_LABELS[p.status] ?? p.status}</span>
                    </div>
                    <dl className="portfolio-dl">
                      <div><dt>Teslim</dt><dd><DueCell row={r} today={today} /></dd></div>
                      <div><dt>Sorumlu</dt><dd>{r.owner ?? <Missing>Atanmamış</Missing>}</dd></div>
                      <div><dt>Sonraki kilometre taşı</dt><dd><MilestoneCell row={r} /></dd></div>
                      <div><dt>Aşama planı</dt><dd><PlanCell row={r} /></dd></div>
                    </dl>
                  </li>
                ); })}
              </ul>

              {pages > 1 && (
                <nav className="portfolio-pager" aria-label="Sayfalama">
                  <button type="button" className="btn btn-sm" disabled={current <= 1} onClick={() => setPage(current - 1)}>Önceki</button>
                  <span className="num text-sm text-muted" aria-live="polite">Sayfa {current} / {pages}</span>
                  <button type="button" className="btn btn-sm" disabled={current >= pages} onClick={() => setPage(current + 1)}>Sonraki</button>
                </nav>
              )}
            </>
          )}
        </>
      )}</Async>
    </>
  );
}
