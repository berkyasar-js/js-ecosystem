import type { SupabaseClient } from '@supabase/supabase-js';
import { PERSONAL_AGENT_PREFIX, agentDigestLines, localParts, type AgentDigestInput } from '@jscore/contracts';
import { notify } from './index';

type Row = Record<string, unknown>;
/**
 * Günlük ajan özeti (servis rolü; cron `/api/jobs/notify`): kurumun yerel saatiyle 09:00'dan sonra günde bir kez,
 * kişisel ajanı olan her ekip üyesine dünkü çalıştırmalar + talimat güncellemeleri (en çok 3 madde) uygulama içi bildirim olarak gider.
 * Dün hiçbir şey olmadıysa ve bekleyen taslak yoksa bildirim gönderilmez. Tekilleştirme: `agent_digest:<tarih>` (24 sa).
 */
export async function runAgentDigest(sb: SupabaseClient, deps: { now?: () => string; force?: boolean } = {}): Promise<{ orgs: number; notified: number; errors: string[] }> {
  const nowIso = (deps.now ?? (() => new Date().toISOString()))();
  const rep = { orgs: 0, notified: 0, errors: [] as string[] };
  const ok = async <T,>(p: PromiseLike<{ data: T | null; error: { message: string } | null }>) => { const { data, error } = await p; if (error) throw new Error(error.message); return (data ?? []) as T; };
  const orgs = await ok<Array<{ id: string; settings: Row | null }>>(sb.from('organizations').select('id,settings'));
  for (const org of orgs) {
    try {
      const tz = ((org.settings?.general as Row | undefined)?.timezone as string | undefined) ?? 'Europe/Istanbul';
      const lp = localParts(nowIso, tz);
      if (!deps.force && lp.minutes < 9 * 60) continue;
      const agents = await ok<Row[]>(sb.from('personal_agents').select('id,owner_employee_id,status,data').eq('org_id', org.id).neq('status', 'archived'));
      if (!agents.length) continue;
      rep.orgs += 1;
      const since = new Date(new Date(nowIso).getTime() - 24 * 3600 * 1000).toISOString();
      const [runs, versions] = await Promise.all([
        ok<Row[]>(sb.from('agent_runs').select('agent,status,created_at').eq('org_id', org.id).like('agent', `${PERSONAL_AGENT_PREFIX}%`).gte('created_at', since).limit(5000)),
        ok<Row[]>(sb.from('agent_versions').select('agent_id,status,author,decided_at').eq('org_id', org.id)),
      ]);
      const byOwner = new Map<string, AgentDigestInput[]>();
      for (const a of agents) {
        const id = a.id as string;
        const mine = versions.filter((v) => v.agent_id === id);
        const pending = mine.filter((v) => v.status === 'draft');
        const item: AgentDigestInput = {
          agentName: ((a.data as Row | null)?.name as string | undefined) ?? 'Ajan',
          runs: runs.filter((r) => r.agent === `${PERSONAL_AGENT_PREFIX}${id}` && r.status !== 'error').length,
          approved: mine.filter((v) => v.status === 'active' && typeof v.decided_at === 'string' && v.decided_at >= since).length,
          pending: pending.length, proposedByAgent: pending.filter((v) => v.author === 'agent').length,
        };
        const owner = a.owner_employee_id as string;
        byOwner.set(owner, [...(byOwner.get(owner) ?? []), item]);
      }
      for (const [owner, items] of byOwner) {
        const lines = agentDigestLines(items);
        if (!lines.length) continue;
        const r = await notify(sb, { org_id: org.id, kind: 'system', employee_ids: [owner], title: `Ajan özeti · ${lp.date}`, body: lines.join(' '), href: '/app/agents', dedupe_key: `agent_digest:${lp.date}` });
        rep.notified += r.inserted;
      }
    } catch (e) { rep.errors.push(`${org.id}: ${e instanceof Error ? e.message : 'hata'}`); }
  }
  return rep;
}
