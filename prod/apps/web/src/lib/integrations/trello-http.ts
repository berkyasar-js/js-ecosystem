/** Trello HTTP katmanı (saf fetch sarmalayıcısı; Supabase'e bağımlı değil). YALNIZCA SUNUCU. */
const API = 'https://api.trello.com/1';
export interface TrelloCreds { api_key: string; token: string }
export class TrelloApiError extends Error {
  constructor(public status: number, msg: string) { super(msg); this.name = 'TrelloApiError'; }
}
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export interface TrelloFetchOpts { params?: Record<string, string>; method?: 'GET' | 'POST' | 'PUT' | 'DELETE'; body?: unknown; /** multipart (dosya yükleme) */ form?: FormData; fetchImpl?: typeof fetch; timeoutMs?: number }
export async function trelloFetch<T>(c: TrelloCreds, path: string, opts: TrelloFetchOpts = {}): Promise<T> {
  const url = new URL(API + path);
  for (const [k, v] of Object.entries(opts.params ?? {})) url.searchParams.set(k, v);
  const f = opts.fetchImpl ?? fetch;
  for (let attempt = 0; ; attempt++) {
    const r = await f(url, {
      method: opts.method ?? 'GET',
      headers: { authorization: `OAuth oauth_consumer_key="${c.api_key}", oauth_token="${c.token}"`, accept: 'application/json', ...(opts.body ? { 'content-type': 'application/json' } : {}) },
      body: opts.form ?? (opts.body ? JSON.stringify(opts.body) : undefined), signal: AbortSignal.timeout(opts.timeoutMs ?? 25_000), cache: 'no-store',
    });
    if (r.status === 429 && attempt < 3) { await sleep(1500 * (attempt + 1)); continue; }
    if (!r.ok) {
      const t = (await r.text().catch(() => '')).slice(0, 200);
      throw new TrelloApiError(r.status, r.status === 401 ? 'Trello anahtarı/token geçersiz' : `Trello ${r.status}: ${t}`);
    }
    const txt = await r.text();
    return (txt ? JSON.parse(txt) : {}) as T;
  }
}

/** Kimlik doğrulamalı ikili indirme (Trello'ya yüklenmiş ek). Boyut sınırı aşılırsa null. */
export async function trelloDownload(c: TrelloCreds, url: string, maxBytes: number, fetchImpl: typeof fetch = fetch): Promise<{ data: ArrayBuffer; mime: string } | null> {
  if (!/^https:\/\/([a-z0-9-]+\.)*(trello\.com|trellocdn\.com|atlassian\.com|atl-paas\.net)\//i.test(url)) return null; // başka alan adlarına kimlik bilgisi gönderme
  const r = await fetchImpl(url, { headers: { authorization: `OAuth oauth_consumer_key="${c.api_key}", oauth_token="${c.token}"` }, signal: AbortSignal.timeout(60_000), cache: 'no-store', redirect: 'follow' });
  if (!r.ok) throw new TrelloApiError(r.status, `Trello dosya indirme ${r.status}`);
  const len = Number(r.headers.get('content-length') ?? 0);
  if (len > maxBytes) return null;
  const data = await r.arrayBuffer();
  return data.byteLength > maxBytes ? null : { data, mime: r.headers.get('content-type') ?? '' };
}
