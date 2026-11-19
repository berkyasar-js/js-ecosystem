import { timingSafeEqual } from 'node:crypto';
import { fail, json } from '@jscore/core/api';
import { authorizeIntegration, isResponse } from '@jscore/core/integrations/auth';
import { syncGmail, type GmailSyncResult } from '@jscore/core/integrations/gmail';
import { GoogleApiError } from '@jscore/core/integrations/google-oauth';
import { createAdmin } from '@jscore/core/supabase/admin';

export const maxDuration = 120;
export const dynamic = 'force-dynamic';
const eq = (a: string, b: string) => { const x = Buffer.from(a), y = Buffer.from(b); return x.length === y.length && timingSafeEqual(x, y); };

/**
 * Gmail → CRM eşitlemesi (vercel.json cron 10 dk, GET + `Authorization: Bearer <CRON_SECRET>`): Google bağlı TÜM org'lar.
 * Elle: yönetici oturumu / servis rolü bearer'ı (+ x-jscore-org) ile POST (yalnızca kendi org'u).
 */
async function run(req: Request) {
  try {
    const bearer = req.headers.get('authorization')?.match(/^Bearer\s+(.+)$/i)?.[1]?.trim() ?? '';
    const cron = process.env.CRON_SECRET;
    if (cron && bearer && eq(bearer, cron)) {
      const admin = createAdmin();
      if (!admin) return json({ error: 'Supabase servis rolü tanımlı değil' }, 503);
      const { data, error } = await admin.from('integrations').select('org_id').eq('provider', 'google').eq('status', 'connected');
      if (error) return json({ error: error.message }, 500);
      const results: GmailSyncResult[] = [];
      for (const r of (data ?? []) as Array<{ org_id: string }>) {
        try { results.push(await syncGmail(admin, r.org_id)); }
        catch (e) { results.push({ org_id: r.org_id, mode: 'none', fetched: 0, messages: 0, threads: 0, matched: 0, history_id: null, errors: [e instanceof Error ? e.message : String(e)] }); }
      }
      return Response.json({ orgs: results.length, results }, { headers: { 'cache-control': 'no-store' } });
    }
    const a = await authorizeIntegration(req);
    if (isResponse(a)) return a;
    return Response.json(await syncGmail(a.admin, a.orgId), { headers: { 'cache-control': 'no-store' } });
  } catch (e) {
    if (e instanceof GoogleApiError) return json({ error: e.message }, 400);
    return fail(e);
  }
}
export const GET = run;
export const POST = run;
