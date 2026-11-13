'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { MODULES, NAV_GROUPS } from '@jscore/contracts';
import { ICONS } from './icons';
import { useSession } from './session';
import { moduleVisible } from '@/lib/nav';

const GROUP = NAV_GROUPS.find((g) => g.id === 'production')!;
/** Üretim hub sekmeleri: Studio · Social · Media · Review · Transfer · Present · Marketing · Events. Modül sayfaları eski URL'lerinde kalır; bu şerit route group `(uretim)` layout'undan gelir. */
export function ProductionTabs() {
  const { me, features } = useSession();
  const path = usePathname();
  const vis = me ? moduleVisible(me.role, features.flags) : () => false;
  const items = GROUP.children.filter((c) => vis(c.module));
  if (items.length <= 1 && path !== '/app/uretim') return null;
  return (
    <nav className="tabs mb-5" role="tablist" aria-label="Üretim alanları">
      <Link role="tab" href="/app/uretim" aria-selected={path === '/app/uretim'} className="tab">Üretim</Link>
      {items.map((c) => { const m = MODULES.find((x) => x.id === c.module); const Icon = ICONS[m?.icon ?? 'apps'] ?? ICONS.apps; const active = path === c.href || path.startsWith(c.href + '/'); return (
        <Link key={c.module} role="tab" href={c.href} aria-selected={active} className="tab"><Icon size={13} aria-hidden className="mr-1 inline" />{c.label}</Link>
      ); })}
    </nav>
  );
}
