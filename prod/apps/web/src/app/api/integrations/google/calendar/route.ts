import { isClientRole } from '@jscore/contracts';
import { fail } from '@jscore/core/api';
import { loadAgendaEvents } from '@jscore/core/integrations/google-calendar';
import { googleFail, isResponse, requireUser } from '@/lib/google-user';

export const dynamic = 'force-dynamic';
/** GET ?days=14&today=YYYY-MM-DD → { events, me, org, errors }: kişisel takvim + (iç roller) ajans takvimi; 5 dk bellek önbelleği. */
export async function GET(req: Request) {
  try {
    const a = await requireUser(); if (isResponse(a)) return a;
    const url = new URL(req.url);
    const days = Math.min(31, Math.max(1, Number(url.searchParams.get('days') ?? 14) || 14));
    const today = /^\d{4}-\d{2}-\d{2}$/.test(url.searchParams.get('today') ?? '') ? (url.searchParams.get('today') as string) : new Date().toISOString().slice(0, 10);
    const r = await loadAgendaEvents(a.admin, { userId: a.me.id, orgId: a.me.org_id, today, days, includeOrg: !isClientRole(a.me.role) });
    return Response.json(r, { headers: { 'cache-control': 'private, max-age=60' } });
  } catch (e) { return googleFail(e) ?? fail(e); }
}
