import { fail } from '@jscore/core/api';
import { importFromHubSpot } from '@jscore/core/integrations/hubspot-sync';
import { authorizeHubSpot, hubspotFail } from '@/lib/hubspot-auth';
import { isResponse } from '@/lib/route';

export const maxDuration = 300;
/** POST: tam içe aktarma (idempotent; source_ref + integration_links ile çift kayıt üretmez). */
export async function POST() {
  try {
    const a = await authorizeHubSpot('integration.hubspot.import');
    if (isResponse(a)) return a;
    return Response.json(await importFromHubSpot(a.admin, a.orgId), { headers: { 'cache-control': 'no-store' } });
  } catch (e) { return hubspotFail(e) ?? fail(e); }
}
