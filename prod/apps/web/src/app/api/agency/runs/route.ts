import { fail, json } from '@jscore/core/api';
import { getRepo } from '@jscore/core/repo';
import { createAdmin } from '@jscore/core/supabase/admin';
import { AGENCY_PREFIX, toAgencyRun, type AgencyRunView } from '@/lib/agency';
import { assertAgencyAccess } from '@/lib/agency/server';

export const dynamic = 'force-dynamic';

/**
 * Ofis etkinliği: kurumun son Agency çalıştırmaları. `agent_runs` okuması RLS'te owner/org_admin/auditor/operations ile sınırlı olduğundan
 * modüle erişimi olan diğer iç roller için satırlar servis rolüyle (yalnızca `agency:*`, yalnızca kendi org'u) okunur.
 * Demo'da sunucu durumsuzdur: `{ demo: true }` döner, istemci kendi deposunu okur.
 */
export async function GET() {
  try {
    const repo = await getRepo();
    const me = await assertAgencyAccess(repo, await repo.me());
    if (repo.mode === 'demo') return json({ demo: true, runs: [] });
    const admin = createAdmin();
    type Row = Parameters<typeof toAgencyRun>[0];
    let rows: Row[] = [];
    if (admin) {
      const { data, error } = await admin.from('agent_runs').select('id, agent, input, output, status, created_at, cost_usd')
        .eq('org_id', me.org_id).like('agent', `${AGENCY_PREFIX}%`).order('created_at', { ascending: false }).limit(200);
      if (error) throw new Error(error.message);
      rows = (data ?? []) as Row[];
    } else {
      rows = (await repo.listAgentRuns().catch(() => [])) as Row[];
    }
    const runs = rows.map(toAgencyRun).filter((r): r is AgencyRunView => !!r);
    return json({ demo: false, runs });
  } catch (e) { return fail(e); }
}
