import { tokenCreateSchema } from '@jscore/contracts';
import { fail, json } from '@jscore/core/api';
import { getRepo } from '@jscore/core/repo';
import { audit, isResponse, requireAdmin } from '@/lib/route';

/** API anahtarları (yönetim paneli). Düz token yalnızca POST yanıtında bir kez döner; saklanan yalnızca sha256 özetidir. Politika (süre/kapsam) Repo içinde uygulanır. */
const res = (data: unknown, status = 200) => Response.json(data, { status, headers: { 'cache-control': 'no-store' } });

export async function POST(req: Request) {
  try {
    const ctx = await requireAdmin(); if (isResponse(ctx)) return ctx;
    const repo = await getRepo();
    const body = tokenCreateSchema.parse(await req.json().catch(() => null));
    const { token, plaintext } = await repo.createToken(body);
    await audit(ctx, 'token.create', `access_tokens/${token.id}`, { name: body.name, scopes: body.scopes, expires_in_days: body.expires_in_days ?? null });
    return res({ token, plaintext, persisted: repo.mode === 'supabase' }, 201);
  } catch (e) { return fail(e); }
}
export async function DELETE(req: Request) {
  try {
    const ctx = await requireAdmin(); if (isResponse(ctx)) return ctx;
    const id = new URL(req.url).searchParams.get('id');
    if (!id) return json({ error: 'id gerekli' }, 400);
    await (await getRepo()).revokeToken(id);
    await audit(ctx, 'token.revoke', `access_tokens/${id}`);
    return res({ ok: true });
  } catch (e) { return fail(e); }
}
