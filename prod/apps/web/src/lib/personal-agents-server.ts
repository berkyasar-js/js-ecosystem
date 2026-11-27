import { z } from 'zod';
import { activeVersion, canAccessModule, isClientRole, moduleEntitled, personalAgentRunId, type AgentName, type AgentVersion, type Me, type OrgSettings, type PersonalAgent } from '@jscore/contracts';
import { enforceAgentCap } from '@jscore/core/agents/cap';
import { costUsd } from '@jscore/core/agents/cost';
import { assertCan } from '@jscore/core/permissions';
import { listManagedAgents } from '@jscore/core/personal-agents';
import { ForbiddenError, NotFoundError, type Repo } from '@jscore/core/repo/types';
import { SupabaseRepo } from '@jscore/core/repo/supabase';
import { createAdmin } from '@jscore/core/supabase/admin';
import { DepartmentQuotaError, type HubProvider } from '@jscore/ai-hub';
import { callProvider, hubCostUsd, hubModel, requireProvider } from '@jscore/ai-hub/server';
import { departmentQuota } from './ai-hub-server';

const FALLBACK_MODEL = 'claude-sonnet-4-5';
/** Demo'da sunucu durumsuzdur (veri tarayıcıda): istemci ajanı ve yürürlükteki sürümü gövdede yollar. Supabase'de bu alan YOK SAYILIR; kayıt RLS'ten okunur. */
export const demoAgentSchema = z.object({
  name: z.string().max(80), specialty: z.string().max(200), base_role: z.string().max(120).nullable(), owner_employee_id: z.string(), owner_name: z.string().max(120),
  version: z.object({ version: z.number().int().min(1), instructions: z.string().max(12000), can: z.array(z.string()).max(20), cannot: z.array(z.string()).max(20) }),
});
export interface LoadedAgent { agent: Pick<PersonalAgent, 'id' | 'name' | 'specialty' | 'base_role' | 'owner_employee_id'>; version: Pick<AgentVersion, 'version' | 'instructions' | 'can' | 'cannot'>; ownerName: string; department: string | null }

export async function personalAgentAccess(repo: Repo): Promise<{ me: Me; settings: OrgSettings }> {
  const me = await repo.me();
  if (!me) throw new ForbiddenError('Oturum yok');
  if (isClientRole(me.role) || !canAccessModule(me.role, 'myagents')) throw new ForbiddenError('Ajanlarım için yetkin yok');
  const settings = await repo.getSettings();
  if (!moduleEntitled('myagents', settings.feature_flags)) throw new ForbiddenError('Ajanlarım yönetici tarafından kapatıldı');
  await assertCan(repo, me, 'agents.run');
  return { me, settings };
}

/** Ajanı ve yürürlükteki sürümünü yükler. Yönetemediğin ajan bulunamaz (RLS + `supervises`). Onaylı sürümü olmayan ajan çalıştırılamaz. */
export async function loadAgent(repo: Repo, agentId: string, demo: z.infer<typeof demoAgentSchema> | undefined): Promise<LoadedAgent> {
  const team = await repo.team().catch(() => []);
  if (repo.mode === 'demo') {
    if (!demo) throw new NotFoundError('Ajan');
    return { agent: { id: agentId, name: demo.name, specialty: demo.specialty, base_role: demo.base_role, owner_employee_id: demo.owner_employee_id }, version: demo.version, ownerName: demo.owner_name, department: team.find((m) => m.id === demo.owner_employee_id)?.team ?? null };
  }
  const { agents, versions } = await listManagedAgents(repo);
  const agent = agents.find((a) => a.id === agentId);
  if (!agent) throw new NotFoundError('Ajan');
  if (agent.status !== 'active') throw new ForbiddenError('Ajan etkin değil');
  const version = activeVersion(agent.id, versions);
  if (!version) throw new ForbiddenError('Ajanın onaylı bir talimat sürümü yok');
  const owner = team.find((m) => m.id === agent.owner_employee_id);
  return { agent, version, ownerName: owner?.name ?? 'ekip üyesi', department: owner?.team ?? null };
}

/** Kurum tavanı + departman kotası (ajan sahibinin departmanı). */
export async function enforceBudgets(repo: Repo, me: Me, settings: OrgSettings, agentId: string, department: string | null, demo: { spend?: number; cap?: number }) {
  const admin = repo.mode === 'supabase' ? createAdmin() : null;
  await enforceAgentCap({ repo, spendRepo: admin ? new SupabaseRepo(admin, me.org_id) : undefined, agent: personalAgentRunId(agentId), spendOverrideUsd: demo.spend, capOverrideUsd: demo.cap });
  if (repo.mode !== 'demo' && department) {
    const quota = await departmentQuota(repo, me, settings, department, new Date().toISOString().slice(0, 7));
    if (quota?.exceeded) throw new DepartmentQuotaError(department, quota);
  }
}

export interface ModelCall { text: string; mode: 'ok' | 'demo'; usage: { tokens_in: number; tokens_out: number; cost_usd: number; model: string; latency_ms: number } }
/** Model çağrısı (varsayılan Claude; `choice` ile ChatGPT / Gemini). Demo ya da anahtarsız Claude'da `demoText` döner; anahtarı olmayan ChatGPT / Gemini açık hatayla reddedilir. Hata fırlatırsa çağıran kaydeder. */
export async function callModel(repo: Repo, settings: OrgSettings, system: string, user: string, demoText: string, maxTokens = 1500, choice: HubProvider | null = null): Promise<ModelCall> {
  const key = process.env.ANTHROPIC_API_KEY;
  if (repo.mode === 'demo' || (!key && (choice ?? 'claude') === 'claude')) return { text: demoText, mode: 'demo', usage: { tokens_in: 0, tokens_out: 0, cost_usd: 0, model: 'demo', latency_ms: 0 } };
  const provider = requireProvider(choice);
  const model = hubModel(provider, settings.ai.default_model || FALLBACK_MODEL);
  const t0 = Date.now();
  const res = await callProvider({ provider, model, maxTokens, system, messages: [{ role: 'user', content: user }] });
  const cost = provider === 'claude' ? costUsd(model, res.tokens_in, res.tokens_out) : hubCostUsd(provider, res.tokens_in, res.tokens_out);
  return { text: res.text, mode: 'ok', usage: { tokens_in: res.tokens_in, tokens_out: res.tokens_out, cost_usd: cost, model, latency_ms: Date.now() - t0 } };
}

export async function logRun(repo: Repo, agentId: string, trigger: string, input: Record<string, unknown>, output: Record<string, unknown>, call: ModelCall | null, error?: string) {
  if (repo.mode === 'demo') return; // demo: istemci kendi deposuna yazar
  await repo.logAgentRun({
    agent: personalAgentRunId(agentId) as AgentName, trigger, input, output: error ? { error: error.slice(0, 300) } : output, model: call?.usage.model ?? 'unknown',
    tokens_in: call?.usage.tokens_in ?? 0, tokens_out: call?.usage.tokens_out ?? 0, cost_usd: call?.usage.cost_usd ?? 0, latency_ms: call?.usage.latency_ms ?? 0, status: error ? 'error' : call?.mode === 'ok' ? 'ok' : 'demo',
  }).catch(() => undefined);
}
