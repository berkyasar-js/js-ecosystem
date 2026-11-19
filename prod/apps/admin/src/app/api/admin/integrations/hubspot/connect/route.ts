import { hubspotConfigSchema, maskHubSpotConfig } from '@jscore/contracts';
import { fail, json } from '@jscore/core/api';
import { loadHubSpotConfig, saveHubSpotConfig, testHubSpotConnection } from '@jscore/core/integrations/hubspot';
import { buildDefaultStageMap } from '@jscore/core/integrations/hubspot-map';
import { authorizeHubSpot, hubspotFail } from '@/lib/hubspot-auth';
import { isResponse } from '@/lib/route';

/** POST { token } → token kaydedilir, /account-info ile doğrulanır (portal id, owner sayısı, pipeline'lar); varsayılan aşama eşlemesi kurulur. Yalnızca maskeli görünüm döner. */
export async function POST(req: Request) {
  try {
    const a = await authorizeHubSpot('integration.hubspot.connect');
    if (isResponse(a)) return a;
    const body = hubspotConfigSchema.pick({ token: true }).safeParse(await req.json().catch(() => null));
    if (!body.success) return json({ error: 'Token gerekli (en az 20 karakter)' }, 400);
    const prev = await loadHubSpotConfig(a.admin, a.orgId);
    await saveHubSpotConfig(a.admin, a.orgId, { token: body.data.token, connected_at: prev?.connected_at ?? new Date().toISOString(), mode: prev?.mode ?? 'pull_only' });
    let test;
    try { test = await testHubSpotConnection(a.admin, a.orgId); }
    catch (e) { await saveHubSpotConfig(a.admin, a.orgId, {}, 'error'); return hubspotFail(e) ?? fail(e); }
    const cfg = await saveHubSpotConfig(a.admin, a.orgId, { stage_map: buildDefaultStageMap(test.pipelines, prev?.stage_map) });
    return Response.json({ ...maskHubSpotConfig(cfg), test }, { headers: { 'cache-control': 'no-store' } });
  } catch (e) { return fail(e); }
}
