'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import { Activity, Bot, Building2, ChevronRight, ClipboardList, ExternalLink, Landmark, LayoutDashboard, MessagesSquare, Store, LogOut, Menu, Moon, Plug, ShieldCheck, Sun, SquareStack, UserCog, Users, Workflow, X, type LucideIcon } from 'lucide-react';
import { ROLE_LABELS } from '@jscore/contracts';
import { useSession } from './session';
import { Avatar } from './avatar';
import { Loading } from './ui';

export const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? '';
interface Item { href: string; label: string; icon: LucideIcon }
export const NAV: Array<{ label: string; items: Item[] }> = [
  { label: 'PANEL', items: [{ href: '/admin', label: 'Genel bakış', icon: LayoutDashboard }] },
  { label: 'YAPILANDIRMA', items: [
    { href: '/admin/modules', label: 'Modüller & Özellikler', icon: SquareStack },
    { href: '/admin/users', label: 'Kullanıcılar & Roller', icon: UserCog },
    { href: '/admin/employees', label: 'Çalışanlar', icon: Users },
  ] },
  { label: 'SİSTEM', items: [
    { href: '/admin/integrations', label: 'Entegrasyonlar', icon: Plug },
    { href: '/admin/automations', label: 'Otomasyonlar', icon: Workflow },
    { href: '/admin/agents', label: 'Ajanlar & Maliyet', icon: Bot },
    { href: '/admin/board', label: 'Yönetim Kurulu', icon: Landmark },
    { href: '/admin/board/sohbet', label: 'Kurul Sohbeti', icon: MessagesSquare },
  ] },
  { label: 'GÜVENLİK & VERİ', items: [
    { href: '/admin/audit', label: 'Denetim kaydı', icon: ClipboardList },
    { href: '/admin/security', label: 'Güvenlik', icon: ShieldCheck },
    { href: '/admin/organization', label: 'Organizasyon', icon: Building2 },
    { href: '/admin/marketplace', label: 'Ürünler & Paketler', icon: Store },
  ] },
];
const flat = NAV.flatMap((g) => g.items);

export function AdminShell({ children }: { children: React.ReactNode }) {
  const { me, mode, orgs, orgId, theme, toggleTheme, logout, resetDemo } = useSession();
  const path = usePathname();
  const [open, setOpen] = useState(false);
  useEffect(() => setOpen(false), [path]);
  if (!me) return <div className="mx-auto max-w-3xl p-8"><Loading rows={4} /></div>;
  const orgName = orgs.find((o) => o.id === orgId)?.name ?? 'Jobs Studio';
  const orgMark = orgName.split(/\s+/).map((w) => w[0]).slice(0, 2).join('').toUpperCase();
  // Alt rota (ör. /admin/board/sohbet) kendi menü maddesine sahipse üst madde (/admin/board) etkin sayılmaz.
  const active = (href: string) => (href === '/admin' ? path === '/admin' : path === href || (path.startsWith(href + '/') && !flat.some((i) => i.href !== href && i.href.startsWith(href + '/') && (path === i.href || path.startsWith(i.href + '/')))));
  const current = flat.find((i) => active(i.href));
  return (
    <div className="min-h-screen lg:grid lg:grid-cols-[256px_1fr]">
      <aside aria-label="Ana Yönetim Paneli" className={`sidebar ${open ? 'fixed inset-0 z-40 flex' : 'hidden'} lg:sticky lg:top-0 lg:flex lg:h-screen`}>
        <div className="flex items-start justify-between">
          <Link href="/admin" aria-label="Genel bakış"><img className="logo" src="/brand/jobs-logo-light.svg" alt="Jobs Studio" width={168} height={32} /></Link>
          <button className="btn btn-ghost btn-sm text-white lg:hidden" onClick={() => setOpen(false)} aria-label="Menüyü kapat"><X size={16} /></button>
        </div>
        <Link className="wordmark" href="/admin">Yönetim<b>.</b></Link>
        <div className="workspace"><div className="workspace-mark">{orgMark || 'JS'}</div><div>{orgName}<small>{ROLE_LABELS[me.role]} · Ana Yönetim Paneli</small></div></div>
        <nav aria-label="Yönetim gezinmesi" className="flex flex-col">
          {NAV.map((g) => (
            <div key={g.label}>
              <div className="nav-label">{g.label}</div>
              {g.items.map(({ href, label, icon: Icon }) => (
                <Link key={href} href={href} className="navitem" aria-current={active(href) ? 'page' : undefined}><Icon size={17} aria-hidden /><span className="flex-1 truncate">{label}</span></Link>
              ))}
            </div>
          ))}
          {APP_URL && <a className="navitem mt-2" href={`${APP_URL}/app/overview`} target="_blank" rel="noreferrer"><ExternalLink size={17} aria-hidden /><span className="flex-1 truncate">Kullanıcı uygulaması</span></a>}
        </nav>
        <div className="identity"><Avatar id={me.employee_id || me.id} name={me.name} /><div>{me.name}<small>{me.email || me.title}</small></div></div>
      </aside>
      <div className="min-w-0">
        <header className="topbar">
          <button className="btn btn-ghost icon-btn lg:hidden" onClick={() => setOpen(true)} aria-label="Menüyü aç"><Menu size={18} /></button>
          <div className="breadcrumb"><span className="org-crumb hidden sm:inline">{orgName}</span><ChevronRight size={14} aria-hidden className="org-crumb hidden sm:inline" /><strong>{current?.label ?? 'Yönetim'}</strong></div>
          <div className="top-actions">
            <span className="role-chip hidden sm:inline-flex"><span className="dot" /><span className="role-text">{ROLE_LABELS[me.role]}</span></span>
            {mode === 'demo' && <button className="demo-chip hidden md:inline-flex" title="Demo verisini sıfırla" onClick={() => { if (window.confirm('Demo verisi sıfırlansın mı?')) resetDemo(); }}><i className="demo-dot" /><span className="demo-text">Demo · Supabase bağlı değil</span></button>}
            <Link href="/admin/audit" className="btn btn-ghost icon-btn" aria-label="Denetim kaydı"><Activity size={17} /></Link>
            <button className="btn btn-ghost icon-btn" onClick={toggleTheme} aria-label="Temayı değiştir">{theme === 'dark' ? <Sun size={17} /> : <Moon size={17} />}</button>
            <button className="btn btn-ghost icon-btn" onClick={() => void logout()} aria-label="Çıkış"><LogOut size={17} /></button>
          </div>
        </header>
        <main id="main" className="mx-auto w-full max-w-[1400px] p-4 sm:p-6">{children}</main>
      </div>
    </div>
  );
}
