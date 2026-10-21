import Link from 'next/link';
import type { ReactNode } from 'react';
import { STATUS_LABELS, type ProjectStatus } from '@/lib/types';

export function PageHeader({ title, sub, actions, eyebrow }: { title: string; sub?: string; actions?: ReactNode; eyebrow?: string }) {
  return (
    <div className="page-head">
      <div>
        {eyebrow && <div className="eyebrow">{eyebrow}</div>}
        <h1>{title}</h1>
        {sub && <p>{sub}</p>}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </div>
  );
}
export function Empty({ children }: { children: ReactNode }) {
  return <div className="rounded-card border border-dashed border-line p-8 text-center text-sm text-muted">{children}</div>;
}
const TONE: Record<ProjectStatus, string> = { draft: '', queued: 'chip-warn', running: 'chip-brand', done: 'chip-ok', failed: 'chip-bad' };
export function StatusChip({ status }: { status: ProjectStatus }) { return <span className={`chip ${TONE[status]}`}>{STATUS_LABELS[status]}</span>; }
export function LinkButton({ href, children, primary }: { href: string; children: ReactNode; primary?: boolean }) {
  return <Link href={href} className={`btn ${primary ? 'btn-primary' : ''}`}>{children}</Link>;
}
const TR_MONTHS = ['Oca', 'Şub', 'Mar', 'Nis', 'May', 'Haz', 'Tem', 'Ağu', 'Eyl', 'Eki', 'Kas', 'Ara'];
export function fmtDate(iso: string | null | undefined): string {
  if (!iso) return '—';
  const [, m, d] = iso.slice(0, 10).split('-');
  return m ? `${Number(d)} ${TR_MONTHS[Number(m) - 1]} ${iso.slice(0, 4)}` : iso;
}
export function fmtBytes(n: number | null | undefined): string {
  if (n == null) return '—';
  return n >= 1048576 ? `${(n / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`;
}
