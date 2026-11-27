/**
 * Proje portföyü — saf süzme / sıralama / satır türetme (sayfa + test).
 * Kural: kaynak veride olmayan değer üretilmez. Teslim tarihi yoksa "planlanmadı", aşama planı boşsa ilerleme yok,
 * sorumlu yoksa "atanmamış"; "gecikmiş" yalnızca teslim tarihi geçmiş ve bitmemiş projedir.
 */
import type { Milestone, Project, TaskState } from '@jscore/contracts';

export const PROJECT_STATUS_LABELS: Record<Project['status'], string> = { planning: 'Planlama', active: 'Aktif', paused: 'Duraklatıldı', done: 'Tamamlandı' };
export type DueFilter = '' | 'overdue' | 'week' | 'month' | 'unplanned';
export const DUE_FILTER_LABELS: Record<Exclude<DueFilter, ''>, string> = { overdue: 'Gecikmiş', week: '7 gün içinde', month: '30 gün içinde', unplanned: 'Teslim planlanmadı' };
export type PortfolioSort = 'due' | 'name' | 'brand' | 'stage';
export const SORT_LABELS: Record<PortfolioSort, string> = { due: 'Teslim tarihi', name: 'Proje adı', brand: 'Marka', stage: 'Aşama' };
export const PAGE_SIZE = 25;

export interface PortfolioFilters { q: string; status: '' | Project['status']; stage: '' | TaskState; owner: string; due: DueFilter; sort: PortfolioSort }
export const EMPTY_FILTERS: PortfolioFilters = { q: '', status: '', stage: '', owner: '', due: '', sort: 'due' };
/** Sorumlu süzgecinde "atanmamış" seçeneği. */
export const UNASSIGNED = '__none__';

export interface PortfolioRow {
  project: Project;
  brand: string | null;
  /** Sorumlunun adı; flow_owner boşsa ya da ekipte bulunamıyorsa null (→ "Atanmamış"). */
  owner: string | null;
  /** Bitmemiş, tarihi olan en yakın kilometre taşı; yoksa null (→ "Planlanmadı"). */
  nextMilestone: { name: string; due_at: string; late: boolean } | null;
  /** Aşama planı: boşsa null (ilerleme hesaplanamaz). */
  plan: { done: number; total: number } | null;
  overdue: boolean;
  /** Kayıtta varsa son güncelleme (projects.updated_at); yoksa null. */
  updatedAt: string | null;
}

const day = (iso: string | null | undefined) => (iso ? iso.slice(0, 10) : null);
const addDays = (d: string, n: number) => new Date(new Date(`${d}T00:00:00Z`).getTime() + n * 86400000).toISOString().slice(0, 10);
const tr = (s: string) => s.toLocaleLowerCase('tr');

export function buildRows(input: { projects: Project[]; brands: Array<{ id: string; name: string }>; team: Array<{ id: string; name: string }>; milestones: Milestone[]; today: string }): PortfolioRow[] {
  const { projects, brands, team, milestones, today } = input;
  return projects.map((project) => {
    const due = day(project.due_at);
    const next = milestones
      .filter((m) => m.project_id === project.id && m.status !== 'done' && !!m.due_at)
      .sort((a, b) => a.due_at!.localeCompare(b.due_at!))[0];
    const plan = project.stage_plan?.length ? { done: project.stage_plan.filter((s) => s.done).length, total: project.stage_plan.length } : null;
    const updated = (project as Project & { updated_at?: string | null }).updated_at;
    return {
      project,
      brand: brands.find((b) => b.id === project.brand_id)?.name ?? null,
      owner: project.flow_owner ? team.find((m) => m.id === project.flow_owner)?.name ?? null : null,
      nextMilestone: next ? { name: next.name, due_at: next.due_at!, late: day(next.due_at)! < today } : null,
      plan,
      overdue: !!due && due < today && project.status !== 'done',
      updatedAt: typeof updated === 'string' && updated ? updated : null,
    };
  });
}

export function filterRows(rows: PortfolioRow[], f: PortfolioFilters, today: string): PortfolioRow[] {
  const needle = tr(f.q.trim());
  const out = rows.filter((r) => {
    const p = r.project;
    const due = day(p.due_at);
    if (needle && !tr(`${p.name} ${r.brand ?? ''} ${p.type ?? ''}`).includes(needle)) return false;
    if (f.status && p.status !== f.status) return false;
    if (f.stage && p.flow_stage !== f.stage) return false;
    if (f.owner && (f.owner === UNASSIGNED ? !!r.owner : p.flow_owner !== f.owner)) return false;
    if (f.due === 'overdue' && !r.overdue) return false;
    if (f.due === 'unplanned' && due) return false;
    if (f.due === 'week' && !(due && due >= today && due <= addDays(today, 7))) return false;
    if (f.due === 'month' && !(due && due >= today && due <= addDays(today, 30))) return false;
    return true;
  });
  const cmpText = (a: string | null, b: string | null) => (a ?? '￿').localeCompare(b ?? '￿', 'tr');
  return out.sort((a, b) => {
    if (f.sort === 'name') return cmpText(a.project.name, b.project.name);
    if (f.sort === 'brand') return cmpText(a.brand, b.brand) || cmpText(a.project.name, b.project.name);
    if (f.sort === 'stage') return cmpText(a.project.flow_stage, b.project.flow_stage) || cmpText(a.project.name, b.project.name);
    // Teslim: tarihi olanlar önce (en yakın üstte), planlanmamışlar sonda.
    return cmpText(day(a.project.due_at), day(b.project.due_at)) || cmpText(a.project.name, b.project.name);
  });
}

export const activeFilterCount = (f: PortfolioFilters) => [f.q.trim(), f.status, f.stage, f.owner, f.due].filter(Boolean).length;

/** Süzgeç ↔ URL sorgusu (paylaşılabilir / yer imine eklenebilir görünüm). Varsayılanlar yazılmaz. */
export function filtersToQuery(f: PortfolioFilters, page: number): string {
  const q = new URLSearchParams();
  if (f.q.trim()) q.set('q', f.q.trim());
  if (f.status) q.set('status', f.status);
  if (f.stage) q.set('stage', f.stage);
  if (f.owner) q.set('owner', f.owner);
  if (f.due) q.set('due', f.due);
  if (f.sort !== 'due') q.set('sort', f.sort);
  if (page > 1) q.set('page', String(page));
  return q.toString();
}
export function filtersFromQuery(search: string, stages: readonly string[]): { filters: PortfolioFilters; page: number } {
  const q = new URLSearchParams(search);
  const pick = <T extends string>(v: string | null, allowed: readonly string[]): T | '' => (v && allowed.includes(v) ? (v as T) : '');
  const page = Number(q.get('page'));
  return {
    filters: {
      q: q.get('q') ?? '',
      status: pick<Project['status']>(q.get('status'), Object.keys(PROJECT_STATUS_LABELS)),
      stage: pick<TaskState>(q.get('stage'), stages),
      owner: q.get('owner') ?? '',
      due: pick<Exclude<DueFilter, ''>>(q.get('due'), Object.keys(DUE_FILTER_LABELS)),
      sort: pick<PortfolioSort>(q.get('sort'), Object.keys(SORT_LABELS)) || 'due',
    },
    page: Number.isInteger(page) && page > 1 ? page : 1,
  };
}
export const pageCount = (n: number) => Math.max(1, Math.ceil(n / PAGE_SIZE));
