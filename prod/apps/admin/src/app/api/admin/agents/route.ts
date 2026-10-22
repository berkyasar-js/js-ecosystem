import { capStatus } from '@jscore/core/agents/cap';
import { adminRoute, ok, requireService, isResponse } from '@/lib/route';
import { readSettings } from '@/lib/settings';

export const dynamic = 'force-dynamic';

/** Ajanlar & maliyet: tüm prompt sürümleri (org + global), son 100 çalıştırma, ay içi harcama. */
export const GET = adminRoute(async (ctx) => {
  const sb = requireService(ctx); if (isResponse(sb)) return sb;
  const month = new Date().toISOString().slice(0, 7);
  const [prompts, runs, spendRows, s] = await Promise.all([
    sb.from('agent_prompts').select('id,org_id,agent,version,model,is_active,created_at').or(`org_id.eq.${ctx.orgId},org_id.is.null`).order('agent').order('version', { ascending: false }),
    sb.from('agent_runs').select('id,agent,trigger,model,tokens_in,tokens_out,cost_usd,latency_ms,status,created_at').eq('org_id', ctx.orgId).order('created_at', { ascending: false }).limit(100),
    sb.from('agent_runs').select('cost_usd').eq('org_id', ctx.orgId).gte('created_at', `${month}-01`),
    readSettings(sb, ctx.orgId),
  ]);
  if (prompts.error) throw new Error(prompts.error.message);
  const spent = (spendRows.data ?? []).reduce((a, r) => a + Number(r.cost_usd), 0);
  return ok({ prompts: prompts.data ?? [], runs: runs.data ?? [], cap: capStatus(spent, s.settings.ai), ai: s.settings.ai });
});
