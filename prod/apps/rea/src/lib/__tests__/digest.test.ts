import { describe, expect, it } from 'vitest';
import { buildDigest, classifyEvidence, reduceSummary, snippetFrom } from '../rea/digest';
import { describeProgress, fileFraction, overallPercent, parseProgressLine } from '../rea/progress';
import { extractScriptRefs, findChunkRefs, urlToRelPath } from '../rea/site';
import { buildSynthesisPrompt } from '../ai/synthesize';

const loc = (source: string, line: number, column = 0) => ({ evidence: { location: { value: { kind: 'source-range', source, start: { line, column } } } } });
const evidence = {
  predicate_type: 'rea.javascript-application-analysis',
  normalized_result: {
    statistics: { relevant_files: 3, parsed_javascript_files: 2 },
    summary: { electron: { ipc: { operations: 1, literal_channels: 1, main_handlers: 1 } } },
    limitations: ['Static imports do not prove runtime execution.', 'Static imports do not prove runtime execution.'],
    graph: { nodes: [
      { kind: 'artifact', observations: [{ label: 'artifact root' }] },
      { kind: 'ipc-channel', observations: [{ label: 'paste-text', properties: { side: 'main', mode: 'handle' }, ...loc('main.js', 3) }] },
      { kind: 'endpoint', observations: [{ label: '/api/save', properties: { endpoint_kind: 'network', mechanism: 'call:fetch' }, ...loc('a.js', 1) }] },
    ] },
    semantic_graph: { nodes: [
      { kind: 'child-process', label: 'helper', properties: { command: 'helper', method: 'spawn' }, identity: { module_path: 'paste.js', source_range: { start: { line: 2, column: 50 } } } },
      { kind: 'function', label: 'pasteText', identity: { module_path: 'paste.js', source_range: { start: { line: 2, column: 20 } } } },
      { kind: 'function', label: 'unrelated', identity: { module_path: 'x.js', source_range: { start: { line: 1, column: 0 } } } },
    ], unknowns: [{ family: 'call-flow', detail: 'Call target pasteText has ambiguous assignments.' }] },
  },
};

describe('buildDigest', () => {
  const d = buildDigest(evidence, { keywords: ['paste'], readSnippet: (f, l) => `${f}:${l} snippet` });
  it('IPC, uç nokta, alt süreç ve eşleşen işlevleri çıkarır; artifact atlanır', () => {
    expect(d.items.map((i) => i.kind).sort()).toEqual(['child-process', 'endpoint', 'function', 'ipc-channel']);
    expect(d.items.find((i) => i.label === 'unrelated')).toBeUndefined();
  });
  it('anahtar kelime eşleşenler başa gelir ve dosya/satır/snippet taşır', () => {
    expect(d.items[0].note).toContain('anahtar kelime');
    const ch = d.items.find((i) => i.kind === 'ipc-channel');
    expect(ch).toMatchObject({ label: 'paste-text', file: 'main.js', line: 3, snippet: 'main.js:3 snippet' });
  });
  it('istatistik, tekrarsız sınırlar ve bilinmeyenler', () => {
    expect(d.stats).toMatchObject({ relevant_files: 3, ipc_literal_channels: 1, ipc_main_handlers: 1 });
    expect(d.limitations).toHaveLength(1);
    expect(d.unknowns[0]).toContain('call-flow');
  });
});

describe('REA çıktı yardımcıları', () => {
  it('kanıt türünü ayırt eder', () => {
    expect(classifyEvidence(evidence)).toBe('analysis');
    expect(classifyEvidence({ predicate_type: 'rea.analysis-view' })).toBe('summary-view');
    expect(classifyEvidence({ foo: 1 })).toBe('unknown');
    expect(classifyEvidence(null)).toBe('unknown');
  });
  it('özet görünümünü küçük nesneye indirger', () => {
    const s = reduceSummary({ normalized_result: { summary: { format: 'asar', statistics: { parsed_javascript_files: 167, modules: 1428 }, electron: { ipc: { operations: 207 } } }, limitations: ['a'], unknowns: [1, 2] } });
    expect(s.stats).toMatchObject({ format: 'asar', parsed_javascript_files: 167, modules: 1428, ipc_operations: 207 });
    expect(s.unknowns_count).toBe(2);
  });
  it('snippetFrom: normal satırda 2-3 satır, sıkıştırılmış satırda pencere', () => {
    expect(snippetFrom('a\nb\nc\nd', 3)).toBe('b\nc\nd');
    const long = 'x'.repeat(500) + 'HEDEF' + 'y'.repeat(500);
    const s = snippetFrom(long, 1, 500) as string;
    expect(s).toContain('HEDEF'); expect(s.length).toBeLessThan(260);
    expect(snippetFrom('a', 5)).toBeNull();
  });
});

describe('ilerleme', () => {
  const line = '{"rea_progress":{"phase":"parse_javascript_source","completed":0,"total":1,"message":"Parsing and projecting main.js (1/3)","sequence":4}}';
  it('stderr satırını okur ve Türkçeleştirir', () => {
    const p = parseProgressLine(line);
    expect(p?.phase).toBe('parse_javascript_source');
    expect(describeProgress(p!)).toEqual({ text: 'Çözümleniyor: main.js (1/3)', fraction: 1 / 3 });
    expect(parseProgressLine('günlük satırı')).toBeNull();
    expect(fileFraction('x (12/167)')).toEqual({ done: 12, total: 167 });
  });
  it('yüzde aşama aralığında kalır', () => {
    expect(overallPercent('analiz', 0)).toBe(30);
    expect(overallPercent('analiz', 1)).toBe(80);
    expect(overallPercent('analiz', 9)).toBe(80);
  });
});

describe('site toplama yardımcıları', () => {
  const html = `<html><head><link rel="modulepreload" href="/m.js"><script src="/_next/static/a.js" defer></script><script src='https://cdn.x.com/lib.js'></script><script type="application/json">{"a":1}</script></head><body><script>fetch('/api')</script></body></html>`;
  it('harici ve satır içi scriptleri ayırır', () => {
    const r = extractScriptRefs(html, 'https://ornek.com/app');
    expect(r.srcs).toEqual(['https://ornek.com/_next/static/a.js', 'https://cdn.x.com/lib.js', 'https://ornek.com/m.js']);
    expect(r.inline).toEqual(["fetch('/api')"]);
  });
  it('chunk adreslerini bulur', () => {
    expect(findChunkRefs('n.u=e=>"/_next/static/chunks/"+e;load("/_next/static/chunks/9a.js")', 'https://ornek.com/')).toEqual(['https://ornek.com/_next/static/chunks/9a.js']);
  });
  it('URL → güvenli yol', () => {
    expect(urlToRelPath('https://cdn.x.com/a/../b/app.min.js?v=1')).toBe('scripts/cdn.x.com/b/app.min.js');
    expect(urlToRelPath('https://x.com/')).toBe('scripts/x.com/index.js');
  });
});

describe('buildSynthesisPrompt', () => {
  it('soru, kanıt ve sınırları etiketli bölümlerle verir; anahtar kelime eşleşmesi önce', () => {
    const d = buildDigest(evidence, { keywords: ['paste'] });
    const p = buildSynthesisPrompt({ name: 'T', target_kind: 'bundle', target_url: null, question: 'Nasıl yapıştırıyor?' }, d);
    expect(p).toContain('SORU: Nasıl yapıştırıyor?');
    expect(p).toContain('<KANIT>'); expect(p).toContain('</REA_SINIRLARI>');
    expect(p.indexOf('paste-text')).toBeLessThan(p.indexOf('/api/save'));
  });
});
