'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

export function ProjectTabs({ id }: { id: string }) {
  const path = usePathname();
  const tabs = [
    { href: `/projeler/${id}`, label: 'Genel durum' },
    { href: `/projeler/${id}/bulgular`, label: 'Bulgular' },
    { href: `/projeler/${id}/tasima`, label: 'JS Ecosystem\'e taşı' },
  ];
  return (
    <nav className="tabs" aria-label="Proje bölümleri">
      {tabs.map((t) => <Link key={t.href} href={t.href} className="tab" aria-selected={path === t.href} aria-current={path === t.href ? 'page' : undefined}>{t.label}</Link>)}
    </nav>
  );
}
