import { agentRunRequestSchema } from '@jscore/contracts';
import { enforceAgentCap } from '@jscore/core/agents/cap';
import { runAgent } from '@jscore/core/agents/run';
import { fail, json } from '@jscore/core/api';
import { getRepo } from '@jscore/core/repo';
import { SupabaseRepo } from '@jscore/core/repo/supabase';
import { createAdmin } from '@jscore/core/supabase/admin';
import { audit, isResponse, requireAdmin } from '@/lib/route';

/** Kurul (CHAIR ve board ajanları) yalnızca buradan çalışır. Maliyet tavanı 402 ile uygulanır. */
export async function POST(req: Request) {
  try {
    const ctx = await requireAdmin(); if (isResponse(ctx)) return ctx;
    const repo = await getRepo();
    const me = await repo.me();
    if (!me) return json({ error: 'Oturum yok' }, 401);
    const body = agentRunRequestSchema.parse(await req.json());
    const board = !['inbox_drafts', 'twin_person', 'twin_role', 'twin_bid', 'studio_draft'].includes(body.agent);
    const admin = repo.mode === 'supabase' ? createAdmin() : null;
    await enforceAgentCap({ repo, spendRepo: admin ? new SupabaseRepo(admin, me.org_id) : undefined, agent: body.agent, spendOverrideUsd: body.demo_spend_usd, capOverrideUsd: body.demo_cap_usd });
    const { output, run } = await runAgent({ agent: body.agent, input: body.input, repo, trigger: board ? 'board' : 'manual' });
    await audit(ctx, board ? 'board.convene' : 'agent.run', `agents/${body.agent}`, { cost_usd: run.cost_usd, status: run.status });
    return json({ agent: body.agent, mode: run.status, output, usage: { tokens_in: run.tokens_in, tokens_out: run.tokens_out, cost_usd: run.cost_usd, model: run.model } });
  } catch (e) { return fail(e); }
}
