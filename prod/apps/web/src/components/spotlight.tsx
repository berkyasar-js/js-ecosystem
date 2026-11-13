'use client';
import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowRight, CornerDownLeft, FolderKanban, Landmark, Plus, Search, Settings2, SquareKanban, Terminal, User, Building2 } from 'lucide-react';
import { MODULES, SLASH_COMMANDS, parseSlash, slashHref, type Brand, type NavGroup, type Project, type Role, type Task, type TeamMember } from '@jscore/contracts';
import { ICONS } from './icons';
import { useSession } from './session';
import { moduleVisible } from '@/lib/nav';

/** Spotlight (⌘K / Ctrl+K): modül ve sayfalar, görevler, projeler, marka/müşteri, kişiler, hızlı eylemler. Veri oturumun repo'sundan, açılışta bir kez yüklenir. */
export interface Hit { id: string; label: string; kind: string; href: string; hint?: string; icon?: React.ComponentType<{ size?: number; 'aria-hidden'?: boolean }> }
const ADMIN_URL = process.env.NEXT_PUBLIC_ADMIN_URL ?? '';
const lc = (s: string) => s.toLocaleLowerCase('tr');

/** Slash komutları (0017): `/görev <başlık>`, `/talep`, `/duyuru`, `/kurul <soru>` (owner), `/git <modül>`; `/` tek başına komut listesi. */
export function slashHits(q: string, o: { role: Role | null; adminUrl?: string; modules: Array<{ id: string; name: string; slug: string }> }): Hit[] | null {
  const t = q.trim();
  if (!t.startsWith('/')) return null;
  const allowed = SLASH_COMMANDS.filter((c) => !c.roles || (o.role && c.roles.includes(o.role)));
  const p = parseSlash(t);
  if (p && allowed.some((c) => c.cmd === p.cmd)) {
    const def = allowed.find((c) => c.cmd === p.cmd)!;
    const href = slashHref(p.cmd, p.arg, o);
    if (!href) return [{ id: 'slash:none', label: p.cmd === 'go' ? `"${p.arg}" adında modül yok` : 'Bu komut için bağlantı tanımlı değil (NEXT_PUBLIC_ADMIN_URL)', kind: 'Komut', href: '#', icon: Terminal }];
    return [{ id: `slash:${p.cmd}`, label: `${def.hint}${p.arg ? `: ${p.arg}` : ''}`, kind: 'Komut', href, hint: def.label, icon: Terminal }];
  }
  const word = lc(t.slice(1).split(/\s+/)[0]);
  return allowed.filter((c) => !word || c.aliases.some((a) => a.startsWith(word))).map<Hit>((c) => ({ id: `slash:list:${c.cmd}`, label: c.label, kind: 'Komut', href: `#slash:${c.aliases[0]}`, hint: c.hint, icon: Terminal }));
}

/** Saf eşleme: boş sorguda hızlı eylemler + sayfalar; doluda tüm kaynaklar (en çok 12). */
export function searchHits(q: string, src: { pages: Hit[]; actions: Hit[]; tasks: Task[]; projects: Project[]; brands: Brand[]; team: TeamMember[] }): Hit[] {
  const t = lc(q.trim());
  if (!t) return [...src.actions, ...src.pages.slice(0, 8)];
  const m = (s: string) => lc(s).includes(t);
  const out: Hit[] = [
    ...src.actions.filter((a) => m(a.label)),
    ...src.pages.filter((p) => m(p.label) || (p.hint ? m(p.hint) : false)),
    ...src.projects.filter((p) => m(p.name)).map<Hit>((p) => ({ id: `p:${p.id}`, label: p.name, kind: 'Proje', href: `/app/projects/${p.id}`, hint: p.status, icon: FolderKanban })),
    ...src.tasks.filter((x) => m(x.title)).map<Hit>((x) => ({ id: `t:${x.id}`, label: x.title, kind: 'Görev', href: `/app/projects/${x.project_id}?task=${x.id}`, hint: x.due_at?.slice(0, 10) ?? undefined, icon: SquareKanban })),
    ...src.brands.filter((b) => m(b.name)).map<Hit>((b) => ({ id: `b:${b.id}`, label: b.name, kind: 'Marka', href: `/app/crm/${b.id}`, hint: b.sector, icon: Building2 })),
    ...src.team.filter((p) => m(p.name) || m(p.role_title)).map<Hit>((p) => ({ id: `u:${p.id}`, label: p.name, kind: 'Kişi', href: `/app/people/${p.id}`, hint: p.role_title, icon: User })),
  ];
  return out.slice(0, 12);
}

export function Spotlight({ open, onClose, groups }: { open: boolean; onClose(): void; groups: NavGroup[] }) {
  const { repo, me, features } = useSession();
  const router = useRouter();
  const [q, setQ] = useState('');
  const [i, setI] = useState(0);
  const [data, setData] = useState<{ tasks: Task[]; projects: Project[]; brands: Brand[]; team: TeamMember[] }>({ tasks: [], projects: [], brands: [], team: [] });
  const inputRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (!open || !repo) return;
    setQ(''); setI(0);
    const safe = <T,>(p: Promise<T[]>) => p.catch(() => [] as T[]);
    Promise.all([safe(repo.listTasks()), safe(repo.listProjects()), safe(repo.listBrands()), safe(repo.team())]).then(([tasks, projects, brands, team]) => setData({ tasks, projects, brands, team }));
    setTimeout(() => inputRef.current?.focus(), 20);
  }, [open, repo]);
  const pages = useMemo<Hit[]>(() => {
    const vis = me ? moduleVisible(me.role, features.flags) : () => false;
    const gp = groups.flatMap<Hit>((g) => [{ id: `g:${g.id}`, label: g.label, kind: 'Alan', href: g.href, icon: ICONS[g.icon] }, ...g.children.filter((c) => c.href !== g.href).map<Hit>((c) => ({ id: `c:${c.href}`, label: `${g.label} › ${c.label}`, kind: 'Sayfa', href: c.href, icon: ICONS[g.icon] }))]);
    const mods = MODULES.filter((m) => vis(m.id) && !gp.some((h) => h.href === `/app/${m.slug}`)).map<Hit>((m) => ({ id: `m:${m.id}`, label: m.name, kind: 'Modül', href: `/app/${m.slug}`, hint: m.desc, icon: ICONS[m.icon] }));
    return [...gp, ...mods];
  }, [groups, me, features.flags]);
  const actions = useMemo<Hit[]>(() => {
    const a: Hit[] = [];
    if (me && !['client_admin', 'client_viewer', 'auditor'].includes(me.role)) a.push({ id: 'a:task', label: 'Yeni görev', kind: 'Eylem', href: '/app/tasks?new=1', icon: Plus });
    if (me && ['owner', 'org_admin', 'operations', 'account', 'pm'].includes(me.role)) a.push({ id: 'a:project', label: 'Yeni proje', kind: 'Eylem', href: '/app/projects?new=1', icon: Plus });
    if (me && (me.role === 'owner' || me.role === 'org_admin')) {
      a.push({ id: 'a:setup', label: 'Kurulum sihirbazı', kind: 'Eylem', href: '/app/setup', icon: Settings2 });
      if (ADMIN_URL) a.push({ id: 'a:board', label: 'Kurulu aç (Yönetim Kurulu)', kind: 'Eylem', href: `${ADMIN_URL}/admin/board`, icon: Landmark });
    }
    return a;
  }, [me]);
  const hits = useMemo(() => slashHits(q, { role: me?.role ?? null, adminUrl: ADMIN_URL || undefined, modules: MODULES }) ?? searchHits(q, { pages, actions, ...data }), [q, pages, actions, data, me]);
  useEffect(() => setI(0), [q]);
  if (!open) return null;
  const go = (h: Hit) => {
    if (h.href === '#') return;
    if (h.href.startsWith('#slash:')) { setQ(`/${h.href.slice(7)} `); inputRef.current?.focus(); return; }
    onClose(); if (/^https?:/.test(h.href)) window.open(h.href, '_blank', 'noopener'); else router.push(h.href);
  };
  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setI((n) => Math.min(hits.length - 1, n + 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setI((n) => Math.max(0, n - 1)); }
    else if (e.key === 'Enter' && hits[i]) { e.preventDefault(); go(hits[i]); }
  };
  return (
    <div className="palette-backdrop" onMouseDown={onClose} role="presentation">
      <div className="palette card" role="dialog" aria-modal="true" aria-label="Spotlight arama" onMouseDown={(e) => e.stopPropagation()} onKeyDown={onKey}>
        <div className="palette-input"><Search size={16} aria-hidden /><input ref={inputRef} className="input" placeholder="Ara: sayfa, görev, proje, marka, kişi… ya da / ile komut (/görev, /talep, /git)" aria-label="Ara" value={q} onChange={(e) => setQ(e.target.value)} /><kbd>Esc</kbd></div>
        <ul className="palette-list" role="listbox" aria-label="Sonuçlar">
          {hits.map((h, n) => { const Icon = h.icon ?? ArrowRight; return (
            <li key={h.id} role="option" aria-selected={n === i}>
              <button type="button" className={`palette-item ${n === i ? 'is-active' : ''}`} onMouseEnter={() => setI(n)} onClick={() => go(h)}>
                <Icon size={16} aria-hidden /><span className="flex-1 truncate">{h.label}{h.hint && <span className="ml-2 text-xs text-muted">{h.hint}</span>}</span><span className="chip">{h.kind}</span>{n === i && <CornerDownLeft size={14} aria-hidden className="text-muted" />}
              </button>
            </li>
          ); })}
          {hits.length === 0 && <li className="p-3 text-sm text-muted">Sonuç yok. ⌘J ile soru sorabilirsin; <code>/</code> ile komutlar.</li>}
        </ul>
      </div>
    </div>
  );
}
