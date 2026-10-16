import { fail, json } from '@/lib/api';
import { authorizeIntegration, isResponse } from '@/lib/integrations/auth';
import { TrelloApiError, importFromTrello } from '@/lib/integrations/trello';

export const maxDuration = 300;

/** POST: tam içe aktarma (idempotent; tekrar çalıştırmak çift kayıt üretmez). Sayımları ve eşlenemeyen adları döner. */
export async function POST(req: Request) {
  try {
    const a = await authorizeIntegration(req);
    if (isResponse(a)) return a;
    return Response.json(await importFromTrello(a.admin, a.orgId), { headers: { 'cache-control': 'no-store' } });
  } catch (e) {
    if (e instanceof TrelloApiError) return json({ error: e.message }, e.status === 401 ? 400 : e.status >= 500 ? 502 : 400);
    return fail(e);
  }
}
