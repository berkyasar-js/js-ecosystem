import { timingSafeEqual } from 'node:crypto';
import { fail, json } from '@/lib/api';
import { dispatchEvent, type AutomationEvent, type DispatchResult } from '@/lib/automations/dispatch';
import { supabasePorts } from '@/lib/automations/supabase-ports';
import { verifyHmac } from '@/lib/hmac';
import { createAdmin } from '@/lib/supabase/admin';

export const maxDuration = 60;
const BATCH = 100;

const eq = (a: string, b: string) => { const x = Buffer.from(a), y = Buffer.from(b); return x.length === y.length && timingSafeEqual(x, y); };

/**
 * core.events (public.events) satırlarından processed_at IS NULL olanları işler ve otomasyon kurallarını çalıştırır.
 * Yetki (herhangi biri):
 *  - POST: x-jscore-signature = HMAC-SHA256(ham gövde, JSCORE_WEBHOOK_SECRET)
 *  - POST/GET: Authorization: Bearer <SUPABASE_SERVICE_ROLE_KEY>
 *  - GET (Vercel Cron): Authorization: Bearer <CRON_SECRET>  — Vercel, CRON_SECRET tanımlıysa otomatik gönderir.
 */
async function run(req: Request, raw: string) {
  const bearer = req.headers.get('authorization')?.match(/^Bearer\s+(.+)$/i)?.[1]?.trim() ?? '';
  const secret = process.env.JSCORE_WEBHOOK_SECRET;
  const service = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const cron = process.env.CRON_SECRET;
  const authorized =
    (req.method === 'POST' && verifyHmac(raw, req.headers.get('x-jscore-signature'), secret)) ||
    (!!service && !!bearer && eq(bearer, service)) ||
    (!!cron && !!bearer && eq(bearer, cron));
  if (!authorized) return json({ error: 'Yetkisiz' }, 401);
  const admin = createAdmin();
  if (!admin) return json({ error: 'Supabase servis rolü tanımlı değil (demo modunda olaylar DemoRepo içinde anında işlenir)' }, 503);

  // Talep et: önce processed_at yazılır (aynı anda iki çağrı aynı olayı işlemez), sonra işlenir.
  const { data: pending, error: e1 } = await admin.from('events').select('id').is('processed_at', null).order('occurred_at').limit(BATCH);
  if (e1) return json({ error: e1.message }, 500);
  if (!pending?.length) return json({ processed: 0, fired: 0 });
  const { data: claimed, error: e2 } = await admin.from('events').update({ processed_at: new Date().toISOString() }).in('id', pending.map((p) => p.id)).is('processed_at', null).select('*');
  if (e2) return json({ error: e2.message }, 500);

  const ports = supabasePorts(admin, { webhookSecret: secret });
  const results: Array<DispatchResult & { event_id: string }> = [];
  let failed = 0;
  for (const row of (claimed ?? []) as Array<Record<string, unknown>>) {
    const ev: AutomationEvent = { id: row.id as string, org_id: row.org_id as string, type: row.type as string, aggregate: row.aggregate as string, aggregate_id: row.aggregate_id as string, payload: (row.payload ?? {}) as AutomationEvent['payload'] };
    try { for (const r of await dispatchEvent(ev, ports)) results.push({ ...r, event_id: ev.id as string }); }
    catch { failed++; /* olay işaretli kalır; hatalı kural günlüğe düşer, tek olay tüm partiyi durdurmaz */ }
  }
  return json({ processed: claimed?.length ?? 0, fired: results.length, errors: results.filter((r) => r.status === 'error').length, failed });
}

export async function POST(req: Request) { try { return await run(req, await req.text()); } catch (e) { return fail(e); } }
export async function GET(req: Request) { try { return await run(req, ''); } catch (e) { return fail(e); } }
