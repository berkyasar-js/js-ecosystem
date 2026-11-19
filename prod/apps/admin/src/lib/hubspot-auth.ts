import type { SupabaseClient } from '@supabase/supabase-js';
import { json } from '@jscore/core/api';
import { HubSpotApiError } from '@jscore/core/integrations/hubspot';
import { audit, requireAdmin, isResponse } from './route';

/** HubSpot yönetim rotaları: owner/org_admin oturumu + servis rolü (Trello ile aynı desen). */
export async function authorizeHubSpot(action?: string): Promise<{ orgId: string; admin: SupabaseClient } | Response> {
  const ctx = await requireAdmin();
  if (isResponse(ctx)) return ctx;
  if (!ctx.sb) return json({ error: 'Demo modu — HubSpot yalnızca Supabase ile bağlanır (token sunucuda saklanır)' }, 503);
  if (action) await audit(ctx, action, 'integrations/hubspot', { phase: 'start' });
  return { orgId: ctx.orgId, admin: ctx.sb };
}
/** HubSpot API hatası → 400/502 JSON; diğerleri çağırana bırakılır. */
export const hubspotFail = (e: unknown): Response | null => (e instanceof HubSpotApiError ? json({ error: e.message }, e.status >= 500 ? 502 : 400) : null);
