'use client';
import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
import { Bell, Bookmark, ChevronRight, Keyboard, LogOut, Menu, MessageCircleQuestion, Moon, PanelLeftClose, PanelLeftOpen, Search, Star, Sun, X } from 'lucide-react';
import { GO_TARGETS, MODULES, ROLE_LABELS, SHORTCUTS, canDecideApproval, isClientRole, type NavGroup, type Notification, type SavedView } from '@jscore/contracts';
import { OrbitDialog } from './dialog';
import { crumbFor, mobileTabs, moduleVisible, navGroups, routeVerdict } from '@/lib/nav';
import { mfaRequired } from '@/lib/mfa';
import { MfaGate } from './mfa-gate';
import { ICONS } from './icons';
import { useSession } from './session';
import { Avatar } from './avatar';
import { Loading } from './ui';
import { Spotlight } from './spotlight';
import { AskDrawer } from './ask-drawer';

export const hrefOf = (slug: string) => `/app/${slug}`;
/** Kendi başına (kabuksuz) açılan rotalar. */
const BARE = ['/app/welcome'];

/** Oturum + MFA kapısı: ayarlar yüklenene dek içerik gösterilmez; org MFA'yı zorunlu kılmışsa TOTP kaydı/kodu olmadan uygulama açılmaz. */
export function Shell({ children }: { children: React.ReactNode }) {
  const { mode, features, logout } = useSession();
  const path = usePathname();
  if (!features.loaded) return <div className="mx-auto max-w-3xl p-8"><Loading rows={4} /></div>;
  if (BARE.some((b) => path.startsWith(b))) return <WelcomeGate>{children}</WelcomeGate>;
  if (mfaRequired(mode, features.requireMfa)) return <MfaGate onLogout={() => void logout()}><ShellInner>{children}</ShellInner></MfaGate>;
  return <ShellInner>{children}</ShellInner>;
}
function WelcomeGate({ children }: { children: React.ReactNode }) {
  const { me } = useSession();
  return me ? <>{children}</> : <div className="mx-auto max-w-3xl p-8"><Loading rows={4} /></div>;
}

function ShellInner({ children }: { children: React.ReactNode }) {
  const { me, mode, resetDemo, orgs, orgId, setOrg, theme, toggleTheme, logout, repo, rev, features, prefs, prefsLoaded, setPrefs } = useSession();
  const router = useRouter();
  const [notice, setNotice] = useState<string | null>(null);
  const path = usePathname();
  const qs = useSearchParams();
  const [open, setOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [askOpen, setAskOpen] = useState(false);
  const [attention, setAttention] = useState(0);
  const [helpOpen, setHelpOpen] = useState(false);
  const [pinnedViews, setPinnedViews] = useState<SavedView[]>([]);
  const flags = features.flags;
  const collapsed = prefs.sidebar_collapsed;
  useEffect(() => { setOpen(false); setSearchOpen(false); }, [path]);
  // Klavye (0017): ⌘K ara, ⌘J sor, ? yardım, g+h/i/p/t/a/r git, c yeni görev — yazı alanı odaktayken devre dışı.
  useEffect(() => {
    let pendingG = 0;
    const typing = (el: EventTarget | null) => el instanceof HTMLElement && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT' || el.isContentEditable || !!el.closest('dialog, [role="dialog"]'));
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); setAskOpen(false); setSearchOpen((v) => !v); return; }
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'j') { e.preventDefault(); setSearchOpen(false); setAskOpen((v) => !v); return; }
      if (e.key === 'Escape') { setSearchOpen(false); setAskOpen(false); setOpen(false); return; }
      if (e.metaKey || e.ctrlKey || e.altKey || typing(e.target)) return;
      if (e.key === '?') { e.preventDefault(); setHelpOpen((v) => !v); return; }
      if (pendingG && Date.now() - pendingG < 1200 && GO_TARGETS[e.key]) { e.preventDefault(); pendingG = 0; router.push(GO_TARGETS[e.key]); return; }
      pendingG = e.key === 'g' ? Date.now() : 0;
      if (e.key === 'c' && !(e.target as HTMLElement).closest('.wk-work-area')) { e.preventDefault(); router.push('/app/tasks?new=1'); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [router]);
  useEffect(() => { if (new URLSearchParams(window.location.search).get('help') === 'keys') setHelpOpen(true); }, [path]);
  // Kenar çubuğuna sabitlenen kayıtlı görünümler (Projeler altında).
  useEffect(() => {
    if (!repo || !me || isClientRole(me.role) || !prefs.pinned_views.length) { setPinnedViews([]); return; }
    let alive = true;
    repo.list('saved_views').then((vs) => alive && setPinnedViews(prefs.pinned_views.map((id) => vs.find((v) => v.id === id)).filter((v): v is SavedView => !!v)), () => alive && setPinnedViews([]));
    return () => { alive = false; };
  }, [repo, me, prefs.pinned_views, rev]);
  // Dikkat sayacı: karar verebileceğim onaylar + okunmamış bildirimlerim (Gelen Kutusu rozeti).
  useEffect(() => {
    if (!repo || !me) return;
    let alive = true;
    Promise.all([repo.listApprovals().catch(() => []), repo.list('notifications').catch(() => [] as Notification[])]).then(([a, n]) => {
      if (!alive) return;
      const done = new Set(prefs.inbox_done);
      const ap = a.filter((x) => x.status === 'pending' && canDecideApproval(me.role, x.required_role) && !done.has(`approval:${x.id}`)).length;
      const nn = (n as Notification[]).filter((x) => !x.read && (!me.employee_id || x.employee_id === me.employee_id) && !done.has(`${x.kind === 'mention' ? 'mention' : 'notification'}:${x.id}`)).length;
      setAttention(ap + nn);
    });
    return () => { alive = false; };
  }, [repo, rev, me, prefs.inbox_done]);

  // Kapalı modülün rotası → ana sayfaya yönlendir (yönetim modülleri kendi "taşındı" sayfasını gösterir).
  const verdict = features.loaded ? routeVerdict(path, flags) : 'ok';
  useEffect(() => { if (verdict === 'disabled') router.replace('/app/overview?notice=module_disabled'); }, [verdict, router]);
  useEffect(() => {
    if (path !== '/app/overview') return;
    const n = new URLSearchParams(window.location.search).get('notice');
    setNotice(n === 'module_disabled' ? 'Bu modül yöneticin tarafından kapatıldı.' : null);
  }, [path]);
  // İlk giriş: karşılama akışı (atlanabilir; prefs.welcome_done).
  useEffect(() => { if (prefsLoaded && me && !prefs.welcome_done && !path.startsWith('/app/setup')) router.replace('/app/welcome'); }, [prefsLoaded, prefs.welcome_done, me, path, router]);

  const groups = useMemo(() => (me ? navGroups(me.role, flags, features.nav) : []), [me, flags, features.nav]);
  const visible = useMemo(() => (me ? moduleVisible(me.role, flags) : () => false), [me, flags]);
  const favorites = useMemo(() => prefs.favorites.map((id) => MODULES.find((m) => m.id === id)).filter((m): m is NonNullable<typeof m> => !!m && visible(m.id)), [prefs.favorites, visible]);
  const tabs = useMemo(() => mobileTabs(groups), [groups]);

  if (!me) return <div className="mx-auto max-w-3xl p-8"><Loading rows={4} /></div>;
  const currentOrg = orgs.find((o) => o.id === orgId);
  const orgName = features.orgName || currentOrg?.name || 'Jobs Studio';
  const orgMark = orgName.split(/\s+/).map((w) => w[0]).slice(0, 2).join('').toUpperCase();
  const avatarId = me.employee_id || me.id;
  const crumb = crumbFor(path, groups);
  const isActive = (g: NavGroup) => { const base = g.href.split('?')[0]; return path === base || path.startsWith(base + '/') || g.modules.some((m) => path === hrefOf(m) || path.startsWith(hrefOf(m) + '/')); };
  const childActive = (href: string) => { const [b, q] = href.split('?'); if (path !== b && !path.startsWith(b + '/')) return false; const [k, v] = (q ?? '').split('='); return q ? qs.get(k) === v : !qs.get('tab'); };

  const nav = (
    <nav aria-label="Ana gezinme" className="flex flex-col">
      {groups.map((g) => {
        const Icon = ICONS[g.icon] ?? ICONS.apps;
        const active = isActive(g);
        const count = g.id === 'inbox' ? attention : 0;
        return (
          <div key={g.id}>
            <Link href={g.href} className="navitem" aria-current={active ? 'page' : undefined} title={g.label}>
              <Icon size={17} aria-hidden /><span className="nav-text flex-1 truncate">{g.label}</span>
              {count > 0 && <span className="nav-count">{count}</span>}
            </Link>
            {active && !collapsed && (g.children.length > 1 || (g.id === 'projects' && pinnedViews.length > 0)) && (
              <div className="nav-sub" role="list">
                {g.children.map((c) => <Link key={c.href} role="listitem" href={c.href} className="nav-subitem" aria-current={childActive(c.href) ? 'page' : undefined}>{c.label}</Link>)}
                {g.id === 'projects' && pinnedViews.map((v) => <Link key={v.id} role="listitem" href={`/app/tasks?view=${v.id}`} className="nav-subitem" aria-current={qs.get('view') === v.id ? 'page' : undefined} title={`Kayıtlı görünüm · ${v.scope === 'org' ? 'organizasyon' : 'kişisel'}`}><Bookmark size={11} aria-hidden className="mr-1 inline" />{v.name}</Link>)}
              </div>
            )}
          </div>
        );
      })}
      {favorites.length > 0 && (
        <div>
          <div className="nav-label nav-text">Favoriler</div>
          {favorites.map((m) => { const Icon = ICONS[m.icon] ?? ICONS.apps; const href = hrefOf(m.slug); return (
            <Link key={m.id} href={href} className="navitem" aria-current={path === href || path.startsWith(href + '/') ? 'page' : undefined} title={m.name}><Icon size={17} aria-hidden /><span className="nav-text flex-1 truncate">{m.name}</span><Star size={12} aria-hidden className="nav-text opacity-60" /></Link>
          ); })}
        </div>
      )}
    </nav>
  );

  return (
    <div className={`min-h-screen lg:grid ${collapsed ? 'lg:grid-cols-[76px_1fr]' : 'lg:grid-cols-[256px_1fr]'}`}>
      <aside aria-label="Jobs Studio" className={`sidebar ${collapsed ? 'collapsed' : ''} ${open ? 'fixed inset-0 z-40 flex' : 'hidden'} lg:sticky lg:top-0 lg:flex lg:h-screen`}>
        <div className="flex items-start justify-between">
          <Link href="/app/overview" aria-label="Ana Sayfa">{features.logoUrl && /^https:\/\//.test(features.logoUrl) ? <img className="logo" src={features.logoUrl} alt={orgName} width={168} height={32} /> : <img className="logo" src="/brand/jobs-logo-light.svg" alt="Jobs Studio" width={168} height={32} />}</Link>
          <button className="btn btn-ghost btn-sm text-white lg:hidden" onClick={() => setOpen(false)} aria-label="Menüyü kapat"><X size={16} /></button>
        </div>
        <Link className="wordmark nav-text" href="/app/overview">JS Ecosystem<b>.</b></Link>
        <div className="workspace"><div className="workspace-mark">{orgMark || 'JS'}</div><div className="nav-text">{orgName}<small>{ROLE_LABELS[me.role]} görünümü</small></div></div>
        {nav}
        <button className="navitem mt-2 hidden lg:flex" onClick={() => void setPrefs({ sidebar_collapsed: !collapsed })} aria-label={collapsed ? 'Menüyü genişlet' : 'Menüyü daralt'} aria-pressed={collapsed} title={collapsed ? 'Genişlet' : 'Daralt'}>
          {collapsed ? <PanelLeftOpen size={17} aria-hidden /> : <PanelLeftClose size={17} aria-hidden />}<span className="nav-text flex-1 truncate">Daralt</span>
        </button>
        <Link className="identity" href="/app/profile" aria-label="Profil">
          <Avatar id={avatarId} name={me.name} />
          <div className="nav-text">{me.name}<small>{me.title}</small></div>
        </Link>
      </aside>
      <div className="min-w-0">
        <header className="topbar">
          <button className="btn btn-ghost icon-btn lg:hidden" onClick={() => setOpen(true)} aria-label="Menüyü aç"><Menu size={18} /></button>
          <div className="breadcrumb"><span className="org-crumb hidden sm:inline">{orgName}</span><ChevronRight size={14} aria-hidden className="org-crumb hidden sm:inline" /><strong>{crumb.group}</strong>{crumb.sub && <><ChevronRight size={14} aria-hidden className="hidden sm:inline" /><span className="hidden sm:inline">{crumb.sub}</span></>}</div>
          <div className="top-actions">
            <div className="search-wrap">
              <button className="search-trigger" onClick={() => setSearchOpen(true)} aria-label="Ara (⌘K)" aria-haspopup="dialog">
                <Search size={15} aria-hidden /><span className="hidden md:inline">Ara</span><kbd className="hidden md:inline">⌘ K</kbd>
              </button>
            </div>
            <button className="btn btn-ghost icon-btn" onClick={() => setAskOpen(true)} aria-label="Sor (⌘J)" title="Sor · ⌘J"><MessageCircleQuestion size={17} /></button>
            <button className="btn btn-ghost icon-btn hidden md:inline-flex" onClick={() => setHelpOpen(true)} aria-label="Klavye kısayolları (?)" title="Kısayollar · ?"><Keyboard size={17} /></button>
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
            <Link href="/app/inbox" className="btn btn-ghost icon-btn" aria-label={`Gelen kutusu (${attention} dikkat isteyen)`}>
              <Bell size={17} />{attention > 0 && <span className="count-dot">{attention}</span>}
            </Link>
            <button className="btn btn-ghost icon-btn" onClick={toggleTheme} aria-label="Temayı değiştir">{theme === 'dark' ? <Sun size={17} /> : <Moon size={17} />}</button>
            <Link href="/app/profile" className="avatar-link" aria-label="Profil" title={me.name}><Avatar id={avatarId} name={me.name} size="md" /></Link>
            <button className="btn btn-ghost icon-btn hidden sm:inline-flex" onClick={() => void logout()} aria-label="Çıkış"><LogOut size={17} /></button>
          </div>
        </header>
        <main id="main" className="mx-auto w-full max-w-[1400px] p-4 pb-24 sm:p-6 lg:pb-6">
          {notice && <p role="status" className="card mb-4 flex items-center justify-between gap-3 text-sm"><span>{notice}</span><button className="btn btn-ghost btn-sm" onClick={() => setNotice(null)} aria-label="Bildirimi kapat"><X size={14} /></button></p>}
          {verdict === 'disabled' ? <Loading rows={2} /> : children}
        </main>
        {tabs.length > 0 && (
          <nav className="bottom-tabs lg:hidden" aria-label="Hızlı gezinme">
            {tabs.map((g) => { const Icon = ICONS[g.icon] ?? ICONS.apps; const active = isActive(g); return (
              <Link key={g.id} href={g.href} className="bottom-tab" aria-current={active ? 'page' : undefined}><span className="relative"><Icon size={20} aria-hidden />{g.id === 'inbox' && attention > 0 && <span className="count-dot">{attention}</span>}</span><span>{g.label}</span></Link>
            ); })}
          </nav>
        )}
      </div>
      <Spotlight open={searchOpen} onClose={() => setSearchOpen(false)} groups={groups} />
      <AskDrawer open={askOpen} onClose={() => setAskOpen(false)} />
      <OrbitDialog open={helpOpen} onClose={() => { setHelpOpen(false); if (!prefs.shortcuts_seen) void setPrefs({ shortcuts_seen: true }); }} title="Klavye kısayolları" description="Yazı alanı odaktayken harf kısayolları devre dışıdır.">
        <div className="wk-dialog-body"><ul className="wk-keys">{SHORTCUTS.map((k) => <li key={k.keys}><span>{k.label}</span><kbd className="wk-kbd">{k.keys}</kbd></li>)}</ul></div>
      </OrbitDialog>
    </div>
  );
}
