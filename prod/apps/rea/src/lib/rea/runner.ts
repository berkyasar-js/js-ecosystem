import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { unzipSync } from 'fflate';
import { MAX_EVIDENCE_DB_BYTES, MAX_UPLOAD_BYTES, REA_ANALYSIS_TIMEOUT_MS, RUN_MAX_DURATION_S } from '../limits';
import { createAdmin } from '../supabase/admin';
import type { Store } from '../store/types';
import type { Actor, Digest, DigestItem, Project, Run } from '../types';
import { buildDigest, classifyEvidence, reduceSummary } from './digest';
import { describeProgress, overallPercent, parseProgressLine } from './progress';
import { buildAnalyzeArgs, buildInspectArgs, buildRunRequest, buildSummaryRequest, extractKeywords } from './requests';
import { collectSite } from './site';
import { extractAsar, grepSources, makeSnippetReader, safeJoin, scanHelpers, walkFiles } from './sources';

/* eslint-disable @typescript-eslint/no-explicit-any */

export function resolveReaBin(): string {
  if (process.env.REA_BIN) return process.env.REA_BIN;
  const starts = [process.cwd(), __dirname];
  for (const s of starts) {
    let dir = s;
    for (let i = 0; i < 8; i++) {
      const cand = path.join(dir, 'node_modules', 'rea-agents', 'scripts', 'rea.mjs');
      if (fs.existsSync(cand)) return cand;
      const up = path.dirname(dir);
      if (up === dir) break;
      dir = up;
    }
  }
  throw new Error('rea-agents bulunamadı (node_modules/rea-agents). `npm install` çalıştırıldı mı?');
}

interface ReaResult { code: number | null; stderrTail: string; timedOut: boolean }

/** REA CLI'yi çalıştırır; stdout bir dosyaya akar (büyük JSON bellekte tutulmaz), stderr ilerleme satırlarıdır. */
export function runRea(args: string[], opts: { cwd: string; stdoutFile: string; timeoutMs: number; onProgress?: (line: string) => void }): Promise<ReaResult> {
  return new Promise((resolve, reject) => {
    let out: number;
    try { out = fs.openSync(opts.stdoutFile, 'w'); } catch (e) { reject(e); return; }
    const env: NodeJS.ProcessEnv = { PATH: process.env.PATH, HOME: path.join(opts.cwd, '.home'), TMPDIR: opts.cwd, NO_COLOR: '1', CI: '1', NODE_ENV: 'production' };
    fs.mkdirSync(env.HOME as string, { recursive: true });
    const child = spawn(process.execPath, [resolveReaBin(), ...args], { cwd: opts.cwd, env, stdio: ['ignore', out, 'pipe'] });
    let tail = '';
    let buf = '';
    let timedOut = false;
    const timer = setTimeout(() => { timedOut = true; child.kill('SIGKILL'); }, opts.timeoutMs);
    child.stderr?.on('data', (d: Buffer) => {
      buf += d.toString('utf8');
      let i: number;
      while ((i = buf.indexOf('\n')) !== -1) {
        const line = buf.slice(0, i); buf = buf.slice(i + 1);
        if (line.includes('rea_progress')) opts.onProgress?.(line); else tail = (tail + line + '\n').slice(-2000);
      }
    });
    child.on('error', (e) => { clearTimeout(timer); fs.closeSync(out); reject(e); });
    child.on('close', (code) => { clearTimeout(timer); fs.closeSync(out); resolve({ code, stderrTail: (tail + buf).slice(-2000), timedOut }); });
  });
}

/** REA hata zarfından (JSON) okunur bir mesaj çıkarır. */
export function reaErrorMessage(stdoutFile: string, stderrTail: string): string {
  for (const src of [() => fs.readFileSync(stdoutFile, 'utf8').slice(0, 20000), () => stderrTail]) {
    try {
      const txt = src();
      const m = txt.match(/\{"error".*\}/);
      if (m) { const e = JSON.parse(m[0]) as { message?: string; error?: string; details?: { issues?: Array<{ message?: string; reason?: string }> } }; return [e.error, e.message, e.details?.issues?.[0]?.message ?? e.details?.issues?.[0]?.reason].filter(Boolean).join(' — '); }
    } catch { /* sonraki kaynak */ }
  }
  return stderrTail.trim().split('\n').slice(-2).join(' ') || 'REA beklenmedik şekilde sonlandı.';
}

function findTarget(root: string): { kind: 'asar' | 'dir'; path: string } {
  const files = walkFiles(root);
  const asars = files.filter((f) => path.basename(f) === 'app.asar').sort((a, b) => a.length - b.length);
  if (asars[0]) return { kind: 'asar', path: asars[0] };
  const anyAsar = files.filter((f) => f.endsWith('.asar')).sort((a, b) => b.length - a.length)[0];
  if (anyAsar) return { kind: 'asar', path: anyAsar };
  const pkgs = files.filter((f) => path.basename(f) === 'package.json' && !f.includes(`${path.sep}node_modules${path.sep}`)).sort((a, b) => a.length - b.length);
  return { kind: 'dir', path: pkgs[0] ? path.dirname(pkgs[0]) : root };
}

function unzipTo(buf: Buffer, dest: string): void {
  let total = 0;
  const entries = unzipSync(new Uint8Array(buf), { filter: (f) => { total += f.originalSize; if (total > 450 * 1024 * 1024) throw new Error('Zip açılmış boyutu 450 MB sınırını aşıyor.'); return !f.name.endsWith('/'); } });
  for (const [name, data] of Object.entries(entries)) {
    const target = safeJoin(dest, name);
    if (!target) continue; // zip-slip
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, data);
  }
}

async function download(uploadPath: string): Promise<Buffer> {
  const admin = createAdmin();
  if (!admin) throw new Error('Yüklenen dosyalar yalnızca Supabase bağlıyken okunabilir (demo modunda yükleme yok).');
  const { data, error } = await admin.storage.from('rea-uploads').download(uploadPath);
  if (error || !data) throw new Error(`Yükleme okunamadı: ${error?.message ?? 'bulunamadı'}`);
  const buf = Buffer.from(await data.arrayBuffer());
  if (buf.length > MAX_UPLOAD_BYTES) throw new Error('Dosya yükleme sınırını aşıyor.');
  return buf;
}

/** Bir analiz çalıştırmasını baştan sona yürütür; ilerleme `runs` satırına yazılır (arayüz yoklar). */
export async function executeRun(actor: Actor, store: Store, project: Project, run: Run): Promise<void> {
  const orgId = actor.orgId;
  const t0 = Date.now();
  const deadline = t0 + (RUN_MAX_DURATION_S - 25) * 1000;
  const work = fs.mkdtempSync(path.join(os.tmpdir(), 'rea-'));
  const log: string[] = [];
  let lastWrite = 0;
  const push = async (stage: Run['stage'], progress: number, message: string, force = false) => {
    if (log[log.length - 1] !== message) log.push(message);
    if (log.length > 80) log.splice(0, log.length - 80);
    const nowMs = Date.now();
    if (!force && nowMs - lastWrite < 1200) return;
    lastWrite = nowMs;
    try { await store.updateRun(orgId, run.id, { status: 'running', stage, progress, message, log: [...log] }); } catch { /* ilerleme yazımı kritik değil */ }
  };

  try {
    await store.updateRun(orgId, run.id, { status: 'running', stage: 'hazirlik', progress: 2, message: 'Başlatıldı', started_at: new Date().toISOString(), error: null });
    await store.updateProject(orgId, project.id, { status: 'running' });
    const rq = buildRunRequest(project);
    if (!rq.ok) throw new Error(rq.error);
    const q = rq.request;

    let sourceRoot: string | null = null;
    let analyzeInput: string | null = null;
    let evidence: any = null;
    const evFile = path.join(work, 'evidence.json');
    const notes: string[] = [];

    if (q.mode === 'web') {
      await push('indirme', overallPercent('indirme', 0), `Sayfa indiriliyor: ${q.url}`, true);
      const site = await collectSite(q.url, path.join(work, 'site'), (m, d, t) => { void push('indirme', overallPercent('indirme', t ? d / t : 0), m); });
      notes.push(...site.notes);
      await push('indirme', overallPercent('indirme', 1), `${site.files.length} dosya toplandı (${(site.bytes / 1048576).toFixed(1)} MB)`, true);
      sourceRoot = site.dir; analyzeInput = site.dir;
    } else if (q.mode === 'bundle') {
      await push('indirme', overallPercent('indirme', 0.1), 'Yüklenen paket indiriliyor', true);
      const buf = await download(q.uploadPath);
      if (q.ext === '.asar') {
        const f = path.join(work, 'app.asar'); fs.writeFileSync(f, buf);
        analyzeInput = f;
      } else {
        await push('indirme', overallPercent('indirme', 0.5), 'Zip açılıyor', true);
        const dir = path.join(work, 'unzipped'); unzipTo(buf, dir);
        const t = findTarget(dir);
        analyzeInput = t.path;
        if (t.kind === 'dir') sourceRoot = t.path;
        notes.push(`Zip içinde bulunan hedef: ${path.relative(dir, t.path) || '.'}`);
      }
      if (!sourceRoot) {
        await push('indirme', overallPercent('indirme', 0.8), 'asar açılıyor (kanıt snippet\'leri için)', true);
        const dst = path.join(work, 'src');
        const ex = await extractAsar(analyzeInput as string, dst);
        sourceRoot = dst;
        if (ex.skipped) notes.push(`asar içinde ${ex.skipped} dosya okunamadı (paket dışına çıkarılmış olabilir).`);
      }
    } else {
      await push('indirme', overallPercent('indirme', 0.3), 'REA çıktısı (JSON) indiriliyor', true);
      const buf = await download(q.uploadPath);
      await push('indirme', overallPercent('indirme', 0.8), 'JSON okunuyor', true);
      evidence = JSON.parse(buf.toString('utf8'));
      fs.writeFileSync(evFile, buf);
      const kind = classifyEvidence(evidence);
      if (kind === 'unknown') throw new Error('Bu dosya REA çıktısına benzemiyor. `analyze-javascript-application ... --json` çıktısını yükle.');
      if (kind === 'summary-view') notes.push('Yüklenen dosya yalnızca özet görünümü; ayrıntılı kanıt listesi için tam analiz çıktısını yükle.');
    }

    // --- REA analizi ---
    if (analyzeInput) {
      await push('analiz', overallPercent('analiz', 0), 'REA analizi başladı', true);
      const budget = Math.max(30_000, Math.min(REA_ANALYSIS_TIMEOUT_MS, deadline - Date.now() - 40_000));
      let frac = 0;
      const res = await runRea(buildAnalyzeArgs({ inputPath: analyzeInput, timeoutMs: budget, integrity: 'record-and-continue' }), {
        cwd: work, stdoutFile: evFile, timeoutMs: Math.max(30_000, deadline - Date.now() - 30_000),
        onProgress: (line) => {
          const p = parseProgressLine(line); if (!p) return;
          const d = describeProgress(p); if (d.fraction != null) frac = Math.max(frac, d.fraction);
          void push('analiz', overallPercent('analiz', frac), d.text);
        },
      });
      if (res.timedOut) throw new Error('Analiz süre sınırına takıldı. Daha küçük bir paket yükle ya da "Bilgisayarımda" modunu kullan.');
      if (res.code !== 0) throw new Error(`REA hata verdi: ${reaErrorMessage(evFile, res.stderrTail)}`);
      evidence = JSON.parse(fs.readFileSync(evFile, 'utf8'));
    }
    const evBytes = fs.statSync(evFile).size;

    // --- Özet görünümü (rehberdeki inspect-analysis-view) ---
    await push('ozet', overallPercent('ozet', 0), 'Özet görünümü çıkarılıyor', true);
    let summary: ReturnType<typeof reduceSummary> | null = null;
    if (classifyEvidence(evidence) === 'summary-view') summary = reduceSummary(evidence);
    else {
      const reqFile = path.join(work, 'ozet-istek.json');
      fs.writeFileSync(reqFile, JSON.stringify(buildSummaryRequest(evidence)));
      const viewFile = path.join(work, 'ozet.json');
      const vr = await runRea(buildInspectArgs(reqFile), { cwd: work, stdoutFile: viewFile, timeoutMs: Math.max(20_000, deadline - Date.now() - 15_000) });
      if (vr.code === 0) { try { summary = reduceSummary(JSON.parse(fs.readFileSync(viewFile, 'utf8'))); } catch { /* aşağıdaki geri dönüş */ } }
      if (!summary) notes.push(`Özet görünümü üretilemedi: ${reaErrorMessage(viewFile, vr.stderrTail)}`);
    }

    // --- Kanıt listesi ---
    await push('kayit', overallPercent('kayit', 0.1), 'Kanıtlar derleniyor', true);
    const keywords = extractKeywords(project.question, project.seeds);
    const helpers = sourceRoot ? scanHelpers(sourceRoot) : [];
    const digest: Digest = buildDigest(evidence, { keywords, readSnippet: sourceRoot ? makeSnippetReader(sourceRoot) : undefined, helpers });
    if (sourceRoot) {
      const hits: DigestItem[] = grepSources(sourceRoot, keywords);
      digest.items = [...hits, ...digest.items].slice(0, 300);
    }
    digest.limitations = [...digest.limitations, ...notes];
    const base = summary ?? { stats: { ...digest.stats } as Record<string, number | string | null> };
    const summaryOut = { ...base, stats: { ...base.stats, ...(base.stats?.parsed_javascript_files == null ? digest.stats : {}) } };

    const keepEvidence = evBytes <= MAX_EVIDENCE_DB_BYTES;
    await store.updateRun(orgId, run.id, {
      status: 'done', stage: 'kayit', progress: 100, message: `Tamamlandı (${Math.round((Date.now() - t0) / 1000)} sn)`, log: [...log, 'Tamamlandı'],
      summary: summaryOut, digest, evidence: keepEvidence ? evidence : null, evidence_bytes: evBytes, evidence_truncated: !keepEvidence, finished_at: new Date().toISOString(), error: null,
    });
    await store.updateProject(orgId, project.id, { status: 'done' });
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Bilinmeyen hata';
    try {
      await store.updateRun(orgId, run.id, { status: 'failed', progress: 100, message: 'Hata', error: msg.slice(0, 1500), log: [...log, `Hata: ${msg}`.slice(0, 300)], finished_at: new Date().toISOString() });
      await store.updateProject(orgId, project.id, { status: 'failed' });
    } catch { /* son çare */ }
  } finally {
    fs.rm(work, { recursive: true, force: true }, () => undefined);
  }
}
