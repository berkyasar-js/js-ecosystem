import { cookies } from 'next/headers';
import type { SupabaseClient } from '@supabase/supabase-js';
import { guardAdmin, type AdminGuard, type Role } from '@jscore/contracts';
import { DEMO_COOKIE, ORG_COOKIE, isSupabaseConfigured, validOrgId } from '@jscore/core/env';
import { DemoRepo } from '@jscore/core/repo/demo';
import { createAdmin } from '@jscore/core/supabase/admin';
import { createServer } from '@jscore/core/supabase/server';

export interface AdminCtx {
  mode: 'demo' | 'supabase';
  userId: string; email: string; orgId: string; role: Role;
  /** Servis rolü istemcisi (RLS'i aşar). Demo modunda null. */
  sb: SupabaseClient | null;
}
export type AdminResult = { ok: true; ctx: AdminCtx } | { ok: false; reason: Exclude<AdminGuard, { ok: true }>['reason'] };

/**
 * Yönetim paneli oturum bağlamı. Supabase: oturum çerezindeki kullanıcı → servis rolüyle memberships
 * (JWT claim'lerine güvenilmez) → guardAdmin (owner/org_admin, aktif üyelik). Demo: rol seçici çerezi.
 */
export async function getAdminContext(): Promise<AdminResult> {
  const store = await cookies();
  const preferred = validOrgId(store.get(ORG_COOKIE)?.value);
  if (!isSupabaseConfigured()) {
    // DemoRepo çerez yoksa varsayılan olarak owner hesabına düşer; yönetim panelinde çerez AÇIKÇA şart.
    const account = store.get(DEMO_COOKIE)?.value;
    if (!account) return { ok: false, reason: 'no_session' };
    const repo = new DemoRepo({ accountId: account, orgId: preferred ?? undefined });
    const me = await repo.me();
    const g = guardAdmin(me?.id, me ? [{ org_id: me.org_id, role: me.role }] : [], preferred);
    return g.ok && me ? { ok: true, ctx: { mode: 'demo', userId: me.id, email: me.email, orgId: g.orgId, role: g.role, sb: null } } : { ok: false, reason: g.ok ? 'no_session' : g.reason };
  }
  const { data: { user } } = await (await createServer()).auth.getUser();
  const sb = createAdmin();
  if (!user) return { ok: false, reason: 'no_session' };
  if (!sb) return { ok: false, reason: 'forbidden' };
  const { data } = await sb.from('memberships').select('org_id,role,status').eq('user_id', user.id);
  const g = guardAdmin(user.id, (data ?? []) as Array<{ org_id: string; role: string; status: string | null }>, preferred);
  return g.ok ? { ok: true, ctx: { mode: 'supabase', userId: user.id, email: user.email ?? '', orgId: g.orgId, role: g.role, sb } } : { ok: false, reason: g.reason };
}
