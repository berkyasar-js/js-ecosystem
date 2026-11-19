import { fail } from '@jscore/core/api';
import { reconcileHubSpot } from '@jscore/core/integrations/hubspot-sync';
import { authorizeHubSpot, hubspotFail } from '@/lib/hubspot-auth';
import { isResponse } from '@/lib/route';

export const maxDuration = 300;
/** Elle “Şimdi eşitle” (yalnızca bu org). Saatlik cron kullanıcı uygulamasında (apps/web /api/integrations/hubspot/reconcile). */
export async function POST() {
  try {
    const a = await authorizeHubSpot('integration.hubspot.reconcile');
    if (isResponse(a)) return a;
    return Response.json(await reconcileHubSpot(a.admin, a.orgId), { headers: { 'cache-control': 'no-store' } });
  } catch (e) { return hubspotFail(e) ?? fail(e); }
}
