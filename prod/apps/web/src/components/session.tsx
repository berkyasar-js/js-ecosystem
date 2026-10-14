'use client';
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import type { Me, Organization } from '@jscore/contracts';
import { clearCookie, createClientRepo, readCookie, setCookie } from '@/lib/repo/client';
import { DEMO_COOKIE, ORG_COOKIE, isSupabaseConfigured } from '@/lib/env';
import { createBrowser } from '@/lib/supabase/browser';
import { DEMO_STORAGE_KEY } from '@/lib/repo/demo';
import type { Repo } from '@/lib/repo/types';

interface Ctx {
  repo: Repo | null; me: Me | null; orgs: Organization[]; orgId: string; mode: 'demo' | 'supabase'; rev: number;
  setOrg(id: string): void; bump(): void; logout(): Promise<void>; resetDemo(): void; theme: 'dark' | 'light'; toggleTheme(): void;
}
const SessionCtx = createContext<Ctx | null>(null);
export const useSession = () => {
  const c = useContext(SessionCtx);
  if (!c) throw new Error('SessionProvider yok');
  return c;
};

export function SessionProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [orgId, setOrgId] = useState('');
  const [repo, setRepo] = useState<Repo | null>(null);
  const [me, setMe] = useState<Me | null>(null);
  const [orgs, setOrgs] = useState<Organization[]>([]);
  const [rev, setRev] = useState(0);
  const [theme, setTheme] = useState<'dark' | 'light'>('dark');
  const mode = isSupabaseConfigured() ? 'supabase' : 'demo';

  useEffect(() => {
    const saved = document.documentElement.dataset.theme;
    if (saved === 'light') setTheme('light');
  }, []);

  useEffect(() => {
    let alive = true;
    const r = createClientRepo(orgId || readCookie(ORG_COOKIE));
    (async () => {
      try {
        const [m, o] = await Promise.all([r.me(), r.listOrgs()]);
        if (!alive) return;
        if (!m) { router.replace('/login'); return; }
        setRepo(r); setMe(m); setOrgs(o);
        if (!orgId) setOrgId(readCookie(ORG_COOKIE) && o.some((x) => x.id === readCookie(ORG_COOKIE)) ? (readCookie(ORG_COOKIE) as string) : m.org_id);
      } catch { if (alive) router.replace('/login'); }
    })();
    return () => { alive = false; };
  }, [orgId, router]);

  const setOrg = useCallback((id: string) => { setCookie(ORG_COOKIE, id); setMe(null); setOrgId(id); setRev((n) => n + 1); }, []);
  const bump = useCallback(() => setRev((n) => n + 1), []);
  const logout = useCallback(async () => {
    if (isSupabaseConfigured()) await createBrowser().auth.signOut();
    clearCookie(DEMO_COOKIE); clearCookie(ORG_COOKIE);
    router.replace('/login');
  }, [router]);
  const resetDemo = useCallback(() => { try { localStorage.removeItem(DEMO_STORAGE_KEY); } catch { /* yok */ } setRev((n) => n + 1); }, []);
  const toggleTheme = useCallback(() => {
    setTheme((t) => {
      const n = t === 'dark' ? 'light' : 'dark';
      document.documentElement.dataset.theme = n;
      try { localStorage.setItem('js_theme', n); } catch { /* yok */ }
      return n;
    });
  }, []);

  const value = useMemo<Ctx>(() => ({ repo, me, orgs, orgId: orgId || me?.org_id || '', mode, rev, setOrg, bump, logout, resetDemo, theme, toggleTheme }), [repo, me, orgs, orgId, mode, rev, setOrg, bump, logout, resetDemo, theme, toggleTheme]);
  return <SessionCtx.Provider value={value}>{children}</SessionCtx.Provider>;
}
