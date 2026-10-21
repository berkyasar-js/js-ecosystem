'use client';
import { Check, Copy } from 'lucide-react';
import { useState } from 'react';

export function CopyButton({ text, label = 'Kopyala', className = '' }: { text: string; label?: string; className?: string }) {
  const [ok, setOk] = useState(false);
  const copy = async () => {
    try { await navigator.clipboard.writeText(text); } catch {
      const ta = document.createElement('textarea'); ta.value = text; document.body.appendChild(ta); ta.select();
      try { document.execCommand('copy'); } catch { /* kopyalanamadı */ } ta.remove();
    }
    setOk(true); setTimeout(() => setOk(false), 1800);
  };
  return (
    <button type="button" className={`btn btn-sm ${className}`} onClick={copy} aria-live="polite">
      {ok ? <Check size={14} aria-hidden /> : <Copy size={14} aria-hidden />}
      {ok ? 'Kopyalandı' : label}
    </button>
  );
}

/** Kopyalanabilir komut / prompt bloğu. */
export function CommandBlock({ text, title, note }: { text: string; title?: string; note?: string }) {
  return (
    <div className="step">
      {title && <div className="code-title">{title}</div>}
      <div className="code-block">
        <pre tabIndex={0}>{text}</pre>
        <CopyButton text={text} label="Kopyala" className="copy btn-ghost" />
      </div>
      {note && <p className="hint mt-1">{note}</p>}
    </div>
  );
}
