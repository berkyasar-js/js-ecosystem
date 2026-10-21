import { NextResponse } from 'next/server';
import type { z } from 'zod';
import { getAccess, httpFor, type Access } from './auth';

export const json = (data: unknown, status = 200) => NextResponse.json(data, { status, headers: { 'cache-control': 'no-store' } });
export const fail = (status: number, error: string) => json({ error }, status);

type Ok = Extract<Access, { ok: true }>;

/** Oturum + rol denetimi; başarısızsa hazır yanıt döner. */
export async function requireAccess(): Promise<{ a: Ok } | { res: NextResponse }> {
  const a = await getAccess();
  if (!a.ok) { const h = httpFor(a); return { res: fail(h.status, h.error) }; }
  return { a };
}

export async function readJson<T extends z.ZodTypeAny>(req: Request, schema: T): Promise<{ data: z.infer<T> } | { res: NextResponse }> {
  let raw: unknown;
  try { raw = await req.json(); } catch { return { res: fail(400, 'Geçersiz JSON.') }; }
  const r = schema.safeParse(raw);
  if (!r.success) return { res: fail(400, `${r.error.issues[0]?.path.join('.') || 'girdi'}: ${r.error.issues[0]?.message ?? 'geçersiz'}`) };
  return { data: r.data };
}

/** Aynı kaynaktan gelmeyen yazma isteklerini reddeder (cookie tabanlı oturumda CSRF'ye karşı). */
export function sameOrigin(req: Request): boolean {
  const origin = req.headers.get('origin');
  if (!origin) return true;
  try { return new URL(origin).host === (req.headers.get('x-forwarded-host') ?? req.headers.get('host')); } catch { return false; }
}
