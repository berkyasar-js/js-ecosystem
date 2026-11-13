import { describe, expect, it } from 'vitest';
import { buildOrgTree, groupByTeam, subtreeIds } from '../org-tree';

const P = [
  { id: 'BY', name: 'Batuhan', manager_id: null, team: 'Yönetim' }, { id: 'UC', name: 'Ural', manager_id: 'BY', team: 'Kreatif' },
  { id: 'SK', name: 'Seda', manager_id: 'UC', team: 'Kreatif' }, { id: 'OE', name: 'Öykü', manager_id: 'BY', team: 'Hesap' },
  { id: 'X1', name: 'Döngü A', manager_id: 'X2' }, { id: 'X2', name: 'Döngü B', manager_id: 'X1' }, { id: 'Z', name: 'Yetim', manager_id: 'YOK' },
];
describe('org ağacı', () => {
  it('kökler, çocuklar, döngü ve eksik yönetici', () => {
    const t = buildOrgTree(P);
    const names = t.map((n) => n.name);
    expect(names).toContain('Batuhan'); expect(names).toContain('Yetim');
    const by = t.find((n) => n.id === 'BY')!;
    expect(by.children.map((c) => c.id)).toEqual(['OE', 'UC']);
    expect(by.children.find((c) => c.id === 'UC')!.children[0].depth).toBe(2);
    expect(t.filter((n) => n.id.startsWith('X'))).toHaveLength(1);
    expect(t.flatMap((n) => [n.id, ...n.children.flatMap((c) => [c.id, ...c.children.map((x) => x.id)])]).sort()).toEqual(['BY', 'OE', 'SK', 'UC', 'X1', 'X2', 'Z'].sort());
  });
  it('alt ağaç ve ekip gruplama', () => {
    expect(Array.from(subtreeIds(P, 'UC')).sort()).toEqual(['SK', 'UC']);
    expect(Array.from(subtreeIds(P, 'BY')).sort()).toEqual(['BY', 'OE', 'SK', 'UC']);
    const g = groupByTeam(P);
    expect(g[0][0]).toBe('Hesap'); expect(g[g.length - 1][0]).toBe('Ekipsiz'); expect(g[g.length - 1][1]).toHaveLength(3);
  });
});
