import { fail, json } from '@/lib/api';
import { verifyHmac } from '@/lib/hmac';
import { createAdmin } from '@/lib/supabase/admin';

/** Gövde ham metin olarak okunur (HMAC bayt-bayt doğrulanır). İmza: x-jscore-signature veya x-hub-signature-256. */
export async function POST(req: Request, ctx: { params: Promise<{ provider: string }> }) {
  try {
    const { provider } = await ctx.params;
    const secret = process.env.JSCORE_WEBHOOK_SECRET;
    if (!secret) return json({ error: 'JSCORE_WEBHOOK_SECRET tanımlı değil' }, 503);
    const raw = await req.text();
    const sig = req.headers.get('x-jscore-signature') ?? req.headers.get('x-hub-signature-256');
    if (!verifyHmac(raw, sig, secret)) return json({ error: 'İmza geçersiz' }, 401);
    let payload: unknown;
    try { payload = JSON.parse(raw); } catch { return json({ error: 'JSON bekleniyor' }, 400); }
    const admin = createAdmin();
    if (admin) {
      const orgId = req.headers.get('x-jscore-org');
      if (orgId) {
        const { error } = await admin.from('events').insert({ org_id: orgId, type: `webhook.${provider}`, aggregate: 'webhooks', aggregate_id: crypto.randomUUID(), payload });
        if (error) return json({ error: error.message }, 500);
      }
    }
    return json({ ok: true, provider }, 202);
  } catch (e) { return fail(e); }
}
