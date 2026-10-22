import type { SupabaseClient } from '@supabase/supabase-js';
import { ADMIN_AUDIT_PREFIX } from '@jscore/contracts';
import { fail, json } from '@jscore/core/api';
import { getAdminContext, type AdminCtx } from './admin-ctx';

export const noStore = { 'cache-control': 'no-store' };
export const ok = (data: unknown = { ok: true }, status = 200) => Response.json(data, { status, headers: noStore });

/** Tüm /api/admin/* rotaları: owner/org_admin oturumu zorunlu; değilse 401/403. */
export async function requireAdmin(): Promise<AdminCtx | Response> {
  const r = await getAdminContext();
  if (r.ok) return r.ctx;
  if (r.reason === 'no_session') return json({ error: 'Oturum yok' }, 401);
  return json({ error: 'Yetkiniz yok — bu panel yalnızca owner / org_admin içindir' }, 403);
}
export const isResponse = (x: unknown): x is Response => x instanceof Response;

/** Servis rolü gerektiren (kullanıcı/oturum/denetim) işlemler demo modunda çalışmaz. */
export function requireService(ctx: AdminCtx): SupabaseClient | Response {
  return ctx.sb ?? json({ error: 'Demo modu — bu işlem için Supabase bağlantısı (servis rolü anahtarı) gerekir' }, 503);
}

/** Her yönetim eylemi denetim kaydına yazılır (başarı + hata). Denetim yazılamazsa eylemi engellemez ama konsola düşer. */
export async function audit(ctx: AdminCtx, action: string, resource: string, meta: Record<string, unknown> = {}, outcome: 'allow' | 'deny' | 'error' = 'allow'): Promise<void> {
  if (!ctx.sb) return;
  const { error } = await ctx.sb.from('audit_events').insert({ org_id: ctx.orgId, actor: ctx.userId, action: `${ADMIN_AUDIT_PREFIX}${action}`, resource, outcome, meta });
  if (error) console.error('audit yazılamadı', error.message);
}

/** Rota sarmalayıcı: yetki + hata → JSON. */
export function adminRoute<A extends unknown[]>(fn: (ctx: AdminCtx, req: Request, ...rest: A) => Promise<Response>) {
  return async (req: Request, ...rest: A): Promise<Response> => {
    try {
      const ctx = await requireAdmin();
      if (isResponse(ctx)) return ctx;
      return await fn(ctx, req, ...rest);
    } catch (e) { return fail(e); }
  };
}
