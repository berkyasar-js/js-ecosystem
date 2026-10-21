import { MAX_UPLOAD_BYTES, REA_ANALYSIS_TIMEOUT_MS, REA_MAX_HEAP_MB } from '../limits';
import type { Project, TargetKind } from '../types';

/** Saf (yan etkisiz) yardımcılar: REA komut satırı ve istek gövdelerini üretir. Test edilir. */

export type IntegrityPolicy = 'fail' | 'record-and-continue';

export type NormalizedUrl = { ok: true; url: string; host: string } | { ok: false; error: string };

/** URL'yi doğrular. Yalnızca http/https, kullanıcı bilgisi yok, localhost/özel IP yazımı reddedilir (SSRF'nin ilk katmanı; DNS katmanı site.ts'te). */
export function normalizeWebUrl(input: string): NormalizedUrl {
  const raw = input.trim();
  if (!raw) return { ok: false, error: 'Adres boş.' };
  let u: URL;
  try { u = new URL(/^[a-z][a-z0-9+.-]*:\/\//i.test(raw) ? raw : `https://${raw}`); } catch { return { ok: false, error: 'Geçerli bir adres değil.' }; }
  if (u.protocol !== 'http:' && u.protocol !== 'https:') return { ok: false, error: 'Yalnızca http ve https adresleri incelenebilir.' };
  if (u.username || u.password) return { ok: false, error: 'Adreste kullanıcı adı/parola olamaz.' };
  const host = u.hostname.toLowerCase();
  if (!host.includes('.') || host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.local') || host.endsWith('.internal')) {
    return { ok: false, error: 'Yerel ya da iç ağ adresleri sunucudan incelenemez. Bu durumda "Bilgisayarımda" seçeneğini kullan.' };
  }
  if (isPrivateIpLiteral(host)) return { ok: false, error: 'Özel ağ IP adresleri incelenemez.' };
  u.hash = '';
  return { ok: true, url: u.toString(), host };
}

/** IPv4/IPv6 sabit adresleri için özel-aralık kontrolü (DNS çözümlemesinden sonra da kullanılır). */
export function isPrivateIpLiteral(host: string): boolean {
  const h = host.replace(/^\[|\]$/g, '').toLowerCase();
  const v4 = h.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (v4) {
    const [a, b] = [Number(v4[1]), Number(v4[2])];
    return a === 0 || a === 10 || a === 127 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127) || a >= 224;
  }
  if (h.includes(':')) {
    if (h === '::1' || h === '::') return true;
    const mapped = h.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
    if (mapped) return isPrivateIpLiteral(mapped[1]);
    return /^(fc|fd|fe[89ab])/.test(h);
  }
  // 0x7f000001 / 2130706433 gibi tek parça sayısal yazımlar
  if (/^(0x[0-9a-f]+|\d+)$/i.test(h)) return true;
  return false;
}

export interface AnalyzeOptions {
  inputPath: string;
  integrity?: IntegrityPolicy;
  timeoutMs?: number;
  maxHeapMb?: number;
  sourcePaths?: string[];
}

/** `rea analyze-javascript-application <yol> --json ...` argv listesi. */
export function buildAnalyzeArgs(o: AnalyzeOptions): string[] {
  const args = ['analyze-javascript-application', o.inputPath, '--json'];
  args.push('--integrity-policy', o.integrity ?? 'record-and-continue');
  args.push('--analysis-timeout-ms', String(Math.max(10_000, Math.floor(o.timeoutMs ?? REA_ANALYSIS_TIMEOUT_MS))));
  args.push('--max-heap-mb', String(Math.max(256, Math.floor(o.maxHeapMb ?? REA_MAX_HEAP_MB))));
  for (const p of o.sourcePaths ?? []) args.push('--source-path', p);
  return args;
}

/** `inspect-analysis-view` istek gövdesi (rehberdeki jq çıktısının birebir karşılığı). */
export function buildSummaryRequest(evidence: unknown) {
  return { source: { kind: 'inline' as const, evidence }, view: { kind: 'summary' as const } };
}
export function buildInspectArgs(requestJsonPath: string): string[] {
  return ['inspect-analysis-view', requestJsonPath, '--json'];
}

export type SeedKind = 'channel' | 'string' | 'route' | 'module' | 'native-export';
/** `trace-application-feature` gövdesi: `application` doğrudan ham kanıt JSON'udur (inline sarmalayıcı değil). */
export function buildTraceRequest(evidence: unknown, seed: { kind: SeedKind; value: string }) {
  return { application: evidence, seed: { kind: seed.kind, value: seed.value, match: 'exact' as const } };
}
export function buildTraceArgs(requestJsonPath: string): string[] {
  return ['trace-application-feature', requestJsonPath, '--json'];
}

export type RunRequest =
  | { mode: 'web'; url: string; host: string }
  | { mode: 'bundle'; uploadPath: string; ext: '.asar' | '.zip'; bytes: number | null }
  | { mode: 'local'; uploadPath: string; bytes: number | null };

export type RunRequestResult = { ok: true; request: RunRequest } | { ok: false; error: string };

/** Projeden, çalıştırılacak işin doğrulanmış tanımı. */
export function buildRunRequest(p: Pick<Project, 'target_kind' | 'target_url' | 'upload_path' | 'upload_name' | 'upload_bytes' | 'org_id'>): RunRequestResult {
  if (p.target_kind === 'web') {
    const n = normalizeWebUrl(p.target_url ?? '');
    return n.ok ? { ok: true, request: { mode: 'web', url: n.url, host: n.host } } : n;
  }
  if (!p.upload_path) return { ok: false, error: 'Önce dosyayı yükle.' };
  if (!p.upload_path.startsWith(`${p.org_id}/`) || p.upload_path.includes('..')) return { ok: false, error: 'Yükleme yolu bu kuruluşa ait değil.' };
  if (p.upload_bytes != null && p.upload_bytes > MAX_UPLOAD_BYTES) return { ok: false, error: `Dosya ${Math.round(MAX_UPLOAD_BYTES / 1048576)} MB sınırını aşıyor.` };
  const name = (p.upload_name ?? p.upload_path).toLowerCase();
  if (p.target_kind === 'local') {
    return name.endsWith('.json') ? { ok: true, request: { mode: 'local', uploadPath: p.upload_path, bytes: p.upload_bytes } } : { ok: false, error: 'Bilgisayarımda modunda yalnızca REA\'nın .json çıktısı yüklenir.' };
  }
  const ext = name.endsWith('.asar') ? '.asar' : name.endsWith('.zip') ? '.zip' : null;
  if (!ext) return { ok: false, error: 'Yalnızca .asar ya da .zip yüklenebilir.' };
  return { ok: true, request: { mode: 'bundle', uploadPath: p.upload_path, ext, bytes: p.upload_bytes } };
}

/** Yükleme dosyası için güvenli ad ve uzantı denetimi. */
export function validateUpload(kind: Exclude<TargetKind, 'web'>, filename: string, size: number): { ok: true; safeName: string } | { ok: false; error: string } {
  const base = filename.split(/[\\/]/).pop() ?? '';
  const safeName = base.normalize('NFKD').replace(/[^\w.\-]+/g, '_').replace(/^\.+/, '').slice(-80) || 'dosya';
  const lower = safeName.toLowerCase();
  const okExt = kind === 'bundle' ? lower.endsWith('.asar') || lower.endsWith('.zip') : lower.endsWith('.json');
  if (!okExt) return { ok: false, error: kind === 'bundle' ? 'Yalnızca .asar veya .zip kabul edilir.' : 'Yalnızca .json kabul edilir.' };
  if (!Number.isFinite(size) || size <= 0) return { ok: false, error: 'Dosya boş.' };
  if (size > MAX_UPLOAD_BYTES) return { ok: false, error: `Dosya ${Math.round(MAX_UPLOAD_BYTES / 1048576)} MB sınırını aşıyor. Büyük paketler için "Bilgisayarımda" modunu kullan.` };
  return { ok: true, safeName };
}

export interface LocalStep { title: string; note?: string; command: string }

/** "Bilgisayarımda" modu: kullanıcının kendi makinesinde çalıştıracağı kopyala-yapıştır komutlar. */
export function buildLocalCommands(hint: string | null | undefined, projectName = 'analiz'): LocalStep[] {
  const slug = projectName.normalize('NFKD').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 32) || 'analiz';
  const h = (hint ?? '').trim();
  const isWeb = /^https?:\/\//i.test(h);
  const steps: LocalStep[] = [{ title: 'Node sürümünü kontrol et', note: 'REA Node.js 22.19 ya da üstünü ister.', command: 'node -v' }];
  if (isWeb) {
    steps.push(
      { title: 'Chrome\'u uzaktan hata ayıklama portuyla aç', note: 'Sayfayı bu pencerede açıp gezin; işlem bitince kapatabilirsin.', command: `google-chrome --remote-debugging-port=9222 --user-data-dir=/tmp/rea-chrome "${h}"` },
      { title: 'Sayfa hedefini bul', command: 'npx -y rea-agents@latest list-browser-targets http://127.0.0.1:9222' },
      { title: 'Paketi yakala ve analiz et', note: '<targetId> yerine bir önceki çıktıdaki kimliği yaz.', command: `npx -y rea-agents@latest analyze-web-bundle http://127.0.0.1:9222 <targetId> --fetch-source-maps --json > ${slug}.json` },
    );
  } else {
    const path = h || '/Applications/UygulamaAdı.app/Contents/Resources/app.asar';
    steps.push(
      { title: 'Uygulamayı analiz et', note: 'Kendi kurduğun, güvendiğin bir uygulamaysa --integrity-policy record-and-continue ekli kalsın. Çıktı büyük olabilir (Wispr Flow: 59 MB).', command: `npx -y rea-agents@latest analyze-javascript-application "${path}" --integrity-policy record-and-continue --json > ${slug}.json` },
    );
  }
  steps.push(
    { title: 'Özet görünümü (isteğe bağlı kontrol)', note: 'jq kuruluysa. Özet çıktısı büyük dosyayı yüklemeden önce sağlıklı olduğunu gösterir.', command: `jq -c '{source: {kind: "inline", evidence: .}, view: {kind: "summary"}}' ${slug}.json > ozet-istek.json && npx -y rea-agents@latest inspect-analysis-view ozet-istek.json` },
    { title: `${slug}.json dosyasını buraya yükle`, note: `En çok ${Math.round(MAX_UPLOAD_BYTES / 1048576)} MB. Daha büyükse analizi --source-path ile daraltıp yeniden çalıştır.`, command: `ls -lh ${slug}.json` },
  );
  return steps;
}

const STOP = new Set(['nasıl', 'nasil', 'neden', 'nerede', 'hangi', 'için', 'icin', 'gibi', 'olan', 'olarak', 'bunu', 'şunu', 'butona', 'basınca', 'basinca', 'ne', 'oluyor', 'çalışıyor', 'calisiyor', 'yapıyor', 'yapiyor', 'özellik', 'uygulama', 'uygulamada', 'adım', 'adim', 'kodda', 'çıkar', 'cikar', 'bulmak', 'bana', 'göster', 'goster', 'ile', 'veya', 'ama', 'the', 'and', 'how', 'does', 'what', 'work', 'works', 'feature', 'with', 'this', 'that', 'when', 'from']);

/** Sorudan ve kullanıcının verdiği tohum terimlerden aranacak anahtar kelimeleri çıkarır (camelCase/snake/kebab tanımlayıcılar öncelikli). */
export function extractKeywords(question: string, seeds: string[] = [], max = 12): string[] {
  const out: string[] = [];
  const push = (w: string) => { const t = w.trim(); if (t.length >= 3 && t.length <= 60 && !out.some((x) => x.toLowerCase() === t.toLowerCase())) out.push(t); };
  seeds.forEach(push);
  const ids = question.match(/[A-Za-z_][A-Za-z0-9_]*(?:[-.][A-Za-z0-9_]+)*/g) ?? [];
  const identifiers = ids.filter((w) => /[a-z][A-Z]|_|-|\./.test(w) || /^[A-Z][a-z]+[A-Z]/.test(w));
  identifiers.forEach(push);
  for (const w of question.split(/[^\p{L}\p{N}]+/u)) {
    const l = w.toLocaleLowerCase('tr');
    if (l.length >= 4 && !STOP.has(l)) push(w);
  }
  return out.slice(0, max);
}
