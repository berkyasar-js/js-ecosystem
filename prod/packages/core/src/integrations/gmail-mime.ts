/**
 * Gmail için SAF yardımcılar: RFC 2822 MIME kurucu (UTF-8 konu, HTML+metin, konu başlıkları In-Reply-To/References),
 * base64url, adres ayrıştırma, Gmail yük gövdesi çıkarma ve HTML temizleyici. Ağ/DB yok → testlenebilir.
 */
export const toBase64Url = (s: string | Buffer) => Buffer.from(s as Buffer).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
export const fromBase64Url = (s: string) => Buffer.from(s.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8');

/** RFC 2047: ASCII dışı içeren başlık değerini =?UTF-8?B?…?= olarak kodlar (76 karakterlik satırlara bölünür). */
export function encodeHeaderUtf8(value: string): string {
  // eslint-disable-next-line no-control-regex
  if (!/[^\x20-\x7e]/.test(value)) return value;
  const bytes = Buffer.from(value, 'utf8');
  const chunks: string[] = [];
  // 45 bayt → 60 b64 karakteri; =?UTF-8?B?…?= ile ~72 karakter
  for (let i = 0; i < bytes.length;) {
    let n = Math.min(45, bytes.length - i);
    // UTF-8 çok baytlı karakteri bölme
    while (n > 1 && i + n < bytes.length && (bytes[i + n] & 0xc0) === 0x80) n--;
    chunks.push(`=?UTF-8?B?${bytes.subarray(i, i + n).toString('base64')}?=`);
    i += n;
  }
  return chunks.join('\r\n ');
}
/** "Ad Soyad <a@b>" biçimi; ad ASCII dışı ise 2047 ile kodlanır, tırnak içinde özel karakter varsa tırnaklanır. */
export function formatAddress(email: string, name?: string | null): string {
  const e = email.trim();
  if (!name?.trim()) return e;
  const n = name.trim();
  // eslint-disable-next-line no-control-regex
  if (/[^\x20-\x7e]/.test(n)) return `${encodeHeaderUtf8(n)} <${e}>`;
  return /[^\w .'-]/.test(n) ? `"${n.replace(/"/g, '\\"')}" <${e}>` : `${n} <${e}>`;
}
export interface Address { email: string; name: string }
/** "Ad <a@b>, c@d" → [{email,name}] (küçük harf e-posta; 2047 kodlu adlar çözülür). */
export function parseAddressList(v: string | null | undefined): Address[] {
  if (!v) return [];
  const out: Address[] = [];
  // virgülle böl ama tırnak içindekini koru
  const parts: string[] = []; let cur = ''; let q = false;
  for (const ch of v) { if (ch === '"') q = !q; if (ch === ',' && !q) { parts.push(cur); cur = ''; } else cur += ch; }
  parts.push(cur);
  for (const raw of parts) {
    const p = raw.trim(); if (!p) continue;
    const m = p.match(/^(.*?)\s*<([^<>\s]+@[^<>\s]+)>\s*$/);
    if (m) out.push({ email: m[2].toLowerCase(), name: decodeHeaderUtf8(m[1].trim().replace(/^"|"$/g, '').replace(/\\"/g, '"')) });
    else { const e = p.match(/[^\s<>"']+@[^\s<>"']+/)?.[0]; if (e) out.push({ email: e.toLowerCase(), name: '' }); }
  }
  return out;
}
export const parseAddress = (v: string | null | undefined): Address | null => parseAddressList(v)[0] ?? null;
/** =?charset?B|Q?…?= parçalarını çözer (UTF-8 / ISO-8859-9 / latin1 yaklaşık). */
export function decodeHeaderUtf8(v: string): string {
  return v.replace(/=\?([^?]+)\?([BbQq])\?([^?]*)\?=(\s+(?==\?))?/g, (_m, cs: string, enc: string, data: string) => {
    const charset = cs.toLowerCase();
    const bytes = enc.toUpperCase() === 'B' ? Buffer.from(data, 'base64') : Buffer.from(data.replace(/_/g, ' ').replace(/=([0-9A-Fa-f]{2})/g, (_x, h: string) => String.fromCharCode(parseInt(h, 16))), 'latin1');
    try { return new TextDecoder(charset === 'iso-8859-9' ? 'windows-1254' : charset).decode(bytes); } catch { return bytes.toString('utf8'); }
  });
}

/* ───────── MIME kurucu ───────── */
export interface MimeInput {
  from: string; to: string[]; cc?: string[]; replyTo?: string; subject: string; text: string; html?: string;
  inReplyTo?: string | null; references?: string | null; messageId?: string; date?: Date; headers?: Record<string, string>;
}
const wrap76 = (b64: string) => b64.replace(/(.{76})/g, '$1\r\n');
const qpSafe = (s: string) => Buffer.from(s, 'utf8').toString('base64');
/** RFC 2822 iletisi (multipart/alternative: text/plain + text/html; ikisi de base64 UTF-8). Dönüş: ham metin (CRLF). */
export function buildMime(m: MimeInput): string {
  const boundary = `=_js_${(m.messageId ?? `${Date.now()}`).replace(/[^a-zA-Z0-9]/g, '').slice(0, 24) || 'part'}_${qpSafe(m.subject).slice(0, 8).replace(/[^a-zA-Z0-9]/g, '')}`;
  const h: string[] = [];
  h.push(`From: ${m.from}`);
  h.push(`To: ${m.to.join(', ')}`);
  if (m.cc?.length) h.push(`Cc: ${m.cc.join(', ')}`);
  if (m.replyTo) h.push(`Reply-To: ${m.replyTo}`);
  h.push(`Subject: ${encodeHeaderUtf8(m.subject)}`);
  h.push(`Date: ${(m.date ?? new Date()).toUTCString().replace('GMT', '+0000')}`);
  if (m.messageId) h.push(`Message-ID: ${m.messageId.startsWith('<') ? m.messageId : `<${m.messageId}>`}`);
  if (m.inReplyTo) h.push(`In-Reply-To: ${m.inReplyTo.startsWith('<') ? m.inReplyTo : `<${m.inReplyTo}>`}`);
  if (m.references) h.push(`References: ${m.references}`);
  for (const [k, v] of Object.entries(m.headers ?? {})) h.push(`${k}: ${v}`);
  h.push('MIME-Version: 1.0');
  const textPart = ['Content-Type: text/plain; charset="UTF-8"', 'Content-Transfer-Encoding: base64', '', wrap76(qpSafe(m.text))].join('\r\n');
  if (!m.html) return [...h, textPart].join('\r\n');
  const htmlPart = ['Content-Type: text/html; charset="UTF-8"', 'Content-Transfer-Encoding: base64', '', wrap76(qpSafe(m.html))].join('\r\n');
  h.push(`Content-Type: multipart/alternative; boundary="${boundary}"`);
  return [...h, '', `--${boundary}`, textPart, `--${boundary}`, htmlPart, `--${boundary}--`, ''].join('\r\n');
}
/** Yanıt konusu: "Re:" öneki tekrarlanmaz. */
export const replySubject = (s: string) => (/^\s*(re|ynt|yanıt|aw)\s*:/i.test(s) ? s.trim() : `Re: ${s.trim()}`);
/** References zinciri: önceki References + önceki Message-ID (tekrar yok). */
export function buildReferences(prevReferences: string | null | undefined, prevMessageId: string | null | undefined): string | null {
  const ids = [...(prevReferences ?? '').split(/\s+/), prevMessageId ?? ''].map((s) => s.trim()).filter(Boolean).map((s) => (s.startsWith('<') ? s : `<${s}>`));
  const uniq = [...new Set(ids)];
  return uniq.length ? uniq.join(' ') : null;
}

/* ───────── Gmail yükü → gövdeler ───────── */
export interface GmailPart { mimeType?: string; filename?: string; headers?: Array<{ name: string; value: string }>; body?: { data?: string; size?: number; attachmentId?: string }; parts?: GmailPart[] }
export interface GmailMessage { id: string; threadId: string; labelIds?: string[]; snippet?: string; historyId?: string; internalDate?: string; payload?: GmailPart }
export const headerMap = (headers: Array<{ name: string; value: string }> | undefined): Record<string, string> => Object.fromEntries((headers ?? []).map((h) => [h.name.toLowerCase(), h.value]));
export interface ExtractedBodies { text: string; html: string; attachments: Array<{ filename: string; mime: string; size: number; attachment_id?: string }> }
export function extractBodies(payload: GmailPart | undefined): ExtractedBodies {
  const out: ExtractedBodies = { text: '', html: '', attachments: [] };
  const walk = (p: GmailPart | undefined) => {
    if (!p) return;
    const mt = (p.mimeType ?? '').toLowerCase();
    if (p.filename && p.body?.attachmentId) { out.attachments.push({ filename: p.filename, mime: mt || 'application/octet-stream', size: p.body.size ?? 0, attachment_id: p.body.attachmentId }); return; }
    if (mt === 'text/plain' && p.body?.data && !out.text) out.text = fromBase64Url(p.body.data);
    else if (mt === 'text/html' && p.body?.data && !out.html) out.html = fromBase64Url(p.body.data);
    for (const c of p.parts ?? []) walk(c);
  };
  walk(payload);
  if (!out.text && out.html) out.text = htmlToText(out.html);
  return out;
}
/** Kaba HTML → metin (önizleme / arama için). */
export function htmlToText(html: string): string {
  return decodeEntities(html.replace(/<(script|style)[\s\S]*?<\/\1>/gi, ' ').replace(/<br\s*\/?>/gi, '\n').replace(/<\/(p|div|li|tr|h[1-6]|blockquote)>/gi, '\n').replace(/<[^>]+>/g, '')).replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
}
const ENT: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' };
export const decodeEntities = (s: string) => s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e: string) => { const k = e.toLowerCase(); if (k.startsWith('#x')) return String.fromCodePoint(parseInt(k.slice(2), 16)); if (k.startsWith('#')) return String.fromCodePoint(Number(k.slice(1))); return ENT[k] ?? m; });

/* ───────── HTML temizleyici (izin listesi) ───────── */
const ALLOWED_TAGS = new Set(['p', 'br', 'b', 'strong', 'i', 'em', 'u', 's', 'a', 'ul', 'ol', 'li', 'blockquote', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'div', 'span', 'table', 'thead', 'tbody', 'tr', 'td', 'th', 'img', 'pre', 'code', 'hr', 'small', 'sup', 'sub']);
const DROP_WITH_CONTENT = new Set(['script', 'style', 'iframe', 'object', 'embed', 'form', 'input', 'button', 'textarea', 'select', 'head', 'title', 'meta', 'link', 'svg', 'math', 'noscript', 'template']);
const URL_ATTR = new Set(['href', 'src']);
const ALLOWED_ATTR = new Set(['href', 'src', 'alt', 'title', 'colspan', 'rowspan', 'width', 'height']);
const safeUrl = (attr: string, v: string) => {
  const u = v.trim().replace(/[\u0000-\u001f\s]/g, '').toLowerCase();
  if (attr === 'href') return /^(https?:|mailto:|tel:)/.test(u) || u.startsWith('#');
  return /^https?:/.test(u) || u.startsWith('cid:') || u.startsWith('data:image/');
};
/** Script/style/form vb. içerikleriyle silinir; izinli olmayan etiketler soyulur (içerik kalır); on* ve javascript: atılır; a → rel/target eklenir. */
export function sanitizeHtml(input: string): string {
  if (!input) return '';
  let html = input.replace(/<!--[\s\S]*?-->/g, '');
  for (const t of DROP_WITH_CONTENT) html = html.replace(new RegExp(`<${t}\\b[^>]*>[\\s\\S]*?<\\/${t}\\s*>`, 'gi'), '').replace(new RegExp(`<${t}\\b[^>]*\\/?>`, 'gi'), '');
  return html.replace(/<\/?([a-zA-Z][a-zA-Z0-9-]*)\b([^>]*)>/g, (whole, rawTag: string, rawAttrs: string) => {
    const tag = rawTag.toLowerCase();
    const closing = whole.startsWith('</');
    if (!ALLOWED_TAGS.has(tag)) return '';
    if (closing) return tag === 'br' || tag === 'img' || tag === 'hr' ? '' : `</${tag}>`;
    const attrs: string[] = [];
    const re = /([a-zA-Z_:][-a-zA-Z0-9_:.]*)\s*(?:=\s*("([^"]*)"|'([^']*)'|([^\s"'>]+)))?/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(rawAttrs))) {
      const name = m[1].toLowerCase();
      const val = m[3] ?? m[4] ?? m[5] ?? '';
      if (name.startsWith('on') || !ALLOWED_ATTR.has(name)) continue;
      if (URL_ATTR.has(name) && !safeUrl(name, val)) continue;
      attrs.push(`${name}="${val.replace(/&(?!(amp|lt|gt|quot|#\d+);)/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;')}"`);
    }
    if (tag === 'a') attrs.push('rel="noopener noreferrer nofollow"', 'target="_blank"');
    if (tag === 'img') attrs.push('loading="lazy"');
    const selfClose = tag === 'br' || tag === 'img' || tag === 'hr';
    return `<${tag}${attrs.length ? ` ${attrs.join(' ')}` : ''}${selfClose ? ' /' : ''}>`;
  });
}
