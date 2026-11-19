import type { SupabaseClient } from '@supabase/supabase-js';
import { json } from '@jscore/core/api';
import { GoogleApiError } from '@jscore/core/integrations/google-oauth';
import { EncKeyMissingError } from '@jscore/core/integrations/google-crypto';
import { audit, requireAdmin, isResponse } from './route';

/** Google Workspace yönetim rotaları: owner/org_admin oturumu + servis rolü (HubSpot ile aynı desen). */
export async function authorizeGoogle(action?: string): Promise<{ orgId: string; admin: SupabaseClient; userId: string; email: string } | Response> {
  const ctx = await requireAdmin();
  if (isResponse(ctx)) return ctx;
  if (!ctx.sb) return json({ error: 'Demo modu — Google Workspace yalnızca Supabase ile bağlanır (token sunucuda şifreli saklanır)' }, 503);
  if (action) await audit(ctx, action, 'integrations/google', { phase: 'start' });
  return { orgId: ctx.orgId, admin: ctx.sb, userId: ctx.userId, email: ctx.email };
}
export const googleFail = (e: unknown): Response | null =>
  e instanceof GoogleApiError ? json({ error: e.message }, e.status >= 500 ? 502 : e.status === 404 ? 404 : 400) : e instanceof EncKeyMissingError ? json({ error: e.message }, 503) : null;
/** OAuth geri çağrı adresi: ADMIN_URL / NEXT_PUBLIC_ADMIN_URL ya da istek kaynağı (x-forwarded-host). Google Console'daki URI ile birebir aynı olmalı. */
export function adminRedirectUri(req: Request): string {
  const base = (process.env.ADMIN_URL ?? process.env.NEXT_PUBLIC_ADMIN_URL ?? '').replace(/\/$/, '');
  if (base) return `${base}/api/admin/integrations/google/callback`;
  const h = req.headers; const host = h.get('x-forwarded-host') ?? h.get('host');
  const origin = host ? `${h.get('x-forwarded-proto') ?? 'https'}://${host}` : new URL(req.url).origin;
  return `${origin}/api/admin/integrations/google/callback`;
}
