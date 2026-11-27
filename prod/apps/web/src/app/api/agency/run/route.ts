import Anthropic from '@anthropic-ai/sdk';
import { z } from 'zod';
import type { AgentName } from '@jscore/contracts';
import { enforceAgentCap } from '@jscore/core/agents/cap';
import { costUsd } from '@jscore/core/agents/cost';
import { fail, json } from '@jscore/core/api';
import { assertCan } from '@jscore/core/permissions';
import { getRepo } from '@jscore/core/repo';
import { SupabaseRepo } from '@jscore/core/repo/supabase';
import { createAdmin } from '@jscore/core/supabase/admin';
import { agencyAgentId, agencyRole, demoAgencyOutput, personaById } from '@jscore/agents';
import { agencyPrompt, agencySystemPrompt, assertAgencyAccess } from '@jscore/agents/server';

export const maxDuration = 120;
const FALLBACK_MODEL = 'claude-sonnet-4-5';
const bodySchema = z.object({
  role: z.string().min(1).max(120),
  /** Elle seçilen tipleme (12 karakterden biri); yoksa rolün varsayılanı. */
  persona: z.string().max(40).nullable().optional(),
  project_id: z.string().max(80).nullable().optional(),
  task_id: z.string().max(80).nullable().optional(),
  brief: z.string().trim().min(3).max(4000),
  demo_spend_usd: z.number().min(0).optional(),
  demo_cap_usd: z.number().min(0).optional(),
});

/**
 * Bir Agency rolünü proje bağlamında çalıştırır. Kayıt `agent_runs`'a `agent='agency:<slug>'` olarak yazılır
 * (aylık maliyet tavanına dahil; ofis görünümü bu satırlardan beslenir). Demo / anahtarsız modda model çağrısı yapılmaz.
 */
export async function POST(req: Request) {
  try {
    const repo = await getRepo();
    const me = await assertAgencyAccess(repo, await repo.me());
    const body = bodySchema.parse(await req.json());
    const role = agencyRole(body.role);
    const prompt = agencyPrompt(body.role);
    if (!role || !prompt) return json({ error: 'Rol bulunamadı' }, 404);
    await assertCan(repo, me, 'agents.run', { projectId: body.project_id ?? null });

    // Proje / görev kullanıcının kendi görebildikleri arasından çözülür (RLS); göremediği kimlik bağlama girmez.
    const project = body.project_id ? (await repo.listProjects()).find((p) => p.id === body.project_id) ?? null : null;
    if (body.project_id && !project) return json({ error: 'Proje bulunamadı' }, 404);
    const task = body.task_id && project ? (await repo.listTasks({ project_id: project.id })).find((t) => t.id === body.task_id) ?? null : null;

    const department = me.employee_id ? (await repo.team().catch(() => [])).find((m) => m.id === me.employee_id)?.team ?? null : null;
    const agent = agencyAgentId(role.slug);
    const admin = repo.mode === 'supabase' ? createAdmin() : null;
    await enforceAgentCap({ repo, spendRepo: admin ? new SupabaseRepo(admin, me.org_id) : undefined, agent, spendOverrideUsd: body.demo_spend_usd, capOverrideUsd: body.demo_cap_usd });

    if (body.persona && !personaById(body.persona)) return json({ error: 'Tipleme bulunamadı' }, 404);
    const input = { project_id: project?.id ?? null, task_id: task?.id ?? null, brief: body.brief, by: me.name, role: role.name, persona: body.persona ?? null, department };
    const key = process.env.ANTHROPIC_API_KEY;
    if (repo.mode === 'demo' || !key) {
      const text = demoAgencyOutput(role, body.brief, project?.name ?? null);
      const run = { agent: agent as AgentName, trigger: 'agency', input, output: { text }, model: 'demo', tokens_in: 0, tokens_out: 0, cost_usd: 0, latency_ms: 0, status: 'demo' as const };
      // Demo'da sunucu durumsuzdur: istemci kendi DemoRepo'suna yazar. Supabase'de (anahtar yoksa) satır burada yazılır.
      if (repo.mode === 'supabase') await repo.logAgentRun(run);
      return json({ mode: 'demo', run });
    }

    const settings = await repo.getSettings();
    const model = settings.ai.default_model || FALLBACK_MODEL;
    const client = new Anthropic({ apiKey: key });
    const t0 = Date.now();
    const base = { agent: agent as AgentName, trigger: 'agency', input, model };
    try {
      const res = await client.messages.create({
        model, max_tokens: 1500,
        system: agencySystemPrompt(prompt, { project: project?.name ?? null, task: task?.title ?? null }),
        messages: [{ role: 'user', content: body.brief }],
      });
      const text = res.content.map((b) => (b.type === 'text' ? b.text : '')).join('').trim();
      const run = { ...base, output: { text }, tokens_in: res.usage.input_tokens, tokens_out: res.usage.output_tokens, cost_usd: costUsd(model, res.usage.input_tokens, res.usage.output_tokens), latency_ms: Date.now() - t0, status: 'ok' as const };
      await repo.logAgentRun(run);
      return json({ mode: 'ok', run });
    } catch (e) {
      const message = e instanceof Error ? e.message : 'Model çağrısı başarısız';
      await repo.logAgentRun({ ...base, output: { text: '', error: message.slice(0, 500) }, tokens_in: 0, tokens_out: 0, cost_usd: 0, latency_ms: Date.now() - t0, status: 'error' }).catch(() => {});
      return json({ error: `Rol çalıştırılamadı: ${message}` }, 502);
    }
  } catch (e) { return fail(e); }
}
