import { fail, json } from '@jscore/core/api';
import { loadHubSpotConfig } from '@jscore/core/integrations/hubspot';
import { applyHubSpotWebhook, verifyHubSpotSignatureV3, type HubSpotWebhookEvent } from '@jscore/core/integrations/hubspot-sync';
import { createAdmin } from '@jscore/core/supabase/admin';

export const GET = () => new Response('ok', { status: 200 });

/**
 * HubSpot uygulama webhook'u (İSTEĞE BAĞLI — HubSpot webhook aboneliği herkese açık bir uygulama gerektirir; özel uygulama token'ı ile
 * yalnızca saatlik uzlaştırma çalışır). Adres: POST /api/webhooks/hubspot?org=<org id>. Doğrulama: integrations.config.webhook_secret
 * (uygulamanın client secret'ı) ile `X-HubSpot-Signature-v3` (HMAC-SHA256 base64; method+uri+body+timestamp, 5 dk pencere). Sır tanımlı değilse 401.
 * Gövde: [{objectId, subscriptionType:'contact.propertyChange'|'company.creation'|'deal.deletion'…}] → nesneler yeniden okunup çekme çekirdeğiyle uygulanır.
 */
export async function POST(req: Request) {
  try {
    const raw = await req.text();
    const url = new URL(req.url);
    const orgId = url.searchParams.get('org');
    const admin = createAdmin();
    if (!orgId || !admin) return json({ error: 'Yetkisiz' }, 401);
    const cfg = await loadHubSpotConfig(admin, orgId);
    if (!cfg?.webhook_secret) return json({ error: 'Webhook sırrı tanımlı değil — saatlik uzlaştırma kullanılır' }, 401);
    const publicUrl = (process.env.APP_URL ? `${process.env.APP_URL.replace(/\/$/, '')}${url.pathname}${url.search}` : url.toString());
    if (!verifyHubSpotSignatureV3({ method: 'POST', url: publicUrl, body: raw, timestamp: req.headers.get('x-hubspot-request-timestamp'), signature: req.headers.get('x-hubspot-signature-v3'), secret: cfg.webhook_secret })) return json({ error: 'İmza geçersiz' }, 401);
    if (cfg.mode === 'off') return json({ ok: true, ignored: 'mode_off' });
    let events: HubSpotWebhookEvent[];
    try { const b = JSON.parse(raw) as unknown; events = Array.isArray(b) ? (b as HubSpotWebhookEvent[]) : [b as HubSpotWebhookEvent]; } catch { return json({ error: 'JSON bekleniyor' }, 400); }
    return json({ ok: true, ...(await applyHubSpotWebhook(admin, orgId, events.filter((e) => e && typeof e.subscriptionType === 'string'))) });
  } catch (e) { return fail(e); }
}
