import { appOrigin } from '@jscore/core/integrations/auth';
import { exchangeCode, googleEnv, saveGoogleUser, userinfo, verifyState } from '@jscore/core/integrations/google-oauth';
import { isResponse, requireUser, safeReturn, webRedirectUri } from '@/lib/google-user';

export const dynamic = 'force-dynamic';
const back = (req: Request, path: string, q: Record<string, string>) => {
  const base = (process.env.NEXT_PUBLIC_APP_URL ?? '').replace(/\/$/, '') || appOrigin(req);
  const u = new URL(`${base}${path}`); for (const [k, v] of Object.entries(q)) u.searchParams.set(k, v);
  return Response.redirect(u.toString(), 302);
};
/** GET ?code&state — kişisel Google bağlantısı: kod → token → user_integrations (şifreli). Ardından return_to'ya (?google=ok|error). */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const st = verifyState(url.searchParams.get('state'));
  const ret = safeReturn(st?.return_to);
  const err = url.searchParams.get('error');
  if (err) return back(req, ret, { google: 'error', msg: err === 'access_denied' ? 'Onay verilmedi' : err });
  const code = url.searchParams.get('code');
  if (!st || st.kind !== 'user' || !code) return back(req, ret, { google: 'error', msg: 'Geçersiz ya da süresi dolmuş state — yeniden dene' });
  const a = await requireUser();
  if (isResponse(a)) return back(req, ret, { google: 'error', msg: 'Oturum yok' });
  if (a.me.id !== st.user_id) return back(req, ret, { google: 'error', msg: 'Oturum state ile uyuşmuyor' });
  const env = googleEnv(); if (!env) return back(req, ret, { google: 'error', msg: 'GOOGLE_CLIENT_ID / SECRET yok' });
  try {
    const tokens = await exchangeCode(env, code, webRedirectUri(req));
    const granted = tokens.scope ? tokens.scope.split(/\s+/).filter(Boolean) : st.scopes;
    const info = await userinfo(tokens.access_token);
    await saveGoogleUser(a.admin, { user_id: a.me.id, org_id: a.me.org_id, tokens, scopes: granted, email: info.email });
    return back(req, ret, { google: 'ok', email: info.email });
  } catch (e) { return back(req, ret, { google: 'error', msg: (e instanceof Error ? e.message : 'Bağlantı hatası').slice(0, 200) }); }
}
