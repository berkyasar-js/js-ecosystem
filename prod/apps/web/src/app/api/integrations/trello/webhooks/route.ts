import { fail, json } from '@/lib/api';
import { appOrigin, authorizeIntegration, isResponse } from '@/lib/integrations/auth';
import { TrelloApiError, registerWebhooks } from '@/lib/integrations/trello';

/** POST { board_ids?: string[] } → her pano için Trello webhook'u kaydeder (callbackURL = <origin>/api/webhooks/trello?org=…&k=…). Trello herkese açık HTTPS adres ister. */
export async function POST(req: Request) {
  try {
    const a = await authorizeIntegration(req);
    if (isResponse(a)) return a;
    const body = (await req.json().catch(() => ({}))) as { board_ids?: string[] };
    const origin = appOrigin(req);
    if (!/^https:\/\//.test(origin)) return json({ error: 'Trello webhook için herkese açık HTTPS adres gerekir (APP_URL tanımla)' }, 400);
    const r = await registerWebhooks(a.admin, a.orgId, origin, body.board_ids);
    return Response.json({ ok: r.errors.length === 0, count: Object.keys(r.webhook_ids).length, errors: r.errors }, { headers: { 'cache-control': 'no-store' } });
  } catch (e) {
    if (e instanceof TrelloApiError) return json({ error: e.message }, 400);
    return fail(e);
  }
}
