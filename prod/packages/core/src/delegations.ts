import { CAP_LABELS, delegationSchema, type Capability, type Delegation, type Me, type TeamMember } from '@jscore/contracts';
import { addDaysIso } from './token';
import { notify } from './notify';
import type { Repo } from './repo/types';

export type DelegationInput = Omit<Delegation, 'id' | 'org_id' | 'created_at' | 'status' | 'approval_id' | 'created_by'>;
/**
 * Delegasyon oluşturur (admin + Profil self-servis ortak). Repo `save` kuralı: owner dışındakiler için hassas yetkiler (approvals.decide, finance.*)
 * 'pending' kalır → owner onayı (action_type='access', subject.delegation_id) açılır; onaylanınca motor delegasyonu 'active' yapar.
 * Hedef kişiye bildirim yazılır.
 */
export async function requestDelegation(repo: Repo, me: Me, input: DelegationInput, team: TeamMember[]): Promise<{ delegation: Delegation; approvalId: string | null }> {
  const v = delegationSchema.parse({ ...input, status: 'active', created_by: me.id });
  const d = await repo.save('delegations', v);
  let approvalId: string | null = null;
  const from = team.find((t) => t.id === d.from_employee_id)?.name ?? d.from_employee_id;
  const to = team.find((t) => t.id === d.to_employee_id)?.name ?? d.to_employee_id;
  const capsText = d.caps.map((c) => (c === '*' ? 'tüm yetkiler' : CAP_LABELS[c as Capability] ?? c)).join(', ');
  if (d.status === 'pending') {
    const a = await repo.createApproval({ action_type: 'access', title: `Delegasyon: ${from} → ${to} (${capsText})`, required_role: 'owner', due_at: addDaysIso(new Date().toISOString(), 2), subject: { delegation_id: d.id, note: d.reason || undefined } });
    approvalId = a.id;
    await repo.save('delegations', { id: d.id, approval_id: a.id }).catch(() => undefined);
  }
  await notify(repo, { kind: 'delegation', employee_ids: [d.to_employee_id], except: me.employee_id ?? null, title: d.status === 'pending' ? `Delegasyon onay bekliyor: ${from} → sen` : `${from} sana yetki devretti`, body: `${capsText} · ${d.starts_at.slice(0, 10)} – ${d.ends_at.slice(0, 10)}${d.reason ? ` · ${d.reason}` : ''}`, href: '/app/profile', dedupe_key: `delegation:${d.id}` }).catch(() => undefined);
  return { delegation: approvalId ? { ...d, approval_id: approvalId } : d, approvalId };
}
export const revokeDelegation = (repo: Repo, id: string) => repo.save('delegations', { id, status: 'revoked' });
