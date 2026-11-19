import type { SupabaseClient } from '@supabase/supabase-js';
import { isClientRole, type Me } from '@jscore/contracts';
import { json } from '@jscore/core/api';
import { getRepo } from '@jscore/core/repo';
import { createAdmin } from '@jscore/core/supabase/admin';
import { appOrigin } from '@jscore/core/integrations/auth';
import { GoogleApiError } from '@jscore/core/integrations/google-oauth';
import { EncKeyMissingError } from '@jscore/core/integrations/google-crypto';

/** Kullanıcı uygulaması Google rotaları: oturum (herhangi bir üyelik) + servis rolü. Gelen kutusu rotaları ayrıca iç rol ister. */
export async function requireUser(o: { internal?: boolean } = {}): Promise<{ me: Me; admin: SupabaseClient } | Response> {
  const admin = createAdmin();
  if (!admin) return json({ error: 'Demo modu — Google bağlantısı yalnızca Supabase ile çalışır' }, 503);
  const me = await (await getRepo()).me();
  if (!me) return json({ error: 'Oturum yok' }, 401);
  if (o.internal && isClientRole(me.role)) return json({ error: 'Bu alan yalnızca ajans ekibine açık' }, 403);
  return { me, admin };
}
export const isResponse = (x: unknown): x is Response => x instanceof Response;
export const googleFail = (e: unknown): Response | null =>
  e instanceof GoogleApiError ? json({ error: e.message }, e.status >= 500 ? 502 : e.status === 404 ? 404 : e.status === 403 ? 403 : 400) : e instanceof EncKeyMissingError ? json({ error: e.message }, 503) : null;
/** OAuth geri çağrı adresi (Google Console ile birebir): APP_URL / NEXT_PUBLIC_APP_URL ya da istek kaynağı. */
export const webRedirectUri = (req: Request) => `${(process.env.NEXT_PUBLIC_APP_URL ?? '').replace(/\/$/, '') || appOrigin(req)}/api/integrations/google/callback`;
/** Yalnızca uygulama içi yol (açık yönlendirme yok). */
export const safeReturn = (p: string | null | undefined, fallback = '/app/agenda') => (p && /^\/app\/[a-zA-Z0-9/_?=&.-]*$/.test(p) ? p : fallback);
