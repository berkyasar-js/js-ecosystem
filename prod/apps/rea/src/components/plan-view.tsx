'use client';
import { Download } from 'lucide-react';
import { CopyButton } from './copy';

export function PlanActions({ markdown, filename }: { markdown: string; filename: string }) {
  const download = () => {
    const url = URL.createObjectURL(new Blob([markdown], { type: 'text/markdown;charset=utf-8' }));
    const a = document.createElement('a'); a.href = url; a.download = filename; document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  return (
    <div className="row">
      <CopyButton text={markdown} label="Markdown'ı kopyala" className="btn-primary" />
      <button type="button" className="btn btn-sm" onClick={download}><Download size={14} aria-hidden />.md indir</button>
    </div>
  );
}
