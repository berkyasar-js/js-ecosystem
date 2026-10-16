import { timingSafeEqual } from 'node:crypto';
import type { SupabaseClient } from '@supabase/supabase-js';
import { TOKEN_ADMIN_ROLES } from '@jscore/contracts';
import { json } from '../api';
import { getRepo } from '../repo';
import { createAdmin } from '../supabase/admin';

const eq = (a: string, b: string) => { const x = Buffer.from(a), y = Buffer.from(b); return x.length === y.length && timingSafeEqual(x, y); };

/**
 * Entegrasyon rotaları yetkisi: owner / org_admin / integration_admin oturumu (RLS int_w ile aynı) ya da
 * `Authorization: Bearer <SUPABASE_SERVICE_ROLE_KEY>` + `x-jscore-org` (veya ?org=). Dönen admin = servis rolü istemcisi.
 */
export async function authorizeIntegration(req: Request): Promise<{ orgId: string; admin: SupabaseClient } | Response> {
  const admin = createAdmin();
  if (!admin) return json({ error: 'Supabase servis rolü tanımlı değil — demo modunda Trello yalnızca “Örnek veriyle dene” ile denenir' }, 503);
  const bearer = req.headers.get('authorization')?.match(/^Bearer\s+(.+)$/i)?.[1]?.trim();
  const service = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (bearer) {
    if (!service || !eq(bearer, service)) return json({ error: 'Yetkisiz' }, 401);
    const org = req.headers.get('x-jscore-org') ?? new URL(req.url).searchParams.get('org');
    return org ? { orgId: org, admin } : json({ error: 'x-jscore-org gerekli' }, 400);
  }
  const me = await (await getRepo()).me();
  if (!me) return json({ error: 'Oturum yok' }, 401);
  if (!TOKEN_ADMIN_ROLES.includes(me.role)) return json({ error: 'Bu işlem için yetkin yok' }, 403);
  return { orgId: me.org_id, admin };
}
export const isResponse = (x: unknown): x is Response => x instanceof Response;
export const appOrigin = (req: Request) => {
  if (process.env.APP_URL) return process.env.APP_URL.replace(/\/$/, '');
  const h = req.headers;
  const host = h.get('x-forwarded-host') ?? h.get('host');
  return host ? `${h.get('x-forwarded-proto') ?? 'https'}://${host}` : new URL(req.url).origin;
};
