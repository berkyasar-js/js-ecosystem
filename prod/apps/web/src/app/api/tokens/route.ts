import { tokenCreateSchema } from '@jscore/contracts';
import { fail, json } from '@/lib/api';
import { getRepo } from '@/lib/repo';

/** API anahtarları (oturumlu kullanıcı; yetki Repo + RLS'te). Düz token yalnızca POST yanıtında bir kez döner; saklanan yalnızca sha256 özetidir. */
const noStore = { 'cache-control': 'no-store' };
const res = (data: unknown, status = 200) => Response.json(data, { status, headers: noStore });

export async function GET() {
  try {
    const repo = await getRepo();
    if (!(await repo.me())) return json({ error: 'Oturum yok' }, 401);
    return res({ tokens: (await repo.getConnect()).tokens });
  } catch (e) { return fail(e); }
}

export async function POST(req: Request) {
  try {
    const repo = await getRepo();
    if (!(await repo.me())) return json({ error: 'Oturum yok' }, 401);
    const body = tokenCreateSchema.parse(await req.json().catch(() => null));
    const { token, plaintext } = await repo.createToken(body);
    // Demo'da sunucu durumsuzdur: anahtar kalıcı değildir (UI demoda doğrudan istemci repo'sunu kullanır).
    return res({ token, plaintext, persisted: repo.mode === 'supabase' }, 201);
  } catch (e) { return fail(e); }
}

export async function DELETE(req: Request) {
  try {
    const repo = await getRepo();
    if (!(await repo.me())) return json({ error: 'Oturum yok' }, 401);
    const id = new URL(req.url).searchParams.get('id');
    if (!id) return json({ error: 'id gerekli' }, 400);
    await repo.revokeToken(id);
    return res({ ok: true, persisted: repo.mode === 'supabase' });
  } catch (e) { return fail(e); }
}
