'use client';
import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { Flame, Plus, Search, User } from 'lucide-react';
import { TASK_STATE_LABELS, isClientRole, type AuditEvent, type Priority, type Project, type Task, type TaskBadges, type TaskPatch, type TaskState, type TaskType, type TeamMember } from '@jscore/contracts';
import { TaskBids } from '../modules/bids';
import { useSession } from '../session';
import { OrbitDialog } from '../dialog';
import { useToast } from '../toasts';
import { NewTaskDialog } from './NewTaskDialog';
import { TaskBoard } from './TaskBoard';
import { TaskDetails } from './TaskDetails';
import { TaskRow } from './TaskRow';
import { applyFilters, memberName, type WorkFilters } from './work-utils';

const MOBILE = '(max-width: 899px)';
function useMobile() {
  return useSyncExternalStore(
    (cb) => { const m = window.matchMedia(MOBILE); m.addEventListener('change', cb); return () => m.removeEventListener('change', cb); },
    () => window.matchMedia(MOBILE).matches,
    () => false,
  );
}

/** Liste/pano + araç çubuğu + ayrıntı paneli + yeni görev penceresi. Görev durumu üst bileşende (kontrollü); yazma işlemleri repo üzerinden. */
export function TaskWorkArea({ tasks, setTasks, team, projects, taskTypes, view, projectId, showProject = false, today, canBid = false, allowCreate = true, hideMineFilter = false, emptyText, openRequest }: {
  tasks: Task[]; setTasks: (fn: (prev: Task[]) => Task[]) => void; team: TeamMember[]; projects: Project[]; taskTypes: TaskType[]; view: 'list' | 'board';
  projectId?: string; showProject?: boolean; today: string; canBid?: boolean; allowCreate?: boolean; hideMineFilter?: boolean; emptyText?: string; openRequest?: { id: string; n: number } | null;
}) {
  const { repo, me } = useSession();
  const toast = useToast();
  const mobile = useMobile();
  const readonly = !me || isClientRole(me.role) || me.role === 'auditor';
  const employeeId = me?.employee_id;
  const [filters, setFilters] = useState<WorkFilters>({ mine: false, high: false, q: '' });
  const [selId, setSelId] = useState<string | null>(null);
  const [pendingIds, setPending] = useState<ReadonlySet<string>>(new Set());
  const [err, setErr] = useState<{ id: string | null; msg: string } | null>(null);
  const [newOpen, setNewOpen] = useState(false);
  const [bidOpen, setBidOpen] = useState<string | null>(null);
  const [audit, setAudit] = useState<AuditEvent[] | null>([]);
  const [badges, setBadges] = useState<Record<string, TaskBadges>>({});
  const wrapRef = useRef<HTMLDivElement>(null);
  const addBtn = useRef<HTMLButtonElement>(null);

  useEffect(() => { if (openRequest) setSelId(openRequest.id); }, [openRequest]);
  const sel = tasks.find((t) => t.id === selId) ?? null;
  const visible = useMemo(() => applyFilters(tasks, filters, employeeId), [tasks, filters, employeeId]);
  const projectName = (id: string) => projects.find((p) => p.id === id)?.name ?? '';
  const typeLabel = (t: Task) => taskTypes.find((x) => x.key === t.task_type)?.label ?? t.task_type;
  const nameOf = useCallback((id: string | null) => memberName(team, id), [team]);

  useEffect(() => {
    if (!repo || !selId) return;
    let alive = true;
    repo.listAudit().then((a) => alive && setAudit(a.filter((e) => e.resource === `tasks/${selId}`)), () => alive && setAudit(null));
    return () => { alive = false; };
  }, [repo, selId, tasks]);

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
  const open = (t: Task) => { setSelId(t.id); setErr((e) => (e?.id === t.id ? e : null)); };
  const close = () => { const id = selId; setSelId(null); focusOpener(id); };

  const run = async (id: string, fn: () => Promise<Task>, ok: (t: Task) => [string, string?], rollback?: () => void) => {
    if (pendingIds.has(id)) return;
    setPending((s) => new Set(s).add(id)); setErr(null);
    try {
      const t = await fn();
      setTasks((ts) => ts.map((x) => (x.id === t.id ? t : x)));
      toast.success(...ok(t));
    } catch (e) {
      rollback?.();
      setErr({ id, msg: e instanceof Error ? e.message : 'İşlem başarısız' });
    } finally {
      setPending((s) => { const n = new Set(s); n.delete(id); return n; });
    }
  };
  const move = (t: Task, to: TaskState, optimistic = false) => {
    if (!repo || t.state === to) return;
    const prev = t.state;
    if (optimistic) setTasks((ts) => ts.map((x) => (x.id === t.id ? { ...x, state: to } : x)));
    return run(t.id, () => repo.moveTask(t.id, to), (n) => [to === 'delivery' && prev !== 'delivery' ? 'Görev tamamlandı' : 'Aşama güncellendi', `${n.title} → ${TASK_STATE_LABELS[n.state]}`],
      optimistic ? () => setTasks((ts) => ts.map((x) => (x.id === t.id ? { ...x, state: prev } : x))) : undefined);
  };
  const complete = (t: Task) => move(t, 'delivery');
  const patch = (t: Task, p: TaskPatch) => {
    if (repo) void run(t.id, () => repo.updateTask(t.id, p), (n) => ['description' in p ? 'Açıklama kaydedildi' : 'cover' in p ? 'Kapak güncellendi' : 'Görev güncellendi', n.title]);
  };
  const create = async (input: { project_id: string; title: string; assignee_id: string | null; priority: Priority; due_at: string }) => {
    if (!repo) throw new Error('Oturum hazır değil');
    const t = await repo.createTask(input);
    setTasks((ts) => [...ts, t]);
    toast.success('Görev eklendi', t.title);
    return t;
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key !== 'Escape' || e.defaultPrevented || !selId || (e.target as HTMLElement).closest('dialog')) return;
    e.stopPropagation(); close();
  };

  const detail = sel && (
    <TaskDetails task={sel} team={team} context={projectName(sel.project_id) || '—'} typeLabel={typeLabel(sel)} activity={audit} readonly={readonly} pending={pendingIds.has(sel.id)}
      error={err?.id === sel.id ? err.msg : undefined} onClose={close} onComplete={() => void complete(sel)} onStage={(s) => void move(sel, s)} onPatch={(p) => patch(sel, p)} onBadges={onBadges} onLocalPatch={onLocalPatch} />
  );
  const filtered = filters.mine || filters.high || filters.q.trim() !== '';
  const cols = canBid ? 7 : 6;

  return (
    <div className="wk-work-area" data-detail={sel ? 'open' : 'closed'} ref={wrapRef} onKeyDown={onKeyDown}>
      <div className="wk-work-center">
        <div className="wk-toolbar" role="toolbar" aria-label="Görev araçları">
          {allowCreate && !readonly && <button ref={addBtn} type="button" className="wk-btn" data-primary onClick={() => setNewOpen(true)}><Plus size={15} aria-hidden />Görev ekle</button>}
          {!hideMineFilter && <button type="button" className="wk-filter" aria-pressed={filters.mine} disabled={!employeeId} title={employeeId ? undefined : 'Hesabın bir çalışan kaydına bağlı değil'} onClick={() => setFilters((f) => ({ ...f, mine: !f.mine }))}><User size={14} aria-hidden />Bana atanan</button>}
          <button type="button" className="wk-filter" aria-pressed={filters.high} onClick={() => setFilters((f) => ({ ...f, high: !f.high }))}><Flame size={14} aria-hidden />Yüksek öncelik</button>
          <span className="wk-grow" />
          <label className="wk-search"><Search size={15} aria-hidden /><span className="wk-sr">Görevlerde ara</span>
            <input type="search" placeholder="Görevlerde ara…" value={filters.q} onChange={(e) => setFilters((f) => ({ ...f, q: e.target.value }))} /></label>
        </div>
        <p className="wk-results-meta" role="status"><span><strong>{visible.length}</strong> görev{filtered && ` (${tasks.length} içinden)`}</span></p>
        {err && !(sel && err.id === sel.id) && <p role="alert" className="wk-error" style={{ marginBottom: 10 }}>{err.msg}</p>}

        {tasks.length === 0 ? (
          <div className="wk-empty"><h3>{emptyText ?? 'Henüz görev yok'}</h3>{allowCreate && !readonly && <button type="button" className="wk-btn" data-primary onClick={() => setNewOpen(true)}>İlk görevi ekle</button>}</div>
        ) : visible.length === 0 ? (
          <div className="wk-empty"><h3>Filtreyle eşleşen görev yok</h3><p>Filtreleri gevşetmeyi ya da aramayı temizlemeyi dene.</p><button type="button" className="wk-btn" onClick={() => setFilters({ mine: false, high: false, q: '' })}>Filtreleri temizle</button></div>
        ) : view === 'board' ? (
          <TaskBoard tasks={visible} nameOf={nameOf} today={today} selectedId={selId} pendingIds={pendingIds} readonly={readonly} onOpen={open} onMove={(t, to) => void move(t, to, true)} badges={badges} />
        ) : (
          <div className="wk-table-wrap">
            <table className="wk-task-table">
              <caption>Görev listesi</caption>
              <thead><tr><th scope="col"><span className="wk-sr">Tamamla</span></th><th scope="col">Görev adı</th><th scope="col">Sorumlu</th><th scope="col">Bitiş</th><th scope="col">Aşama</th><th scope="col">Öncelik</th>{canBid && <th scope="col">İhale</th>}</tr></thead>
              <tbody>
                {visible.map((t) => (
                  <RowGroup key={t.id}>
                    <TaskRow task={t} badges={badges[t.id]} assignee={nameOf(t.assignee_id)} today={today} selected={selId === t.id} pending={pendingIds.has(t.id)} readonly={readonly}
                      category={[showProject ? projectName(t.project_id) : '', typeLabel(t)].filter(Boolean).join(' · ')} onOpen={() => open(t)} onComplete={() => void complete(t)}
                      extra={canBid ? <button type="button" className="wk-btn" data-sm aria-expanded={bidOpen === t.id} onClick={() => setBidOpen(bidOpen === t.id ? null : t.id)}>İhale</button> : undefined} />
                    {canBid && bidOpen === t.id && <tr className="wk-expand"><td colSpan={cols} style={{ padding: '4px 10px 14px' }}><TaskBids task={t} /></td></tr>}
                  </RowGroup>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
      {sel && !mobile && detail}
      <OrbitDialog open={!!sel && mobile} onClose={close} variant="sheet" label="Görev ayrıntısı">{detail}</OrbitDialog>
      <NewTaskDialog open={newOpen} onClose={() => { setNewOpen(false); requestAnimationFrame(() => addBtn.current?.focus()); }} projects={projects} projectId={projectId} team={team} today={today} onCreate={create} />
    </div>
  );
}
const RowGroup = ({ children }: { children: React.ReactNode }) => <>{children}</>;
