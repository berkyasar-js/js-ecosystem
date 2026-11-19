import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';

/**
 * Entegrasyon sırları için AES-256-GCM (yalnızca sunucu). Anahtar `INTEGRATIONS_ENC_KEY` env'inden: 32 bayt base64 / 64 hex ya da
 * herhangi bir uzun parola (sha256 ile türetilir). Anahtar yoksa saklama REDDEDİLİR (açık metin token yazılmaz).
 * Biçim: `enc:v1:<iv b64>:<tag b64>:<ciphertext b64>`.
 */
export class EncKeyMissingError extends Error {
  constructor() { super('INTEGRATIONS_ENC_KEY tanımlı değil — Google token’ları şifrelenmeden saklanmaz. Vercel env’e 32 baytlık (base64) bir anahtar ekle: `openssl rand -base64 32`.'); this.name = 'EncKeyMissingError'; }
}
export const encKeyReady = (env: NodeJS.ProcessEnv = process.env) => !!env.INTEGRATIONS_ENC_KEY?.trim() && env.INTEGRATIONS_ENC_KEY.trim().length >= 16;

export function deriveKey(raw: string): Buffer {
  const s = raw.trim();
  if (/^[0-9a-f]{64}$/i.test(s)) return Buffer.from(s, 'hex');
  if (/^[A-Za-z0-9+/=_-]{43,44}$/.test(s)) { const b = Buffer.from(s.replace(/-/g, '+').replace(/_/g, '/'), 'base64'); if (b.length === 32) return b; }
  return createHash('sha256').update(s, 'utf8').digest();
}
const keyFromEnv = (env: NodeJS.ProcessEnv) => { if (!encKeyReady(env)) throw new EncKeyMissingError(); return deriveKey(env.INTEGRATIONS_ENC_KEY as string); };

export function encryptJson(value: unknown, env: NodeJS.ProcessEnv = process.env): string {
  const key = keyFromEnv(env);
  const iv = randomBytes(12);
  const c = createCipheriv('aes-256-gcm', key, iv);
  const ct = Buffer.concat([c.update(JSON.stringify(value), 'utf8'), c.final()]);
  return `enc:v1:${iv.toString('base64')}:${c.getAuthTag().toString('base64')}:${ct.toString('base64')}`;
}
export function decryptJson<T = unknown>(blob: string, env: NodeJS.ProcessEnv = process.env): T {
  const key = keyFromEnv(env);
  const parts = blob.split(':');
  if (parts.length !== 5 || parts[0] !== 'enc' || parts[1] !== 'v1') throw new Error('Şifreli veri biçimi tanınmadı');
  const d = createDecipheriv('aes-256-gcm', key, Buffer.from(parts[2], 'base64'));
  d.setAuthTag(Buffer.from(parts[3], 'base64'));
  const pt = Buffer.concat([d.update(Buffer.from(parts[4], 'base64')), d.final()]);
  return JSON.parse(pt.toString('utf8')) as T;
}
export const isEncrypted = (s: unknown): s is string => typeof s === 'string' && s.startsWith('enc:v1:');
