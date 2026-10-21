import fs from 'node:fs';
import path from 'node:path';
import { snippetFrom, type SnippetReader } from './digest';
import type { DigestItem, HelperCandidate } from '../types';

const TEXT_EXT = new Set(['.js', '.mjs', '.cjs', '.jsx', '.ts', '.tsx', '.html', '.htm', '.json']);
const NATIVE_EXT = new Set(['.node', '.exe', '.dll', '.dylib', '.so']);

/** `root` altında, simge bağlantılarını izlemeden, dosyaları gezer. */
export function walkFiles(root: string, cap = 20000): string[] {
  const out: string[] = [];
  const stack = [root];
  while (stack.length && out.length < cap) {
    const dir = stack.pop() as string;
    let ents: fs.Dirent[];
    try { ents = fs.readdirSync(dir, { withFileTypes: true }); } catch { continue; }
    for (const e of ents) {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) stack.push(p);
      else if (e.isFile()) out.push(p);
    }
  }
  return out;
}

/** Yol çıkışını (../) engelleyen güvenli birleştirme. */
export function safeJoin(root: string, rel: string): string | null {
  const p = path.resolve(root, rel);
  return p === root || p.startsWith(root + path.sep) ? p : null;
}

export function makeSnippetReader(root: string): SnippetReader {
  const cache = new Map<string, string | null>();
  return (file, line, col) => {
    if (!line) return null;
    let text = cache.get(file);
    if (text === undefined) {
      const p = safeJoin(root, file);
      try { text = p && fs.statSync(p).size < 12 * 1024 * 1024 ? fs.readFileSync(p, 'utf8') : null; } catch { text = null; }
      if (cache.size > 60) cache.clear();
      cache.set(file, text);
    }
    return text ? snippetFrom(text, line, col) : null;
  };
}

/** Anahtar kelimeleri paketlenmiş kaynakta arar (REA "izle" komutu 0 sonuç verse bile işe yarar — rehberdeki yöntem). */
export function grepSources(root: string, keywords: string[], maxHits = 60): DigestItem[] {
  const kws = keywords.map((k) => k.toLowerCase()).filter((k) => k.length >= 3);
  if (!kws.length) return [];
  const hits: DigestItem[] = [];
  const perKw = new Map<string, number>();
  for (const f of walkFiles(root)) {
    if (hits.length >= maxHits) break;
    if (!TEXT_EXT.has(path.extname(f).toLowerCase())) continue;
    let text: string;
    try { if (fs.statSync(f).size > 12 * 1024 * 1024) continue; text = fs.readFileSync(f, 'utf8'); } catch { continue; }
    const low = text.toLowerCase();
    for (const kw of kws) {
      if ((perKw.get(kw) ?? 0) >= 8) continue;
      let idx = low.indexOf(kw);
      let guard = 0;
      while (idx !== -1 && guard++ < 2 && (perKw.get(kw) ?? 0) < 8) {
        const before = text.lastIndexOf('\n', idx);
        const line = text.slice(0, idx).split('\n').length;
        const col = idx - (before + 1);
        hits.push({ kind: 'keyword', label: kw, file: path.relative(root, f).split(path.sep).join('/'), line, snippet: snippetFrom(text, line, col), note: 'kaynakta metin araması' });
        perKw.set(kw, (perKw.get(kw) ?? 0) + 1);
        idx = low.indexOf(kw, idx + kw.length + 400);
      }
    }
  }
  return hits.slice(0, maxHits);
}

function magicKind(file: string): string | null {
  let fd: number | null = null;
  try {
    fd = fs.openSync(file, 'r');
    const b = Buffer.alloc(4);
    fs.readSync(fd, b, 0, 4, 0);
    const hex = b.toString('hex');
    if (['feedface', 'feedfacf', 'cefaedfe', 'cffaedfe', 'cafebabe'].includes(hex)) return 'Mach-O';
    if (hex === '7f454c46') return 'ELF';
    if (hex.startsWith('4d5a')) return 'Windows PE';
  } catch { /* okunamadı */ } finally { if (fd !== null) fs.closeSync(fd); }
  return null;
}

/** Paketin içinde ayrı çalışan yardımcı program (derlenmiş ikili, .node eklentisi, "helper" klasörü) arar. */
export function scanHelpers(root: string, max = 30): HelperCandidate[] {
  const out: HelperCandidate[] = [];
  const seen = new Set<string>();
  for (const f of walkFiles(root)) {
    if (out.length >= max) break;
    const rel = path.relative(root, f).split(path.sep).join('/');
    const ext = path.extname(f).toLowerCase();
    if (TEXT_EXT.has(ext) || /\.(png|jpe?g|svg|gif|ico|woff2?|ttf|css|map|md|txt)$/i.test(ext)) continue;
    const dirHint = /(helper|native|swift|sidecar|daemon|agent)[^/]*\//i.test(rel + '/') ? 'yardımcı/native klasör adı' : null;
    const kind = NATIVE_EXT.has(ext) ? (ext === '.node' ? 'Node native eklentisi' : 'çalıştırılabilir/kütüphane') : magicKind(f);
    if (!kind && !dirHint) continue;
    const key = rel;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ path: rel, why: [kind, dirHint].filter(Boolean).join(' · ') });
  }
  return out;
}

/** asar'ı hedef dizine açar. Paket dışı (unpacked) eksik dosyalar atlanır. */
export async function extractAsar(archive: string, dest: string): Promise<{ ok: boolean; skipped: number }> {
  const mod = (await import('@electron/asar')) as unknown as { default?: AsarApi } & AsarApi;
  const asar: AsarApi = mod.default ?? mod;
  fs.mkdirSync(dest, { recursive: true });
  try { asar.extractAll(archive, dest); return { ok: true, skipped: 0 }; } catch { /* tek tek dene */ }
  let skipped = 0;
  for (const entry of asar.listPackage(archive, { isPack: false })) {
    const rel = entry.replace(/^[\\/]/, '');
    const target = safeJoin(dest, rel);
    if (!target) { skipped++; continue; }
    try {
      const buf = asar.extractFile(archive, rel);
      fs.mkdirSync(path.dirname(target), { recursive: true });
      fs.writeFileSync(target, buf);
    } catch { skipped++; }
  }
  return { ok: true, skipped };
}
interface AsarApi {
  extractAll(archive: string, dest: string): void;
  listPackage(archive: string, options: { isPack: boolean }): string[];
  extractFile(archive: string, filename: string): Buffer;
}
