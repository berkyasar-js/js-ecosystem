import { maskGoogleConfig } from '@jscore/contracts';
import { fail, json } from '@jscore/core/api';
import { loadGoogleLog } from '@jscore/core/integrations/gmail';
import { clearGoogleOrg, googleReady, loadGoogleOrgConfig, saveGoogleOrgConfig } from '@jscore/core/integrations/google-oauth';
import { authorizeGoogle, googleFail } from '@/lib/google-auth';
import { isResponse } from '@/lib/route';

export const dynamic = 'force-dynamic';
const res = (data: unknown, status = 200) => Response.json(data, { status, headers: { 'cache-control': 'no-store' } });

/** GET: maskeli durum (token ASLA dönmez) + senkron günlüğü (son 30) + env/şifre anahtarı hazırlığı. */
export async function GET() {
  try {
    const a = await authorizeGoogle();
    if (isResponse(a)) return a;
    const cfg = await loadGoogleOrgConfig(a.admin, a.orgId);
    const r = googleReady();
    return res({ ...maskGoogleConfig(cfg, { envReady: r.env_ready, encReady: r.enc_ready }), sync_log: await loadGoogleLog(a.admin, a.orgId, 30) });
  } catch (e) { return googleFail(e) ?? fail(e); }
}
/** PUT { display_name?, calendar_id? } */
export async function PUT(req: Request) {
  try {
    const a = await authorizeGoogle('integration.google.update');
    if (isResponse(a)) return a;
    const body = (await req.json().catch(() => null)) as { display_name?: unknown; calendar_id?: unknown } | null;
    if (!body) return json({ error: 'JSON bekleniyor' }, 400);
    const cfg = await loadGoogleOrgConfig(a.admin, a.orgId);
    if (!cfg) return json({ error: 'Google posta kutusu bağlı değil' }, 400);
    const patch: Record<string, string> = {};
    if (typeof body.display_name === 'string' && body.display_name.trim()) patch.display_name = body.display_name.trim().slice(0, 80);
    if (typeof body.calendar_id === 'string' && body.calendar_id.trim()) patch.calendar_id = body.calendar_id.trim().slice(0, 200);
    const saved = await saveGoogleOrgConfig(a.admin, a.orgId, patch);
    const r = googleReady();
    return res(maskGoogleConfig(saved, { envReady: r.env_ready, encReady: r.enc_ready }));
  } catch (e) { return googleFail(e) ?? fail(e); }
}
/** DELETE: refresh token iptal edilir (Google), config temizlenir; gelen kutusu verileri (mail_threads) korunur. */
export async function DELETE() {
  try {
    const a = await authorizeGoogle('integration.google.disconnect');
    if (isResponse(a)) return a;
    await clearGoogleOrg(a.admin, a.orgId);
    const r = googleReady();
    return res(maskGoogleConfig(null, { envReady: r.env_ready, encReady: r.enc_ready }));
  } catch (e) { return googleFail(e) ?? fail(e); }
}
