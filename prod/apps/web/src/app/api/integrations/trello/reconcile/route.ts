import { timingSafeEqual } from 'node:crypto';
import { fail, json } from '@/lib/api';
import { authorizeIntegration, isResponse } from '@/lib/integrations/auth';
import { TrelloApiError } from '@/lib/integrations/trello';
import { reconcileTrello, type ReconcileSummary } from '@/lib/integrations/trello-reconcile';
import { createAdmin } from '@/lib/supabase/admin';

export const maxDuration = 300;
const eq = (a: string, b: string) => { const x = Buffer.from(a), y = Buffer.from(b); return x.length === y.length && timingSafeEqual(x, y); };

/**
 * Saatlik uzlaştırma (vercel.json cron, GET + `Authorization: Bearer <CRON_SECRET>`): Trello bağlı TÜM org'lar.
 * Elle: yönetici oturumu / servis rolü bearer'ı ile POST (yalnızca kendi org'u; Connect → "Şimdi eşitle").
 */
async function run(req: Request) {
  try {
    const bearer = req.headers.get('authorization')?.match(/^Bearer\s+(.+)$/i)?.[1]?.trim() ?? '';
    const cron = process.env.CRON_SECRET;
    if (cron && bearer && eq(bearer, cron)) {
      const admin = createAdmin();
      if (!admin) return json({ error: 'Supabase servis rolü tanımlı değil' }, 503);
      const { data, error } = await admin.from('integrations').select('org_id').eq('provider', 'trello');
      if (error) return json({ error: error.message }, 500);
      const results: ReconcileSummary[] = [];
      for (const r of (data ?? []) as Array<{ org_id: string }>) {
        try { results.push(await reconcileTrello(admin, r.org_id)); }
        catch (e) { results.push({ org_id: r.org_id, pulled: 0, pushed: 0, created_cards: 0, archived: 0, vanished: 0, skipped_conflicts: 0, errors: [e instanceof Error ? e.message : String(e)] }); }
      }
      return Response.json({ orgs: results.length, results }, { headers: { 'cache-control': 'no-store' } });
    }
    const a = await authorizeIntegration(req);
    if (isResponse(a)) return a;
    return Response.json(await reconcileTrello(a.admin, a.orgId), { headers: { 'cache-control': 'no-store' } });
  } catch (e) {
    if (e instanceof TrelloApiError) return json({ error: e.message }, 400);
    return fail(e);
  }
}
export const GET = run;
export const POST = run;
