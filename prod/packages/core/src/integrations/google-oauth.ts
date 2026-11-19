import { createHmac, timingSafeEqual } from 'node:crypto';
import type { SupabaseClient } from '@supabase/supabase-js';
import { GOOGLE_ORG_SCOPES, googleOrgConfigSchema, googleTokensSchema, googleUserConfigSchema, type GoogleOrgConfig, type GoogleTokens, type GoogleUserConfig, type GoogleUserState } from '@jscore/contracts';
import { decryptJson, encKeyReady, encryptJson } from './google-crypto';

/**
 * Google OAuth 2.0 (web akışı, offline erişim) + token deposu.
 *  - Org posta kutusu: integrations(provider='google').config (GoogleOrgConfig; token'lar şifreli `tokens_enc`).
 *  - Kişisel: user_integrations(user_id, provider='google').config (GoogleUserConfig).
 * Env: GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, INTEGRATIONS_ENC_KEY. State: HMAC imzalı (JSCORE_WEBHOOK_SECRET ya da client secret), 10 dk.
 */
const AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth';
const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const REVOKE_URL = 'https://oauth2.googleapis.com/revoke';
const USERINFO_URL = 'https://openidconnect.googleapis.com/v1/userinfo';

export class GoogleApiError extends Error {
  constructor(public status: number, msg: string, public reason?: string) { super(msg); this.name = 'GoogleApiError'; }
}
export interface GoogleEnv { clientId: string; clientSecret: string }
export function googleEnv(env: NodeJS.ProcessEnv = process.env): GoogleEnv | null {
  const clientId = env.GOOGLE_CLIENT_ID?.trim(); const clientSecret = env.GOOGLE_CLIENT_SECRET?.trim();
  return clientId && clientSecret ? { clientId, clientSecret } : null;
}
export const googleEnvReady = (env: NodeJS.ProcessEnv = process.env) => !!googleEnv(env);
export const googleReady = (env: NodeJS.ProcessEnv = process.env) => ({ env_ready: googleEnvReady(env), enc_ready: encKeyReady(env) });

/* ───────── State (CSRF) ───────── */
export interface OAuthState { kind: 'org' | 'user'; org_id: string; user_id: string; return_to?: string; scopes: string[]; iat: number }
const stateSecret = (env: NodeJS.ProcessEnv) => env.JSCORE_WEBHOOK_SECRET?.trim() || env.GOOGLE_CLIENT_SECRET?.trim() || '';
const b64u = (b: Buffer) => b.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const unb64u = (s: string) => Buffer.from(s.replace(/-/g, '+').replace(/_/g, '/'), 'base64');
export function signState(st: Omit<OAuthState, 'iat'>, env: NodeJS.ProcessEnv = process.env, now = Date.now()): string {
  const secret = stateSecret(env); if (!secret) throw new Error('State imzası için JSCORE_WEBHOOK_SECRET ya da GOOGLE_CLIENT_SECRET gerekli');
  const body = b64u(Buffer.from(JSON.stringify({ ...st, iat: now }), 'utf8'));
  return `${body}.${b64u(createHmac('sha256', secret).update(body).digest())}`;
}
export function verifyState(token: string | null | undefined, env: NodeJS.ProcessEnv = process.env, now = Date.now(), maxAgeMs = 10 * 60_000): OAuthState | null {
  const secret = stateSecret(env); if (!secret || !token) return null;
  const [body, sig] = token.split('.'); if (!body || !sig) return null;
  const want = createHmac('sha256', secret).update(body).digest(); const got = unb64u(sig);
  if (want.length !== got.length || !timingSafeEqual(want, got)) return null;
  try {
    const st = JSON.parse(unb64u(body).toString('utf8')) as OAuthState;
    if (!st || typeof st.iat !== 'number' || now - st.iat > maxAgeMs || now - st.iat < -60_000) return null;
    if (st.kind !== 'org' && st.kind !== 'user') return null;
    return st;
  } catch { return null; }
}

/* ───────── Yetki URL'si + token uçları ───────── */
export function authUrl(o: { clientId: string; redirectUri: string; scopes: string[]; state: string; loginHint?: string }): string {
  const u = new URL(AUTH_URL);
  u.searchParams.set('client_id', o.clientId); u.searchParams.set('redirect_uri', o.redirectUri); u.searchParams.set('response_type', 'code');
  u.searchParams.set('scope', o.scopes.join(' ')); u.searchParams.set('access_type', 'offline'); u.searchParams.set('prompt', 'consent'); u.searchParams.set('include_granted_scopes', 'true');
  u.searchParams.set('state', o.state); if (o.loginHint) u.searchParams.set('login_hint', o.loginHint);
  return u.toString();
}
interface TokenResponse { access_token: string; expires_in: number; refresh_token?: string; scope?: string; token_type?: string; error?: string; error_description?: string }
export interface OAuthDeps { fetchImpl?: typeof fetch; now?: () => number; sleep?: (ms: number) => Promise<unknown> }
const sleepReal = (ms: number) => new Promise((r) => setTimeout(r, ms));
async function tokenPost(params: Record<string, string>, deps: OAuthDeps): Promise<TokenResponse> {
  const f = deps.fetchImpl ?? fetch;
  const r = await f(TOKEN_URL, { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams(params).toString(), signal: AbortSignal.timeout(15_000), cache: 'no-store' });
  const j = (await r.json().catch(() => ({}))) as TokenResponse;
  if (!r.ok) throw new GoogleApiError(r.status, j.error === 'invalid_grant' ? 'Google yetkisi geçersiz ya da geri alınmış — yeniden bağlan' : `Google token hatası: ${j.error_description ?? j.error ?? r.status}`, j.error);
  return j;
}
export const tokensFromResponse = (j: TokenResponse, prevRefresh: string | null, now = Date.now()): GoogleTokens => googleTokensSchema.parse({
  access_token: j.access_token, refresh_token: j.refresh_token ?? prevRefresh ?? '', expires_at: new Date(now + Math.max(60, (j.expires_in ?? 3600) - 60) * 1000).toISOString(), scope: j.scope ?? '', token_type: j.token_type ?? 'Bearer',
});
export async function exchangeCode(env: GoogleEnv, code: string, redirectUri: string, deps: OAuthDeps = {}): Promise<GoogleTokens> {
  const j = await tokenPost({ code, client_id: env.clientId, client_secret: env.clientSecret, redirect_uri: redirectUri, grant_type: 'authorization_code' }, deps);
  if (!j.refresh_token) throw new GoogleApiError(400, 'Google refresh token vermedi — onay ekranında erişimi tekrar onayla (prompt=consent) ya da hesabın üçüncü taraf erişimini kontrol et');
  return tokensFromResponse(j, null, (deps.now ?? Date.now)());
}
/** Yenileme: 5xx / ağ hatasında 2 kez daha dener (1s, 2s); invalid_grant anında fırlatır. */
export async function refreshAccessToken(env: GoogleEnv, t: GoogleTokens, deps: OAuthDeps = {}): Promise<GoogleTokens> {
  const sleep = deps.sleep ?? sleepReal;
  for (let attempt = 0; ; attempt++) {
    try {
      const j = await tokenPost({ refresh_token: t.refresh_token, client_id: env.clientId, client_secret: env.clientSecret, grant_type: 'refresh_token' }, deps);
      return tokensFromResponse(j, t.refresh_token, (deps.now ?? Date.now)());
    } catch (e) {
      const retriable = !(e instanceof GoogleApiError) || e.status >= 500;
      if (!retriable || attempt >= 2) throw e;
      await sleep(1000 * 2 ** attempt);
    }
  }
}
export const isExpired = (t: GoogleTokens, now = Date.now()) => Date.parse(t.expires_at) <= now + 30_000;
export async function revokeToken(token: string, deps: OAuthDeps = {}): Promise<void> {
  const f = deps.fetchImpl ?? fetch;
  await f(`${REVOKE_URL}?token=${encodeURIComponent(token)}`, { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, signal: AbortSignal.timeout(10_000) }).catch(() => undefined);
}
export async function userinfo(accessToken: string, deps: OAuthDeps = {}): Promise<{ email: string; name?: string }> {
  const f = deps.fetchImpl ?? fetch;
  const r = await f(USERINFO_URL, { headers: { authorization: `Bearer ${accessToken}` }, signal: AbortSignal.timeout(10_000), cache: 'no-store' });
  const j = (await r.json().catch(() => ({}))) as { email?: string; name?: string; error?: unknown };
  if (!r.ok || !j.email) throw new GoogleApiError(r.status, 'Google hesabı e-postası okunamadı (userinfo.email kapsamı)');
  return { email: j.email.toLowerCase(), name: j.name };
}

/* ───────── Depo: org (integrations) ───────── */
type Row = Record<string, unknown>;
export async function loadGoogleOrgConfig(admin: SupabaseClient, orgId: string): Promise<GoogleOrgConfig | null> {
  const { data, error } = await admin.from('integrations').select('config').eq('org_id', orgId).eq('provider', 'google').maybeSingle();
  if (error) throw new Error(error.message);
  const p = googleOrgConfigSchema.safeParse((data as Row | null)?.config ?? {});
  return p.success ? p.data : null;
}
export async function saveGoogleOrgConfig(admin: SupabaseClient, orgId: string, patch: Partial<GoogleOrgConfig>, status: 'connected' | 'available' | 'error' = 'connected'): Promise<GoogleOrgConfig> {
  const { data } = await admin.from('integrations').select('id,config').eq('org_id', orgId).eq('provider', 'google').maybeSingle();
  const cur = ((data as Row | null)?.config ?? {}) as Partial<GoogleOrgConfig>;
  const parsed = googleOrgConfigSchema.parse({ ...cur, ...patch });
  const row = { config: parsed, status, last_sync_at: parsed.last_sync_at ?? null, scopes: parsed.scopes };
  const q = data ? admin.from('integrations').update(row).eq('id', (data as Row).id as string) : admin.from('integrations').insert({ ...row, org_id: orgId, provider: 'google', name: 'Google Workspace' });
  const { error } = await q;
  if (error) throw new Error(error.message);
  return parsed;
}
/** Bağlantıyı kaldır: token iptal edilir (best-effort), config temizlenir (history/sayımlar sıfırlanır), satır 'available'. */
export async function clearGoogleOrg(admin: SupabaseClient, orgId: string, deps: OAuthDeps = {}): Promise<void> {
  const { data } = await admin.from('integrations').select('id,config').eq('org_id', orgId).eq('provider', 'google').maybeSingle();
  if (!data) return;
  const cfg = googleOrgConfigSchema.safeParse((data as Row).config ?? {});
  if (cfg.success) { try { const t = decryptJson<GoogleTokens>(cfg.data.tokens_enc); await revokeToken(t.refresh_token, deps); } catch { /* anahtar yok / zaten geçersiz */ } }
  const { error } = await admin.from('integrations').update({ config: {}, status: 'available', scopes: [], last_sync_at: null }).eq('id', (data as Row).id as string);
  if (error) throw new Error(error.message);
}

/* ───────── Depo: kişisel (user_integrations) ───────── */
export interface UserIntegrationRow { user_id: string; provider: string; config: GoogleUserConfig; scopes: string[]; email: string | null; connected_at: string }
export async function loadGoogleUser(admin: SupabaseClient, userId: string): Promise<UserIntegrationRow | null> {
  const { data, error } = await admin.from('user_integrations').select('user_id,provider,config,scopes,email,connected_at').eq('user_id', userId).eq('provider', 'google').maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) return null;
  const cfg = googleUserConfigSchema.safeParse((data as Row).config ?? {});
  return cfg.success ? { ...(data as unknown as UserIntegrationRow), config: cfg.data } : null;
}
export async function saveGoogleUser(admin: SupabaseClient, row: { user_id: string; org_id: string | null; tokens: GoogleTokens; scopes: string[]; email: string; calendar_id?: string }): Promise<void> {
  const config: GoogleUserConfig = { tokens_enc: encryptJson(row.tokens), calendar_id: row.calendar_id ?? 'primary' };
  const { error } = await admin.from('user_integrations').upsert({ user_id: row.user_id, provider: 'google', org_id: row.org_id, config, scopes: row.scopes, email: row.email, connected_at: new Date().toISOString(), updated_at: new Date().toISOString() }, { onConflict: 'user_id,provider' });
  if (error) throw new Error(error.message);
}
export async function clearGoogleUser(admin: SupabaseClient, userId: string, deps: OAuthDeps = {}): Promise<void> {
  const row = await loadGoogleUser(admin, userId);
  if (row) { try { const t = decryptJson<GoogleTokens>(row.config.tokens_enc); await revokeToken(t.refresh_token, deps); } catch { /* yoksay */ } }
  const { error } = await admin.from('user_integrations').delete().eq('user_id', userId).eq('provider', 'google');
  if (error) throw new Error(error.message);
}
export const userGoogleState = (row: UserIntegrationRow | null, env: NodeJS.ProcessEnv = process.env): GoogleUserState => ({
  connected: !!row, email: row?.email ?? null, scopes: row?.scopes ?? [], connected_at: row?.connected_at ?? null, gmail: !!row?.scopes.includes('https://www.googleapis.com/auth/gmail.readonly'), env_ready: googleEnvReady(env),
});

/* ───────── Erişim token'ı (yenileme + kalıcılaştırma) ───────── */
export type TokenOwner = { kind: 'org'; orgId: string } | { kind: 'user'; userId: string };
/** Geçerli erişim token'ı döner; süresi dolmuşsa yeniler ve depoya yazar. Bağlı değilse null. */
export async function getAccessToken(admin: SupabaseClient, owner: TokenOwner, deps: OAuthDeps & { env?: NodeJS.ProcessEnv } = {}): Promise<{ token: string; email: string | null; scopes: string[] } | null> {
  const env = googleEnv(deps.env ?? process.env); if (!env) throw new GoogleApiError(503, 'GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET tanımlı değil');
  const now = (deps.now ?? Date.now)();
  if (owner.kind === 'org') {
    const cfg = await loadGoogleOrgConfig(admin, owner.orgId); if (!cfg) return null;
    let t = decryptJson<GoogleTokens>(cfg.tokens_enc);
    if (isExpired(t, now)) {
      try { t = await refreshAccessToken(env, t, deps); await saveGoogleOrgConfig(admin, owner.orgId, { tokens_enc: encryptJson(t) }); }
      catch (e) { if (e instanceof GoogleApiError && e.reason === 'invalid_grant') await saveGoogleOrgConfig(admin, owner.orgId, { last_sync_error: e.message }, 'error'); throw e; }
    }
    return { token: t.access_token, email: cfg.email, scopes: cfg.scopes };
  }
  const row = await loadGoogleUser(admin, owner.userId); if (!row) return null;
  let t = decryptJson<GoogleTokens>(row.config.tokens_enc);
  if (isExpired(t, now)) {
    t = await refreshAccessToken(env, t, deps);
    const { error } = await admin.from('user_integrations').update({ config: { ...row.config, tokens_enc: encryptJson(t) }, updated_at: new Date().toISOString() }).eq('user_id', owner.userId).eq('provider', 'google');
    if (error) throw new Error(error.message);
  }
  return { token: t.access_token, email: row.email, scopes: row.scopes };
}
export const ORG_SCOPES = GOOGLE_ORG_SCOPES;
