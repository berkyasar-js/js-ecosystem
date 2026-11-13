'use client';
import Link from 'next/link';
import { useMemo, useState } from 'react';
import { ArrowRight, Search, Star } from 'lucide-react';
import { MODULES, NAV_GROUPS, canAccessModule, isAdminOnlyModule, moduleEntitled, toggleFavorite } from '@jscore/contracts';
import { ICONS } from '@/components/icons';
import { PageHeader } from '@/components/ui';
import { useSession } from '@/components/session';

/** Uygulamalar: tüm modül kartları (açıklama, favori ⭐, aç), arama; kapalı modüller gri ve "Panelden açılabilir". */
export default function Apps() {
  const { me, features, prefs, setPrefs } = useSession();
  const [q, setQ] = useState('');
  const groups = useMemo(() => NAV_GROUPS.filter((g) => g.id !== 'home' && g.id !== 'apps'), []);
  const t = q.trim().toLocaleLowerCase('tr');
  const mods = MODULES.filter((m) => m.id !== 'apps' && !isAdminOnlyModule(m.id) && (!me || canAccessModule(me.role, m.id)) && (!t || m.name.toLocaleLowerCase('tr').includes(t) || m.desc.toLocaleLowerCase('tr').includes(t)));
  const card = (m: (typeof MODULES)[number]) => {
    const Icon = ICONS[m.icon] ?? ICONS.apps; const on = moduleEntitled(m.id, features.flags); const fav = prefs.favorites.includes(m.id);
    return (
      <div key={m.id} className={`app-card ${on ? '' : 'is-off'}`}>
        <button className="fav" aria-pressed={fav} aria-label={fav ? `${m.name}: favorilerden çıkar` : `${m.name}: favorilere ekle`} title="Favori" onClick={() => void setPrefs({ favorites: toggleFavorite(prefs.favorites, m.id) })}><Star size={16} fill={fav ? 'currentColor' : 'none'} /></button>
        <div className="flex items-center gap-2"><Icon size={20} aria-hidden /><span className={`chip ${on ? 'chip-ok' : ''}`}>{on ? 'Açık' : 'Kapalı'}</span></div>
        <h2 className="font-bold">{m.name}</h2>
        <p className="text-sm text-muted">{m.desc}</p>
        {on ? <Link href={`/app/${m.slug}`} className="text-button mt-auto">Aç <ArrowRight size={14} aria-hidden /></Link> : <p className="mt-auto text-xs text-muted">Panelden açılabilir (Ana Yönetim Paneli → Modüller).</p>}
      </div>
    );
  };
  const favs = mods.filter((m) => prefs.favorites.includes(m.id));
  return (
    <>
      <PageHeader title="Uygulamalar" sub="Rolüne açık tüm modüller — favorilerin kenar çubuğunda görünür" />
      <div className="search-trigger mb-5 max-w-md"><Search size={15} aria-hidden /><input className="input !min-h-0 !border-0 !bg-transparent !p-0" placeholder="Uygulama ara…" aria-label="Uygulama ara" value={q} onChange={(e) => setQ(e.target.value)} /></div>
      {favs.length > 0 && <section className="mb-6" aria-label="Favoriler"><div className="eyebrow mb-3">Favoriler</div><div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">{favs.map(card)}</div></section>}
      {groups.map((g) => {
        const items = mods.filter((m) => g.modules.includes(m.id));
        if (!items.length) return null;
        return <section key={g.id} className="mb-6" aria-label={g.label}><div className="eyebrow mb-3">{g.label}</div><div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">{items.map(card)}</div></section>;
      })}
      {(() => { const rest = mods.filter((m) => !NAV_GROUPS.some((g) => g.modules.includes(m.id))); return rest.length ? <section className="mb-6" aria-label="Diğer"><div className="eyebrow mb-3">Diğer</div><div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">{rest.map(card)}</div></section> : null; })()}
      {mods.length === 0 && <p className="text-sm text-muted">Eşleşen uygulama yok.</p>}
    </>
  );
}
