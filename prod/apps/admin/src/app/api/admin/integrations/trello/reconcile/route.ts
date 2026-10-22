import { fail, json } from '@jscore/core/api';
import { TrelloApiError } from '@jscore/core/integrations/trello';
import { reconcileTrello } from '@jscore/core/integrations/trello-reconcile';
import { authorizeTrello } from '@/lib/trello-auth';
import { isResponse } from '@/lib/route';

export const maxDuration = 300;
/** Elle “Şimdi eşitle” (yalnızca bu org). Saatlik cron kullanıcı uygulamasında (apps/web) çalışır. */
export async function POST() {
  try {
    const a = await authorizeTrello('integration.trello.reconcile');
    if (isResponse(a)) return a;
    return Response.json(await reconcileTrello(a.admin, a.orgId), { headers: { 'cache-control': 'no-store' } });
  } catch (e) {
    if (e instanceof TrelloApiError) return json({ error: e.message }, 400);
    return fail(e);
  }
}
