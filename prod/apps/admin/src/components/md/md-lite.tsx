'use client';
import { Fragment, type ReactNode } from 'react';
import { parseBlocks, type Inline } from './md-parse';

/** Markdown-lite görünümü (apps/web/components/work/md-lite.tsx'ten uyarlandı; stiller orbit-work.css .wk-x-md). */
const renderInline = (nodes: Inline[]): ReactNode => nodes.map((n, i) => {
  switch (n.t) {
    case 'text': return <Fragment key={i}>{n.v.split('\n').map((l, j, a) => <Fragment key={j}>{l}{j < a.length - 1 && <br />}</Fragment>)}</Fragment>;
    case 'b': return <strong key={i}>{renderInline(n.v)}</strong>;
    case 'i': return <em key={i}>{renderInline(n.v)}</em>;
    case 'code': return <code key={i}>{n.v}</code>;
    case 'a': return <a key={i} href={n.href} target="_blank" rel="noopener noreferrer nofollow">{n.v}</a>;
    case 'mention': return <span key={i} className="wk-x-mention">{n.v}</span>;
  }
});

/** Düz metni (model yanıtı dahil) güvenli biçimde basar; ham HTML yorumlanmaz. */
export function MdLite({ text, className = '' }: { text: string; className?: string }) {
  const blocks = parseBlocks(text);
  if (!blocks.length) return null;
  return (
    <div className={`orbit-work wk-x-md ${className}`.trim()}>
      {blocks.map((b, i) => {
        if (b.t === 'p') return <p key={i}>{renderInline(b.v)}</p>;
        if (b.t === 'h') { const H = (`h${b.level + 2}`) as 'h3' | 'h4' | 'h5'; return <H key={i}>{renderInline(b.v)}</H>; }
        const L = b.t;
        return <L key={i}>{b.v.map((it, j) => <li key={j}>{renderInline(it)}</li>)}</L>;
      })}
    </div>
  );
}
