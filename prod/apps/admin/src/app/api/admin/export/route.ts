import { audit, adminRoute, requireService, isResponse, noStore } from '@/lib/route';

export const dynamic = 'force-dynamic';
export const maxDuration = 120;

/** Organizasyon verisi JSON dökümü. Sırlar (entegrasyon config'i, token özetleri), maaş ve özlük arşivi DIŞARIDA bırakılır. */
const TABLES: Array<[string, string]> = [
  ['organizations', 'id,name,slug,settings,created_at'], ['memberships', 'user_id,org_id,role,scopes,status,created_at'],
  ['employees', 'id,org_id,code,name,role_title,app_role,status,weekly_hours,auth_user_id'], ['clients', '*'], ['brands', '*'], ['projects', '*'], ['tasks', '*'],
  ['task_types', '*'], ['approvals', '*'], ['agent_prompts', 'id,org_id,agent,version,model,is_active,created_at'], ['agent_runs', 'id,org_id,agent,trigger,model,tokens_in,tokens_out,cost_usd,status,created_at'],
  ['board_decisions', '*'], ['integrations', 'id,org_id,provider,name,status,scopes'], ['access_tokens', 'id,org_id,name,token_prefix,scopes,created_at,expires_at,revoked_at'],
];
export const GET = adminRoute(async (ctx) => {
  const sb = requireService(ctx); if (isResponse(sb)) return sb;
  const out: Record<string, unknown> = { exported_at: new Date().toISOString(), org_id: ctx.orgId, excluded: ['integrations.config', 'access_tokens.token_hash', 'employees.salary_minor', 'employees.hr_archive'] };
  for (const [t, cols] of TABLES) {
    const q = sb.from(t).select(cols).limit(50_000);
    const { data, error } = await (t === 'organizations' ? q.eq('id', ctx.orgId) : q.eq('org_id', ctx.orgId));
    out[t] = error ? { error: error.message } : data;
  }
  await audit(ctx, 'org.export', `organizations/${ctx.orgId}`, { tables: TABLES.map(([t]) => t) });
  return new Response(JSON.stringify(out, null, 2), { headers: { ...noStore, 'content-type': 'application/json; charset=utf-8', 'content-disposition': `attachment; filename="jscore-export-${new Date().toISOString().slice(0, 10)}.json"` } });
});
