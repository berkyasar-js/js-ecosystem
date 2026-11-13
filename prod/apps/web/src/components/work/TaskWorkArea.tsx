'use client';
import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { Flame, Plus, Search, User, X } from 'lucide-react';
import { TASK_STATES, TASK_STATE_LABELS, groupTasks, isClientRole, parseViewQuery, type Milestone, type Priority, type Project, type SavedView, type Task, type TaskBadges, type TaskPatch, type TaskState, type TaskType, type TeamMember } from '@jscore/contracts';
import { TaskBids } from '../modules/bids';
import { useFeature, useSession } from '../session';
import { OrbitDialog } from '../dialog';
import { useToast } from '../toasts';
import { NewTaskDialog } from './NewTaskDialog';
import { TaskBoard } from './TaskBoard';
import { TaskDetails } from './TaskDetails';
import { TaskRow } from './TaskRow';
import { ViewBar, fromQuery } from './saved-views';
import { EMPTY_FILTERS, PRIORITY_LABEL, applyFilters, isFiltered, memberName, type WorkFilters } from './work-utils';

const MOBILE = '(max-width: 899px)';
function useMobile() {
  return useSyncExternalStore(
    (cb) => { const m = window.matchMedia(MOBILE); m.addEventListener('change', cb); return () => m.removeEventListener('change', cb); },
    () => window.matchMedia(MOBILE).matches,
    () => false,
  );
}
const typing = (el: EventTarget | null) => el instanceof HTMLElement && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT' || el.isContentEditable);

/**
 * Liste/pano + araç çubuğu + ayrıntı paneli + yeni görev penceresi. Görev durumu üst bileşende (kontrollü); yazma işlemleri repo üzerinden.
 * 0017: kayıtlı görünümler (ViewBar), gruplama, çoklu seçim + toplu düzenleme, j/k/Enter/x/c klavye gezinmesi, kilometre taşı alanı.
 */
export function TaskWorkArea({ tasks, setTasks, team, projects, taskTypes, view: wantedView, projectId, showProject = false, today, canBid: canBidRole = false, allowCreate = true, hideMineFilter = false, emptyText, openRequest, milestones = [], defaultAssigneeId, showViews = true }: {
  tasks: Task[]; setTasks: (fn: (prev: Task[]) => Task[]) => void; team: TeamMember[]; projects: Project[]; taskTypes: TaskType[]; view: 'list' | 'board';
  projectId?: string; showProject?: boolean; today: string; canBid?: boolean; allowCreate?: boolean; hideMineFilter?: boolean; emptyText?: string; openRequest?: { id: string; n: number } | null;
  milestones?: Milestone[]; defaultAssigneeId?: string | null; showViews?: boolean;
}) {
  const { repo, me } = useSession();
  const bidsOn = useFeature('tasks.bids');
  const boardOn = useFeature('tasks.board_view');
  const canBid = canBidRole && bidsOn;
  const view = wantedView === 'board' && !boardOn ? 'list' : wantedView;
  const toast = useToast();
  const mobile = useMobile();
  const readonly = !me || isClientRole(me.role) || me.role === 'auditor';
  const employeeId = me?.employee_id;
  const [filters, setFilters] = useState<WorkFilters>(EMPTY_FILTERS);
  const [viewId, setViewId] = useState<string | null>(null);
  const [selId, setSelId] = useState<string | null>(null);
  const [cursor, setCursor] = useState<string | null>(null);
  const [checked, setChecked] = useState<Set<string>>(new Set());
  const [pendingIds, setPending] = useState<ReadonlySet<string>>(new Set());
  const [err, setErr] = useState<{ id: string | null; msg: string } | null>(null);
  const [newOpen, setNewOpen] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [bidOpen, setBidOpen] = useState<string | null>(null);
  const [badges, setBadges] = useState<Record<string, TaskBadges>>({});
  const [bulkBusy, setBulkBusy] = useState(false);
  const [labelsOpen, setLabelsOpen] = useState(false);
  const [labelText, setLabelText] = useState('');
  const wrapRef = useRef<HTMLDivElement>(null);
  const addBtn = useRef<HTMLButtonElement>(null);

  useEffect(() => { if (openRequest) setSelId(openRequest.id); }, [openRequest]);
  // Spotlight "Yeni görev" → /app/tasks?new=1[&title=…] (bir kez açılır); ?view=<id> ya da ?mine=1&states=… → filtre.
  useEffect(() => {
    const sp = new URLSearchParams(window.location.search);
    if (allowCreate && !readonly && sp.get('new') === '1') { setNewTitle(sp.get('title') ?? ''); setNewOpen(true); }
    const q = parseViewQuery(sp);
    if (Object.keys(q).length) setFilters(fromQuery(q));
    const v = sp.get('view');
    if (v && repo) repo.list('saved_views').then((vs) => { const sv = vs.find((x) => x.id === v); if (sv) { setFilters(fromQuery(sv.query)); setViewId(sv.id); } }, () => undefined);
  }, [allowCreate, readonly, repo]);
  const sel = tasks.find((t) => t.id === selId) ?? null;
  const visible = useMemo(() => applyFilters(tasks, filters, employeeId), [tasks, filters, employeeId]);
  const projectName = useCallback((id: string) => projects.find((p) => p.id === id)?.name ?? '', [projects]);
  const typeLabel = (t: Task) => taskTypes.find((x) => x.key === t.task_type)?.label ?? t.task_type;
  const nameOf = useCallback((id: string | null) => memberName(team, id), [team]);
  const groups = useMemo(() => groupTasks(visible, filters.group, { member: nameOf, project: projectName }), [visible, filters.group, nameOf, projectName]);

  // Rozet sayımları (yorum / ek / checklist): görev kimlikleri değişince bir kez; ayrıntı paneli açıkken kendi sayımını günceller.
  const idsKey = useMemo(() => tasks.map((t) => t.id).join(','), [tasks]);
  useEffect(() => {
    if (!repo || !idsKey) return;
    let alive = true;
    repo.taskBadges(idsKey.split(',')).then((b) => { if (alive) setBadges((cur) => ({ ...cur, ...b })); }, () => undefined);
    return () => { alive = false; };
  }, [repo, idsKey]);
  const onBadges = useCallback((taskId: string, b: TaskBadges) => setBadges((cur) => (JSON.stringify(cur[taskId]) === JSON.stringify(b) ? cur : { ...cur, [taskId]: b })), []);
  const onLocalPatch = useCallback((taskId: string, p: Partial<Task>) => setTasks((ts) => ts.map((x) => (x.id === taskId ? { ...x, ...p } : x))), [setTasks]);

  const focusOpener = (id: string | null) => requestAnimationFrame(() => {
    const el = id ? wrapRef.current?.querySelector<HTMLElement>(`[data-task-open="${CSS.escape(id)}"]`) : null;
    (el ?? addBtn.current)?.focus();
  });
  const open = (t: Task) => { setSelId(t.id); setCursor(t.id); setErr((e) => (e?.id === t.id ? e : null)); };
  const close = () => { const id = selId; setSelId(null); focusOpener(id); };

  const run = async (id: string, fn: () => Promise<Task>, ok: (t: Task) => [string, string?], rollback?: () => void, quiet = false) => {
    if (pendingIds.has(id)) return;
    setPending((s) => new Set(s).add(id)); setErr(null);
    try {
      const t = await fn();
      setTasks((ts) => ts.map((x) => (x.id === t.id ? t : x)));
      if (!quiet) toast.success(...ok(t));
    } catch (e) {
      rollback?.();
      setErr({ id, msg: e instanceof Error ? e.message : 'İşlem başarısız' });
    } finally {
      setPending((s) => { const n = new Set(s); n.delete(id); return n; });
    }
  };
  const move = (t: Task, to: TaskState, optimistic = false, quiet = false) => {
    if (!repo || t.state === to) return;
    const prev = t.state;
    if (optimistic) setTasks((ts) => ts.map((x) => (x.id === t.id ? { ...x, state: to } : x)));
    return run(t.id, () => repo.moveTask(t.id, to), (n) => [to === 'delivery' && prev !== 'delivery' ? 'Görev tamamlandı' : 'Aşama güncellendi', `${n.title} → ${TASK_STATE_LABELS[n.state]}`],
      optimistic ? () => setTasks((ts) => ts.map((x) => (x.id === t.id ? { ...x, state: prev } : x))) : undefined, quiet);
  };
  const complete = (t: Task) => move(t, 'delivery');
  const patch = (t: Task, p: TaskPatch, quiet = false) => {
    if (repo) return run(t.id, () => repo.updateTask(t.id, p), (n) => ['description' in p ? 'Açıklama kaydedildi' : 'cover' in p ? 'Kapak güncellendi' : 'Görev güncellendi', n.title], undefined, quiet);
  };
  const create = async (input: { project_id: string; title: string; assignee_id: string | null; priority: Priority; due_at: string }) => {
    if (!repo) throw new Error('Oturum hazır değil');
    const t = await repo.createTask(input);
    setTasks((ts) => [...ts, t]);
    toast.success('Görev eklendi', t.title);
    return t;
  };

  /* ───── Toplu düzenleme ───── */
  const selected = useMemo(() => visible.filter((t) => checked.has(t.id)), [visible, checked]);
  const toggleCheck = (id: string) => setChecked((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const bulk = async (label: string, fn: (t: Task) => Promise<unknown> | undefined) => {
    if (!selected.length || bulkBusy) return;
    setBulkBusy(true);
    let okCount = 0;
    for (const t of selected) { try { await fn(t); okCount++; } catch { /* satır hatası err'de */ } }
    setBulkBusy(false);
    toast.success(label, `${okCount} / ${selected.length} görev güncellendi`);
    setChecked(new Set());
  };
  const bulkLabels = async (add: boolean) => {
    const labels = labelText.split(',').map((x) => x.trim()).filter(Boolean);
    if (!labels.length) return;
    setLabelsOpen(false); setLabelText('');
    await bulk(add ? 'Etiket eklendi' : 'Etiket kaldırıldı', (t) => patch(t, { labels: add ? [...new Set([...t.labels, ...labels])] : t.labels.filter((l) => !labels.includes(l)) }, true));
  };

  /* ───── Klavye: j/k gezin, Enter aç, x seç, c yeni, Esc kapat ───── */
  const flat = useMemo(() => groups.flatMap((g) => g.tasks), [groups]);
  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') { if (!e.defaultPrevented && selId && !(e.target as HTMLElement).closest('dialog')) { e.stopPropagation(); close(); } return; }
    if (typing(e.target) || e.metaKey || e.ctrlKey || e.altKey || (e.target as HTMLElement).closest('dialog, aside')) return;
    const i = flat.findIndex((t) => t.id === cursor);
    if (e.key === 'j' || e.key === 'k') {
      e.preventDefault();
      const n = flat[Math.max(0, Math.min(flat.length - 1, i < 0 ? 0 : i + (e.key === 'j' ? 1 : -1)))];
      if (n) { setCursor(n.id); wrapRef.current?.querySelector<HTMLElement>(`[data-task-open="${CSS.escape(n.id)}"]`)?.focus(); }
    } else if (e.key === 'Enter' && cursor && !(e.target as HTMLElement).closest('button')) { const t = flat.find((x) => x.id === cursor); if (t) { e.preventDefault(); open(t); } }
    else if (e.key === 'x' && cursor && !readonly) { e.preventDefault(); toggleCheck(cursor); }
    else if (e.key === 'c' && allowCreate && !readonly) { e.preventDefault(); setNewOpen(true); }
  };

  const detail = sel && (
    <TaskDetails task={sel} team={team} context={projectName(sel.project_id) || '—'} typeLabel={typeLabel(sel)} readonly={readonly} pending={pendingIds.has(sel.id)}
      milestones={milestones.filter((m) => m.project_id === sel.project_id)}
      error={err?.id === sel.id ? err.msg : undefined} onClose={close} onComplete={() => void complete(sel)} onStage={(s) => void move(sel, s)} onPatch={(p) => void patch(sel, p)} onBadges={onBadges} onLocalPatch={onLocalPatch} />
  );
  const filtered = isFiltered(filters);
  const cols = 6 + (canBid ? 1 : 0) + (readonly ? 0 : 1);
  const allChecked = visible.length > 0 && visible.every((t) => checked.has(t.id));

  return (
    <div className="wk-work-area" data-detail={sel ? 'open' : 'closed'} ref={wrapRef} onKeyDown={onKeyDown}>
      <div className="wk-work-center">
        {showViews && !readonly && <ViewBar filters={filters} setFilters={(f) => { setFilters(f); setViewId(null); }} team={team} showProjectFilter={showProject} projects={projects} activeViewId={viewId} onPickView={(v: SavedView | null) => setViewId(v?.id ?? null)} />}
        <div className="wk-toolbar" role="toolbar" aria-label="Görev araçları">
          {allowCreate && !readonly && <button ref={addBtn} type="button" className="wk-btn" data-primary onClick={() => setNewOpen(true)} title="Kısayol: c"><Plus size={15} aria-hidden />Görev ekle</button>}
          {!hideMineFilter && <button type="button" className="wk-filter" aria-pressed={filters.mine} disabled={!employeeId} title={employeeId ? undefined : 'Hesabın bir çalışan kaydına bağlı değil'} onClick={() => setFilters((f) => ({ ...f, mine: !f.mine }))}><User size={14} aria-hidden />Bana atanan</button>}
          <button type="button" className="wk-filter" aria-pressed={filters.high} onClick={() => setFilters((f) => ({ ...f, high: !f.high }))}><Flame size={14} aria-hidden />Yüksek öncelik</button>
          <span className="wk-grow" />
          <label className="wk-search"><Search size={15} aria-hidden /><span className="wk-sr">Görevlerde ara</span>
            <input type="search" placeholder="Görevlerde ara…" value={filters.q} onChange={(e) => setFilters((f) => ({ ...f, q: e.target.value }))} /></label>
        </div>
        <p className="wk-results-meta" role="status"><span><strong>{visible.length}</strong> görev{filtered && ` (${tasks.length} içinden)`}</span>{!readonly && view === 'list' && visible.length > 0 && <span className="wk-muted"> · j/k gezin · Enter aç · x seç · c yeni</span>}</p>
        {err && !(sel && err.id === sel.id) && <p role="alert" className="wk-error" style={{ marginBottom: 10 }}>{err.msg}</p>}

        {selected.length > 0 && !readonly && (
          <div className="wk-bulkbar" role="region" aria-label="Toplu düzenleme" aria-busy={bulkBusy}>
            <strong>{selected.length} seçili</strong>
            <label className="wk-sr" htmlFor="bulk-state">Aşama</label>
            <select id="bulk-state" className="wk-field" value="" disabled={bulkBusy} onChange={(e) => { const s = e.target.value as TaskState; if (s) void bulk('Aşama güncellendi', (t) => move(t, s, false, true)); }}><option value="">Aşama…</option>{TASK_STATES.map((s) => <option key={s} value={s}>{TASK_STATE_LABELS[s]}</option>)}</select>
            <label className="wk-sr" htmlFor="bulk-as">Sorumlu</label>
            <select id="bulk-as" className="wk-field" value="" disabled={bulkBusy} onChange={(e) => { const v = e.target.value; if (v) void bulk('Sorumlu güncellendi', (t) => patch(t, { assignee_id: v === 'none' ? null : v }, true)); }}><option value="">Sorumlu…</option><option value="none">Atanmamış</option>{team.filter((m) => m.status === 'active').map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}</select>
            <label className="wk-sr" htmlFor="bulk-pr">Öncelik</label>
            <select id="bulk-pr" className="wk-field" value="" disabled={bulkBusy} onChange={(e) => { const v = e.target.value as Priority; if (v) void bulk('Öncelik güncellendi', (t) => patch(t, { priority: v }, true)); }}><option value="">Öncelik…</option>{(Object.keys(PRIORITY_LABEL) as Priority[]).map((p) => <option key={p} value={p}>{PRIORITY_LABEL[p]}</option>)}</select>
            <label className="wk-sr" htmlFor="bulk-due">Bitiş</label>
            <input id="bulk-due" type="date" className="wk-field" disabled={bulkBusy} onChange={(e) => { const v = e.target.value; if (v) void bulk('Bitiş güncellendi', (t) => patch(t, { due_at: v }, true)); }} />
            <button type="button" className="wk-filter" disabled={bulkBusy} onClick={() => setLabelsOpen(true)}>Etiket…</button>
            {milestones.length > 0 && <><label className="wk-sr" htmlFor="bulk-ms">Kilometre taşı</label>
              <select id="bulk-ms" className="wk-field" value="" disabled={bulkBusy} onChange={(e) => { const v = e.target.value; if (v) void bulk('Kilometre taşı güncellendi', (t) => patch(t, { milestone_id: v === 'none' ? null : v }, true)); }}><option value="">Kilometre taşı…</option><option value="none">Yok</option>{milestones.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}</select></>}
            <span className="wk-grow" />
            <button type="button" className="wk-ib" aria-label="Seçimi temizle" onClick={() => setChecked(new Set())}><X size={16} aria-hidden /></button>
          </div>
        )}

        {tasks.length === 0 ? (
          <div className="wk-empty"><h3>{emptyText ?? 'Henüz görev yok'}</h3>{allowCreate && !readonly && <button type="button" className="wk-btn" data-primary onClick={() => setNewOpen(true)}>İlk görevi ekle</button>}</div>
        ) : visible.length === 0 ? (
          <div className="wk-empty"><h3>Filtreyle eşleşen görev yok</h3><p>Filtreleri gevşetmeyi ya da aramayı temizlemeyi dene.</p><button type="button" className="wk-btn" onClick={() => { setFilters(EMPTY_FILTERS); setViewId(null); }}>Filtreleri temizle</button></div>
        ) : view === 'board' ? (
          <TaskBoard tasks={visible} nameOf={nameOf} today={today} selectedId={selId} pendingIds={pendingIds} readonly={readonly} onOpen={open} onMove={(t, to) => void move(t, to, true)} badges={badges} />
        ) : (
          <div className="wk-table-wrap">
            <table className="wk-task-table">
              <caption>Görev listesi</caption>
              <thead><tr>
                {!readonly && <th scope="col" className="wk-select-cell"><input type="checkbox" aria-label="Tümünü seç" checked={allChecked} onChange={() => setChecked(allChecked ? new Set() : new Set(visible.map((t) => t.id)))} /></th>}
                <th scope="col"><span className="wk-sr">Tamamla</span></th><th scope="col">Görev adı</th><th scope="col">Sorumlu</th><th scope="col">Bitiş</th><th scope="col">Aşama</th><th scope="col">Öncelik</th>{canBid && <th scope="col">İhale</th>}
              </tr></thead>
              <tbody>
                {groups.map((g) => (
                  <RowGroup key={g.key}>
                    {g.label && <tr className="wk-group-row"><th scope="colgroup" colSpan={cols}>{g.label} <span className="wk-chip">{g.tasks.length}</span></th></tr>}
                    {g.tasks.map((t) => (
                      <RowGroup key={t.id}>
                        <TaskRow task={t} badges={badges[t.id]} assignee={nameOf(t.assignee_id)} today={today} selected={selId === t.id} pending={pendingIds.has(t.id)} readonly={readonly} cursor={cursor === t.id}
                          lead={!readonly ? <input type="checkbox" className="wk-select" aria-label={`${t.title} seç`} checked={checked.has(t.id)} onChange={() => toggleCheck(t.id)} onClick={(e) => e.stopPropagation()} /> : undefined}
                          category={[showProject ? projectName(t.project_id) : '', typeLabel(t), t.milestone_id ? `◆ ${milestones.find((m) => m.id === t.milestone_id)?.name ?? ''}` : ''].filter(Boolean).join(' · ')} onOpen={() => open(t)} onComplete={() => void complete(t)}
                          extra={canBid ? <button type="button" className="wk-btn" data-sm aria-expanded={bidOpen === t.id} onClick={() => setBidOpen(bidOpen === t.id ? null : t.id)}>İhale</button> : undefined} />
                        {canBid && bidOpen === t.id && <tr className="wk-expand"><td colSpan={cols} style={{ padding: '4px 10px 14px' }}><TaskBids task={t} /></td></tr>}
                      </RowGroup>
                    ))}
                  </RowGroup>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
      {sel && !mobile && detail}
      <OrbitDialog open={!!sel && mobile} onClose={close} variant="sheet" label="Görev ayrıntısı">{detail}</OrbitDialog>
      <NewTaskDialog open={newOpen} onClose={() => { setNewOpen(false); setNewTitle(''); requestAnimationFrame(() => addBtn.current?.focus()); }} projects={projects} projectId={projectId} team={team} today={today} onCreate={create} initialTitle={newTitle} defaultAssigneeId={defaultAssigneeId ?? null} />
      <OrbitDialog open={labelsOpen} onClose={() => setLabelsOpen(false)} title="Etiketler" description="Virgülle ayır; seçili görevlere eklenir ya da kaldırılır.">
        <div className="wk-dialog-body"><label className="wk-label" htmlFor="bulk-labels">Etiketler</label><input id="bulk-labels" className="wk-field" autoFocus value={labelText} onChange={(e) => setLabelText(e.target.value)} placeholder="acil, kasım" /></div>
        <div className="wk-dialog-actions"><button type="button" className="wk-btn" onClick={() => void bulkLabels(false)}>Kaldır</button><button type="button" className="wk-btn" data-primary onClick={() => void bulkLabels(true)}>Ekle</button></div>
      </OrbitDialog>
    </div>
  );
}
const RowGroup = ({ children }: { children: React.ReactNode }) => <>{children}</>;
