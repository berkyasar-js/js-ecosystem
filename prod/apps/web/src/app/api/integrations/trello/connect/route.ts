import { maskTrelloConfig, trelloConfigSchema } from '@jscore/contracts';
import { fail, json } from '@/lib/api';
import { authorizeIntegration, isResponse } from '@/lib/integrations/auth';
import { TrelloApiError, loadTrelloConfig, saveTrelloConfig, verifyCredentials } from '@/lib/integrations/trello';

/** POST { api_key, token } → /1/members/me ile doğrular, sunucuda (integrations.config) saklar; yalnızca maskeli görünüm döner. */
export async function POST(req: Request) {
  try {
    const a = await authorizeIntegration(req);
    if (isResponse(a)) return a;
    const body = trelloConfigSchema.pick({ api_key: true, token: true }).safeParse(await req.json().catch(() => null));
    if (!body.success) return json({ error: 'API Key ve Token gerekli' }, 400);
    let me;
    try { me = await verifyCredentials(body.data); }
    catch (e) { return json({ error: e instanceof TrelloApiError && e.status === 401 ? 'Trello anahtarı/token geçersiz' : 'Trello doğrulanamadı' }, 400); }
    const prev = await loadTrelloConfig(a.admin, a.orgId);
    // Aynı hesap/yeni token: pano seçimi ve eşlemeler korunur.
    const cfg = await saveTrelloConfig(a.admin, a.orgId, { ...body.data, member_name: me.fullName, board_ids: prev?.board_ids, member_map: prev?.member_map });
    return Response.json(maskTrelloConfig(cfg), { headers: { 'cache-control': 'no-store' } });
  } catch (e) { return fail(e); }
}
