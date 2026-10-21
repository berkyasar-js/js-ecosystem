'use client';
import { BookOpen, FolderSearch, Menu, PlusCircle, X } from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState, type ReactNode } from 'react';
import { ThemeToggle } from './theme-toggle';

const NAV = [
  { href: '/projeler', label: 'Projeler', icon: FolderSearch, match: (p: string) => p === '/projeler' || (p.startsWith('/projeler/') && p !== '/projeler/yeni') },
  { href: '/projeler/yeni', label: 'Yeni analiz', icon: PlusCircle, match: (p: string) => p === '/projeler/yeni' },
  { href: '/rehber', label: 'Rehber', icon: BookOpen, match: (p: string) => p.startsWith('/rehber') },
];

export function Shell({ children, email, demo }: { children: ReactNode; email: string | null; demo: boolean }) {
  const path = usePathname();
  const [open, setOpen] = useState(false);
  useEffect(() => { setOpen(false); }, [path]);
  return (
    <div className="app-shell" data-open={open}>
      <a className="skip-link" href="#main">İçeriğe geç</a>
      <aside className="sidebar" aria-label="Ana gezinme">
        <img className="logo" src="/brand/jobs-logo-light.svg" alt="Jobs Studio" width={168} height={33} />
        <div className="wordmark">Ters Mühendislik <b>Stüdyosu</b><small>REA ile uygulama analizi</small></div>
        <nav aria-label="Bölümler">
          {NAV.map((n) => (
            <Link key={n.href} href={n.href} className="navitem" aria-current={n.match(path) ? 'page' : undefined}>
              <n.icon size={18} aria-hidden />{n.label}
            </Link>
          ))}
        </nav>
        <div className="side-foot">
          {demo ? <span><span className="demo-dot" /> Demo modu — kayıtlar bellekte</span> : <span>Oturum<br /><b>{email ?? '—'}</b></span>}
        </div>
      </aside>
      <div className="app-main">
        <header className="topbar">
          <button type="button" className="btn icon-btn menu-btn" onClick={() => setOpen((o) => !o)} aria-label={open ? 'Menüyü kapat' : 'Menüyü aç'} aria-expanded={open}>{open ? <X size={18} aria-hidden /> : <Menu size={18} aria-hidden />}</button>
          <div className="brand-line">Jobs Studio · Ters Mühendislik <b>Stüdyosu</b></div>
          <div className="top-actions">
            {demo && <span className="mode"><span className="demo-dot" /> Demo</span>}
            <ThemeToggle />
          </div>
        </header>
        <main id="main" className="app-content">{children}</main>
      </div>
    </div>
  );
}
