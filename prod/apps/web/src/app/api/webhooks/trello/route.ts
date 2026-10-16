import { timingSafeEqual } from 'node:crypto';
import { fail, json } from '@/lib/api';
import { verifyTrelloSignature } from '@/lib/hmac';
import { archiveCardTask, loadTrelloConfig, syncCard } from '@/lib/integrations/trello';
import { isOwnTrelloAction } from '@/lib/integrations/trello-push';
import { createAdmin } from '@/lib/supabase/admin';

/** Trello oluşturma sırasında HEAD ile adresi doğrular → 200. */
export const HEAD = () => new Response(null, { status: 200 });
export const GET = () => new Response('ok', { status: 200 });

const eq = (a: string, b: string) => { const x = Buffer.from(a), y = Buffer.from(b); return x.length === y.length && timingSafeEqual(x, y); };

/**
 * Trello webhook. Doğrulama:
 *  - TRELLO_API_SECRET varsa: `x-trello-webhook` = base64(HMAC-SHA1(gövde + callbackURL, secret)) zorunlu.
 *  - Yoksa: sorgudaki `k` değeri integrations.config.webhook_key ile eşleşmeli.
 * createCard / updateCard / moveCard… → kart yeniden çekilip görev upsert edilir; deleteCard → görev arşive alınır.
 */
export async function POST(req: Request) {
  try {
    const raw = await req.text();
    const url = new URL(req.url);
    const orgId = url.searchParams.get('org');
    const admin = createAdmin();
    if (!orgId || !admin) return json({ error: 'Yetkisiz' }, 401);
    const cfg = await loadTrelloConfig(admin, orgId);
    if (!cfg) return json({ error: 'Yetkisiz' }, 401);
    const secret = process.env.TRELLO_API_SECRET;
    if (secret) {
      const cb = cfg.callback_url ?? `${url.origin}${url.pathname}${url.search}`;
      if (!verifyTrelloSignature(raw, cb, req.headers.get('x-trello-webhook'), secret)) return json({ error: 'İmza geçersiz' }, 401);
    } else {
      const k = url.searchParams.get('k');
      if (!k || !cfg.webhook_key || !eq(k, cfg.webhook_key)) return json({ error: 'Yetkisiz' }, 401);
    }
    if (cfg.mode === 'off') return json({ ok: true, ignored: 'mode_off' });
    let body: { action?: { type?: string; idMemberCreator?: string; data?: { card?: { id?: string } } } };
    try { body = JSON.parse(raw); } catch { return json({ error: 'JSON bekleniyor' }, 400); }
    const type = body.action?.type ?? '';
    const cardId = body.action?.data?.card?.id;
    if (!cardId) return json({ ok: true, ignored: type || 'no_card' });
    // Döngü koruması: entegrasyon token'ının kendi yazdığı (JS → Trello) eylemler geri çekilmez.
    if (isOwnTrelloAction(body.action, cfg)) return json({ ok: true, ignored: 'own_action', type });
    if (type === 'deleteCard') { await archiveCardTask(admin, orgId, cardId); return json({ ok: true, type, result: 'archived' }); }
    if (!/Card|CheckItem|Checklist/.test(type)) return json({ ok: true, ignored: type });
    return json({ ok: true, type, result: await syncCard(admin, orgId, cardId) });
  } catch (e) { return fail(e); }
}
