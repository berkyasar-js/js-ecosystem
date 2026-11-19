import { fail, json } from '@jscore/core/api';
import { pushHubSpotNow } from '@jscore/core/integrations/hubspot-sync';
import { getRepo } from '@jscore/core/repo';
import { createAdmin } from '@jscore/core/supabase/admin';

/**
 * Satır içi (best-effort) JS → HubSpot itmesi: Supabase deposu müşteri/kişi/fırsat yazdıktan hemen sonra tarayıcıdan çağrılır.
 * Yetki: CRM yazabilen iç rol; kayıt oturumdaki org'a ait. HubSpot bağlı değil / mode ≠ two_way → `skipped`. Cron (/api/events/dispatch) aynı işi olaydan yineler; itme idempotent.
 */
const PUSH_ROLES = ['owner', 'org_admin', 'operations', 'account', 'pm', 'integration_admin'];
const ENTITIES = ['company', 'contact', 'deal'] as const;
export async function POST(req: Request) {
  try {
    const admin = createAdmin();
    if (!admin) return json({ ok: true, result: 'skipped' });
    const me = await (await getRepo()).me();
    if (!me) return json({ error: 'Oturum yok' }, 401);
    if (!PUSH_ROLES.includes(me.role)) return json({ ok: true, result: 'skipped' });
    const body = (await req.json().catch(() => null)) as { entity?: unknown; id?: unknown } | null;
    if (!body || typeof body.id !== 'string' || !ENTITIES.includes(body.entity as never)) return json({ error: 'entity (company|contact|deal) ve id gerekli' }, 400);
    return json({ ok: true, result: await pushHubSpotNow(admin, me.org_id, body.entity as (typeof ENTITIES)[number], body.id) });
  } catch (e) { return fail(e); }
}
