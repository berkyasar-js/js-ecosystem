/* JS Ecosystem · pdf.ts — prototype assets/pdf.js'in bağımlılıksız TS portu. A4, çok sayfa, Helvetica/Helvetica-Bold (WinAnsi). */
export type PdfBlock =
  | { t: 'h2'; text: string } | { t: 'p'; text: string } | { t: 'kv'; rows: Array<[string, string]> } | { t: 'sp'; n?: number } | { t: 'rule' }
  | { t: 'table'; cols: Array<{ h: string; w: number; align?: 'right' }>; rows: string[][]; foot?: string[] };
export interface PdfDoc { title: string; subtitle?: string; meta?: Array<[string, string]>; blocks: PdfBlock[]; footer?: string }

const W = 595.28, H = 841.89, M = 48, LH = 1.35;
const HW = [278, 278, 355, 556, 556, 889, 667, 191, 333, 333, 389, 584, 278, 333, 278, 278, 556, 556, 556, 556, 556, 556, 556, 556, 556, 556, 278, 278, 584, 584, 584, 556, 1015, 667, 667, 722, 722, 667, 611, 778, 722, 278, 500, 667, 556, 833, 722, 778, 667, 778, 722, 667, 611, 722, 667, 944, 667, 667, 611, 278, 278, 278, 469, 556, 333, 556, 556, 500, 556, 556, 278, 556, 556, 222, 222, 500, 222, 833, 556, 556, 556, 556, 333, 500, 278, 556, 500, 722, 500, 500, 500, 334, 260, 334, 584];
const FALL: Record<string, string> = { 'ğ': 'g', 'Ğ': 'G', 'ş': 's', 'Ş': 'S', 'İ': 'I', 'ı': 'i', '₺': 'TL', '—': '\x97', '–': '\x96', '‘': '\x91', '’': '\x92', '“': '\x93', '”': '\x94', '•': '\x95', '…': '\x85', '€': '\x80', '·': '\xB7', '×': '\xD7', '→': '->', '←': '<-', '✓': '+', '\t': ' ' };

/** Metni WinAnsi "bayt dizgisi"ne çevirir (ğ ş İ ı gibi karakterler ASCII karşılığıyla yazılır). */
export function enc(input: unknown): string {
  const s = String(input ?? ''); let o = '';
  for (const c of s) {
    const cc = c.charCodeAt(0);
    if (FALL[c] != null) o += FALL[c]; else if (cc >= 32 && cc <= 126) o += c; else if (cc >= 160 && cc <= 255) o += c; else if (cc === 10) o += '\n'; else o += '?';
  }
  return o;
}
const wdt = (b: string, size: number, bold: boolean) => { let w = 0; for (let i = 0; i < b.length; i++) { const c = b.charCodeAt(i); w += c >= 32 && c <= 126 ? HW[c - 32] : c >= 0xc0 ? 640 : 556; } return (w * size / 1000) * (bold ? 1.06 : 1); };
const esc = (b: string) => b.replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)');
function wrap(b: string, size: number, maxW: number, bold: boolean): string[] {
  const out: string[] = [];
  b.split('\n').forEach((par) => { let line = ''; par.split(' ').forEach((w) => { const t = line ? `${line} ${w}` : w; if (wdt(t, size, bold) <= maxW || !line) line = t; else { out.push(line); line = w; } }); out.push(line); });
  return out;
}
function clip(b: string, size: number, maxW: number, bold: boolean) { if (wdt(b, size, bold) <= maxW) return b; while (b.length > 1 && wdt(`${b}...`, size, bold) > maxW) b = b.slice(0, -1); return `${b}...`; }

export function buildPdf(doc: PdfDoc): { bytes: Uint8Array; pages: number } {
  const pages: string[][] = []; let cur: string[] = []; let y = 0;
  const np = () => {
    cur = []; pages.push(cur); y = H - M - 8;
    cur.push(`0.07 0.1 0.45 rg ${M} ${H - M + 14} 6 6 re f BT /F2 9 Tf ${M + 12} ${H - M + 14} Td (JOBS STUDIO  .  JS ECOSYSTEM) Tj ET`);
    cur.push(`0.8 0.8 0.85 RG 0.5 w ${M} ${H - M + 6} m ${W - M} ${H - M + 6} l S`);
  };
  const need = (h: number) => { if (!cur.length || y - h < M + 22) np(); };
  const text = (x: number, yy: number, b: string, size: number, bold: boolean, gray?: number) => cur.push(`BT ${gray != null ? `${gray} g ` : '0.1 g '}/F${bold ? 2 : 1} ${size} Tf ${x.toFixed(2)} ${yy.toFixed(2)} Td (${esc(b)}) Tj ET`);
  np();
  const title = enc(doc.title || 'Belge');
  wrap(title, 20, W - 2 * M, true).forEach((l) => { need(26); y -= 22; text(M, y, l, 20, true); });
  if (doc.subtitle) wrap(enc(doc.subtitle), 11, W - 2 * M, false).forEach((l) => { need(16); y -= 15; text(M, y, l, 11, false, 0.4); });
  y -= 6;
  (doc.meta ?? []).forEach((r) => { need(14); y -= 13; text(M, y, enc(r[0]), 9, true, 0.35); text(M + 110, y, enc(r[1]), 9, false); });
  if (doc.meta?.length) { y -= 6; need(8); cur.push(`0.8 0.8 0.85 RG 0.5 w ${M} ${y} m ${W - M} ${y} l S`); y -= 8; }
  for (const b of doc.blocks) {
    if (b.t === 'sp') { y -= b.n ?? 8; continue; }
    if (b.t === 'rule') { need(10); y -= 4; cur.push(`0.8 0.8 0.85 RG 0.5 w ${M} ${y} m ${W - M} ${y} l S`); y -= 6; continue; }
    if (b.t === 'h2') { need(30); y -= 8; y -= 15; text(M, y, enc(b.text), 13, true); y -= 3; continue; }
    if (b.t === 'p') { wrap(enc(b.text), 10, W - 2 * M, false).forEach((l) => { need(14); y -= 10 * LH; text(M, y, l, 10, false); }); y -= 4; continue; }
    if (b.t === 'kv') { b.rows.forEach((r) => { const ls = wrap(enc(r[1]), 10, W - 2 * M - 150, false); need(14 * ls.length); ls.forEach((l, i) => { y -= 10 * LH; if (!i) text(M, y, enc(r[0]), 10, true, 0.35); text(M + 150, y, l, 10, false); }); }); y -= 4; continue; }
    const cols = b.cols; const tot = cols.reduce((s, c) => s + c.w, 0); const sc = (W - 2 * M) / tot; const xs: number[] = []; let x = M;
    cols.forEach((c) => { xs.push(x); x += c.w * sc; });
    const cw = (i: number) => cols[i].w * sc - 8;
    const cell = (i: number, v: string, yy: number, bold: boolean, gray?: number) => { const s = clip(enc(v), 9.5, cw(i), bold); const xx = xs[i] + (cols[i].align === 'right' ? cw(i) - wdt(s, 9.5, bold) + 4 : 0); text(xx, yy, s, 9.5, bold, gray); };
    const head = () => { need(30); y -= 4; cur.push(`0.93 0.94 0.98 rg ${M} ${y - 14} ${W - 2 * M} 18 re f`); y -= 10; cols.forEach((c, i) => cell(i, c.h, y, true, 0.25)); y -= 8; };
    head();
    b.rows.forEach((r) => { if (y - 16 < M + 22) { np(); head(); } y -= 14; r.forEach((v, i) => cell(i, v, y, false)); cur.push(`0.9 0.9 0.93 RG 0.4 w ${M} ${y - 4} m ${W - M} ${y - 4} l S`); });
    if (b.foot) { need(20); y -= 16; cols.forEach((_, i) => { if (b.foot![i]) cell(i, b.foot![i], y, true); }); }
    y -= 8;
  }
  const n = pages.length;
  pages.forEach((p, i) => {
    p.push(`BT 0.5 g /F1 8 Tf ${M} ${M - 14} Td (${esc(enc(`JS Ecosystem . Demo belge, kurgusal veri . ${doc.footer ?? ''}`))}) Tj ET`);
    p.push(`BT 0.5 g /F1 8 Tf ${W - M - 60} ${M - 14} Td (${esc(`Sayfa ${i + 1} / ${n}`)}) Tj ET`);
  });
  const objs: string[] = [];
  objs[1] = '<< /Type /Catalog /Pages 2 0 R >>';
  objs[2] = `<< /Type /Pages /Count ${n} /Kids [${pages.map((_, i) => `${5 + i * 2 + 1} 0 R`).join(' ')}] >>`;
  objs[3] = '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>';
  objs[4] = '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>';
  pages.forEach((p, i) => {
    const c = p.join('\n');
    objs[5 + i * 2] = `<< /Length ${c.length} >>\nstream\n${c}\nendstream`;
    objs[6 + i * 2] = `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${W.toFixed(2)} ${H.toFixed(2)}] /Resources << /Font << /F1 3 0 R /F2 4 0 R >> >> /Contents ${5 + i * 2} 0 R >>`;
  });
  let out = '%PDF-1.4\n%\xE2\xE3\xCF\xD3\n'; const offs: number[] = [];
  for (let k = 1; k < objs.length; k++) { offs[k] = out.length; out += `${k} 0 obj\n${objs[k]}\nendobj\n`; }
  const xr = out.length;
  out += `xref\n0 ${objs.length}\n0000000000 65535 f \n`;
  for (let k = 1; k < objs.length; k++) out += `${`0000000000${offs[k]}`.slice(-10)} 00000 n \n`;
  out += `trailer\n<< /Size ${objs.length} /Root 1 0 R /Info << /Title (${esc(title)}) /Producer (JS Ecosystem pdf.ts) >> >>\nstartxref\n${xr}\n%%EOF`;
  const bytes = new Uint8Array(out.length);
  for (let j = 0; j < out.length; j++) bytes[j] = out.charCodeAt(j) & 255;
  return { bytes, pages: n };
}
