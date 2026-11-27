import { z } from 'zod';
import { personalAgentPrompt } from '@jscore/contracts';
import { fail, json } from '@jscore/core/api';
import { getRepo } from '@jscore/core/repo';
import { agencyPrompt } from '@jscore/agents/server';
import { DepartmentQuotaError } from '@jscore/ai-hub';
import { callModel, demoAgentSchema, enforceBudgets, loadAgent, logRun, personalAgentAccess } from '@/lib/personal-agents-server';

export const maxDuration = 120;
const bodySchema = z.object({
  agent_id: z.string().min(1).max(80), brief: z.string().trim().min(3).max(4000), project_id: z.string().max(80).nullable().optional(),
  demo_agent: demoAgentSchema.optional(), demo_spend_usd: z.number().min(0).optional(), demo_cap_usd: z.number().min(0).optional(),
});

/** Kişisel ajanı yürürlükteki (onaylı) talimat sürümüyle çalıştırır. Kayıt: `agent_runs` (agent='pa:<id>'), maliyet tavanı ve departman kotasına dahil. */
export async function POST(req: Request) {
  try {
    const repo = await getRepo();
    const { me, settings } = await personalAgentAccess(repo);
    const body = bodySchema.parse(await req.json());
    const loaded = await loadAgent(repo, body.agent_id, body.demo_agent);
    const project = body.project_id ? (await repo.listProjects()).find((p) => p.id === body.project_id) ?? null : null;
    if (body.project_id && !project) return json({ error: 'Proje bulunamadı' }, 404);
    await enforceBudgets(repo, me, settings, loaded.agent.id, loaded.department, { spend: body.demo_spend_usd, cap: body.demo_cap_usd });

    const system = personalAgentPrompt({ name: loaded.agent.name, specialty: loaded.agent.specialty, ownerName: loaded.ownerName, basePrompt: loaded.agent.base_role ? agencyPrompt(loaded.agent.base_role) : null, version: loaded.version });
    const user = project ? `Proje: ${project.name}\n\n${body.brief}` : body.brief;
    const input = { agent_id: loaded.agent.id, agent_name: loaded.agent.name, owner_employee_id: loaded.agent.owner_employee_id, version: loaded.version.version, department: loaded.department, by: me.name, project_id: project?.id ?? null, brief: body.brief };
    const demoText = [`${loaded.agent.name} — demo çıktısı (gerçek model çağrısı yapılmadı)`, `Talimat sürümü: v${loaded.version.version}`, `Görev: ${body.brief.replace(/\s+/g, ' ').slice(0, 160)}`, '', '1. Kapsamı ve başarı ölçütünü netleştir.', '2. İlk taslağı üret, varsayımları listele.', '3. Onaya gönder.'].join('\n');
    try {
      const call = await callModel(repo, settings, system, user, demoText);
      await logRun(repo, loaded.agent.id, 'personal', input, { text: call.text }, call);
      return json({ mode: call.mode, text: call.text, version: loaded.version.version, usage: call.usage, input });
    } catch (e) {
      const message = e instanceof Error ? e.message : 'Model çağrısı başarısız';
      await logRun(repo, loaded.agent.id, 'personal', input, {}, null, message);
      return json({ error: `Ajan çalıştırılamadı: ${message}` }, 502);
    }
  } catch (e) {
    if (e instanceof DepartmentQuotaError) return json({ error: e.message, code: 'department_quota_exceeded' }, 402);
    return fail(e);
  }
}
