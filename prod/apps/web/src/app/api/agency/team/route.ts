import type { AgentName } from '@jscore/contracts';
import { enforceAgentCap } from '@jscore/core/agents/cap';
import { costUsd } from '@jscore/core/agents/cost';
import { fail, json } from '@jscore/core/api';
import { assertCan } from '@jscore/core/permissions';
import { getRepo } from '@jscore/core/repo';
import { SupabaseRepo } from '@jscore/core/repo/supabase';
import { createAdmin } from '@jscore/core/supabase/admin';
import { AGENCY_ROSTER, TEAM_SYSTEM, agencyAgentId, parseTeamReply, suggestTeamByRules, teamRequestSchema, teamUserPrompt, type TeamPick } from '@jscore/agents';
import { assertAgencyAccess } from '@jscore/agents/server';
import { ProviderUnavailableError, callProvider, hubCostUsd, hubModel, requireProvider } from '@jscore/ai-hub/server';

export const maxDuration = 120;
const FALLBACK_MODEL = 'claude-sonnet-4-5';
const TEAM_AGENT = agencyAgentId('team-builder');

/**
 * Proje açıklamasından ekip önerir (hiçbir rolü ÇALIŞTIRMAZ; yalnızca öneri döner).
 * Üretimde model seçer ve yanıt kadroya karşı doğrulanır; demo / anahtarsız modda ya da model yanıtı kullanılamazsa kurallı eşleme kullanılır (`method`).
 */
export async function POST(req: Request) {
  try {
    const repo = await getRepo();
    const me = await assertAgencyAccess(repo, await repo.me());
    const body = teamRequestSchema.parse(await req.json());
    await assertCan(repo, me, 'agents.run', { projectId: body.project_id ?? null });
    const project = body.project_id ? (await repo.listProjects()).find((p) => p.id === body.project_id) ?? null : null;
    if (body.project_id && !project) return json({ error: 'Proje bulunamadı' }, 404);
    const rules = (): TeamPick[] => suggestTeamByRules(body.description, body.size, AGENCY_ROSTER);

    const key = process.env.ANTHROPIC_API_KEY;
    if (repo.mode === 'demo' || (!key && (body.provider ?? 'claude') === 'claude')) return json({ method: 'rules', team: rules(), note: repo.mode === 'demo' ? 'Demo modunda ekip kurallı eşlemeyle seçilir (model çağrısı yok).' : 'Model anahtarı tanımlı değil; ekip kurallı eşlemeyle seçildi.' });

    const admin = createAdmin();
    await enforceAgentCap({ repo, spendRepo: admin ? new SupabaseRepo(admin, me.org_id) : undefined, agent: TEAM_AGENT });
    const settings = await repo.getSettings();
    const provider = requireProvider(body.provider);
    const model = hubModel(provider, settings.ai.default_model || FALLBACK_MODEL);
    const t0 = Date.now();
    const base = { agent: TEAM_AGENT as AgentName, trigger: 'agency_team', input: { project_id: project?.id ?? null, by: me.name, size: body.size, chars_in: body.description.length, provider }, model };
    try {
      const res = await callProvider({ provider, model, maxTokens: 1400, system: TEAM_SYSTEM, messages: [{ role: 'user', content: teamUserPrompt(body.description, body.size, AGENCY_ROSTER, project?.name ?? null) }] });
      const team = parseTeamReply(res.text, AGENCY_ROSTER, body.size);
      const cost = provider === 'claude' ? costUsd(model, res.tokens_in, res.tokens_out) : hubCostUsd(provider, res.tokens_in, res.tokens_out);
      await repo.logAgentRun({ ...base, output: { picked: team.map((t) => t.slug) }, tokens_in: res.tokens_in, tokens_out: res.tokens_out, cost_usd: cost, latency_ms: Date.now() - t0, status: team.length ? 'ok' : 'error' });
      if (team.length >= 2) return json({ method: 'model', team, usage: { cost_usd: cost, model, provider } });
      return json({ method: 'rules', team: rules(), note: 'Model kullanılabilir bir ekip döndürmedi; kurallı eşleme kullanıldı.' });
    } catch (e) {
      const message = e instanceof Error ? e.message : 'Model çağrısı başarısız';
      await repo.logAgentRun({ ...base, output: { error: message.slice(0, 300) }, tokens_in: 0, tokens_out: 0, cost_usd: 0, latency_ms: Date.now() - t0, status: 'error' }).catch(() => undefined);
      return json({ method: 'rules', team: rules(), note: `Model çağrısı başarısız oldu (${message.slice(0, 120)}); kurallı eşleme kullanıldı.` });
    }
  } catch (e) {
    if (e instanceof ProviderUnavailableError) return json({ error: e.message, code: 'provider_unavailable' }, 400);
    return fail(e);
  }
}
