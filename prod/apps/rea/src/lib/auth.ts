import type { SupabaseClient } from '@supabase/supabase-js';
import { isSupabaseConfigured } from './env';
import { DEMO_ORG } from './sample';
import { memoryStore } from './store/memory';
import { supabaseStore } from './store/supabase';
import type { Store } from './store/types';
import { createAdmin } from './supabase/admin';
import { createServer } from './supabase/server';
import type { Actor } from './types';

export const ALLOWED_ROLES = ['owner', 'org_admin'] as const;

export type Access =
  | { ok: true; actor: Actor; store: Store; sb: SupabaseClient | null }
  | { ok: false; reason: 'unauth' | 'forbidden' | 'error'; message: string };

/** Oturumu ve rolü doğrular: yalnızca owner / org_admin. Supabase env yoksa DEMO. */
export async function getAccess(): Promise<Access> {
  if (!isSupabaseConfigured()) {
    return { ok: true, actor: { mode: 'demo', userId: null, email: 'demo@jobsstudio.co', orgId: DEMO_ORG, role: 'owner' }, store: memoryStore, sb: null };
  }
  try {
    const sb = await createServer();
    const { data } = await sb.auth.getUser();
    const user = data.user;
    if (!user) return { ok: false, reason: 'unauth', message: 'Oturum yok.' };
    const { data: ms, error } = await sb.from('memberships').select('org_id,role,created_at').eq('user_id', user.id).in('role', [...ALLOWED_ROLES]).order('created_at');
    if (error) return { ok: false, reason: 'error', message: error.message };
    const m = (ms ?? [])[0] as { org_id: string; role: string } | undefined;
    if (!m) return { ok: false, reason: 'forbidden', message: 'Bu uygulamayı yalnızca owner ve org_admin rolleri kullanabilir.' };
    return { ok: true, actor: { mode: 'supabase', userId: user.id, email: user.email ?? null, orgId: m.org_id, role: m.role }, store: supabaseStore(sb), sb };
  } catch (e) {
    return { ok: false, reason: 'error', message: e instanceof Error ? e.message : 'Bilinmeyen hata' };
  }
}

/** Arka plan işçisi için (istek bağlamı olmadan) depo: Supabase'de service role, demoda bellek. */
export function workerStore(actor: Actor): Store | null {
  if (actor.mode === 'demo') return memoryStore;
  const admin = createAdmin();
  return admin ? supabaseStore(admin) : null;
}

export function httpFor(a: Extract<Access, { ok: false }>): { status: number; error: string } {
  return { status: a.reason === 'unauth' ? 401 : a.reason === 'forbidden' ? 403 : 500, error: a.message };
}
