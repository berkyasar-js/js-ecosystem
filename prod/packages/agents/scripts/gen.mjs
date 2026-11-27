#!/usr/bin/env node
/**
 * Ajans Ofisi kataloğunu üretir: depo kökündeki `.claude/agents/*.md` (Agency kadrosu) →
 *   src/roster.json   (istemci: ad, bölüm, açıklama, emoji — 3B ofis)
 *   src/prompts.ts    (yalnızca sunucu: rol gövdeleri — /api/agency/run sistem promptu)
 * Bölüm eşlemesi `scripts/divisions.json` içindedir (kaynak depodaki klasör).
 * Çalıştır: npm -w packages/agents run gen
 */
import { readFileSync, readdirSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const src = join(here, '../../../../.claude/agents');
const outDir = join(here, '../src');
const divisions = JSON.parse(readFileSync(join(here, 'divisions.json'), 'utf8'));

const unquote = (s) => s.trim().replace(/^(["'])(.*)\1$/, '$2');
function parse(text) {
  const m = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/.exec(text);
  if (!m) return null;
  const meta = {};
  let key = null;
  for (const line of m[1].split(/\r?\n/)) {
    const kv = /^([A-Za-z_][\w-]*):\s*(.*)$/.exec(line);
    if (kv) { key = kv[1]; meta[key] = ['>', '|', '>-', '|-'].includes(kv[2].trim()) ? '' : unquote(kv[2]); }
    else if (key && /^\s+\S/.test(line)) meta[key] = `${meta[key]} ${line.trim()}`.trim();
  }
  return { meta, body: m[2].trim() };
}

const roster = [];
const prompts = {};
for (const file of readdirSync(src).filter((f) => f.endsWith('.md')).sort()) {
  const slug = file.replace(/\.md$/, '');
  const parsed = parse(readFileSync(join(src, file), 'utf8'));
  if (!parsed || !parsed.meta.name) throw new Error(`Ön bilgi (frontmatter) okunamadı: ${file}`);
  const division = divisions[slug];
  if (!division) throw new Error(`Bölüm eşlemesi yok: ${slug} (scripts/divisions.json)`);
  const { meta, body } = parsed;
  roster.push({ slug, name: meta.name, division, description: (meta.description ?? '').slice(0, 320), emoji: meta.emoji ?? '', vibe: (meta.vibe ?? '').slice(0, 200) });
  // Eşleşmemiş vekil (lone surrogate) karakterler paketleyicide geçersiz JSON üretir: U+FFFD ile değiştirilir.
  prompts[slug] = body.toWellFormed();
}
mkdirSync(outDir, { recursive: true });
writeFileSync(join(outDir, 'roster.json'), `${JSON.stringify(roster)}\n`);
// TS modülü (JSON değil): paketleyicinin JSON gömme yolu `\\uD83C` gibi kaçışlı metinleri bozuyor.
const lines = Object.entries(prompts).map(([k, v]) => `  ${JSON.stringify(k)}: ${JSON.stringify(v)},`);
writeFileSync(join(outDir, 'prompts.ts'), `// ÜRETİLMİŞ DOSYA — elle düzenleme: npm -w packages/agents run gen\nconst prompts: Record<string, string> = {\n${lines.join('\n')}\n};\nexport default prompts;\n`);
console.log(`Ajans kadrosu: ${roster.length} rol, ${new Set(roster.map((r) => r.division)).size} bölüm`);
