'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import { NAV, SITE } from '@/content/site';
import { IconChevron, IconMenu, IconX } from './icons';
import { Logo } from './logo';

export function Header() {
  const [open, setOpen] = useState(false);
  const [prodOpen, setProdOpen] = useState(false);
  const path = usePathname();
  useEffect(() => { setOpen(false); setProdOpen(false); }, [path]);
  useEffect(() => {
    document.documentElement.style.overflow = open ? 'hidden' : '';
    return () => { document.documentElement.style.overflow = ''; };
  }, [open]);
  const active = (href: string) => (href === '/' ? path === '/' : path === href || path.startsWith(href + '/'));

  return (
    <header className="sticky top-0 z-50">
      <div className="wrap pt-3">
        <nav className="glass flex items-center justify-between gap-3" aria-label="Ana gezinme">
          <Link href="/" className="flex items-center gap-2.5" aria-label={`${SITE.name} ana sayfa`}><Logo /></Link>
          <ul className="hidden items-center gap-1 lg:flex">
            {NAV.map((n) => (
              <li key={n.href} className="relative" onMouseEnter={() => n.children && setProdOpen(true)} onMouseLeave={() => n.children && setProdOpen(false)}>
                {n.children ? (
                  <>
                    <button type="button" className={`btn btn-ghost btn-sm ${active(n.href) ? 'text-ink' : 'text-muted'}`} aria-expanded={prodOpen} aria-haspopup="true" onClick={() => setProdOpen((v) => !v)}>
                      {n.label} <IconChevron size={14} />
                    </button>
                    {prodOpen && (
                      <div className="absolute left-0 top-full pt-2">
                        <div className="card grid w-[560px] grid-cols-2 gap-1 p-2 shadow-2xl">
                          {n.children.map((c) => (
                            <Link key={c.href} href={c.href} className="rounded-xl px-3 py-2.5 transition hover:bg-white/5">
                              <span className="block text-sm font-semibold">{c.label}</span>
                              <span className="block text-xs text-muted">{c.desc}</span>
                            </Link>
                          ))}
                        </div>
                      </div>
                    )}
                  </>
                ) : (
                  <Link href={n.href} className={`btn btn-ghost btn-sm ${active(n.href) ? 'text-ink' : 'text-muted'}`} aria-current={active(n.href) ? 'page' : undefined}>{n.label}</Link>
                )}
              </li>
            ))}
          </ul>
          <div className="hidden items-center gap-2 lg:flex">
            <a href={SITE.loginUrl} className="btn btn-ghost btn-sm" rel="noopener">Giriş yap</a>
            <Link href="/demo" className="btn btn-primary btn-sm">Demo talep et</Link>
          </div>
          <button type="button" className="btn btn-ghost btn-sm lg:hidden" aria-expanded={open} aria-controls="mobile-menu" aria-label={open ? 'Menüyü kapat' : 'Menüyü aç'} onClick={() => setOpen((v) => !v)}>
            {open ? <IconX /> : <IconMenu />}
          </button>
        </nav>
      </div>
      {open && (
        <div id="mobile-menu" className="fixed inset-x-0 bottom-0 top-[72px] z-40 overflow-y-auto bg-canvas/95 backdrop-blur lg:hidden">
          <div className="wrap grid gap-2 py-4">
            {NAV.map((n) => (
              <div key={n.href} className="nested">
                <Link href={n.href} className="block text-base font-semibold">{n.label}</Link>
                {n.children && (
                  <ul className="mt-2 grid gap-1 border-t border-line pt-2">
                    {n.children.slice(1).map((c) => <li key={c.href}><Link href={c.href} className="block py-1.5 text-sm text-muted">{c.label}</Link></li>)}
                  </ul>
                )}
              </div>
            ))}
            <div className="mt-2 grid grid-cols-2 gap-2">
              <a href={SITE.loginUrl} className="btn" rel="noopener">Giriş yap</a>
              <Link href="/demo" className="btn btn-primary">Demo talep et</Link>
            </div>
          </div>
        </div>
      )}
    </header>
  );
}
