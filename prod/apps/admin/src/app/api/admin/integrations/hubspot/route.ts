import { HUBSPOT_MODES, hubspotOwnerMapSchema, hubspotStageMapSchema, maskHubSpotConfig, type HubSpotMode } from '@jscore/contracts';
import { fail, json } from '@jscore/core/api';
import { clearHubSpotToken, loadHubSpotConfig, loadHubSpotLog, saveHubSpotConfig, writeHubSpotLog } from '@jscore/core/integrations/hubspot';
import { authorizeHubSpot } from '@/lib/hubspot-auth';
import { isResponse } from '@/lib/route';

const res = (data: unknown, status = 200) => Response.json(data, { status, headers: { 'cache-control': 'no-store' } });

/** GET: maskeli durum (token ASLA dönmez) + senkron günlüğü (son 50). */
export async function GET() {
  try {
    const a = await authorizeHubSpot();
    if (isResponse(a)) return a;
    const cfg = await loadHubSpotConfig(a.admin, a.orgId);
    return res({ ...maskHubSpotConfig(cfg), sync_log: cfg ? await loadHubSpotLog(a.admin, a.orgId, 50) : [] });
  } catch (e) { return fail(e); }
}
/** PUT { mode?, stage_map?, owner_map?, webhook_secret? } — mode='off': senkron durur, veriler korunur. stage_map: '<pipeline>:<stage>' → new|talk|proposal|won|lost. */
export async function PUT(req: Request) {
  try {
    const a = await authorizeHubSpot('integration.hubspot.update');
    if (isResponse(a)) return a;
    const body = (await req.json().catch(() => null)) as { mode?: unknown; stage_map?: unknown; owner_map?: unknown; webhook_secret?: unknown } | null;
    if (!body) return json({ error: 'JSON bekleniyor' }, 400);
    const cfg = await loadHubSpotConfig(a.admin, a.orgId);
    if (!cfg) return json({ error: 'HubSpot bağlı değil' }, 400);
    const patch: Record<string, unknown> = {};
    if (body.stage_map !== undefined) patch.stage_map = { ...(cfg.stage_map ?? {}), ...hubspotStageMapSchema.parse({ stage_map: body.stage_map }).stage_map };
    if (body.owner_map !== undefined) {
      const { owner_map } = hubspotOwnerMapSchema.parse({ owner_map: body.owner_map });
      const { data } = await a.admin.from('employees').select('id').eq('org_id', a.orgId);
      const ok = new Set((data ?? []).map((r: { id: string }) => r.id));
      for (const emp of Object.values(owner_map)) if (!ok.has(emp)) return json({ error: `Geçersiz çalışan: ${emp}` }, 400);
      patch.owner_map = { ...(cfg.owner_map ?? {}), ...owner_map };
    }
    if (body.webhook_secret !== undefined) {
      if (body.webhook_secret !== null && typeof body.webhook_secret !== 'string') return json({ error: 'webhook_secret metin olmalı' }, 400);
      patch.webhook_secret = body.webhook_secret ? String(body.webhook_secret).trim() : undefined;
    }
    if (body.mode !== undefined) {
      if (!HUBSPOT_MODES.includes(body.mode as HubSpotMode)) return json({ error: 'Geçersiz mod' }, 400);
      patch.mode = body.mode;
      if (body.mode !== cfg.mode) await writeHubSpotLog(a.admin, a.orgId, [{ direction: 'reconcile', entity: 'integration', entity_id: null, external_id: null, action: 'mode', ok: true, message: `${cfg.mode} → ${body.mode}` }]);
    }
    const saved = await saveHubSpotConfig(a.admin, a.orgId, patch, patch.mode === 'off' ? 'available' : 'connected');
    return res(maskHubSpotConfig(saved));
  } catch (e) { return fail(e); }
}
/** DELETE: token kaldırılır (eşleme ve mod ayarları korunur; veriler silinmez). */
export async function DELETE() {
  try {
    const a = await authorizeHubSpot('integration.hubspot.disconnect');
    if (isResponse(a)) return a;
    await clearHubSpotToken(a.admin, a.orgId);
    return res(maskHubSpotConfig(await loadHubSpotConfig(a.admin, a.orgId)));
  } catch (e) { return fail(e); }
}
