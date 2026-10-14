import { fail, json } from '@/lib/api';
import { getRepo } from '@/lib/repo';

export async function GET() {
  try {
    const repo = await getRepo();
    const me = await repo.me();
    return me ? json({ mode: repo.mode, me }) : json({ error: 'Oturum yok' }, 401);
  } catch (e) { return fail(e); }
}
