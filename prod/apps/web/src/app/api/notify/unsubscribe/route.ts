import { coerceNotificationPrefs } from '@jscore/contracts';
import { createAdmin } from '@jscore/core/supabase/admin';
import { verifyUnsubscribe } from '@jscore/core/notify/unsubscribe';

export const dynamic = 'force-dynamic';
const page = (title: string, body: string, ok: boolean) => new Response(`<!doctype html><html lang="tr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>${title}</title>
<style>body{margin:0;background:#080a17;color:#f0f0f7;font-family:-apple-system,Segoe UI,Roboto,sans-serif;display:grid;place-items:center;min-height:100vh}main{max-width:460px;padding:28px;border:1px solid #292d40;border-radius:18px;background:#151827}h1{font-size:18px;margin:0 0 8px}p{color:#a2a6bc;font-size:14px;line-height:1.5}a{color:#8c93ff}</style></head>
<body><main><h1>${ok ? '✓ ' : ''}${title}</h1><p>${body}</p><p><a href="/app/profile?tab=notifications">Bildirim tercihlerini aç</a></p></main></body></html>`, { status: ok ? 200 : 400, headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' } });

/** E-posta altbilgisi: imzalı token (JSCORE_WEBHOOK_SECRET) → kullanıcının e-posta kanalı (k=email) ya da özeti (k=digest) kapatılır. GET (bağlantı) ve POST (List-Unsubscribe tek tık). */
async function handle(req: Request) {
  const t = new URL(req.url).searchParams.get('t');
  const p = verifyUnsubscribe(t, process.env.JSCORE_WEBHOOK_SECRET);
  if (!p) return page('Bağlantı geçersiz ya da süresi dolmuş', 'Tercihlerini uygulama içinden Profil → Bildirimler sayfasında değiştirebilirsin.', false);
  const sb = createAdmin();
  if (!sb) return page('Şu anda işlenemiyor', 'Sunucu yapılandırması eksik (servis rolü).', false);
  const { data } = await sb.from('user_prefs').select('prefs,org_id').eq('user_id', p.u).maybeSingle();
  const prefs = (data?.prefs ?? {}) as Record<string, unknown>;
  const np = coerceNotificationPrefs(prefs.notifications);
  const next = p.k === 'email' ? { ...np, channels: { ...np.channels, email: false } } : { ...np, digest: 'off' as const };
  const { error } = await sb.from('user_prefs').upsert({ user_id: p.u, org_id: data?.org_id ?? null, prefs: { ...prefs, notifications: next }, updated_at: new Date().toISOString() }, { onConflict: 'user_id' });
  if (error) return page('Kaydedilemedi', error.message, false);
  if (req.method === 'POST') return new Response(null, { status: 204 });
  return page(p.k === 'email' ? 'E-posta bildirimleri kapatıldı' : 'E-posta özeti kapatıldı', p.k === 'email' ? 'Artık bu adrese bildirim e-postası gönderilmeyecek. Uygulama içi bildirimler sürer.' : 'Günlük / haftalık özet e-postası artık gönderilmeyecek.', true);
}
export const GET = handle;
export const POST = handle;
