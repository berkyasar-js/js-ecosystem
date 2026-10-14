'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
import { Bell, Menu, MessageSquare, Moon, Search, Sun, X } from 'lucide-react';
import { GROUP_LABELS, MODULES, ROLE_LABELS, canAccessModule, type ModuleGroup, type Project } from '@jscore/contracts';
import { ICONS } from './icons';
import { useSession } from './session';
import { Loading } from './ui';

const GROUPS: ModuleGroup[] = ['main', 'work', 'creative', 'people', 'intel', 'manage'];
export const hrefOf = (slug: string) => `/app/${slug}`;

export function Shell({ children }: { children: React.ReactNode }) {
  const { me, mode, resetDemo, orgs, orgId, setOrg, theme, toggleTheme, logout, repo, rev } = useSession();
  const path = usePathname();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const [projects, setProjects] = useState<Project[]>([]);
  const [pending, setPending] = useState(0);
  useEffect(() => setOpen(false), [path]);
  useEffect(() => {
    if (!repo) return;
    repo.listApprovals().then((a) => setPending(a.filter((x) => x.status === 'pending').length), () => setPending(0));
    repo.listProjects().then(setProjects, () => setProjects([]));
  }, [repo, rev]);

  const visible = useMemo(() => (me ? MODULES.filter((m) => canAccessModule(me.role, m.id)) : []), [me]);
  const results = useMemo(() => {
    const t = q.trim().toLocaleLowerCase('tr');
    if (!t) return [];
    return [
      ...visible.filter((m) => m.name.toLocaleLowerCase('tr').includes(t)).map((m) => ({ label: m.name, kind: 'Modül', href: hrefOf(m.slug) })),
      ...projects.filter((p) => p.name.toLocaleLowerCase('tr').includes(t)).map((p) => ({ label: p.name, kind: 'Proje', href: `/app/projects/${p.id}` })),
    ].slice(0, 8);
  }, [q, visible, projects]);

  if (!me) return <div className="mx-auto max-w-3xl p-8"><Loading rows={4} /></div>;
  const currentOrg = orgs.find((o) => o.id === orgId);

  const nav = (
    <nav aria-label="Ana gezinme" className="flex flex-col gap-4">
      {GROUPS.map((g) => {
        const items = visible.filter((m) => m.group === g && m.id !== 'apps');
        if (!items.length) return null;
        return (
          <div key={g}>
            <div className="px-3 pb-1 text-[11px] font-bold tracking-widest text-muted">{GROUP_LABELS[g]}</div>
            {items.map((m) => {
              const Icon = ICONS[m.icon] ?? ICONS.apps;
              const href = hrefOf(m.slug);
              const active = path === href || path.startsWith(href + '/');
              return (
                <Link key={m.id} href={href} className="navitem" aria-current={active ? 'page' : undefined} title={m.name}>
                  <Icon size={17} aria-hidden /><span className="flex-1 truncate">{m.name}</span>
                  {m.id === 'approvals' && pending > 0 && <span className="chip chip-warn">{pending}</span>}
                  {!m.live && <span className="h-1.5 w-1.5 rounded-full bg-line" title="Prototipte mevcut, üretimde sırada" />}
                </Link>
              );
            })}
          </div>
        );
      })}
    </nav>
  );

  return (
    <div className="min-h-screen lg:grid lg:grid-cols-[272px_1fr]">
      <aside className={`${open ? 'fixed inset-0 z-40 block bg-canvas' : 'hidden'} overflow-y-auto border-r border-line p-4 lg:sticky lg:top-0 lg:block lg:h-screen`}>
        <div className="mb-5 flex items-center justify-between px-2">
          <Link href="/app/overview" className="text-lg font-extrabold tracking-tight">JS <span className="text-accent">Ecosystem</span></Link>
          <button className="btn btn-ghost btn-sm lg:hidden" onClick={() => setOpen(false)} aria-label="Menüyü kapat"><X size={16} /></button>
        </div>
        {nav}
      </aside>
      <div className="min-w-0">
        {mode === 'demo' && (
          <div role="status" className="flex flex-wrap items-center justify-center gap-3 bg-[#ffb020] px-4 py-1.5 text-center text-xs font-semibold text-[#2a1b00]">
            Demo modu — veritabanı bağlı değil
            <button className="underline" onClick={resetDemo}>Demo verisini sıfırla</button>
          </div>
        )}
        <header className="sticky top-0 z-30 flex flex-wrap items-center gap-2 border-b border-line bg-canvas/90 px-4 py-3 backdrop-blur sm:px-6">
          <button className="btn btn-ghost btn-sm lg:hidden" onClick={() => setOpen(true)} aria-label="Menüyü aç"><Menu size={16} /></button>
          <div className="relative min-w-[160px] flex-1 sm:max-w-md">
            <Search size={15} className="pointer-events-none absolute left-3 top-3 text-muted" aria-hidden />
            <input className="input pl-9" placeholder="Ara: modül, proje…" aria-label="Ara" value={q} onChange={(e) => setQ(e.target.value)} />
            {results.length > 0 && (
              <ul className="card absolute left-0 right-0 top-12 z-50 grid gap-1 p-2 shadow-xl">
                {results.map((r) => (
                  <li key={r.href}><Link href={r.href} onClick={() => setQ('')} className="navitem justify-between"><span>{r.label}</span><span className="chip">{r.kind}</span></Link></li>
                ))}
              </ul>
            )}
          </div>
          <div className="ml-auto flex items-center gap-2">
            {orgs.length > 1 && (
              <select className="input w-auto" aria-label="Organizasyon" value={orgId} onChange={(e) => setOrg(e.target.value)}>
                {orgs.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
              </select>
            )}
            {orgs.length === 1 && <span className="chip hidden sm:inline-flex">{currentOrg?.name}</span>}
            <span className="chip chip-brand hidden sm:inline-flex" title={me.title}>{ROLE_LABELS[me.role]}</span>
            <Link href="/app/approvals" className="btn btn-ghost btn-sm relative" aria-label={`Bildirimler (${pending} bekleyen onay)`}>
              <Bell size={16} />{pending > 0 && <span className="absolute -right-1 -top-1 rounded-full bg-accent px-1.5 text-[10px] font-bold text-white">{pending}</span>}
            </Link>
            <Link href="/app/messages" className="btn btn-ghost btn-sm" aria-label="Mesajlar"><MessageSquare size={16} /></Link>
            <button className="btn btn-ghost btn-sm" onClick={toggleTheme} aria-label="Temayı değiştir">{theme === 'dark' ? <Sun size={16} /> : <Moon size={16} />}</button>
            <Link href="/app/profile" className="grid h-9 w-9 place-items-center rounded-full bg-brand text-xs font-bold text-white" title={me.name}>{me.initials}</Link>
            <button className="btn btn-ghost btn-sm" onClick={() => void logout()}>Çıkış</button>
          </div>
        </header>
        <main id="main" className="mx-auto w-full max-w-[1400px] p-4 sm:p-6">{children}</main>
      </div>
    </div>
  );
}
