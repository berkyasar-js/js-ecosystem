import type { SupabaseClient } from '@supabase/supabase-js';
import { applyEscalation, escalationsDue, stepRecipients, type Approval, type ApprovalPolicy, type ApprovalStep, type TeamMember } from '@jscore/contracts';

type Row = Record<string, unknown>;
const flat = <T,>(r: Row): T => { const { data, ...rest } = r; return { ...rest, ...((data as Row | null) ?? {}) } as T; };
export interface EscalationResult { checked: number; escalated: number; notified: number; errors: string[] }

/**
 * SLA aşımı yükseltmesi (cron: /api/events/dispatch, servis rolü). Bekleyen onayların mevcut adımı `due_at + after_hours` geçmişse
 * adım politikanın hedefine (rol/kişi) yükseltilir, hedefe bildirim yazılır, denetim kaydı düşülür. Saf hesap `escalationsDue` (contracts).
 */
export async function runEscalations(sb: SupabaseClient, now = new Date().toISOString()): Promise<EscalationResult> {
  const res: EscalationResult = { checked: 0, escalated: 0, notified: 0, errors: [] };
  const ok = async <T,>(p: PromiseLike<{ data: T | null; error: { message: string } | null }>) => { const { data, error } = await p; if (error) throw new Error(error.message); return data as T; };
  const approvals = await ok<Row[]>(sb.from('approvals').select('id,org_id,title,status,policy_id,requested_by').eq('status', 'pending').limit(500));
  res.checked = approvals.length;
  if (!approvals.length) return res;
  const ids = approvals.map((a) => a.id as string);
  const steps = (await ok<Row[]>(sb.from('approval_steps').select('*').in('approval_id', ids).eq('status', 'pending'))).map((r) => flat<ApprovalStep>(r));
  const orgIds = [...new Set(approvals.map((a) => a.org_id as string))];
  const policies = (await ok<Row[]>(sb.from('approval_policies').select('*').in('org_id', orgIds))).map((r) => flat<ApprovalPolicy>(r));
  const due = escalationsDue(approvals as unknown as Array<Pick<Approval, 'id' | 'status' | 'policy_id'>>, steps, policies, now);
  if (!due.length) return res;
  const team = (await ok<Row[]>(sb.from('employees').select('id,org_id,app_role,status,name').in('org_id', orgIds))) as unknown as Array<TeamMember & { org_id: string }>;
  for (const e of due) {
    const a = approvals.find((x) => x.id === e.approval_id)!;
    try {
      const next = applyEscalation(e.step, e, now);
      const { id, org_id: _o, created_at: _c, approval_id, step_index, approver_role, status, decided_by, decided_at, note, due_at, ...data } = next; void _o; void _c;
      await ok(sb.from('approval_steps').update({ approval_id, step_index, approver_role, status, decided_by, decided_at, note, due_at, data }).eq('id', id).select('id'));
      res.escalated++;
      const orgTeam = team.filter((t) => t.org_id === a.org_id);
      const targets = stepRecipients({ approver_role: null, approvers: [], escalated_to: next.escalated_to }, orgTeam);
      if (targets.length) {
        await ok(sb.from('notifications').insert(targets.map((emp) => ({ org_id: a.org_id, data: { employee_id: emp, kind: 'approval', title: `SLA aşıldı, sana yükseltildi: ${a.title}`, body: `Adım ${next.step_index + 1} süresinde karara bağlanmadı.`, read: false, href: '/app/approvals' } }))).select('id'));
        res.notified += targets.length;
      }
      await sb.from('audit_events').insert({ org_id: a.org_id, actor: null, action: 'approval.escalated', resource: `approvals/${a.id}`, meta: { step: next.step_index, to: next.escalated_to } });
    } catch (err) { res.errors.push(`${a.id}: ${err instanceof Error ? err.message : 'hata'}`); }
  }
  return res;
}
