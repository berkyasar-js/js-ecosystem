import { agentFeatureKey, agentRunRequestSchema, featureEnabled, isClientRole } from '@jscore/contracts';
import { enforceAgentCap } from '@jscore/core/agents/cap';
import { runAgent } from '@jscore/core/agents/run';
import { fail, json } from '@jscore/core/api';
import { getRepo } from '@jscore/core/repo';
import { SupabaseRepo } from '@jscore/core/repo/supabase';
import { createAdmin } from '@jscore/core/supabase/admin';

export async function POST(req: Request) {
  try {
    const repo = await getRepo();
    const me = await repo.me();
    if (!me) return json({ error: 'Oturum yok' }, 401);
    if (isClientRole(me.role)) return json({ error: 'Yetki yok' }, 403);
    const body = agentRunRequestSchema.parse(await req.json());
    const board = !['inbox_drafts', 'twin_person', 'twin_role', 'twin_bid', 'studio_draft'].includes(body.agent);
    // Yönetim Kurulu yalnızca Ana Yönetim Paneli'nden (apps/admin) çalışır.
    if (board) return json({ error: 'Kurul ajanları yalnızca Ana Yönetim Paneli’nden çalıştırılır', code: 'moved_to_admin' }, 403);
    // Yönetim panelinde kapatılan özellikler sunucuda da reddedilir.
    const featureKey = agentFeatureKey(body.agent);
    if (featureKey && !featureEnabled((await repo.getSettings()).feature_toggles, featureKey)) return json({ error: 'Bu özellik yönetici tarafından kapatıldı', code: 'feature_disabled' }, 403);
    // Aylık maliyet tavanı: ay içi harcama (servis rolüyle — RLS agent_runs okumasını kısıtlar) + tahmini çalıştırma tavanı aşarsa 402.
    const admin = repo.mode === 'supabase' ? createAdmin() : null;
    await enforceAgentCap({ repo, spendRepo: admin ? new SupabaseRepo(admin, me.org_id) : undefined, agent: body.agent, spendOverrideUsd: body.demo_spend_usd, capOverrideUsd: body.demo_cap_usd });
    const { output, run } = await runAgent({ agent: body.agent, input: body.input, repo, trigger: 'inbox' });
    // Demo'da sunucu durumsuz olduğu için istemci kendi DemoRepo'suna yazar; run özeti yanıtta döner.
    return json({ agent: body.agent, mode: run.status, output, usage: { tokens_in: run.tokens_in, tokens_out: run.tokens_out, cost_usd: run.cost_usd, model: run.model } });
  } catch (e) { return fail(e); }
}
