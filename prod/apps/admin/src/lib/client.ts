'use client';
import { useCallback, useEffect, useState } from 'react';
import type { OrgSettings } from '@jscore/contracts';
import { useSession } from '@/components/session';

/** JSON fetch; hata gövdesindeki `error` metnini fırlatır. */
export async function api<T = unknown>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, { ...init, headers: { 'content-type': 'application/json', ...init?.headers }, cache: 'no-store' });
  const j = (await res.json().catch(() => ({}))) as T & { error?: string };
  if (!res.ok) throw new Error(j.error ?? `İşlem başarısız (${res.status})`);
  return j;
}

/** GET yükleyici (yeniden yükleme + hata). */
export function useApi<T>(url: string | null) {
  const [state, setState] = useState<{ data: T | null; error: string | null; loading: boolean }>({ data: null, error: null, loading: !!url });
  const [n, setN] = useState(0);
  useEffect(() => {
    if (!url) return;
    let alive = true;
    setState((s) => ({ ...s, loading: true }));
    api<T>(url).then((data) => alive && setState({ data, error: null, loading: false }), (e: unknown) => alive && setState({ data: null, error: e instanceof Error ? e.message : 'Hata', loading: false }));
    return () => { alive = false; };
  }, [url, n]);
  return { ...state, reload: useCallback(() => setN((x) => x + 1), []) };
}

/**
 * Organizasyon ayarları. Supabase: /api/admin/settings (servis rolü + denetim). Demo: oturumun DemoRepo'su (tarayıcıda kalıcı).
 */
export function useAdminSettings() {
  const { repo, mode, rev, bump } = useSession();
  const [state, setState] = useState<{ settings: OrgSettings | null; slug: string; error: string | null; loading: boolean }>({ settings: null, slug: '', error: null, loading: true });
  useEffect(() => {
    if (!repo) return;
    let alive = true;
    (mode === 'demo'
      ? repo.getSettings().then((settings) => ({ settings, slug: 'jobs' }))
      : api<{ settings: OrgSettings; slug: string }>('/api/admin/settings')
    ).then((r) => alive && setState({ settings: r.settings, slug: r.slug, error: null, loading: false }), (e: unknown) => alive && setState({ settings: null, slug: '', error: e instanceof Error ? e.message : 'Hata', loading: false }));
    return () => { alive = false; };
  }, [repo, mode, rev]);
  const save = useCallback(async (patch: Partial<OrgSettings>, slug?: string) => {
    if (mode === 'demo') await repo!.saveSettings(patch);
    else await api('/api/admin/settings', { method: 'PATCH', body: JSON.stringify({ settings: patch, slug }) });
    bump();
  }, [mode, repo, bump]);
  return { ...state, save, mode };
}
