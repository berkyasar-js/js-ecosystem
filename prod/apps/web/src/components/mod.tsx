'use client';
import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { DndContext, KeyboardSensor, PointerSensor, useDraggable, useDroppable, useSensor, useSensors, type DragEndEvent } from '@dnd-kit/core';
import { Info } from 'lucide-react';
import { canAccessModule, canReadColl, canWriteColl, moduleEntitled, MODULES, tabEnabled, type Brand, type CollKey, type Project, type Records, type SaveInput, type Task, type TeamMember } from '@jscore/contracts';
import { Empty, ErrorBox, Loading, PageHeader, useData } from './ui';
import { useSession } from './session';
import { downloadCsv } from '@jscore/core/domain';

/* ───────── Veri: dünya (marka/proje/görev/ekip) + istenen koleksiyonlar ───────── */
export type World<K extends CollKey> = { brands: Brand[]; projects: Project[]; tasks: Task[]; team: TeamMember[] } & { [P in K]: Records[P][] };
export function useWorld<K extends CollKey>(kinds: readonly K[]) {
  const { me } = useSession();
  return useData(async (r) => {
    const safe = <T,>(p: Promise<T[]>) => p.catch(() => [] as T[]);
    const [brands, projects, tasks, team] = await Promise.all([safe(r.listBrands()), safe(r.listProjects()), safe(r.listTasks()), safe(r.team())]);
    const out: Record<string, unknown> = { brands, projects, tasks, team };
    await Promise.all(kinds.map(async (k) => { out[k] = me && canReadColl(me.role, k) ? await safe(r.list(k)) : []; }));
    return out as World<K>;
  }, [me?.role, kinds.join(',')]);
}
export const useCan = () => { const { me } = useSession(); return { read: (k: CollKey) => !!me && canReadColl(me.role, k), write: (k: CollKey) => !!me && canWriteColl(me.role, k) }; };

/** Mutasyon sarmalayıcı: hata gösterir, başarıda tüm veriyi tazeler. */
export function useAct() {
  const { bump } = useSession();
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const act = useCallback(async (fn: () => Promise<unknown>) => {
    setBusy(true); setErr(null);
    try { await fn(); bump(); return true; } catch (e) { setErr(e instanceof Error ? e.message : 'İşlem başarısız'); return false; } finally { setBusy(false); }
  }, [bump]);
  const Err = err ? <p role="alert" className="mb-3 rounded-xl border border-magenta/40 px-3 py-2 text-sm text-magenta">{err}</p> : null;
  return { act, busy, err, Err };
}

/* ───────── Sayfa iskeleti: başlık + ?tab= sekmeleri + erişim/entitlement kapısı ───────── */
export function ModulePage({ id, title, sub, tabs: allTabs, tab, actions, children }: { id: string; title: string; sub?: string; tabs: Array<[string, string]>; tab?: string; actions?: ReactNode; children: (tab: string) => ReactNode }) {
  const { me, features } = useSession();
  const flags = features.flags;
  // Yönetim panelinde kapatılan özelliğe bağlı sekmeler düşer.
  const tabs = allTabs.filter(([t]) => tabEnabled(features.toggles, id, t));
  const active = tabs.some(([t]) => t === tab) ? (tab as string) : tabs[0][0];
  const mod = MODULES.find((m) => m.id === id);
  const href = `/app/${mod?.slug ?? id}`;
  return (
    <>
      <PageHeader title={title} sub={sub} actions={actions} />
      {tabs.length > 1 && (
        <nav className="tabs" role="tablist" aria-label={`${title} sekmeleri`}>
          {tabs.map(([t, label]) => <Link key={t} role="tab" href={`${href}?tab=${t}`} aria-selected={active === t} className="tab" scroll={false}>{label}</Link>)}
        </nav>
      )}
      {!me || !features.loaded ? <Loading /> : !canAccessModule(me.role, id) ? <div className="card max-w-2xl text-sm text-muted">Bu modüle erişim yetkin yok.</div>
        : !moduleEntitled(id, flags) ? <div className="card max-w-2xl text-sm"><strong>Bu modül kapalı.</strong> <span className="text-muted">Yöneticin Ana Yönetim Paneli’nden açabilir.</span></div>
        : children(active)}
    </>
  );
}
export function Gate({ ok, children, why = 'Bu bölüm için yetkin yok.' }: { ok: boolean; children: ReactNode; why?: string }) {
  return ok ? <>{children}</> : <div className="card text-sm text-muted" role="note">{why}</div>;
}
export function Await<T>({ q, children }: { q: { data: T | null; error: string | null; loading: boolean }; children: (d: T) => ReactNode }) {
  if (q.loading) return <Loading />;
  if (q.error) return <ErrorBox message={q.error} />;
  return <>{q.data !== null && children(q.data)}</>;
}

/* ───────── Küçük UI parçaları ───────── */
export const Grid = ({ cols = 3, children }: { cols?: 2 | 3 | 4; children: ReactNode }) => <div className={`grid gap-4 grid-cols-1 sm:grid-cols-2 ${cols === 3 ? 'lg:grid-cols-3' : cols === 4 ? 'lg:grid-cols-4' : ''}`}>{children}</div>;
export const Card = ({ title, aside, children, className = '' }: { title?: string; aside?: ReactNode; children: ReactNode; className?: string }) => (
  <section className={`card ${className}`} aria-label={title}>
    {(title || aside) && <div className="mb-3 flex items-center justify-between gap-2"><h2 className="text-sm font-bold">{title}</h2>{aside}</div>}
    {children}
  </section>
);
export const Table = ({ heads, children, empty }: { heads: string[]; children: ReactNode; empty?: string }) => (
  <div className="overflow-x-auto"><table className="table"><thead><tr>{heads.map((h) => <th key={h}>{h}</th>)}</tr></thead><tbody>{children}</tbody></table>{empty && <Empty>{empty}</Empty>}</div>
);
export const Bar = ({ pct, tone }: { pct: number; tone?: 'bad' | 'warn' | 'ok' }) => (
  <div className="h-2 min-w-16 rounded-full bg-nested" role="progressbar" aria-valuenow={Math.round(pct)} aria-valuemin={0} aria-valuemax={100}>
    <div className={`h-2 rounded-full ${tone === 'bad' ? 'bg-magenta' : tone === 'warn' ? 'bg-[#ffb020]' : 'bg-accent'}`} style={{ width: `${Math.max(0, Math.min(100, pct))}%` }} />
  </div>
);
export const toneOf = (pct: number): 'bad' | 'warn' | 'ok' => (pct > 100 ? 'bad' : pct >= 85 ? 'warn' : 'ok');

/** Metrik tanımı için klavye erişilebilir açılır balon (details/summary). */
export function Metric({ label, value, def, tone, hint }: { label: string; value: ReactNode; def: string; tone?: 'warn' | 'bad' | 'ok'; hint?: string }) {
  const c = tone === 'bad' ? 'text-magenta' : tone === 'warn' ? 'text-[#ffb020]' : tone === 'ok' ? 'text-[#3ddc97]' : '';
  return (
    <div className="card">
      <div className="flex items-center justify-between gap-2 text-xs font-semibold uppercase tracking-wide text-muted">
        {label}
        <details className="relative"><summary className="cursor-pointer list-none rounded-full p-1 hover:bg-nested" aria-label={`${label} tanımı`}><Info size={14} aria-hidden /></summary>
          <div role="note" className="card absolute right-0 top-7 z-20 w-64 p-3 text-xs font-normal normal-case tracking-normal text-ink shadow-xl">{def}</div></details>
      </div>
      <div className={`mt-2 text-3xl font-bold ${c}`}>{value}</div>
      {hint && <div className="mt-1 text-xs text-muted">{hint}</div>}
    </div>
  );
}
export const Freshness = ({ at = '14 Eki 2026 09:00' }: { at?: string }) => <span className="chip" title="Veri en son bu zamanda hesaplandı">Veri tazeliği: {at}</span>;
export function CsvButton({ name, rows }: { name: string; rows: Array<Array<string | number | boolean | null | undefined>> }) {
  return <button className="btn btn-sm" onClick={() => downloadCsv(name, rows)}>CSV indir</button>;
}
export const Chip = ({ children, tone }: { children: ReactNode; tone?: 'ok' | 'warn' | 'bad' | 'brand' }) => <span className={`chip ${tone ? `chip-${tone}` : ''}`}>{children}</span>;

/* ───────── Form ───────── */
export interface Fld { name: string; label: string; type?: 'text' | 'number' | 'date' | 'select' | 'textarea' | 'checkbox' | 'email'; options?: Array<[string, string]>; required?: boolean; def?: string | number | boolean; wide?: boolean }
export type Vals = Record<string, string | number | boolean>;
export function FormCard({ title, fields, submit = 'Kaydet', onSubmit, busy }: { title?: string; fields: Fld[]; submit?: string; onSubmit: (v: Vals) => Promise<unknown> | unknown; busy?: boolean }) {
  const [k, setK] = useState(0);
  const go = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const f = new FormData(e.currentTarget); const v: Vals = {};
    for (const fl of fields) {
      const raw = f.get(fl.name);
      v[fl.name] = fl.type === 'checkbox' ? raw === 'on' : fl.type === 'number' ? Number(raw ?? 0) : String(raw ?? '');
    }
    await onSubmit(v); setK((n) => n + 1);
  };
  return (
    <form key={k} onSubmit={go} className="nested grid gap-3 sm:grid-cols-2" aria-label={title}>
      {title && <h3 className="text-sm font-bold sm:col-span-2">{title}</h3>}
      {fields.map((fl) => (
        <div key={fl.name} className={fl.wide || fl.type === 'textarea' ? 'sm:col-span-2' : ''}>
          {fl.type === 'checkbox' ? <label className="flex items-center gap-2 text-sm"><input type="checkbox" name={fl.name} defaultChecked={!!fl.def} /> {fl.label}</label> : (
            <>
              <label className="label" htmlFor={`f_${fl.name}${k}`}>{fl.label}</label>
              {fl.type === 'select' ? <select id={`f_${fl.name}${k}`} name={fl.name} className="input" defaultValue={String(fl.def ?? fl.options?.[0]?.[0] ?? '')}>{fl.options?.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select>
                : fl.type === 'textarea' ? <textarea id={`f_${fl.name}${k}`} name={fl.name} className="input min-h-20" required={fl.required} defaultValue={String(fl.def ?? '')} />
                : <input id={`f_${fl.name}${k}`} name={fl.name} type={fl.type ?? 'text'} step={fl.type === 'number' ? 'any' : undefined} className="input" required={fl.required} defaultValue={fl.def === undefined ? undefined : String(fl.def)} />}
            </>
          )}
        </div>
      ))}
      <div className="sm:col-span-2"><button className="btn btn-primary btn-sm" disabled={busy}>{submit}</button></div>
    </form>
  );
}

/** Basit liste + ekleme formu + silme. `build` form değerlerini kayıt girdisine çevirir. */
export function Crud<K extends CollKey>({ kind, rows, heads, cells, fields, build, title, canEdit, empty, rowActions, removable = true }: {
  kind: K; rows: Records[K][]; heads: string[]; cells: (r: Records[K]) => ReactNode[]; fields: Fld[]; build: (v: Vals) => SaveInput<K>; title: string;
  canEdit: boolean; empty: string; rowActions?: (r: Records[K]) => ReactNode; removable?: boolean;
}) {
  const { repo } = useSession();
  const { act, busy, Err } = useAct();
  return (
    <div className="grid gap-4">
      {Err}
      {(rows.length > 0 || empty) && <Card title={title} aside={<span className="chip">{rows.length}</span>}>
        {rows.length === 0 ? <Empty>{empty}</Empty> : (
          <Table heads={[...heads, ...(canEdit ? [''] : [])]}>
            {rows.map((r) => (
              <tr key={r.id}>
                {cells(r).map((c, i) => <td key={i}>{c}</td>)}
                {canEdit && <td className="whitespace-nowrap text-right">{rowActions?.(r)}{removable && <button className="btn btn-ghost btn-sm" aria-label="Sil" disabled={busy} onClick={() => void act(() => repo!.remove(kind, r.id))}>Sil</button>}</td>}
              </tr>
            ))}
          </Table>
        )}
      </Card>}
      {canEdit && <FormCard title={`Yeni: ${title}`} fields={fields} busy={busy} onSubmit={(v) => act(() => repo!.save(kind, build(v)))} />}
    </div>
  );
}

/* ───────── Kanban (dnd-kit; klavye + "taşı" seçimi) ───────── */
function KCard({ id, children }: { id: string; children: ReactNode }) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({ id });
  return <div ref={setNodeRef} {...listeners} {...attributes} className={`nested cursor-grab touch-none ${isDragging ? 'z-10 opacity-80 shadow-xl' : ''}`} style={transform ? { transform: `translate3d(${transform.x}px,${transform.y}px,0)` } : undefined}>{children}</div>;
}
function KCol({ id, label, count, children }: { id: string; label: string; count: number; children: ReactNode }) {
  const { setNodeRef, isOver } = useDroppable({ id });
  return (
    <section ref={setNodeRef} aria-label={label} className={`w-64 shrink-0 rounded-card border p-3 ${isOver ? 'border-accent' : 'border-line'} bg-card max-[720px]:w-full max-[720px]:shrink`}>
      <h2 className="mb-3 flex items-center justify-between text-xs font-bold uppercase tracking-wide text-muted">{label}<span className="chip">{count}</span></h2>
      <div className="grid min-h-16 gap-2">{children}</div>
    </section>
  );
}
export function Kanban<T extends { id: string }>({ items, stages, stageOf, render, onMove, readonly }: {
  items: T[]; stages: Array<[string, string]>; stageOf: (t: T) => string; render: (t: T) => ReactNode; onMove: (t: T, to: string) => Promise<unknown>; readonly?: boolean;
}) {
  const [local, setLocal] = useState<T[]>(items);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => setLocal(items), [items]);
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }), useSensor(KeyboardSensor));
  const move = async (t: T, to: string) => {
    if (readonly || stageOf(t) === to) return;
    const prev = local;
    setLocal((cur) => cur.map((x) => (x.id === t.id ? ({ ...x, __stage: to } as T) : x)));
    try { await onMove(t, to); setErr(null); } catch (e) { setLocal(prev); setErr(e instanceof Error ? e.message : 'Taşınamadı'); }
  };
  const st = (t: T) => ((t as { __stage?: string }).__stage ?? stageOf(t));
  const onEnd = (e: DragEndEvent) => { const t = local.find((x) => x.id === e.active.id); const to = e.over?.id as string | undefined; if (t && to) void move(t, to); };
  return (
    <>
      {err && <p role="alert" className="mb-3 text-sm text-magenta">{err}</p>}
      <DndContext sensors={sensors} onDragEnd={onEnd}>
        <div className="flex gap-3 overflow-x-auto pb-4 max-[720px]:flex-col">
          {stages.map(([id, label]) => {
            const col = local.filter((t) => st(t) === id);
            return (
              <KCol key={id} id={id} label={label} count={col.length}>
                {col.map((t) => (
                  <KCard key={t.id} id={t.id}>
                    {render(t)}
                    {!readonly && (
                      <select className="input mt-2 min-h-8 py-0 text-xs" aria-label="Aşamaya taşı" value={id} onPointerDown={(e) => e.stopPropagation()} onKeyDown={(e) => e.stopPropagation()} onChange={(e) => void move(t, e.target.value)}>
                        {stages.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                      </select>
                    )}
                  </KCard>
                ))}
              </KCol>
            );
          })}
        </div>
      </DndContext>
    </>
  );
}

export const nameOf = (team: TeamMember[], id: string | null | undefined) => team.find((t) => t.id === id)?.name ?? id ?? '—';
export const firstName = (team: TeamMember[], id: string | null | undefined) => nameOf(team, id).split(' ')[0];
export const brandName = (brands: Brand[], id: string | null | undefined) => brands.find((b) => b.id === id)?.name ?? '—';
export const useMemoMap = <T,>(arr: T[], key: (t: T) => string) => useMemo(() => new Map(arr.map((a) => [key(a), a])), [arr]); // eslint-disable-line react-hooks/exhaustive-deps
export const tl = (minor: number) => new Intl.NumberFormat('tr-TR', { maximumFractionDigits: 0 }).format(minor / 100) + ' ₺';
