import { encryptJson } from '@jscore/core/integrations/google-crypto';
import { exchangeCode, googleEnv, loadGoogleOrgConfig, saveGoogleOrgConfig, userinfo, verifyState } from '@jscore/core/integrations/google-oauth';
import { writeGoogleLog } from '@jscore/core/integrations/gmail';
import { adminRedirectUri } from '@/lib/google-auth';
import { audit, requireAdmin, isResponse } from '@/lib/route';

export const dynamic = 'force-dynamic';
const back = (req: Request, q: Record<string, string>) => {
  const base = (process.env.ADMIN_URL ?? process.env.NEXT_PUBLIC_ADMIN_URL ?? '').replace(/\/$/, '') || new URL(req.url).origin;
  const u = new URL(`${base}/admin/integrations`); for (const [k, v] of Object.entries(q)) u.searchParams.set(k, v);
  return Response.redirect(u.toString(), 302);
};
/**
 * GET ?code&state — Google'dan dönüş. Oturumdaki yönetici state'teki org/user ile aynı olmalı. Kod → token (refresh dahil) → şifreli sakla;
 * posta kutusu adresi userinfo'dan. Ardından panele yönlenir (?google=ok|error&msg=).
 */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const err = url.searchParams.get('error');
  if (err) return back(req, { google: 'error', msg: err === 'access_denied' ? 'Onay verilmedi' : err });
  const st = verifyState(url.searchParams.get('state'));
  const code = url.searchParams.get('code');
  if (!st || st.kind !== 'org' || !code) return back(req, { google: 'error', msg: 'Geçersiz ya da süresi dolmuş state — yeniden dene' });
  const ctx = await requireAdmin();
  if (isResponse(ctx) || !ctx.sb) return back(req, { google: 'error', msg: 'Oturum yok ya da yetkisiz' });
  if (ctx.orgId !== st.org_id || ctx.userId !== st.user_id) return back(req, { google: 'error', msg: 'Oturum state ile uyuşmuyor' });
  const env = googleEnv();
  if (!env) return back(req, { google: 'error', msg: 'GOOGLE_CLIENT_ID / SECRET yok' });
  try {
    const tokens = await exchangeCode(env, code, adminRedirectUri(req));
    const granted = tokens.scope ? tokens.scope.split(/\s+/).filter(Boolean) : st.scopes;
    const info = await userinfo(tokens.access_token);
    const prev = await loadGoogleOrgConfig(ctx.sb, ctx.orgId);
    await saveGoogleOrgConfig(ctx.sb, ctx.orgId, {
      email: info.email, display_name: prev?.display_name ?? 'Jobs Studio', tokens_enc: encryptJson(tokens), scopes: granted, connected_at: new Date().toISOString(), connected_by: ctx.email,
      history_id: prev?.email === info.email ? prev?.history_id : undefined, last_sync_error: undefined, calendar_id: prev?.calendar_id ?? 'primary',
    });
    await writeGoogleLog(ctx.sb, ctx.orgId, { direction: 'reconcile', entity: 'integration', action: 'connect', ok: true, message: `${info.email} · ${granted.length} kapsam` });
    await audit(ctx, 'integration.google.connected', 'integrations/google', { email: info.email, scopes: granted });
    return back(req, { google: 'ok', email: info.email });
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Bağlantı hatası';
    await audit(ctx, 'integration.google.connect', 'integrations/google', { error: msg }, 'error');
    return back(req, { google: 'error', msg: msg.slice(0, 200) });
  }
}
