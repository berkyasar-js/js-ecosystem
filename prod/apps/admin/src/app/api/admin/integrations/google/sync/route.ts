import { fail } from '@jscore/core/api';
import { syncGmail } from '@jscore/core/integrations/gmail';
import { authorizeGoogle, googleFail } from '@/lib/google-auth';
import { isResponse } from '@/lib/route';

export const dynamic = 'force-dynamic';
export const maxDuration = 120;
/** POST: Gmail → CRM eşitlemesini şimdi çalıştır (cron'u beklemeden). */
export async function POST() {
  try {
    const a = await authorizeGoogle('integration.google.sync');
    if (isResponse(a)) return a;
    return Response.json(await syncGmail(a.admin, a.orgId), { headers: { 'cache-control': 'no-store' } });
  } catch (e) { return googleFail(e) ?? fail(e); }
}
