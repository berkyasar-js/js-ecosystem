import type { AgentName } from '@jscore/contracts';
import { enforceAgentCap } from '@jscore/core/agents/cap';
import { fail, json } from '@jscore/core/api';
import { assertCan } from '@jscore/core/permissions';
import { getRepo } from '@jscore/core/repo';
import { SupabaseRepo } from '@jscore/core/repo/supabase';
import { createAdmin } from '@jscore/core/supabase/admin';
import { DepartmentQuotaError, HUB_PROVIDERS, HUB_PROVIDER_INFO, demoHubReply, hubAgentId, hubChatSchema, hubSystemPrompt, routeProvider, trimHistory } from '@jscore/ai-hub';
import { availableProviders, callProvider, hubCostUsd, hubModel } from '@jscore/ai-hub/server';
import { departmentQuota, hubAccess } from '@/lib/ai-hub-server';

export const maxDuration = 120;
const FALLBACK_CLAUDE = 'claude-sonnet-4-5';

/**
 * Birleşik sohbet: sağlayıcıyı seçer (elle ya da otomatik), kullanıcının rol + departman + görebildiği marka/proje adlarını sistem bağlamı olarak ekler.
 * Kapılar: modül erişimi, `agents.run`, aylık org tavanı, departman kotası. Kayıt: `agent_runs` (agent='hub:<sağlayıcı>') — sohbet içeriği YAZILMAZ.
 */
export async function POST(req: Request) {
  try {
    const repo = await getRepo();
    const { me, settings, context } = await hubAccess(repo);
    const body = hubChatSchema.parse(await req.json());
    await assertCan(repo, me, 'agents.run');
    const messages = trimHistory(body.messages);
    const last = messages[messages.length - 1].content;
    const demo = repo.mode === 'demo';
    const route = routeProvider(last, demo ? [...HUB_PROVIDERS] : availableProviders(), body.provider);
    if (!route) return json({ error: 'Hiçbir yapay zekâ sağlayıcısı için anahtar tanımlı değil.', code: 'no_provider' }, 503);
    const agent = hubAgentId(route.provider);

    const admin = repo.mode === 'supabase' ? createAdmin() : null;
    await enforceAgentCap({ repo, spendRepo: admin ? new SupabaseRepo(admin, me.org_id) : undefined, agent, spendOverrideUsd: body.demo_spend_usd, capOverrideUsd: body.demo_cap_usd });
    if (!demo && context.department) {
      const quota = await departmentQuota(repo, me, settings, context.department, new Date().toISOString().slice(0, 7));
      if (quota?.exceeded) throw new DepartmentQuotaError(context.department, quota);
    }

    const meta = { by: me.name, department: context.department, turns: messages.length, chars_in: messages.reduce((a, m) => a + m.content.length, 0), routed: body.provider === 'auto' ? route.reason : null };
    const reply = (text: string, usage: { tokens_in: number; tokens_out: number; cost_usd: number; model: string }, mode: 'ok' | 'demo') =>
      json({ mode, provider: route.provider, label: HUB_PROVIDER_INFO[route.provider].label, reason: route.reason, fallback: route.fallback, text, usage });
    if (demo) return reply(demoHubReply(route.provider, last, context), { tokens_in: 0, tokens_out: 0, cost_usd: 0, model: 'demo' }, 'demo');

    const model = hubModel(route.provider, settings.ai.default_model || FALLBACK_CLAUDE);
    const t0 = Date.now();
    const base = { agent: agent as AgentName, trigger: 'hub', input: meta, model };
    try {
      const res = await callProvider({ provider: route.provider, model, system: hubSystemPrompt(context), messages });
      const cost = hubCostUsd(route.provider, res.tokens_in, res.tokens_out);
      await repo.logAgentRun({ ...base, output: { chars_out: res.text.length }, tokens_in: res.tokens_in, tokens_out: res.tokens_out, cost_usd: cost, latency_ms: Date.now() - t0, status: 'ok' });
      return reply(res.text, { tokens_in: res.tokens_in, tokens_out: res.tokens_out, cost_usd: cost, model }, 'ok');
    } catch (e) {
      const message = e instanceof Error ? e.message : 'Model çağrısı başarısız';
      await repo.logAgentRun({ ...base, output: { error: message.slice(0, 300) }, tokens_in: 0, tokens_out: 0, cost_usd: 0, latency_ms: Date.now() - t0, status: 'error' }).catch(() => {});
      return json({ error: `${HUB_PROVIDER_INFO[route.provider].label} yanıt veremedi: ${message}`, provider: route.provider }, 502);
    }
  } catch (e) {
    if (e instanceof DepartmentQuotaError) return json({ error: e.message, code: 'department_quota_exceeded' }, 402);
    return fail(e);
  }
}
