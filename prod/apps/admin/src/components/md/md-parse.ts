/**
 * Markdown-lite: güvenli, bağımlılıksız. Yalnızca **kalın**, *italik*, `kod`, http(s) bağlantıları (otomatik + [metin](url)),
 * "- " / "* " listeleri, "1. " numaralı listeler, başlıklar (# ..) ve @anma vurgusu. Ham HTML hiç yorumlanmaz (React metin olarak basar).
 */
export type Inline =
  | { t: 'text'; v: string } | { t: 'b'; v: Inline[] } | { t: 'i'; v: Inline[] } | { t: 'code'; v: string }
  | { t: 'a'; href: string; v: string } | { t: 'mention'; v: string };
export type Block = { t: 'p'; v: Inline[] } | { t: 'h'; level: 1 | 2 | 3; v: Inline[] } | { t: 'ul'; v: Inline[][] } | { t: 'ol'; v: Inline[][] };

const SAFE_URL = /^https?:\/\/[^\s<>"']+$/i;
const TOKEN = /(\*\*[^*\n]+\*\*|\*[^*\s][^*\n]*\*|`[^`\n]+`|\[[^\]\n]+\]\(https?:\/\/[^\s)]+\)|https?:\/\/[^\s<>"']+|@[\p{L}\p{N}_.-]+)/gu;

export function parseInline(src: string): Inline[] {
  const out: Inline[] = [];
  let last = 0;
  for (const m of src.matchAll(TOKEN)) {
    const i = m.index ?? 0;
    if (i > last) out.push({ t: 'text', v: src.slice(last, i) });
    const tok = m[0];
    if (tok.startsWith('**')) out.push({ t: 'b', v: parseInline(tok.slice(2, -2)) });
    else if (tok.startsWith('`')) out.push({ t: 'code', v: tok.slice(1, -1) });
    else if (tok.startsWith('[')) {
      const mm = tok.match(/^\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)$/);
      out.push(mm && SAFE_URL.test(mm[2]) ? { t: 'a', href: mm[2], v: mm[1] } : { t: 'text', v: tok });
    } else if (tok.startsWith('http')) {
      const trail = tok.match(/[.,;:!?)]+$/)?.[0] ?? '';
      const url = trail ? tok.slice(0, -trail.length) : tok;
      out.push({ t: 'a', href: url, v: url });
      if (trail) out.push({ t: 'text', v: trail });
    } else if (tok.startsWith('@')) out.push({ t: 'mention', v: tok });
    else if (tok.startsWith('*')) out.push({ t: 'i', v: parseInline(tok.slice(1, -1)) });
    last = i + tok.length;
  }
  if (last < src.length) out.push({ t: 'text', v: src.slice(last) });
  return out;
}

export function parseBlocks(src: string): Block[] {
  const blocks: Block[] = [];
  const lines = src.replace(/\r\n?/g, '\n').split('\n');
  let para: string[] = [];
  let list: { kind: 'ul' | 'ol'; items: string[] } | null = null;
  const flushPara = () => { if (para.length) { blocks.push({ t: 'p', v: parseInline(para.join('\n')) }); para = []; } };
  const flushList = () => { if (list) { blocks.push({ t: list.kind, v: list.items.map(parseInline) }); list = null; } };
  for (const line of lines) {
    const ul = line.match(/^\s*[-*•]\s+(.*)$/);
    const ol = line.match(/^\s*\d+[.)]\s+(.*)$/);
    const h = line.match(/^(#{1,3})\s+(.*)$/);
    if (ul || ol) {
      flushPara();
      const kind = ul ? 'ul' : 'ol';
      if (list && list.kind !== kind) flushList();
      (list ??= { kind, items: [] }).items.push((ul ?? ol)![1]);
    } else if (h) { flushPara(); flushList(); blocks.push({ t: 'h', level: h[1].length as 1 | 2 | 3, v: parseInline(h[2]) }); }
    else if (!line.trim()) { flushPara(); flushList(); }
    else { flushList(); para.push(line); }
  }
  flushPara(); flushList();
  return blocks;
}
