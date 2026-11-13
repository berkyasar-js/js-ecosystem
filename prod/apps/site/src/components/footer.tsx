import Link from 'next/link';
import { FOOTER_GROUPS, SITE } from '@/content/site';
import { Logo } from './logo';

export function Footer() {
  return (
    <footer className="mt-24 border-t border-line">
      <div className="wrap grid gap-10 py-14 md:grid-cols-[1.4fr_repeat(3,1fr)]">
        <div>
          <Logo />
          <p className="mt-4 max-w-xs text-sm text-muted">{SITE.tagline}. Projeler, müşteriler, üretim, ekip ve finans tek çalışma alanında — dokuz kişilik yapay zekâ kurulu ile.</p>
          <p className="mt-4 text-xs text-muted">Bir <a href="/hakkinda" className="text-ink">{SITE.company}</a> ürünü · İstanbul</p>
        </div>
        {FOOTER_GROUPS.map((g) => (
          <div key={g.title}>
            <h2 className="eyebrow">{g.title}</h2>
            <ul className="mt-4 grid gap-2.5">{g.links.map((l) => <li key={l.href}><Link href={l.href} className="text-sm text-muted transition hover:text-ink">{l.label}</Link></li>)}</ul>
          </div>
        ))}
      </div>
      <div className="hairline" />
      <div className="wrap flex flex-col gap-3 py-6 text-xs text-muted md:flex-row md:items-center md:justify-between">
        <span>© {new Date().getFullYear()} {SITE.company}. Tüm hakları saklıdır. JS Workspace açık kaynak değildir.</span>
        <span className="flex flex-wrap gap-4">
          <a href={SITE.loginUrl} rel="noopener">Uygulamaya giriş</a>
          <a href={SITE.adminUrl} rel="noopener">Yönetim Paneli</a>
          <a href={SITE.reaUrl} rel="noopener">REA Stüdyosu</a>
        </span>
      </div>
    </footer>
  );
}
