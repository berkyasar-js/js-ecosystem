'use client';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
import { Bell, ChevronRight, LogOut, Menu, MessageSquare, Moon, Search, Sun, X } from 'lucide-react';
import { GROUP_LABELS, ROLE_LABELS, type ModuleGroup, type Project } from '@jscore/contracts';
import { navModules, routeVerdict } from '@/lib/nav';
import { mfaRequired } from '@/lib/mfa';
import { MfaGate } from './mfa-gate';
import { ICONS } from './icons';
import { useSession } from './session';
import { Avatar } from './avatar';
import { Loading } from './ui';

const GROUPS: ModuleGroup[] = ['main', 'work', 'creative', 'people', 'intel', 'manage'];
export const hrefOf = (slug: string) => `/app/${slug}`;

/** Oturum + MFA kapısı: ayarlar yüklenene dek içerik gösterilmez; org MFA'yı zorunlu kılmışsa TOTP kaydı/kodu olmadan uygulama açılmaz. */
export function Shell({ children }: { children: React.ReactNode }) {
  const { mode, features, logout } = useSession();
  if (!features.loaded) return <div className="mx-auto max-w-3xl p-8"><Loading rows={4} /></div>;
  if (mfaRequired(mode, features.requireMfa)) return <MfaGate onLogout={() => void logout()}><ShellInner>{children}</ShellInner></MfaGate>;
  return <ShellInner>{children}</ShellInner>;
}

function ShellInner({ children }: { children: React.ReactNode }) {
  const { me, mode, resetDemo, orgs, orgId, setOrg, theme, toggleTheme, logout, repo, rev, features } = useSession();
  const router = useRouter();
  const [notice, setNotice] = useState<string | null>(null);
  const path = usePathname();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const [searchOpen, setSearchOpen] = useState(false);
  const [projects, setProjects] = useState<Project[]>([]);
  const [pending, setPending] = useState(0);
  const flags = features.flags;
  useEffect(() => { setOpen(false); setSearchOpen(false); setQ(''); }, [path]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); setSearchOpen((v) => !v); }
      else if (e.key === 'Escape') { setSearchOpen(false); setOpen(false); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
  useEffect(() => {
    if (!repo) return;
    repo.listApprovals().then((a) => setPending(a.filter((x) => x.status === 'pending').length), () => setPending(0));
    repo.listProjects().then(setProjects, () => setProjects([]));
  }, [repo, rev]);

  // Kapalı modülün rotası → genel bakışa yönlendir (yönetim modülleri kendi "taşındı" sayfasını gösterir).
  const verdict = features.loaded ? routeVerdict(path, flags) : 'ok';
  useEffect(() => { if (verdict === 'disabled') router.replace('/app/overview?notice=module_disabled'); }, [verdict, router]);
  useEffect(() => {
    if (path !== '/app/overview') return;
    const n = new URLSearchParams(window.location.search).get('notice');
    setNotice(n === 'module_disabled' ? 'Bu modül yöneticin tarafından kapatıldı.' : null);
  }, [path]);

  const visible = useMemo(() => (me ? navModules(me.role, flags) : []), [me, flags]);
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
    <nav aria-label="Ana gezinme" className="flex flex-col">
      {GROUPS.map((g) => {
        const items = visible.filter((m) => m.group === g && m.id !== 'apps');
        if (!items.length) return null;
        return (
          <div key={g}>
            <div className="nav-label">{GROUP_LABELS[g]}</div>
            {items.map((m) => {
              const Icon = ICONS[m.icon] ?? ICONS.apps;
              const href = hrefOf(m.slug);
              const active = path === href || path.startsWith(href + '/');
              return (
                <Link key={m.id} href={href} className="navitem" aria-current={active ? 'page' : undefined} title={m.name}>
                  <Icon size={17} aria-hidden /><span className="flex-1 truncate">{m.name}</span>
                  {m.id === 'approvals' && pending > 0 && <span className="nav-count">{pending}</span>}
                  {!m.live && <span className="h-1.5 w-1.5 rounded-full bg-white/25" title="Prototipte mevcut, üretimde sırada" />}
                </Link>
              );
            })}
          </div>
        );
      })}
    </nav>
  );

  const orgName = currentOrg?.name ?? 'Jobs Studio';
  const orgMark = orgName.split(/\s+/).map((w) => w[0]).slice(0, 2).join('').toUpperCase();
  const avatarId = me.employee_id || me.id;
  const current = visible.find((m) => path === hrefOf(m.slug) || path.startsWith(hrefOf(m.slug) + '/'));
  const crumb = current?.name ?? (path.startsWith('/app/profile') ? 'Profil' : 'Genel Bakış');

  return (
    <div className="min-h-screen lg:grid lg:grid-cols-[256px_1fr]">
      <aside aria-label="Jobs Studio" className={`sidebar ${open ? 'fixed inset-0 z-40 flex' : 'hidden'} lg:sticky lg:top-0 lg:flex lg:h-screen`}>
        <div className="flex items-start justify-between">
          <Link href="/app/overview" aria-label="Genel Bakış"><img className="logo" src="/brand/jobs-logo-light.svg" alt="Jobs Studio" width={168} height={32} /></Link>
          <button className="btn btn-ghost btn-sm text-white lg:hidden" onClick={() => setOpen(false)} aria-label="Menüyü kapat"><X size={16} /></button>
        </div>
        <Link className="wordmark" href="/app/overview">JS Ecosystem<b>.</b></Link>
        <div className="workspace"><div className="workspace-mark">{orgMark || 'JS'}</div><div>{orgName} · Ankara<small>{ROLE_LABELS[me.role]} görünümü</small></div></div>
        {nav}
        <Link className="identity" href="/app/profile" aria-label="Profil">
          <Avatar id={avatarId} name={me.name} />
          <div>{me.name}<small>{me.title}</small></div>
        </Link>
      </aside>
      <div className="min-w-0">
        <header className="topbar">
          <button className="btn btn-ghost icon-btn lg:hidden" onClick={() => setOpen(true)} aria-label="Menüyü aç"><Menu size={18} /></button>
          <div className="breadcrumb"><span className="org-crumb hidden sm:inline">{orgName}</span><ChevronRight size={14} aria-hidden className="org-crumb hidden sm:inline" /><strong>{crumb}</strong></div>
          <div className="top-actions">
            <div className="search-wrap">
              <button className="search-trigger" onClick={() => setSearchOpen((v) => !v)} aria-label="Ara (⌘K)" aria-expanded={searchOpen}>
                <Search size={15} aria-hidden /><span className="hidden md:inline">Ara</span><kbd className="hidden md:inline">⌘ K</kbd>
              </button>
              {searchOpen && (
                <div className="card search-pop fixed left-3 right-3 top-[72px] sm:absolute sm:left-auto sm:right-0 sm:top-12 sm:w-[380px]" role="dialog" aria-label="Ara">
                  <input className="input" autoFocus placeholder="Ara: modül, proje…" aria-label="Ara" value={q} onChange={(e) => setQ(e.target.value)} />
                  {results.map((r) => (
                    <Link key={r.href} href={r.href} onClick={() => { setQ(''); setSearchOpen(false); }} className="navitem justify-between !text-[var(--ink)]"><span>{r.label}</span><span className="chip">{r.kind}</span></Link>
                  ))}
                  {q.trim() && results.length === 0 && <p className="p-2 text-sm text-muted">Sonuç yok.</p>}
                </div>
              )}
            </div>
            {orgs.length > 1 && (
              <select className="input org-select hidden w-auto md:block" aria-label="Organizasyon" value={orgId} onChange={(e) => setOrg(e.target.value)}>
                {orgs.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
              </select>
            )}
            <span className="role-chip hidden sm:inline-flex" title={`${ROLE_LABELS[me.role]} · ${me.title}`} aria-label={`Rol: ${ROLE_LABELS[me.role]}`}><span className="dot" /><span className="role-text">{ROLE_LABELS[me.role]}</span></span>
            {mode === 'demo' && (
              <button className="demo-chip hidden md:inline-flex" title="Demo · 14 Ekim 2026 — verisini sıfırla" aria-label="Demo modu, 14 Ekim 2026. Demo verisini sıfırla" onClick={() => { if (window.confirm('Demo verisi sıfırlansın mı?')) resetDemo(); }}>
                <i className="demo-dot" /><span className="demo-text">Demo · 14 Ekim 2026</span>
              </button>
            )}
            <Link href="/app/approvals" className="btn btn-ghost icon-btn" aria-label={`Bildirimler (${pending} bekleyen onay)`}>
              <Bell size={17} />{pending > 0 && <span className="count-dot">{pending}</span>}
            </Link>
            <Link href="/app/messages" className="btn btn-ghost icon-btn hidden sm:inline-flex" aria-label="Mesajlar"><MessageSquare size={17} /></Link>
            <button className="btn btn-ghost icon-btn" onClick={toggleTheme} aria-label="Temayı değiştir">{theme === 'dark' ? <Sun size={17} /> : <Moon size={17} />}</button>
            <Link href="/app/profile" className="avatar-link" aria-label="Profil" title={me.name}><Avatar id={avatarId} name={me.name} size="md" /></Link>
            <button className="btn btn-ghost icon-btn hidden sm:inline-flex" onClick={() => void logout()} aria-label="Çıkış"><LogOut size={17} /></button>
          </div>
        </header>
        <main id="main" className="mx-auto w-full max-w-[1400px] p-4 sm:p-6">
          {notice && <p role="status" className="card mb-4 flex items-center justify-between gap-3 text-sm"><span>{notice}</span><button className="btn btn-ghost btn-sm" onClick={() => setNotice(null)} aria-label="Bildirimi kapat"><X size={14} /></button></p>}
          {verdict === 'disabled' ? <Loading rows={2} /> : children}
        </main>
      </div>
    </div>
  );
}
