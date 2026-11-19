import { fail } from '@jscore/core/api';
import { loadHubSpotConfig, saveHubSpotConfig, testHubSpotConnection } from '@jscore/core/integrations/hubspot';
import { buildDefaultStageMap } from '@jscore/core/integrations/hubspot-map';
import { authorizeHubSpot, hubspotFail } from '@/lib/hubspot-auth';
import { isResponse } from '@/lib/route';

/** POST: "Bağlantıyı test et" — portal id, owner sayısı, pipeline'lar (config'e yazılır; eşlenmemiş aşamalar için varsayılan eşleme eklenir). */
export async function POST() {
  try {
    const a = await authorizeHubSpot('integration.hubspot.test');
    if (isResponse(a)) return a;
    const prev = await loadHubSpotConfig(a.admin, a.orgId);
    const test = await testHubSpotConnection(a.admin, a.orgId);
    await saveHubSpotConfig(a.admin, a.orgId, { stage_map: buildDefaultStageMap(test.pipelines, prev?.stage_map) });
    return Response.json(test, { headers: { 'cache-control': 'no-store' } });
  } catch (e) { return hubspotFail(e) ?? fail(e); }
}
