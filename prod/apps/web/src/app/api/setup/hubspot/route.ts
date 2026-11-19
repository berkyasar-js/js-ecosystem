import { z } from 'zod';
import { fail, json } from '@jscore/core/api';
import { getRepo } from '@jscore/core/repo';
import { createAdmin } from '@jscore/core/supabase/admin';
import { HubSpotApiError, clearHubSpotToken, loadHubSpotConfig, saveHubSpotConfig, testHubSpotConnection } from '@jscore/core/integrations/hubspot';
import { buildDefaultStageMap } from '@jscore/core/integrations/hubspot-map';

export const dynamic = 'force-dynamic';
const bodySchema = z.object({ token: z.string().trim().min(20).max(300) });
const mask = (t: string) => `${t.slice(0, 7)}••••${t.slice(-4)}`;

/**
 * Kurulum → Entegrasyonlar: HubSpot özel uygulama token'ı. Yalnızca owner/org_admin; token servis rolüyle integrations.config'e yazılır (istemciye hiç inmez),
 * her işlem audit_events'e düşer. POST kaydettikten sonra "Bağlantıyı test et" çalıştırır (portal id, owner sayısı, pipeline'lar → config). Mod varsayılanı pull_only;
 * aşama eşlemesi, tam içe aktarma ve eşitleme Ana Yönetim Paneli → Entegrasyonlar → HubSpot'tadır.
 */
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
    const cfg = (data?.config as { token?: string; portal_id?: string; mode?: string; last_sync_at?: string } | null) ?? null;
    const token = cfg?.token;
    return json({ connected: !!token && data?.status === 'connected', token: token ? mask(token) : null, portal_id: cfg?.portal_id ?? null, mode: cfg?.mode ?? 'pull_only', last_sync_at: cfg?.last_sync_at ?? null });
  } catch (e) { return fail(e); }
}
export async function POST(req: Request) {
  try {
    const g = await guard(); if ('err' in g) return g.err;
    const { token } = bodySchema.parse(await req.json().catch(() => null));
    if (!g.sb) { const c = await g.repo.getConnect(); const h = c.integrations.find((i) => i.provider === 'hubspot'); if (h) await g.repo.setIntegrationStatus(h.id, 'connected'); return json({ ok: true, token: mask(token) }); }
    const prev = await loadHubSpotConfig(g.sb, g.me.org_id);
    try { await saveHubSpotConfig(g.sb, g.me.org_id, { token, connected_at: prev?.connected_at ?? new Date().toISOString(), mode: prev?.mode ?? 'pull_only' }); }
    catch (e) { await audit(g, 'setup.hubspot.connect', { error: e instanceof Error ? e.message : String(e) }, 'error'); throw e; }
    await audit(g, 'setup.hubspot.connect', { masked: mask(token) });
    // Bağlantıyı test et: portal id + owner sayısı + pipeline'lar (başarısızsa token saklı kalır, durum 'error', istemciye test_error).
    try {
      const test = await testHubSpotConnection(g.sb, g.me.org_id);
      await saveHubSpotConfig(g.sb, g.me.org_id, { stage_map: buildDefaultStageMap(test.pipelines, prev?.stage_map) });
      await audit(g, 'setup.hubspot.test', { portal_id: test.portal_id, owners: test.owners, pipelines: test.pipelines.length });
      return json({ ok: true, token: mask(token), test: { portal_id: test.portal_id, owners: test.owners, pipelines: test.pipelines.map((p) => p.label) } });
    } catch (e) {
      const msg = e instanceof HubSpotApiError ? e.message : 'HubSpot doğrulanamadı';
      await saveHubSpotConfig(g.sb, g.me.org_id, {}, 'error').catch(() => undefined);
      await audit(g, 'setup.hubspot.test', { error: msg }, 'error');
      return json({ ok: true, token: mask(token), test_error: msg });
    }
  } catch (e) { return fail(e); }
}
export async function DELETE() {
  try {
    const g = await guard(); if ('err' in g) return g.err;
    if (!g.sb) { const c = await g.repo.getConnect(); const h = c.integrations.find((i) => i.provider === 'hubspot'); if (h) await g.repo.setIntegrationStatus(h.id, 'available'); return json({ ok: true }); }
    await clearHubSpotToken(g.sb, g.me.org_id);
    await audit(g, 'setup.hubspot.disconnect', {});
    return json({ ok: true });
  } catch (e) { return fail(e); }
}
