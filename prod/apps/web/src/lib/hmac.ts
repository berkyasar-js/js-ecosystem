import { createHmac, timingSafeEqual } from 'node:crypto';

export const signBody = (body: string, secret: string) => createHmac('sha256', secret).update(body).digest('hex');

/** `sha256=<hex>` veya düz hex kabul eder; sabit zamanlı karşılaştırır. */
export function verifyHmac(body: string, header: string | null | undefined, secret: string | undefined): boolean {
  if (!secret || !header) return false;
  const given = header.trim().replace(/^sha256=/i, '').toLowerCase();
  if (!/^[0-9a-f]{64}$/.test(given)) return false;
  const a = Buffer.from(given, 'hex');
  const b = Buffer.from(signBody(body, secret), 'hex');
  return a.length === b.length && timingSafeEqual(a, b);
}
