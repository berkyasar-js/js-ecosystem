import { fail, json } from '@jscore/core/api';
import { authorizeTrello } from '@/lib/trello-auth';
import { isResponse } from '@/lib/route';
import { TrelloApiError, importFromTrello } from '@jscore/core/integrations/trello';

export const maxDuration = 300;

/** POST: tam içe aktarma (idempotent; tekrar çalıştırmak çift kayıt üretmez). Sayımları ve eşlenemeyen adları döner. */
export async function POST() {
  try {
    const a = await authorizeTrello('integration.trello.import');
    if (isResponse(a)) return a;
    return Response.json(await importFromTrello(a.admin, a.orgId), { headers: { 'cache-control': 'no-store' } });
  } catch (e) {
    if (e instanceof TrelloApiError) return json({ error: e.message }, e.status === 401 ? 400 : e.status >= 500 ? 502 : 400);
    return fail(e);
  }
}
