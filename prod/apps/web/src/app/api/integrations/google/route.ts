import { fail } from '@jscore/core/api';
import { clearGoogleUser, loadGoogleUser, userGoogleState } from '@jscore/core/integrations/google-oauth';
import { googleFail, isResponse, requireUser } from '@/lib/google-user';

export const dynamic = 'force-dynamic';
const res = (d: unknown, status = 200) => Response.json(d, { status, headers: { 'cache-control': 'no-store' } });
/** GET: kişisel Google bağlantı durumu (token yok). */
export async function GET() {
  try { const a = await requireUser(); if (isResponse(a)) return a; return res(userGoogleState(await loadGoogleUser(a.admin, a.me.id))); }
  catch (e) { return googleFail(e) ?? fail(e); }
}
/** DELETE: kişisel bağlantıyı kaldır (token Google'da iptal edilir). */
export async function DELETE() {
  try { const a = await requireUser(); if (isResponse(a)) return a; await clearGoogleUser(a.admin, a.me.id); return res(userGoogleState(null)); }
  catch (e) { return googleFail(e) ?? fail(e); }
}
