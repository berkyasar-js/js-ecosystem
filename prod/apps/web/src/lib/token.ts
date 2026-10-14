/** Hem tarayıcıda hem Node'da çalışır (WebCrypto). Düz token yalnızca üretildiği anda var olur. */
const hex = (b: Uint8Array) => Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('');
export const generateToken = () => `jsk_${hex(globalThis.crypto.getRandomValues(new Uint8Array(32)))}`;
export const tokenPrefix = (t: string) => `${t.slice(0, 8)}…`;
export async function sha256Hex(s: string): Promise<string> {
  return hex(new Uint8Array(await globalThis.crypto.subtle.digest('SHA-256', new TextEncoder().encode(s))));
}
export const addDaysIso = (nowIso: string, days: number) => new Date(new Date(nowIso).getTime() + days * 86_400_000).toISOString();

export interface TokenRow { id: string; org_id: string; user_id?: string | null; scopes: string[]; expires_at?: string | null; revoked_at?: string | null }
/** Saf kural: iptal edilmemiş, süresi dolmamış ve kapsamı içeren token. */
export function tokenUsable(row: TokenRow | null | undefined, scope: string, nowIso: string): row is TokenRow {
  if (!row || row.revoked_at) return false;
  if (row.expires_at && row.expires_at <= nowIso) return false;
  return row.scopes.includes(scope);
}
