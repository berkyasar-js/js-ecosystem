import { GOOGLE_ORG_SCOPES } from '@jscore/contracts';
import { fail, json } from '@jscore/core/api';
import { authUrl, googleEnv, signState } from '@jscore/core/integrations/google-oauth';
import { EncKeyMissingError, encKeyReady } from '@jscore/core/integrations/google-crypto';
import { adminRedirectUri, authorizeGoogle, googleFail } from '@/lib/google-auth';
import { isResponse } from '@/lib/route';

export const dynamic = 'force-dynamic';
/** POST { login_hint? } → { url }: Google onay ekranı (offline erişim, org kapsamları). Tarayıcı bu adrese yönlenir; geri dönüş /callback. */
export async function POST(req: Request) {
  try {
    const a = await authorizeGoogle('integration.google.connect');
    if (isResponse(a)) return a;
    const env = googleEnv();
    if (!env) return json({ error: 'GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET tanımlı değil (Vercel env)' }, 503);
    if (!encKeyReady()) throw new EncKeyMissingError();
    const body = (await req.json().catch(() => ({}))) as { login_hint?: string };
    const state = signState({ kind: 'org', org_id: a.orgId, user_id: a.userId, scopes: GOOGLE_ORG_SCOPES, return_to: '/admin/integrations' });
    return Response.json({ url: authUrl({ clientId: env.clientId, redirectUri: adminRedirectUri(req), scopes: GOOGLE_ORG_SCOPES, state, loginHint: body.login_hint?.trim() || undefined }) }, { headers: { 'cache-control': 'no-store' } });
  } catch (e) { return googleFail(e) ?? fail(e); }
}
