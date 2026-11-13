/** Çalışan hiyerarşisi (employees.manager_id) → ağaç. Saf; döngü ve eksik yönetici güvenli (kök sayılır). */
export interface OrgNodeInput { id: string; name: string; role_title?: string | null; team?: string | null; manager_id?: string | null; status?: string }
export interface OrgNode extends OrgNodeInput { children: OrgNode[]; depth: number }

export function buildOrgTree(people: OrgNodeInput[]): OrgNode[] {
  const ids = new Set(people.map((p) => p.id));
  const byMgr = new Map<string | null, OrgNodeInput[]>();
  for (const p of people) {
    const m = p.manager_id && ids.has(p.manager_id) && p.manager_id !== p.id ? p.manager_id : null;
    byMgr.set(m, [...(byMgr.get(m) ?? []), p]);
  }
  const seen = new Set<string>();
  const build = (p: OrgNodeInput, depth: number): OrgNode => {
    seen.add(p.id);
    const kids = (byMgr.get(p.id) ?? []).filter((c) => !seen.has(c.id)).sort((a, b) => a.name.localeCompare(b.name, 'tr'));
    return { ...p, depth, children: kids.map((c) => build(c, depth + 1)) };
  };
  const roots = (byMgr.get(null) ?? []).sort((a, b) => a.name.localeCompare(b.name, 'tr')).map((r) => build(r, 0));
  // Döngüye hapsolmuş (hiç köke bağlanmayan) kişiler ayrıca kök olur.
  for (const p of people) if (!seen.has(p.id)) roots.push(build(p, 0));
  return roots;
}
/** Bir kişinin altındakiler (kendisi dahil) — yönetici seçiminde döngü önlemek için. */
export function subtreeIds(people: OrgNodeInput[], rootId: string): Set<string> {
  const out = new Set<string>([rootId]);
  let grew = true;
  while (grew) { grew = false; for (const p of people) if (p.manager_id && out.has(p.manager_id) && !out.has(p.id)) { out.add(p.id); grew = true; } }
  return out;
}
/** Ekip adına göre gruplar (ekipsizler 'Ekipsiz'). */
export const groupByTeam = <T extends { team?: string | null }>(people: T[]): Array<[string, T[]]> => {
  const m = new Map<string, T[]>();
  for (const p of people) { const k = p.team?.trim() || 'Ekipsiz'; m.set(k, [...(m.get(k) ?? []), p]); }
  return Array.from(m.entries()).sort((a, b) => (a[0] === 'Ekipsiz' ? 1 : b[0] === 'Ekipsiz' ? -1 : a[0].localeCompare(b[0], 'tr')));
};
