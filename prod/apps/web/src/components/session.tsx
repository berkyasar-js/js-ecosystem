'use client';
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { DEFAULT_PREFS, featureEnabled, type Me, type NavSettings, type Organization, type SetupState, type UserPrefs } from '@jscore/contracts';
import { clearCookie, createClientRepo, readCookie, setCookie } from '@jscore/core/repo/client';
import { DEMO_COOKIE, ORG_COOKIE, isSupabaseConfigured, validOrgId } from '@jscore/core/env';
import { createBrowser } from '@jscore/core/supabase/browser';
import { DEMO_STORAGE_KEY } from '@jscore/core/repo/demo';
import type { Repo } from '@jscore/core/repo/types';

/** Ana Yönetim Paneli ayarları: modül bayrakları, özellik anahtarları, MFA zorunluluğu. `loaded=false` iken her şey açık sayılır (yanıp sönmeyi azaltır; sunucu tarafı ayrıca uygular). */
export interface Features { loaded: boolean; flags?: Record<string, boolean>; toggles?: Record<string, boolean>; requireMfa: boolean; nav?: NavSettings | null; setup?: SetupState | null; orgName?: string; logoUrl?: string }
interface Ctx {
  features: Features;
  repo: Repo | null; me: Me | null; orgs: Organization[]; orgId: string; mode: 'demo' | 'supabase'; rev: number;
  setOrg(id: string): void; bump(): void; logout(): Promise<void>; resetDemo(): void; theme: 'dark' | 'light'; toggleTheme(): void;
  /** Kullanıcı tercihleri (user_prefs / demo localStorage). `prefsLoaded=false` iken varsayılan. */
  prefs: UserPrefs; prefsLoaded: boolean; setPrefs(patch: Partial<UserPrefs>): Promise<void>;
}
const SessionCtx = createContext<Ctx | null>(null);
export const useSession = () => {
  const c = useContext(SessionCtx);
  if (!c) throw new Error('SessionProvider yok');
  return c;
};
/** Özellik anahtarı açık mı? (`<modül>.<özellik>`, bkz. contracts FEATURES) */
export const useFeature = (key: string) => featureEnabled(useSession().features.toggles, key);

export function SessionProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [orgId, setOrgId] = useState('');
  const [repo, setRepo] = useState<Repo | null>(null);
  const [me, setMe] = useState<Me | null>(null);
  const [orgs, setOrgs] = useState<Organization[]>([]);
  const [rev, setRev] = useState(0);
  const [features, setFeatures] = useState<Features>({ loaded: false, requireMfa: false });
  const [theme, setTheme] = useState<'dark' | 'light'>('dark');
  const [prefs, setPrefsState] = useState<UserPrefs>(DEFAULT_PREFS);
  const [prefsLoaded, setPrefsLoaded] = useState(false);
  const mode = isSupabaseConfigured() ? 'supabase' : 'demo';

  useEffect(() => {
    const saved = document.documentElement.dataset.theme;
    if (saved === 'light') setTheme('light');
  }, []);

  useEffect(() => {
    let alive = true;
    const r = createClientRepo(orgId || validOrgId(readCookie(ORG_COOKIE)));
    (async () => {
      try {
        const [m, o] = await Promise.all([r.me(), r.listOrgs()]);
        if (!alive) return;
        if (!m) { router.replace('/login'); return; }
        setRepo(r); setMe(m); setOrgs(o);
        if (!orgId) { const c = validOrgId(readCookie(ORG_COOKIE)); setOrgId(c && o.some((x) => x.id === c) ? c : m.org_id); }
      } catch { if (alive) router.replace('/login'); }
    })();
    return () => { alive = false; };
  }, [orgId, router]);

  useEffect(() => {
    if (!repo) return;
    let alive = true;
    repo.getSettings().then(
      (st) => alive && setFeatures({ loaded: true, flags: st.feature_flags, toggles: st.feature_toggles, requireMfa: st.security?.require_mfa === true, nav: st.nav ?? null, setup: st.setup ?? null, orgName: st.general?.name, logoUrl: st.general?.logo_url }),
      () => alive && setFeatures({ loaded: true, requireMfa: false }),
    );
    return () => { alive = false; };
  }, [repo, rev]);

  useEffect(() => {
    if (!repo) return;
    let alive = true;
    // Tercih tablosu yoksa (0016 uygulanmadı) karşılama akışıyla kullanıcıyı sıkıştırma: yerel olarak tamamlanmış say.
    repo.getPrefs().then((p) => { if (alive) { setPrefsState(p); setPrefsLoaded(true); } }, () => { if (alive) { setPrefsState({ ...DEFAULT_PREFS, welcome_done: true }); setPrefsLoaded(true); } });
    return () => { alive = false; };
  }, [repo]);
  const setPrefs = useCallback(async (patch: Partial<UserPrefs>) => {
    setPrefsState((p) => ({ ...p, ...patch })); // iyimser
    if (repo) { try { setPrefsState(await repo.savePrefs(patch)); } catch { /* çevrimdışı / RLS: yerel durum kalır */ } }
  }, [repo]);
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

  const value = useMemo<Ctx>(() => ({ features, repo, me, orgs, orgId: orgId || me?.org_id || '', mode, rev, setOrg, bump, logout, resetDemo, theme, toggleTheme, prefs, prefsLoaded, setPrefs }), [features, repo, me, orgs, orgId, mode, rev, setOrg, bump, logout, resetDemo, theme, toggleTheme, prefs, prefsLoaded, setPrefs]);
  return <SessionCtx.Provider value={value}>{children}</SessionCtx.Provider>;
}
