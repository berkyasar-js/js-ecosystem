import { GOOGLE_USER_SCOPES_BASE, GOOGLE_USER_SCOPE_GMAIL } from '@jscore/contracts';
import { fail } from '@jscore/core/api';
import { appOrigin } from '@jscore/core/integrations/auth';
import { EncKeyMissingError, encKeyReady } from '@jscore/core/integrations/google-crypto';
import { authUrl, googleEnv, signState } from '@jscore/core/integrations/google-oauth';
import { isResponse, requireUser, safeReturn, webRedirectUri } from '@/lib/google-user';

export const dynamic = 'force-dynamic';
/** Tarayıcıdan tıklanır: hata JSON yerine dönüş sayfasına ?google=error&msg= ile gider. */
const backWithError = (req: Request, ret: string, msg: string) => {
  const base = (process.env.NEXT_PUBLIC_APP_URL ?? '').replace(/\/$/, '') || appOrigin(req);
  const u = new URL(`${base}${ret}`); u.searchParams.set('google', 'error'); u.searchParams.set('msg', msg.slice(0, 200));
  return Response.redirect(u.toString(), 302);
};
/** GET ?return=/app/agenda&gmail=1 → Google onay ekranına yönlendirir (kişisel: takvim oku, isteğe bağlı gmail.readonly). */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const ret = safeReturn(url.searchParams.get('return'));
  try {
    const a = await requireUser(); if (isResponse(a)) return backWithError(req, ret, 'Oturum yok ya da demo modu');
    const env = googleEnv(); if (!env) return backWithError(req, ret, 'GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET tanımlı değil');
    if (!encKeyReady()) throw new EncKeyMissingError();
    const scopes = url.searchParams.get('gmail') === '1' ? [...GOOGLE_USER_SCOPES_BASE, GOOGLE_USER_SCOPE_GMAIL] : GOOGLE_USER_SCOPES_BASE;
    const state = signState({ kind: 'user', org_id: a.me.org_id, user_id: a.me.id, scopes, return_to: ret });
    return Response.redirect(authUrl({ clientId: env.clientId, redirectUri: webRedirectUri(req), scopes, state, loginHint: a.me.email || undefined }), 302);
  } catch (e) { return e instanceof EncKeyMissingError ? backWithError(req, ret, e.message) : fail(e); }
}
