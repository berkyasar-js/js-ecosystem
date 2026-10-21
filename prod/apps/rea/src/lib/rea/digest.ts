import { MAX_DIGEST_ITEMS } from '../limits';
import type { Digest, DigestItem, HelperCandidate } from '../types';

/* eslint-disable @typescript-eslint/no-explicit-any */
type Obj = Record<string, any>;

const SKIP_KINDS = new Set(['artifact', 'package', 'unknown', 'javascript-module', 'javascript-asset']);
const KIND_ORDER = ['ipc-channel', 'ipc-handler', 'ipc-listener', 'child-process', 'endpoint', 'browser-window', 'context-bridge', 'preload', 'native-addon', 'utility-process', 'worker'];
const PER_KIND_CAP = 50;

export type SnippetReader = (file: string, line: number | null, column: number | null) => string | null;

/** Satır/sütun konumundan 2-3 satırlık (ya da sıkıştırılmış kodda ~220 karakterlik pencere) kısa snippet. */
export function snippetFrom(text: string, line: number | null, column: number | null = null): string | null {
  if (!line || line < 1) return null;
  const lines = text.split('\n');
  const cur = lines[line - 1];
  if (cur === undefined) return null;
  if (cur.length > 240) {
    const c = Math.max(0, (column ?? 0) - 90);
    const s = cur.slice(c, c + 220).trim();
    return (c > 0 ? '…' : '') + s + (c + 220 < cur.length ? '…' : '');
  }
  const out = lines.slice(Math.max(0, line - 2), line + 1).map((l) => l.trimEnd().slice(0, 200)).filter((l) => l.trim());
  return out.length ? out.join('\n') : null;
}

function locOf(o: Obj): { file: string | null; line: number | null; col: number | null } {
  const v = o?.evidence?.location?.value ?? o?.location?.value ?? null;
  if (v && typeof v === 'object' && v.kind === 'source-range') return { file: v.source ?? null, line: v.start?.line ?? null, col: v.start?.column ?? null };
  const sr = o?.identity?.source_range;
  if (sr) return { file: o.identity?.module_path ?? null, line: sr.start?.line ?? null, col: sr.start?.column ?? null };
  return { file: null, line: null, col: null };
}

function describe(kind: string, props: Obj): string | null {
  const bits: string[] = [];
  if (props.side) bits.push(String(props.side));
  if (props.mode ?? props.operation) bits.push(String(props.mode ?? props.operation));
  if (props.mechanism) bits.push(String(props.mechanism));
  if (props.endpoint_kind && kind === 'endpoint') bits.push(String(props.endpoint_kind));
  if (props.method) bits.push(String(props.method));
  if (props.command && kind === 'child-process') bits.push(`komut: ${String(props.command)}`);
  return bits.length ? bits.join(' · ') : null;
}

export interface DigestOptions { keywords?: string[]; readSnippet?: SnippetReader; helpers?: HelperCandidate[] }

/** Ham REA kanıtından (analyze-javascript-application çıktısı) kanıt listesi çıkarır. Salt fonksiyon. */
export function buildDigest(evidence: unknown, opts: DigestOptions = {}): Digest {
  const ev = (evidence ?? {}) as Obj;
  const n: Obj = ev.normalized_result ?? {};
  const keywords = (opts.keywords ?? []).map((k) => k.toLowerCase()).filter(Boolean);
  const match = (s: string | null | undefined) => !!s && keywords.some((k) => s.toLowerCase().includes(k));
  const items: DigestItem[] = [];

  const add = (kind: string, label: string, loc: { file: string | null; line: number | null; col: number | null }, note: string | null) => {
    if (!label) return;
    const snippet = loc.file && opts.readSnippet ? opts.readSnippet(loc.file, loc.line, loc.col) : null;
    items.push({ kind, label: label.slice(0, 200), file: loc.file, line: loc.line, snippet, note: match(label) || match(loc.file) ? [note, 'anahtar kelime eşleşmesi'].filter(Boolean).join(' · ') : note });
  };

  for (const node of (n.graph?.nodes ?? []) as Obj[]) {
    if (SKIP_KINDS.has(node.kind)) continue;
    for (const ob of (node.observations ?? []) as Obj[]) {
      add(node.kind, String(ob.label ?? ob.properties?.value ?? ''), locOf(ob), describe(node.kind, ob.properties ?? {}));
    }
  }
  for (const node of (n.semantic_graph?.nodes ?? []) as Obj[]) {
    if (node.kind === 'child-process') add('child-process', String(node.properties?.command ?? node.label ?? 'alt süreç'), locOf(node), describe('child-process', node.properties ?? {}));
    else if (node.kind === 'function' && node.label && match(node.label)) add('function', String(node.label), locOf(node), 'işlev');
  }

  // Önce anahtar kelime eşleşenler, sonra tür sırası; tür başına üst sınır.
  const rank = (i: DigestItem) => (i.note?.includes('anahtar') ? 0 : 1) * 100 + (KIND_ORDER.indexOf(i.kind) === -1 ? 50 : KIND_ORDER.indexOf(i.kind));
  const perKind = new Map<string, number>();
  const picked = [...items].sort((a, b) => rank(a) - rank(b)).filter((i) => {
    const c = (perKind.get(i.kind) ?? 0) + 1;
    perKind.set(i.kind, c);
    return c <= PER_KIND_CAP;
  }).slice(0, MAX_DIGEST_ITEMS);

  const stats: Digest['stats'] = {};
  const st: Obj = n.statistics ?? n.summary?.statistics ?? {};
  for (const k of ['relevant_files', 'parsed_javascript_files', 'modules', 'findings', 'parse_failures']) if (typeof st[k] === 'number') stats[k] = st[k];
  const ipc: Obj = n.summary?.electron?.ipc ?? {};
  if (typeof ipc.operations === 'number') stats.ipc_operations = ipc.operations;
  if (typeof ipc.literal_channels === 'number') stats.ipc_literal_channels = ipc.literal_channels;
  if (typeof ipc.main_handlers === 'number') stats.ipc_main_handlers = ipc.main_handlers;
  stats.graph_nodes = (n.graph?.nodes ?? []).length;

  const uniq = (xs: string[]) => [...new Set(xs.map((x) => x.trim()).filter(Boolean))];
  const limitations = uniq([...(n.limitations ?? []), ...(ev.limitations ?? [])].filter((x: unknown): x is string => typeof x === 'string')).slice(0, 24);
  const unknowns = uniq(((n.semantic_graph?.unknowns ?? []) as Obj[]).map((u) => `${u.family ?? 'unknown'}: ${u.detail ?? u.reason ?? ''}`)).slice(0, 20);

  return { items: picked, helpers: opts.helpers ?? [], stats, limitations, unknowns, keywords: opts.keywords ?? [], source: 'rea' };
}

/** `inspect-analysis-view` summary çıktısını DB'ye yazılacak küçük nesneye indirger. */
export function reduceSummary(view: unknown) {
  const v = (view ?? {}) as Obj;
  const n: Obj = v.normalized_result ?? {};
  const s: Obj = n.summary ?? {};
  const st: Obj = s.statistics ?? {};
  return {
    stats: {
      format: s.format ?? null,
      relevant_files: st.relevant_files ?? null,
      parsed_javascript_files: st.parsed_javascript_files ?? null,
      modules: st.modules ?? null,
      findings: st.findings ?? null,
      ipc_operations: s.electron?.ipc?.operations ?? null,
      ipc_literal_channels: s.electron?.ipc?.literal_channels ?? null,
      browser_windows: s.electron?.browser_windows ?? null,
      native_addon_bindings: s.electron?.native_addon_bindings ?? null,
      parse_failures: st.parse_failures ?? null,
    },
    coverage: n.coverage ?? null,
    limitation_count: Array.isArray(n.limitations) ? n.limitations.length : 0,
    limitations: Array.isArray(n.limitations) ? (n.limitations as unknown[]).filter((x): x is string => typeof x === 'string').slice(0, 24) : [],
    unknowns_count: Array.isArray(n.unknowns) ? n.unknowns.length : 0,
  };
}

/** Kanıt JSON'unun REA'nın JS uygulama analizi (ya da özet görünümü) olup olmadığını denetler. */
export function classifyEvidence(x: unknown): 'analysis' | 'summary-view' | 'web-bundle' | 'unknown' {
  const e = x as Obj | null;
  if (!e || typeof e !== 'object') return 'unknown';
  const p = String(e.predicate_type ?? '');
  if (p === 'rea.javascript-application-analysis') return 'analysis';
  if (p === 'rea.analysis-view') return 'summary-view';
  if (/web/.test(p) && e.normalized_result) return 'web-bundle';
  return 'unknown';
}
