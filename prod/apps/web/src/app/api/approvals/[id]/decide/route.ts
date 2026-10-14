import { approvalDecisionSchema } from '@jscore/contracts';
import { fail, json } from '@/lib/api';
import { getRepo } from '@/lib/repo';

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await ctx.params;
    const repo = await getRepo();
    if (!(await repo.me())) return json({ error: 'Oturum yok' }, 401);
    const body = approvalDecisionSchema.parse(await req.json());
    const approval = await repo.decideApproval(id, body.decision, body.note);
    return json({ approval, persisted: repo.mode === 'supabase' });
  } catch (e) { return fail(e); }
}
