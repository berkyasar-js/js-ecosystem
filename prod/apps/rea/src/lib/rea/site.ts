import dns from 'node:dns/promises';
import fs from 'node:fs';
import path from 'node:path';
import { SITE_LIMITS } from '../limits';
import { isPrivateIpLiteral, normalizeWebUrl } from './requests';

/** Sunucudan, tarayıcı olmadan web sitesi toplama: HTML + script dosyaları → REA'nın JS analizine verilecek dizin. */

export interface ScriptRefs { srcs: string[]; inline: string[] }

/** HTML'den harici script adreslerini (mutlak URL) ve satır içi script gövdelerini çıkarır. */
export function extractScriptRefs(html: string, baseUrl: string): ScriptRefs {
  const srcs: string[] = [];
  const inline: string[] = [];
  const add = (raw: string | undefined) => {
    if (!raw) return;
    try {
      const u = new URL(raw.trim(), baseUrl);
      if ((u.protocol === 'http:' || u.protocol === 'https:') && !srcs.includes(u.toString())) srcs.push(u.toString());
    } catch { /* geçersiz URL */ }
  };
  for (const m of html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)) {
    const attrs = m[1] ?? '';
    const src = attrs.match(/\bsrc\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/i);
    if (src) add(src[1] ?? src[2] ?? src[3]);
    else if (!/\btype\s*=\s*["']?(application\/(ld\+)?json|text\/template|importmap)/i.test(attrs) && m[2]?.trim()) inline.push(m[2]);
  }
  for (const m of html.matchAll(/<link\b[^>]*>/gi)) {
    const tag = m[0];
    if (/\brel\s*=\s*["']?modulepreload/i.test(tag) || (/\brel\s*=\s*["']?preload/i.test(tag) && /\bas\s*=\s*["']?script/i.test(tag))) {
      add(tag.match(/\bhref\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/i)?.slice(1).find(Boolean));
    }
  }
  return { srcs, inline };
}

/** Birinci düzey script içinden ikinci düzey parça (chunk) adreslerini bulur (Next.js `_next/static`, Vite `assets/`). */
export function findChunkRefs(js: string, baseUrl: string): string[] {
  const found = new Set<string>();
  const re = /["'`]((?:\/|\.\/)?(?:_next\/static\/|assets\/|static\/js\/)[A-Za-z0-9_\-./%~+]+\.m?js)["'`]/g;
  for (const m of js.matchAll(re)) {
    try {
      const rel = m[1].startsWith('/') || m[1].startsWith('./') ? m[1] : `/${m[1]}`;
      found.add(new URL(rel, baseUrl).toString());
    } catch { /* geçersiz */ }
    if (found.size > 80) break;
  }
  return [...found];
}

/** URL → dizin içi güvenli göreli yol. */
export function urlToRelPath(url: string): string {
  const u = new URL(url);
  const clean = (s: string) => s.replace(/[^\w.\-@]+/g, '_').replace(/^\.+/, '_');
  const segs = u.pathname.split('/').filter(Boolean).map(clean);
  let file = segs.pop() || 'index.js';
  if (!/\.m?js$/i.test(file)) file += '.js';
  return ['scripts', clean(u.host), ...segs, file].join('/');
}

export async function assertPublicHost(host: string): Promise<void> {
  if (isPrivateIpLiteral(host)) throw new Error('Özel ağ adresi.');
  let addrs: { address: string }[];
  try { addrs = await dns.lookup(host, { all: true }); } catch { throw new Error('Alan adı çözümlenemedi.'); }
  if (!addrs.length || addrs.some((a) => isPrivateIpLiteral(a.address))) throw new Error('Alan adı özel/iç ağa çözümleniyor.');
}

interface Fetched { url: string; status: number; type: string; body: Buffer }

/** Yönlendirmeleri elle izleyip her sıçramada SSRF denetimi yapan, boyut/süre sınırlı fetch. */
export async function guardedFetch(startUrl: string, maxBytes: number, timeoutMs: number = SITE_LIMITS.timeoutMs): Promise<Fetched> {
  let url = startUrl;
  for (let hop = 0; hop < 5; hop++) {
    const n = normalizeWebUrl(url);
    if (!n.ok) throw new Error(n.error);
    await assertPublicHost(new URL(n.url).hostname);
    const res = await fetch(n.url, {
      redirect: 'manual',
      signal: AbortSignal.timeout(timeoutMs),
      headers: { 'user-agent': 'JobsStudio-REA/0.1 (+statik analiz)', accept: 'text/html,application/javascript,*/*;q=0.5' },
    });
    if (res.status >= 300 && res.status < 400 && res.headers.get('location')) { url = new URL(res.headers.get('location') as string, n.url).toString(); continue; }
    const declared = Number(res.headers.get('content-length') ?? 0);
    if (declared > maxBytes) throw new Error(`Yanıt çok büyük (${Math.round(declared / 1024)} KB).`);
    const reader = res.body?.getReader();
    const chunks: Buffer[] = [];
    let total = 0;
    if (reader) {
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        total += value.byteLength;
        if (total > maxBytes) { await reader.cancel(); throw new Error('Yanıt boyut sınırını aştı.'); }
        chunks.push(Buffer.from(value));
      }
    }
    return { url: n.url, status: res.status, type: res.headers.get('content-type') ?? '', body: Buffer.concat(chunks) };
  }
  throw new Error('Çok fazla yönlendirme.');
}

export interface SiteResult { dir: string; pageUrl: string; files: string[]; bytes: number; notes: string[] }

export async function collectSite(startUrl: string, dest: string, onProgress?: (msg: string, done: number, total: number) => void): Promise<SiteResult> {
  const L = SITE_LIMITS;
  fs.mkdirSync(dest, { recursive: true });
  const notes: string[] = [];
  const page = await guardedFetch(startUrl, L.maxHtmlBytes);
  if (page.status >= 400) throw new Error(`Sayfa ${page.status} döndürdü.`);
  const html = page.body.toString('utf8');
  fs.writeFileSync(path.join(dest, 'index.html'), html);
  const refs = extractScriptRefs(html, page.url);
  const pageHost = new URL(page.url).host;
  const files: string[] = ['index.html'];
  let bytes = page.body.length;

  refs.inline.slice(0, 20).forEach((code, i) => {
    const rel = `scripts/inline/inline-${i + 1}.js`;
    fs.mkdirSync(path.join(dest, 'scripts/inline'), { recursive: true });
    fs.writeFileSync(path.join(dest, rel), code);
    files.push(rel);
    bytes += code.length;
  });

  const queue = [...refs.srcs].sort((a, b) => Number(new URL(b).host === pageHost) - Number(new URL(a).host === pageHost));
  const done = new Set<string>();
  let fetched = 0;
  while (queue.length && fetched < L.maxScripts && bytes < L.maxTotalBytes) {
    const u = queue.shift() as string;
    if (done.has(u)) continue;
    done.add(u);
    onProgress?.(`Script indiriliyor: ${new URL(u).pathname.split('/').pop() ?? u}`, fetched, Math.min(L.maxScripts, fetched + queue.length + 1));
    try {
      const r = await guardedFetch(u, L.maxFileBytes);
      if (r.status >= 400) { notes.push(`${u} → ${r.status}`); continue; }
      const rel = urlToRelPath(r.url);
      const target = path.join(dest, rel);
      if (!target.startsWith(dest + path.sep)) continue;
      fs.mkdirSync(path.dirname(target), { recursive: true });
      fs.writeFileSync(target, r.body);
      files.push(rel);
      bytes += r.body.length;
      fetched++;
      if (new URL(r.url).host === pageHost && fetched <= 8) {
        for (const c of findChunkRefs(r.body.toString('utf8'), r.url)) if (!done.has(c) && !queue.includes(c) && new URL(c).host === pageHost) queue.push(c);
      }
    } catch (e) {
      notes.push(`${u} alınamadı: ${e instanceof Error ? e.message : 'hata'}`);
    }
  }
  if (queue.length) notes.push(`Sınır nedeniyle ${queue.length} script atlandı (en çok ${L.maxScripts} dosya / ${Math.round(L.maxTotalBytes / 1048576)} MB).`);
  if (files.length <= 1) notes.push('Sayfada harici script bulunamadı; içerik büyük olasılıkla tarayıcıda çalışan bir uygulama değil ya da istemci tarafında geç yükleniyor.');
  return { dir: dest, pageUrl: page.url, files, bytes, notes };
}
