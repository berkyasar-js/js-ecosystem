import { z } from 'zod';
import { fail, json } from '@jscore/core/api';
import { getRepo } from '@jscore/core/repo';
import { createAdmin } from '@jscore/core/supabase/admin';

export const dynamic = 'force-dynamic';
const bodySchema = z.object({ token: z.string().trim().min(20).max(300) });
const mask = (t: string) => `${t.slice(0, 7)}••••${t.slice(-4)}`;

/** Kurulum → Entegrasyonlar: HubSpot özel uygulama token'ı. Yalnızca owner/org_admin; token servis rolüyle integrations.config'e yazılır (istemciye hiç inmez), her işlem audit_events'e düşer. */
async function guard() {
  const repo = await getRepo();
  const me = await repo.me();
  if (!me) return { err: json({ error: 'Oturum yok' }, 401) } as const;
  if (me.role !== 'owner' && me.role !== 'org_admin') return { err: json({ error: 'Yalnızca owner / org_admin' }, 403) } as const;
  if (repo.mode === 'demo') return { me, repo, sb: null } as const;
  const sb = createAdmin();
  if (!sb) return { err: json({ error: 'SUPABASE_SERVICE_ROLE_KEY tanımlı değil' }, 503) } as const;
  return { me, repo, sb } as const;
}
const audit = async (g: { me: { id: string; org_id: string }; sb: NonNullable<ReturnType<typeof createAdmin>> }, action: string, meta: Record<string, unknown>, outcome: 'allow' | 'error' = 'allow') => {
  await g.sb.from('audit_events').insert({ org_id: g.me.org_id, actor: g.me.id, action, resource: 'integrations/hubspot', outcome, meta });
};

export async function GET() {
  try {
    const g = await guard(); if ('err' in g) return g.err;
    if (!g.sb) { const c = await g.repo.getConnect(); const h = c.integrations.find((i) => i.provider === 'hubspot'); return json({ connected: h?.status === 'connected', token: h?.status === 'connected' ? 'demo-••••' : null }); }
    const { data } = await g.sb.from('integrations').select('status,config').eq('org_id', g.me.org_id).eq('provider', 'hubspot').maybeSingle();
    const token = (data?.config as { token?: string } | null)?.token;
    return json({ connected: !!token && data?.status === 'connected', token: token ? mask(token) : null });
  } catch (e) { return fail(e); }
}
export async function POST(req: Request) {
  try {
    const g = await guard(); if ('err' in g) return g.err;
    const { token } = bodySchema.parse(await req.json().catch(() => null));
    if (!g.sb) { const c = await g.repo.getConnect(); const h = c.integrations.find((i) => i.provider === 'hubspot'); if (h) await g.repo.setIntegrationStatus(h.id, 'connected'); return json({ ok: true, token: mask(token) }); }
    const { error } = await g.sb.from('integrations').upsert({ org_id: g.me.org_id, provider: 'hubspot', name: 'HubSpot', status: 'connected', config: { token, connected_at: new Date().toISOString() } }, { onConflict: 'org_id,provider' });
    if (error) { await audit(g, 'setup.hubspot.connect', { error: error.message }, 'error'); throw new Error(error.message); }
    await audit(g, 'setup.hubspot.connect', { masked: mask(token) });
    return json({ ok: true, token: mask(token) });
  } catch (e) { return fail(e); }
}
export async function DELETE() {
  try {
    const g = await guard(); if ('err' in g) return g.err;
    if (!g.sb) { const c = await g.repo.getConnect(); const h = c.integrations.find((i) => i.provider === 'hubspot'); if (h) await g.repo.setIntegrationStatus(h.id, 'available'); return json({ ok: true }); }
    const { error } = await g.sb.from('integrations').update({ status: 'available', config: {} }).eq('org_id', g.me.org_id).eq('provider', 'hubspot');
    if (error) throw new Error(error.message);
    await audit(g, 'setup.hubspot.disconnect', {});
    return json({ ok: true });
  } catch (e) { return fail(e); }
}
