import { NextResponse } from 'next/server';
import { ForbiddenError, NotFoundError } from './repo/types';

export const json = (data: unknown, status = 200) => NextResponse.json(data, { status });
export function fail(e: unknown) {
  if (e instanceof ForbiddenError) return json({ error: e.message }, 403);
  if (e instanceof NotFoundError) return json({ error: e.message }, 404);
  if (e && typeof e === 'object' && 'issues' in e) return json({ error: 'Geçersiz istek', issues: (e as { issues: unknown }).issues }, 400);
  console.error(e);
  return json({ error: e instanceof Error ? e.message : 'Sunucu hatası' }, 500);
}
