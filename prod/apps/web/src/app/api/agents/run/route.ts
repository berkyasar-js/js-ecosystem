import { agentRunRequestSchema, isClientRole } from '@jscore/contracts';
import { runAgent } from '@/lib/agents/run';
import { fail, json } from '@/lib/api';
import { getRepo } from '@/lib/repo';

export async function POST(req: Request) {
  try {
    const repo = await getRepo();
    const me = await repo.me();
    if (!me) return json({ error: 'Oturum yok' }, 401);
    if (isClientRole(me.role)) return json({ error: 'Yetki yok' }, 403);
    const body = agentRunRequestSchema.parse(await req.json());
    const board = !['inbox_drafts', 'twin_person', 'twin_role'].includes(body.agent);
    if (board && !['owner', 'org_admin'].includes(me.role)) return json({ error: 'Kurul ajanlarını yalnızca owner/org_admin çalıştırır' }, 403);
    const { output, run } = await runAgent({ agent: body.agent, input: body.input, repo, trigger: board ? 'board' : 'inbox' });
    // Demo'da sunucu durumsuz olduğu için istemci kendi DemoRepo'suna yazar; run özeti yanıtta döner.
    return json({ agent: body.agent, mode: run.status, output, usage: { tokens_in: run.tokens_in, tokens_out: run.tokens_out, cost_usd: run.cost_usd, model: run.model } });
  } catch (e) { return fail(e); }
}
