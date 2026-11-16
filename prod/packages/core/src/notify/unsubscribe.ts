import { createHmac, timingSafeEqual } from 'node:crypto';

/**
 * E-posta altbilgisindeki abonelikten çıkma bağlantısı: imzalı, süreli token (HMAC-SHA256, JSCORE_WEBHOOK_SECRET).
 * `t = base64url(payload).base64url(hmac)`; payload = {u: user_id, k: 'email'|'digest', e: exp (epoch s)}.
 */
export interface UnsubPayload { u: string; k: 'email' | 'digest'; e: number }
const b64u = (buf: Buffer | string) => Buffer.from(buf).toString('base64url');
const sig = (body: string, secret: string) => createHmac('sha256', secret).update(body).digest('base64url');
const DAYS_90 = 90 * 24 * 3600;

export function signUnsubscribe(p: Omit<UnsubPayload, 'e'> & { e?: number }, secret: string, nowSec = Math.floor(Date.now() / 1000)): string {
  if (!secret) throw new Error('JSCORE_WEBHOOK_SECRET tanımlı değil');
  const body = b64u(JSON.stringify({ u: p.u, k: p.k, e: p.e ?? nowSec + DAYS_90 } satisfies UnsubPayload));
  return `${body}.${sig(body, secret)}`;
}
export function verifyUnsubscribe(token: string | null | undefined, secret: string | undefined, nowSec = Math.floor(Date.now() / 1000)): UnsubPayload | null {
  if (!token || !secret) return null;
  const [body, given] = token.split('.');
  if (!body || !given) return null;
  const want = sig(body, secret);
  const a = Buffer.from(given), b = Buffer.from(want);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  try {
    const p = JSON.parse(Buffer.from(body, 'base64url').toString('utf8')) as UnsubPayload;
    if (typeof p.u !== 'string' || !p.u || (p.k !== 'email' && p.k !== 'digest') || typeof p.e !== 'number' || p.e < nowSec) return null;
    return p;
  } catch { return null; }
}
export const unsubscribeUrl = (appUrl: string, token: string) => `${appUrl.replace(/\/$/, '')}/api/notify/unsubscribe?t=${encodeURIComponent(token)}`;
