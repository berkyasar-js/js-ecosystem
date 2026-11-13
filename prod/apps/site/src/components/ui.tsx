import Link from 'next/link';
import type { ReactNode } from 'react';
import { STATUS_LABEL, type Status } from '@/content/platform';
import { IconArrow, IconCheck } from './icons';

export function Section({ id, eyebrow, title, lede, children, className = '', align = 'left' }: { id?: string; eyebrow?: string; title?: ReactNode; lede?: ReactNode; children?: ReactNode; className?: string; align?: 'left' | 'center' }) {
  return (
    <section id={id} className={`wrap scroll-mt-24 py-14 md:py-20 ${className}`}>
      {(eyebrow || title || lede) && (
        <header className={`mb-10 max-w-3xl ${align === 'center' ? 'mx-auto text-center' : ''}`}>
          {eyebrow && <p className="eyebrow mb-3">{eyebrow}</p>}
          {title && <h2 className="text-3xl md:text-[40px] md:leading-[1.1]">{title}</h2>}
          {lede && <p className="lede mt-4">{lede}</p>}
        </header>
      )}
      {children}
    </section>
  );
}

export function PageHero({ eyebrow, title, lede, actions, children }: { eyebrow?: string; title: ReactNode; lede?: ReactNode; actions?: ReactNode; children?: ReactNode }) {
  return (
    <section className="relative overflow-hidden">
      <div className="hero-glow" aria-hidden="true" />
      <div className="bg-grid absolute inset-0 -z-10" aria-hidden="true" />
      <div className="wrap relative pb-10 pt-14 md:pb-16 md:pt-24">
        <div className="max-w-3xl">
          {eyebrow && <p className="eyebrow mb-4">{eyebrow}</p>}
          <h1 className="text-4xl md:text-6xl md:leading-[1.02]">{title}</h1>
          {lede && <p className="lede mt-6 max-w-2xl">{lede}</p>}
          {actions && <div className="mt-8 flex flex-wrap gap-3">{actions}</div>}
        </div>
        {children}
      </div>
    </section>
  );
}

export function StatusChip({ status }: { status: Status }) {
  const cls = status === 'live' ? 'chip-ok' : status === 'soon' ? 'chip-warn' : 'chip-brand';
  return <span className={`chip ${cls}`}>{STATUS_LABEL[status]}</span>;
}

export function Feature({ icon, title, children, soon }: { icon?: ReactNode; title: string; children: ReactNode; soon?: boolean }) {
  return (
    <article className="card flex flex-col gap-3">
      <div className="flex items-start justify-between gap-3">
        {icon && <span className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-line bg-nested text-brand-ink">{icon}</span>}
        {soon && <span className="chip chip-warn">Yakında</span>}
      </div>
      <h3 className="text-lg">{title}</h3>
      <p className="text-sm text-muted">{children}</p>
    </article>
  );
}

export function Check({ children }: { children: ReactNode }) {
  return <li className="flex items-start gap-2.5 text-sm"><span className="tick mt-0.5"><IconCheck size={11} /></span><span>{children}</span></li>;
}

export function CtaBand({ title = 'Ekibinizi Trello’dan, tablolardan ve dağınık araçlardan tek çalışma alanına taşıyalım.', sub = '30 dakikalık demoda kendi panonuzla, kendi ekip listenizle deneyin.' }: { title?: string; sub?: string }) {
  return (
    <section className="wrap py-10">
      <div className="card glow relative overflow-hidden p-8 md:p-12">
        <div className="hero-glow opacity-70" aria-hidden="true" />
        <div className="relative grid gap-6 md:grid-cols-[1fr_auto] md:items-center">
          <div>
            <h2 className="text-2xl md:text-4xl">{title}</h2>
            <p className="lede mt-3 max-w-xl text-base md:text-lg">{sub}</p>
          </div>
          <div className="flex flex-wrap gap-3">
            <Link href="/demo" className="btn btn-primary btn-lg">Demo talep et <IconArrow size={16} /></Link>
            <Link href="/fiyatlandirma" className="btn btn-lg">Fiyatlandırma</Link>
          </div>
        </div>
      </div>
    </section>
  );
}

export function Code({ children, title }: { children: string; title?: string }) {
  return (
    <figure className="grid gap-2">
      {title && <figcaption className="text-xs font-semibold text-muted">{title}</figcaption>}
      <pre className="code"><code>{children}</code></pre>
    </figure>
  );
}

export function Faq({ items }: { items: Array<{ q: string; a: string }> }) {
  return (
    <div>
      {items.map((f) => (
        <details key={f.q} className="faq">
          <summary>{f.q}</summary>
          <p className="text-sm">{f.a}</p>
        </details>
      ))}
    </div>
  );
}

export function Prose({ children }: { children: ReactNode }) {
  return <div className="prose max-w-3xl">{children}</div>;
}
