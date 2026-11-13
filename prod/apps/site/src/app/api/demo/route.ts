import { NextResponse } from 'next/server';

export const runtime = 'nodejs';

/**
 * Demo talebi: DEMO_WEBHOOK_URL tanımlıysa JSON olarak oraya iletilir (Formspree, Slack webhook, Make/Zapier, kendi uç noktanız).
 * Tanımlı değilse hiçbir şey saklanmaz; istek sunucu günlüğüne yazılır ve başarı döner (forwarded:false) — arayüz e-posta yedeğini gösterir.
 */
const MAX = { name: 120, email: 200, company: 120, seats: 10, message: 2000, plan: 40 } as const;
type Key = keyof typeof MAX;
const clean = (v: unknown, max: number) => (typeof v === 'string' ? v.trim().slice(0, max) : '');

export async function POST(req: Request) {
  let body: Record<string, unknown>;
  try { body = (await req.json()) as Record<string, unknown>; } catch { return NextResponse.json({ ok: false, error: 'Geçersiz istek' }, { status: 400 }); }
  if (clean(body.website, 200)) return NextResponse.json({ ok: true, forwarded: false }); // honeypot: sessizce yut
  const data = Object.fromEntries((Object.keys(MAX) as Key[]).map((k) => [k, clean(body[k], MAX[k])])) as Record<Key, string>;
  if (data.name.length < 2 || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(data.email) || !data.company) return NextResponse.json({ ok: false, error: 'Ad, e-posta ve ajans adı gerekli' }, { status: 400 });

  const payload = { source: 'js-workspace-site', received_at: new Date().toISOString(), ...data, consent: body.consent === 'on' || body.consent === true };
  const url = process.env.DEMO_WEBHOOK_URL;
  if (!url) {
    console.log('[demo-request]', JSON.stringify(payload));
    return NextResponse.json({ ok: true, forwarded: false });
  }
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 8000);
    const r = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json', accept: 'application/json' }, body: JSON.stringify(payload), signal: ctrl.signal });
    clearTimeout(t);
    if (!r.ok) throw new Error(`webhook ${r.status}`);
    return NextResponse.json({ ok: true, forwarded: true });
  } catch (e) {
    console.error('[demo-request] webhook failed', e instanceof Error ? e.message : e, JSON.stringify(payload));
    // Yedek: talebi günlüğe yazdık; kullanıcıya başarı + e-posta yedeği göster.
    return NextResponse.json({ ok: true, forwarded: false });
  }
}
