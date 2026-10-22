import type { SupabaseClient } from '@supabase/supabase-js';
import { json } from '@jscore/core/api';
import { audit, requireAdmin, isResponse } from './route';

/** Trello yönetim rotaları: owner/org_admin oturumu + servis rolü. (Web'deki authorizeIntegration yerine; Kurul/Entegrasyon yönetimi yalnızca panelde.) */
export async function authorizeTrello(action?: string): Promise<{ orgId: string; admin: SupabaseClient } | Response> {
  const ctx = await requireAdmin();
  if (isResponse(ctx)) return ctx;
  if (!ctx.sb) return json({ error: 'Demo modu — Trello yalnızca “Örnek veriyle dene” ile denenir' }, 503);
  if (action) await audit(ctx, action, `integrations/trello`, { phase: 'start' });
  return { orgId: ctx.orgId, admin: ctx.sb };
}
export const publicOrigin = () => (process.env.NEXT_PUBLIC_APP_URL ?? process.env.APP_URL ?? '').replace(/\/$/, '');
