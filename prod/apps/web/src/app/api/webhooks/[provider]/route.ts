import { fail, json } from '@jscore/core/api';
import { verifyHmac } from '@jscore/core/hmac';
import { createAdmin } from '@jscore/core/supabase/admin';
import { authenticateBearer, bearerOf } from '@jscore/core/tokens-server';

/** Gövde ham metin olarak okunur (HMAC bayt-bayt doğrulanır). İmza: x-jscore-signature veya x-hub-signature-256. */
export async function POST(req: Request, ctx: { params: Promise<{ provider: string }> }) {
  try {
    const { provider } = await ctx.params;
    const raw = await req.text();
    // Yol 1: Authorization: Bearer <API anahtarı> ('webhooks' kapsamı) — organizasyon anahtardan gelir.
    // Yol 2 (mevcut): ham gövde HMAC-SHA256 imzası + x-jscore-org başlığı.
    const bearer = bearerOf(req);
    let tokenOrg: string | null = null;
    if (bearer) {
      const auth = await authenticateBearer(bearer, 'webhooks');
      if (!auth) return json({ error: 'Token geçersiz, süresi dolmuş veya iptal edilmiş' }, 401);
      tokenOrg = auth.org_id;
    } else {
      const secret = process.env.JSCORE_WEBHOOK_SECRET;
      if (!secret) return json({ error: 'JSCORE_WEBHOOK_SECRET tanımlı değil' }, 503);
      const sig = req.headers.get('x-jscore-signature') ?? req.headers.get('x-hub-signature-256');
      if (!verifyHmac(raw, sig, secret)) return json({ error: 'İmza geçersiz' }, 401);
    }
    let payload: unknown;
    try { payload = JSON.parse(raw); } catch { return json({ error: 'JSON bekleniyor' }, 400); }
    const admin = createAdmin();
    if (admin) {
      const orgId = tokenOrg ?? req.headers.get('x-jscore-org');
      if (orgId) {
        const { error } = await admin.from('events').insert({ org_id: orgId, type: `webhook.${provider}`, aggregate: 'webhooks', aggregate_id: crypto.randomUUID(), payload });
        if (error) return json({ error: error.message }, 500);
      }
    }
    return json({ ok: true, provider }, 202);
  } catch (e) { return fail(e); }
}
