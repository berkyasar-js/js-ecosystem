import { timingSafeEqual } from 'node:crypto';
import type { HubSpotReconcileSummary } from '@jscore/contracts';
import { fail, json } from '@jscore/core/api';
import { authorizeIntegration, isResponse } from '@jscore/core/integrations/auth';
import { HubSpotApiError } from '@jscore/core/integrations/hubspot';
import { reconcileHubSpot } from '@jscore/core/integrations/hubspot-sync';
import { createAdmin } from '@jscore/core/supabase/admin';

export const maxDuration = 300;
const eq = (a: string, b: string) => { const x = Buffer.from(a), y = Buffer.from(b); return x.length === y.length && timingSafeEqual(x, y); };

/**
 * Saatlik HubSpot uzlaştırması (vercel.json cron, GET + `Authorization: Bearer <CRON_SECRET>`): HubSpot bağlı TÜM org'lar.
 * Elle: yönetici oturumu / servis rolü bearer'ı ile POST (yalnızca kendi org'u).
 */
async function run(req: Request) {
  try {
    const bearer = req.headers.get('authorization')?.match(/^Bearer\s+(.+)$/i)?.[1]?.trim() ?? '';
    const cron = process.env.CRON_SECRET;
    if (cron && bearer && eq(bearer, cron)) {
      const admin = createAdmin();
      if (!admin) return json({ error: 'Supabase servis rolü tanımlı değil' }, 503);
      const { data, error } = await admin.from('integrations').select('org_id').eq('provider', 'hubspot').eq('status', 'connected');
      if (error) return json({ error: error.message }, 500);
      const results: HubSpotReconcileSummary[] = [];
      for (const r of (data ?? []) as Array<{ org_id: string }>) {
        try { results.push(await reconcileHubSpot(admin, r.org_id)); }
        catch (e) { results.push({ org_id: r.org_id, pulled: 0, pushed: 0, created_remote: 0, skipped_conflicts: 0, errors: [e instanceof Error ? e.message : String(e)] }); }
      }
      return Response.json({ orgs: results.length, results }, { headers: { 'cache-control': 'no-store' } });
    }
    const a = await authorizeIntegration(req);
    if (isResponse(a)) return a;
    return Response.json(await reconcileHubSpot(a.admin, a.orgId), { headers: { 'cache-control': 'no-store' } });
  } catch (e) {
    if (e instanceof HubSpotApiError) return json({ error: e.message }, 400);
    return fail(e);
  }
}
export const GET = run;
export const POST = run;
