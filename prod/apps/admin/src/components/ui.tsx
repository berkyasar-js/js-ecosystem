'use client';
import Link from 'next/link';
import { useEffect, useState, type ReactNode } from 'react';
import { useSession } from './session';
import type { Repo } from '@jscore/core/repo/types';

export function useData<T>(fn: (repo: Repo) => Promise<T>, deps: unknown[] = []) {
  const { repo, rev } = useSession();
  const [state, setState] = useState<{ data: T | null; error: string | null; loading: boolean }>({ data: null, error: null, loading: true });
  const [local, setLocal] = useState(0);
  useEffect(() => {
    if (!repo) return;
    let alive = true;
    fn(repo).then((data) => alive && setState({ data, error: null, loading: false }), (e: unknown) => alive && setState({ data: null, error: e instanceof Error ? e.message : 'Hata', loading: false }));
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [repo, rev, local, ...deps]);
  return { ...state, reload: () => setLocal((n) => n + 1) };
}

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

export function Loading({ rows = 3 }: { rows?: number }) {
  return <div className="grid gap-3" aria-busy="true">{Array.from({ length: rows }, (_, i) => <div key={i} className="skeleton h-20" />)}</div>;
}
export function ErrorBox({ message }: { message: string }) {
  return <div role="alert" className="card border-magenta/50 text-sm"><strong className="text-magenta">Yüklenemedi.</strong> {message}</div>;
}
export function Empty({ children }: { children: ReactNode }) {
  return <div className="rounded-card border border-dashed border-line p-8 text-center text-sm text-muted">{children}</div>;
}
/** Veri yükleme durumlarını tek yerde ele alır. */
export function Async<T>({ q, children }: { q: { data: T | null; error: string | null; loading: boolean }; children: (d: T) => ReactNode }) {
  if (q.loading) return <Loading />;
  if (q.error) return <ErrorBox message={q.error} />;
  return <>{q.data !== null && children(q.data)}</>;
}

export function Tabs<T extends string>({ tabs, value, onChange }: { tabs: Array<[T, string]>; value: T; onChange(v: T): void }) {
  return (
    <div className="tabs" role="tablist">
      {tabs.map(([id, label]) => <button key={id} role="tab" aria-selected={value === id} className="tab" onClick={() => onChange(id)}>{label}</button>)}
    </div>
  );
}
export function Stat({ label, value, hint, tone, href, icon }: { label: string; value: ReactNode; hint?: string; tone?: 'warn' | 'bad' | 'ok'; href?: string; icon?: ReactNode }) {
  const c = tone === 'bad' ? 'text-magenta' : tone === 'warn' ? 'text-[#ffb020]' : tone === 'ok' ? 'text-[#3ddc97]' : '';
  const body = (
    <>
      <div className="metric-top"><span>{label}</span>{icon}</div>
      <div className={`metric-value ${c}`}>{value}</div>
      {hint && <div className="metric-note">{hint}</div>}
    </>
  );
  return href ? <Link href={href} className="metric metric-link">{body}</Link> : <div className="metric">{body}</div>;
}

const TR_MONTHS = ['Oca', 'Şub', 'Mar', 'Nis', 'May', 'Haz', 'Tem', 'Ağu', 'Eyl', 'Eki', 'Kas', 'Ara'];
export const fmtDate = (iso: string | null | undefined) => { if (!iso) return '—'; const [, m, d] = iso.slice(0, 10).split('-'); return m ? `${Number(d)} ${TR_MONTHS[Number(m) - 1]}` : iso; };
export const money = (minor: number) => new Intl.NumberFormat('tr-TR', { style: 'currency', currency: 'TRY', maximumFractionDigits: 0 }).format(minor / 100);
export const fmtTime = (iso: string) => `${fmtDate(iso)} ${iso.slice(11, 16)}`;
export const initials = (n: string) => n.split(/\s+/).map((s) => s[0]).slice(0, 2).join('').toUpperCase();
export const APPROVAL_STATUS: Record<string, [string, string]> = { pending: ['Bekliyor', 'chip-warn'], approved: ['Onaylandı', 'chip-ok'], rejected: ['Reddedildi', 'chip-bad'], deferred: ['Ertelendi', ''] };
export const PRIORITY: Record<string, [string, string]> = { high: ['Yüksek', 'chip-bad'], normal: ['Normal', ''], low: ['Düşük', ''] };

export const todayFor = (mode: 'demo' | 'supabase') => (mode === 'demo' ? '2026-10-14' : new Date().toISOString().slice(0, 10));
