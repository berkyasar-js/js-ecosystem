import type { Role } from './roles';

/**
 * Agency OS erişim katmanları (4 katman) — mevcut 14 rolün ve org ağacının ÜSTÜNDE bir okuma katmanıdır; rolleri değiştirmez, RLS'i gevşetmez.
 *  1. super_admin      Ajans sahibi: owner / org_admin
 *  2. department_lead  Ekip lideri: org ağacında kendisine bağlı aktif çalışanı olan iç kullanıcı (employees.manager_id)
 *  3. member           Ekip üyesi: diğer iç roller
 *  4. agent            AI çalışan: kullanıcı değildir; sahibinin kapsamını miras alır (bkz. agentScope)
 * Müşteri / freelancer / denetçi rolleri `external`'dır: ajan filosu ve ekip denetimi dışında kalır.
 */
export const ACCESS_TIERS = ['super_admin', 'department_lead', 'member', 'external'] as const;
export type AccessTier = (typeof ACCESS_TIERS)[number];
export const ACCESS_TIER_LABELS: Record<AccessTier | 'agent', string> = {
  super_admin: 'Ajans Sahibi', department_lead: 'Ekip Lideri', member: 'Ekip Üyesi', external: 'Dış kullanıcı', agent: 'AI Çalışan',
};
const EXTERNAL_ROLES: Role[] = ['client_admin', 'client_viewer', 'freelancer', 'auditor'];

export interface TierPerson { id: string; status?: 'active' | 'left'; manager_id?: string | null; team?: string | null }
export interface TierActor { role: Role; employee_id?: string | null }

/** `leadId`'ye doğrudan ya da dolaylı bağlı aktif çalışanlar (döngü korumalı). */
export function reportsOf(leadId: string, team: TierPerson[]): string[] {
  const out: string[] = [];
  const seen = new Set<string>([leadId]);
  let frontier = [leadId];
  while (frontier.length) {
    const next = team.filter((e) => e.status !== 'left' && !!e.manager_id && frontier.includes(e.manager_id) && !seen.has(e.id)).map((e) => e.id);
    next.forEach((id) => seen.add(id));
    out.push(...next);
    frontier = next;
  }
  return out;
}

export function accessTier(actor: TierActor, team: TierPerson[]): AccessTier {
  if (actor.role === 'owner' || actor.role === 'org_admin') return 'super_admin';
  if (EXTERNAL_ROLES.includes(actor.role)) return 'external';
  return actor.employee_id && reportsOf(actor.employee_id, team).length > 0 ? 'department_lead' : 'member';
}

/** Kişinin departmanı (employees.team); yoksa null. */
export const departmentOf = (employeeId: string | null | undefined, team: TierPerson[]): string | null =>
  (employeeId ? team.find((e) => e.id === employeeId)?.team : null) ?? null;

/**
 * `actor`, `targetEmployeeId` kişisinin ajanlarını / çıktılarını denetleyebilir mi?
 * Ajans sahibi: herkes · Ekip lideri: kendisi + kendisine bağlı zincir · Ekip üyesi: yalnızca kendisi · Dış kullanıcı: hiç kimse.
 */
export function supervises(actor: TierActor, targetEmployeeId: string, team: TierPerson[]): boolean {
  const tier = accessTier(actor, team);
  if (tier === 'super_admin') return true;
  if (tier === 'external' || !actor.employee_id) return false;
  if (actor.employee_id === targetEmployeeId) return true;
  return tier === 'department_lead' && reportsOf(actor.employee_id, team).includes(targetEmployeeId);
}

/** `actor`'ın denetleyebildiği çalışan kimlikleri (ajan filosu / ekip görünümü süzgeci). */
export function supervisedEmployees(actor: TierActor, team: TierPerson[]): string[] {
  return team.filter((e) => e.status !== 'left' && supervises(actor, e.id, team)).map((e) => e.id);
}

/**
 * AI çalışanın kapsamı: sahibinin kapsamından geniş olamaz. `requested` verilirse sahibin markalarıyla kesişimi alınır
 * (sahip tüm markaları görüyorsa — `ownerBrandIds` boş — istenen aynen kalır).
 */
export function agentScope(ownerBrandIds: string[], requested?: string[] | null): string[] {
  if (!requested || requested.length === 0) return [...ownerBrandIds];
  return ownerBrandIds.length === 0 ? [...requested] : requested.filter((b) => ownerBrandIds.includes(b));
}
