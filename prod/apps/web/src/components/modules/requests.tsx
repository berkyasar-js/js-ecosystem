'use client';
import Link from 'next/link';
import { useEffect, useId, useMemo, useState } from 'react';
import { ArrowRightCircle, Plus } from 'lucide-react';
import { REQUEST_KINDS, REQUEST_KIND_LABELS, REQUEST_STATUS_LABELS, isClientRole, requestToTask, type Brand, type Project, type RequestKind, type Task, type TeamMember, type WorkRequest } from '@jscore/contracts';
import { OrbitDialog } from '../dialog';
import { useSession } from '../session';
import { useToast } from '../toasts';
import { Empty, fmtDate, todayFor, useData } from '../ui';
import { Chip, ModulePage, nameOf, useAct } from '../mod';

const TABS: Array<[string, string]> = [['open', 'Açık'], ['converted', 'Göreve dönüştü'], ['done', 'Kapanan'], ['all', 'Tümü']];
const TONE: Record<WorkRequest['status'], 'ok' | 'warn' | 'bad' | undefined> = { new: 'warn', triaged: undefined, converted: 'ok', closed: undefined, rejected: 'bad' };

/**
 * Talepler (intake): hata / fikir / brief / müşteri talebi. Triyaj → göreve dönüştür (yeni görev ya da mevcut göreve bağla; bir görev birden çok talebi kapsar).
 * Görev teslim/arşive geçince talep kendiliğinden kapanır. Müşteri rolleri yalnızca kendi markasının taleplerini görür ve `client` türünde talep açar.
 */
export function RequestsView({ tab, embedded = false, brandIds }: { tab?: string; embedded?: boolean; brandIds?: string[] }) {
  const { me, mode, rev } = useSession();
  const client = !!me && isClientRole(me.role);
  const q = useData(async (r) => {
    const safe = <T,>(p: Promise<T[]>) => p.catch(() => [] as T[]);
    const [requests, brands, projects, tasks, team] = await Promise.all([safe(r.list('requests')), safe(r.listBrands()), safe(r.listProjects()), safe(r.listTasks()), safe(r.team())]);
    return { requests: requests as WorkRequest[], brands, projects, tasks, team };
  }, [rev]);
  const [wantNew, setWantNew] = useState<{ title: string } | null>(null);
  const [convert, setConvert] = useState<WorkRequest[] | null>(null);
  const [checked, setChecked] = useState<Set<string>>(new Set());
  const [kind, setKind] = useState<RequestKind | ''>('');
  useEffect(() => { const sp = new URLSearchParams(window.location.search); if (sp.get('new') === '1') setWantNew({ title: sp.get('title') ?? '' }); }, []);
  const body = (t: string) => {
    if (!q.data) return null;
    const { requests, brands, projects, tasks, team } = q.data;
    const scoped = brandIds ? requests.filter((r) => r.brand_id && brandIds.includes(r.brand_id)) : requests;
    const rows = scoped.filter((r) => (kind ? r.kind === kind : true) && (t === 'all' ? true : t === 'open' ? r.status === 'new' || r.status === 'triaged' : t === 'converted' ? r.status === 'converted' : r.status === 'closed' || r.status === 'rejected'))
      .sort((a, b) => b.created_at.localeCompare(a.created_at));
    const counts = { new: scoped.filter((r) => r.status === 'new').length, open: scoped.filter((r) => r.status === 'new' || r.status === 'triaged').length };
    const sel = rows.filter((r) => checked.has(r.id));
    return (
      <div className="grid gap-4">
        <div className="flex flex-wrap items-center gap-2">
          <Chip tone={counts.new ? 'warn' : undefined}>{counts.new} yeni</Chip><Chip>{counts.open} açık</Chip>
          <select className="input w-auto" aria-label="Tür" value={kind} onChange={(e) => setKind(e.target.value as RequestKind | '')}><option value="">Tüm türler</option>{REQUEST_KINDS.filter((k) => !client || k === 'client').map((k) => <option key={k} value={k}>{REQUEST_KIND_LABELS[k]}</option>)}</select>
          <span className="flex-1" />
          {!client && sel.length > 0 && <button className="btn btn-sm btn-primary" onClick={() => setConvert(sel)}><ArrowRightCircle size={14} aria-hidden /> Seçili {sel.length} talebi tek göreve dönüştür</button>}
          {me && me.role !== 'auditor' && me.role !== 'client_viewer' && <button className="btn btn-sm btn-primary" onClick={() => setWantNew({ title: '' })}><Plus size={14} aria-hidden /> Yeni talep</button>}
        </div>
        {rows.length === 0 ? <Empty>Bu sekmede talep yok.</Empty> : (
          <ul className="grid gap-3" aria-label="Talepler">
            {rows.map((r) => <RequestCard key={r.id} r={r} brands={brands} projects={projects} tasks={tasks} team={team} client={client} checked={checked.has(r.id)} onCheck={() => setChecked((s) => { const n = new Set(s); if (n.has(r.id)) n.delete(r.id); else n.add(r.id); return n; })} onConvert={() => setConvert([r])} />)}
          </ul>
        )}
        <p className="text-xs text-muted">Bir görev birden çok talebi kapsayabilir; görev teslim ya da arşive geçince bağlı talepler kendiliğinden kapanır. Yeni talep ve görevler markanın <strong>alan sahibine</strong> (CRM → marka kartı) düşer.</p>
        <NewRequestDialog open={!!wantNew} initialTitle={wantNew?.title ?? ''} onClose={() => setWantNew(null)} brands={brandIds ? brands.filter((b) => brandIds.includes(b.id)) : brands} projects={projects} client={client} />
        {convert && <ConvertDialog reqs={convert} onClose={() => { setConvert(null); setChecked(new Set()); }} brands={brands} projects={projects} tasks={tasks} team={team} today={todayFor(mode)} />}
      </div>
    );
  };
  if (embedded) return q.data ? body('open') : null;
  return <ModulePage id="requests" title="Talepler" sub="Hata, fikir, brief ve müşteri talepleri: triyaj → göreve dönüştür" tabs={TABS} tab={tab}>{(t) => (q.loading ? <p className="text-sm text-muted">Yükleniyor…</p> : body(t))}</ModulePage>;
}

function RequestCard({ r, brands, projects, tasks, team, client, checked, onCheck, onConvert }: { r: WorkRequest; brands: Brand[]; projects: Project[]; tasks: Task[]; team: TeamMember[]; client: boolean; checked: boolean; onCheck: () => void; onConvert: () => void }) {
  const { repo } = useSession();
  const { act, busy, Err } = useAct();
  const task = r.task_id ? tasks.find((t) => t.id === r.task_id) : null;
  const brand = brands.find((b) => b.id === r.brand_id);
  const open = r.status === 'new' || r.status === 'triaged';
  const set = (status: WorkRequest['status']) => void act(() => repo!.save('requests', { id: r.id, status }));
  return (
    <li className="card">
      {Err}
      <div className="flex flex-wrap items-start gap-3">
        {!client && open && <input type="checkbox" className="mt-1" aria-label={`${r.title} seç`} checked={checked} onChange={onCheck} />}
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2"><strong>{r.title}</strong><Chip tone={TONE[r.status]}>{REQUEST_STATUS_LABELS[r.status]}</Chip><Chip tone={r.kind === 'bug' ? 'bad' : r.kind === 'client' ? 'brand' : undefined}>{REQUEST_KIND_LABELS[r.kind]}</Chip></div>
          {r.body && <p className="mt-1 whitespace-pre-wrap text-sm text-muted">{r.body}</p>}
          <div className="mt-2 flex flex-wrap gap-2 text-xs text-muted">
            <span>{r.requester_name || nameOf(team, r.requester_employee_id)}</span><span>· {fmtDate(r.created_at)}</span>
            {brand && <span>· <Link className="underline" href={`/app/crm/${brand.id}`}>{brand.name}</Link>{brand.default_assignee_id && <> (alan sahibi {nameOf(team, brand.default_assignee_id).split(' ')[0]})</>}</span>}
            {r.project_id && <span>· <Link className="underline" href={`/app/projects/${r.project_id}`}>{projects.find((p) => p.id === r.project_id)?.name ?? 'Proje'}</Link></span>}
            {task && <span>· Görev: <Link className="underline" href={`/app/projects/${task.project_id}?task=${task.id}`}>{task.title}</Link></span>}
          </div>
        </div>
        {!client && (
          <div className="flex flex-wrap gap-2">
            {r.status === 'new' && <button className="btn btn-sm" disabled={busy} onClick={() => set('triaged')}>Değerlendirildi</button>}
            {open && <button className="btn btn-sm btn-primary" disabled={busy} onClick={onConvert}>Göreve dönüştür</button>}
            {open && <button className="btn btn-ghost btn-sm" disabled={busy} onClick={() => set('rejected')}>Reddet</button>}
            {(r.status === 'rejected' || r.status === 'closed') && <button className="btn btn-ghost btn-sm" disabled={busy} onClick={() => set('new')}>Yeniden aç</button>}
          </div>
        )}
      </div>
    </li>
  );
}

export function NewRequestDialog({ open, onClose, brands, projects, client, initialTitle = '', fixedBrand }: { open: boolean; onClose: () => void; brands: Brand[]; projects: Project[]; client: boolean; initialTitle?: string; fixedBrand?: string }) {
  const { repo, me, bump } = useSession();
  const toast = useToast();
  const id = useId();
  const [kind, setKind] = useState<RequestKind>(client ? 'client' : 'brief');
  const [title, setTitle] = useState(initialTitle);
  const [body, setBody] = useState('');
  const [brand, setBrand] = useState(fixedBrand ?? '');
  const [project, setProject] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => { if (open) { setTitle(initialTitle); setBody(''); setBrand(fixedBrand ?? brands[0]?.id ?? ''); setProject(''); setErr(null); setKind(client ? 'client' : 'brief'); } }, [open, initialTitle, fixedBrand, brands, client]);
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!repo || !me || busy) return;
    if (title.trim().length < 2) { setErr('Başlık en az 2 karakter olmalı.'); return; }
    if (client && !brand) { setErr('Marka seçilmeli.'); return; }
    setBusy(true); setErr(null);
    try {
      await repo.save('requests', { kind: client ? 'client' : kind, title: title.trim(), body: body.trim(), status: 'new', requester_employee_id: me.employee_id ?? null, requester_name: me.name, brand_id: brand || null, project_id: project || null, task_id: null, client_visible: client || kind === 'client' });
      toast.success('Talep açıldı', title.trim()); bump(); onClose();
    } catch (ex) { setErr(ex instanceof Error ? ex.message : 'Talep açılamadı'); } finally { setBusy(false); }
  };
  const projs = projects.filter((p) => !brand || p.brand_id === brand);
  return (
    <OrbitDialog open={open} onClose={() => !busy && onClose()} title="Yeni talep" description={client ? 'Talebiniz ajans ekibine düşer; değerlendirilip göreve dönüştürülür.' : 'Talep triyaj kuyruğuna düşer; göreve dönüştürülünce markanın alan sahibine atanır.'}>
      <form onSubmit={submit} noValidate aria-busy={busy}>
        <div className="wk-dialog-body">
          {!client && <div><label className="wk-label" htmlFor={`${id}-k`}>Tür</label><select id={`${id}-k`} className="wk-field" value={kind} onChange={(e) => setKind(e.target.value as RequestKind)}>{REQUEST_KINDS.map((k) => <option key={k} value={k}>{REQUEST_KIND_LABELS[k]}</option>)}</select></div>}
          <div><label className="wk-label" htmlFor={`${id}-t`}>Başlık *</label><input id={`${id}-t`} className="wk-field" autoFocus maxLength={200} value={title} onChange={(e) => setTitle(e.target.value)} /></div>
          <div><label className="wk-label" htmlFor={`${id}-b`}>Açıklama</label><textarea id={`${id}-b`} className="wk-field wk-x-ta" rows={4} maxLength={5000} value={body} onChange={(e) => setBody(e.target.value)} /></div>
          <div style={{ display: 'grid', gap: 14, gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))' }}>
            {!fixedBrand && <div><label className="wk-label" htmlFor={`${id}-br`}>Marka (alan)</label><select id={`${id}-br`} className="wk-field" value={brand} onChange={(e) => { setBrand(e.target.value); setProject(''); }}>{!client && <option value="">—</option>}{brands.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}</select></div>}
            <div><label className="wk-label" htmlFor={`${id}-p`}>Proje (isteğe bağlı)</label><select id={`${id}-p`} className="wk-field" value={project} onChange={(e) => setProject(e.target.value)}><option value="">—</option>{projs.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select></div>
          </div>
          {err && <p role="alert" className="wk-error">{err}</p>}
        </div>
        <div className="wk-dialog-actions"><button type="button" className="wk-btn" onClick={onClose} disabled={busy}>Vazgeç</button><button type="submit" className="wk-btn" data-primary disabled={busy}>{busy ? 'Açılıyor…' : 'Talep aç'}</button></div>
      </form>
    </OrbitDialog>
  );
}

function ConvertDialog({ reqs, onClose, brands, projects, tasks, team, today }: { reqs: WorkRequest[]; onClose: () => void; brands: Brand[]; projects: Project[]; tasks: Task[]; team: TeamMember[]; today: string }) {
  const { repo, bump } = useSession();
  const toast = useToast();
  const id = useId();
  const first = reqs[0];
  const brand = brands.find((b) => b.id === first.brand_id) ?? null;
  const [mode, setMode] = useState<'new' | 'existing'>('new');
  const [project, setProject] = useState(first.project_id ?? projects.find((p) => p.brand_id === first.brand_id && p.status !== 'done')?.id ?? projects[0]?.id ?? '');
  const defaultAssignee = brand?.default_assignee_id ?? brand?.account_owner ?? '';
  const [assignee, setAssignee] = useState(defaultAssignee && team.some((m) => m.id === defaultAssignee) ? defaultAssignee : '');
  const [title, setTitle] = useState(reqs.length > 1 ? `${first.title} (+${reqs.length - 1} talep)` : first.title);
  const [existing, setExisting] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const openTasks = useMemo(() => tasks.filter((t) => t.project_id === project && t.state !== 'archive' && t.state !== 'delivery'), [tasks, project]);
  const go = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!repo || busy) return;
    setBusy(true); setErr(null);
    try {
      let taskId = existing;
      if (mode === 'new') {
        if (!project) throw new Error('Proje seçilmeli');
        const input = requestToTask({ ...first, title, body: reqs.map((r) => r.body).filter(Boolean).join('\n\n— — —\n\n') }, { project_id: project, today, brand, assignee_id: assignee || null });
        const t = await repo.createTask({ project_id: input.project_id, title: input.title, assignee_id: input.assignee_id, priority: input.priority, due_at: input.due_at, task_type: input.task_type, qty: 1, source_ref: reqs.length > 1 ? `request:${reqs.map((r) => r.id).join(',')}` : input.source_ref, state: 'brief' });
        await repo.updateTask(t.id, { description: input.description, labels: ['talep', ...new Set(reqs.map((r) => r.kind))] }).catch(() => undefined);
        taskId = t.id;
      } else if (!taskId) throw new Error('Görev seçilmeli');
      for (const r of reqs) await repo.save('requests', { id: r.id, status: 'converted', task_id: taskId, project_id: mode === 'new' ? project : tasks.find((t) => t.id === taskId)?.project_id ?? r.project_id });
      toast.success(reqs.length > 1 ? `${reqs.length} talep göreve bağlandı` : 'Talep göreve dönüştürüldü', title);
      bump(); onClose();
    } catch (ex) { setErr(ex instanceof Error ? ex.message : 'Dönüştürülemedi'); } finally { setBusy(false); }
  };
  return (
    <OrbitDialog open onClose={() => !busy && onClose()} title={reqs.length > 1 ? `${reqs.length} talebi göreve dönüştür` : 'Göreve dönüştür'} description="Yeni görev aç ya da mevcut bir göreve bağla. Görev teslim edilince talepler kapanır.">
      <form onSubmit={go} noValidate aria-busy={busy}>
        <div className="wk-dialog-body">
          <div className="wk-chips" role="radiogroup" aria-label="Yöntem">
            <button type="button" role="radio" aria-checked={mode === 'new'} className="wk-chip" data-on={mode === 'new' || undefined} onClick={() => setMode('new')}>Yeni görev</button>
            <button type="button" role="radio" aria-checked={mode === 'existing'} className="wk-chip" data-on={mode === 'existing' || undefined} onClick={() => setMode('existing')}>Mevcut göreve bağla</button>
          </div>
          <div><label className="wk-label" htmlFor={`${id}-p`}>Proje</label><select id={`${id}-p`} className="wk-field" value={project} onChange={(e) => { setProject(e.target.value); setExisting(''); }}>{projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select></div>
          {mode === 'new' ? (
            <>
              <div><label className="wk-label" htmlFor={`${id}-t`}>Görev adı</label><input id={`${id}-t`} className="wk-field" maxLength={200} value={title} onChange={(e) => setTitle(e.target.value)} /></div>
              <div><label className="wk-label" htmlFor={`${id}-a`}>Sorumlu {brand?.default_assignee_id && <span className="wk-muted">(alan sahibi varsayılan)</span>}</label>
                <select id={`${id}-a`} className="wk-field" value={assignee} onChange={(e) => setAssignee(e.target.value)}><option value="">Atanmamış</option>{team.filter((m) => m.status === 'active').map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}</select></div>
            </>
          ) : (
            <div><label className="wk-label" htmlFor={`${id}-e`}>Görev</label><select id={`${id}-e`} className="wk-field" value={existing} onChange={(e) => setExisting(e.target.value)}><option value="">Seç…</option>{openTasks.map((t) => <option key={t.id} value={t.id}>{t.title}</option>)}</select>{openTasks.length === 0 && <p className="wk-muted" style={{ fontSize: 12 }}>Bu projede açık görev yok.</p>}</div>
          )}
          {err && <p role="alert" className="wk-error">{err}</p>}
        </div>
        <div className="wk-dialog-actions"><button type="button" className="wk-btn" onClick={onClose} disabled={busy}>Vazgeç</button><button type="submit" className="wk-btn" data-primary disabled={busy}>{busy ? 'Dönüştürülüyor…' : 'Dönüştür'}</button></div>
      </form>
    </OrbitDialog>
  );
}
