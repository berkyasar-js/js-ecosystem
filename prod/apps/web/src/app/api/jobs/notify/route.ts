import { timingSafeEqual } from 'node:crypto';
import { fail, json } from '@jscore/core/api';
import { verifyHmac } from '@jscore/core/hmac';
import { createAdmin } from '@jscore/core/supabase/admin';
import { runNotifyJobs, type NotifyJob } from '@jscore/core/notify/jobs';
import { runAgentDigest } from '@jscore/core/notify/agent-digest';

export const maxDuration = 60;
export const dynamic = 'force-dynamic';
const eq = (a: string, b: string) => { const x = Buffer.from(a), y = Buffer.from(b); return x.length === y.length && timingSafeEqual(x, y); };
const JOBS: NotifyJob[] = ['instant', 'due', 'trello', 'digest'];

/**
 * Bildirim işleri (cron, 5 dk): anlık e-posta, bugün biten / geciken görev bildirimleri, Trello kaynaklı değişiklikler, günlük (08:30 org saati) / haftalık (Pazartesi) özet.
 * Yetki: GET/POST `Authorization: Bearer <CRON_SECRET>` (Vercel Cron otomatik gönderir) ya da `Bearer <SUPABASE_SERVICE_ROLE_KEY>`; POST ayrıca `x-jscore-signature` (HMAC, JSCORE_WEBHOOK_SECRET).
 * Sorgu: `?job=digest,instant` (varsayılan hepsi), `?force=1` (özet penceresini / günlük tarama saatini yok sayar — test için).
 */
async function run(req: Request, raw: string) {
  const bearer = req.headers.get('authorization')?.match(/^Bearer\s+(.+)$/i)?.[1]?.trim() ?? '';
  const service = process.env.SUPABASE_SERVICE_ROLE_KEY; const cron = process.env.CRON_SECRET; const secret = process.env.JSCORE_WEBHOOK_SECRET;
  const authorized = (req.method === 'POST' && verifyHmac(raw, req.headers.get('x-jscore-signature'), secret)) || (!!service && !!bearer && eq(bearer, service)) || (!!cron && !!bearer && eq(bearer, cron));
  if (!authorized) return json({ error: 'Yetkisiz' }, 401);
  const admin = createAdmin();
  if (!admin) return json({ error: 'Supabase servis rolü tanımlı değil (demo modunda e-posta işi yok)' }, 503);
  const url = new URL(req.url);
  const only = (url.searchParams.get('job') ?? '').split(',').map((s) => s.trim()).filter((s): s is NotifyJob => (JOBS as string[]).includes(s));
  const report = await runNotifyJobs(admin, { only: only.length ? only : undefined, force: url.searchParams.get('force') === '1' });
  // 0022: günlük ajan özeti (yerel 09:00 sonrası, kişi başına günde bir). Tablo henüz yoksa (migration uygulanmadıysa) hata raporlanır, diğer işler etkilenmez.
  const agents = !only.length || url.searchParams.get('job') === 'agents' ? await runAgentDigest(admin, { force: url.searchParams.get('force') === '1' }).catch((e: unknown) => ({ orgs: 0, notified: 0, errors: [e instanceof Error ? e.message : 'hata'] })) : null;
  return json({ ...report, agents });
}
export async function GET(req: Request) { try { return await run(req, ''); } catch (e) { return fail(e); } }
export async function POST(req: Request) { try { return await run(req, await req.text()); } catch (e) { return fail(e); } }
