import { describe, expect, it } from 'vitest';
import { TASK_STATES, type Milestone, type Project } from '@jscore/contracts';
import { EMPTY_FILTERS, UNASSIGNED, activeFilterCount, buildRows, filterRows, filtersFromQuery, filtersToQuery, pageCount } from '../portfolio';

const today = '2026-12-01';
const P = (id: string, o: Partial<Project> = {}): Project => ({
  id, org_id: 'o', brand_id: 'b1', name: `Proje ${id}`, type: 'kampanya', status: 'active', flow_stage: 'brief', flow_owner: '', stage_plan: [],
  due_at: null, budget_minor: 0, summary: '', client_visible: false, ...o,
});
const M = (id: string, project_id: string, due_at: string | null, status: Milestone['status'] = 'planned'): Milestone =>
  ({ id, org_id: 'o', created_at: today, project_id, name: `KT ${id}`, due_at, status });
const brands = [{ id: 'b1', name: 'Anova' }, { id: 'b2', name: 'Çelik' }];
const team = [{ id: 'e1', name: 'Öykü' }, { id: 'e2', name: 'Seda' }];
const projects = [
  P('a', { due_at: '2026-11-20T00:00:00Z', flow_owner: 'e1', stage_plan: [{ stage: 'brief', owner: 'e1', due_at: '', done: true }, { stage: 'plan', owner: 'e1', due_at: '', done: false }] }),
  P('b', { due_at: '2026-12-05', flow_owner: 'e2', brand_id: 'b2', flow_stage: 'production', budget_minor: 500000 }),
  P('c', { status: 'done', due_at: '2026-11-01', flow_owner: 'silinmis' }),
  P('d', { status: 'planning' }),
];
const rows = buildRows({ projects, brands, team, today, milestones: [M('1', 'a', '2026-12-10'), M('2', 'a', '2026-11-25'), M('3', 'a', '2026-11-10', 'done'), M('4', 'b', null)] });
const by = (id: string) => rows.find((r) => r.project.id === id)!;

describe('Proje portföyü — satır türetme (veri uydurmaz)', () => {
  it('gecikmiş yalnızca tarihi geçmiş ve bitmemiş projedir', () => {
    expect(by('a').overdue).toBe(true);
    expect(by('b').overdue).toBe(false);
    expect(by('c').overdue).toBe(false); // bitmiş
    expect(by('d').overdue).toBe(false); // tarih yok
  });
  it('eksik veri null kalır: sorumlu, plan, kilometre taşı, güncelleme', () => {
    expect(by('a').owner).toBe('Öykü');
    expect(by('c').owner).toBeNull(); // ekipte bulunamayan kimlik ad uydurmaz
    expect(by('d').owner).toBeNull();
    expect(by('a').plan).toEqual({ done: 1, total: 2 });
    expect(by('b').plan).toBeNull(); // boş plan → ilerleme yok (0% değil)
    expect(by('a').nextMilestone).toEqual({ name: 'KT 2', due_at: '2026-11-25', late: true }); // bitmemiş en yakın; biten atlanır
    expect(by('b').nextMilestone).toBeNull(); // tarihsiz kilometre taşı "sonraki" sayılmaz
    expect(by('a').updatedAt).toBeNull();
    expect(buildRows({ projects: [{ ...P('z'), updated_at: '2026-11-30T10:00:00Z' } as Project], brands, team, milestones: [], today })[0].updatedAt).toBe('2026-11-30T10:00:00Z');
  });
});

describe('Proje portföyü — süzme ve sıralama', () => {
  const ids = (f: Partial<typeof EMPTY_FILTERS>) => filterRows(rows, { ...EMPTY_FILTERS, ...f }, today).map((r) => r.project.id);
  it('varsayılan sıra: teslim tarihi, planlanmamışlar sonda', () => { expect(ids({})).toEqual(['c', 'a', 'b', 'd']); });
  it('arama ad + marka (tr küçük harf)', () => { expect(ids({ q: 'çelik' })).toEqual(['b']); expect(ids({ q: 'PROJE A' })).toEqual(['a']); });
  it('durum / aşama / sorumlu / teslim', () => {
    expect(ids({ status: 'planning' })).toEqual(['d']);
    expect(ids({ stage: 'production' })).toEqual(['b']);
    expect(ids({ owner: 'e1' })).toEqual(['a']);
    expect(ids({ owner: UNASSIGNED })).toEqual(['c', 'd']);
    expect(ids({ due: 'overdue' })).toEqual(['a']);
    expect(ids({ due: 'week' })).toEqual(['b']);
    expect(ids({ due: 'unplanned' })).toEqual(['d']);
  });
  it('sıralama seçenekleri', () => {
    expect(ids({ sort: 'name' })).toEqual(['a', 'b', 'c', 'd']);
    expect(ids({ sort: 'brand' })[3]).toBe('b');
  });
  it('etkin süzgeç sayısı sıralamayı saymaz', () => { expect(activeFilterCount({ ...EMPTY_FILTERS, sort: 'name' })).toBe(0); expect(activeFilterCount({ ...EMPTY_FILTERS, q: ' x ', due: 'overdue' })).toBe(2); });
});

describe('Proje portföyü — URL', () => {
  it('gidiş-dönüş; varsayılanlar yazılmaz; geçersiz değer atılır', () => {
    expect(filtersToQuery(EMPTY_FILTERS, 1)).toBe('');
    const f = { ...EMPTY_FILTERS, q: 'lansman', status: 'active' as const, stage: 'plan' as const, owner: 'e1', due: 'overdue' as const, sort: 'name' as const };
    const back = filtersFromQuery(`?${filtersToQuery(f, 3)}`, TASK_STATES);
    expect(back).toEqual({ filters: f, page: 3 });
    expect(filtersFromQuery('?status=hack&stage=yok&due=x&sort=y&page=-2&new=1', TASK_STATES)).toEqual({ filters: EMPTY_FILTERS, page: 1 });
  });
  it('sayfa sayısı', () => { expect(pageCount(0)).toBe(1); expect(pageCount(25)).toBe(1); expect(pageCount(26)).toBe(2); });
});
