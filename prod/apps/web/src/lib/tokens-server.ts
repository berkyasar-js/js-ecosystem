import { createAdmin } from './supabase/admin';
import { sha256Hex, tokenUsable, type TokenRow } from './token';

export const bearerOf = (req: Request) => {
  const m = req.headers.get('authorization')?.match(/^Bearer\s+(.+)$/i);
  return m ? m[1].trim() : null;
};

/** Supabase: sha256(token) ↔ access_tokens.token_hash. Geçerliyse son kullanım zamanını günceller. */
export async function authenticateBearer(token: string, scope: string): Promise<{ org_id: string; user_id: string | null; token_id: string } | null> {
  const admin = createAdmin();
  if (!admin) return null;
  const { data } = await admin.from('access_tokens').select('id,org_id,user_id,scopes,expires_at,revoked_at').eq('token_hash', await sha256Hex(token)).maybeSingle();
  const row = data as TokenRow | null;
  if (!tokenUsable(row, scope, new Date().toISOString())) return null;
  void admin.from('access_tokens').update({ last_used_at: new Date().toISOString() }).eq('id', row.id);
  return { org_id: row.org_id, user_id: row.user_id ?? null, token_id: row.id };
}
