import { adminRoute, ok, requireService, isResponse } from '@/lib/route';
import { listAllUsers } from '@/lib/users';

export const dynamic = 'force-dynamic';

/** Denetim görüntüleyici: audit_events (source=audit) ya da integration_sync_log (source=sync). Filtreler: action (önek), actor, outcome/ok, from, to, q. */
export const GET = adminRoute(async (ctx, req) => {
  const sb = requireService(ctx); if (isResponse(sb)) return sb;
  const u = new URL(req.url).searchParams;
  const source = u.get('source') === 'sync' ? 'sync' : 'audit';
  const limit = Math.min(Math.max(Number(u.get('limit')) || 100, 1), 500);
  const from = u.get('from'), to = u.get('to'), q = u.get('q')?.trim();
  const clean = (s: string) => s.replace(/[%,()]/g, '');
  if (source === 'sync') {
    let query = sb.from('integration_sync_log').select('*').eq('org_id', ctx.orgId).order('created_at', { ascending: false }).limit(limit);
    if (u.get('provider')) query = query.eq('provider', u.get('provider') as string);
    if (u.get('outcome') === 'error') query = query.eq('ok', false);
    if (u.get('outcome') === 'ok') query = query.eq('ok', true);
    if (u.get('action')) query = query.ilike('action', `${clean(u.get('action') as string)}%`);
    if (from) query = query.gte('created_at', from);
    if (to) query = query.lte('created_at', to);
    if (q) query = query.or(`message.ilike.%${clean(q)}%,entity_id.ilike.%${clean(q)}%,external_id.ilike.%${clean(q)}%`);
    const { data, error } = await query;
    if (error) throw new Error(error.message);
    return ok({ source, rows: data ?? [] });
  }
  let query = sb.from('audit_events').select('*').eq('org_id', ctx.orgId).order('occurred_at', { ascending: false }).limit(limit);
  if (u.get('action')) query = query.ilike('action', `${clean(u.get('action') as string)}%`);
  if (u.get('actor')) query = query.eq('actor', u.get('actor') as string);
  if (u.get('outcome')) query = query.eq('outcome', u.get('outcome') as string);
  if (u.get('admin') === '1') query = query.ilike('action', 'admin.%');
  if (from) query = query.gte('occurred_at', from);
  if (to) query = query.lte('occurred_at', to);
  if (q) query = query.ilike('resource', `%${clean(q)}%`);
  const { data, error } = await query;
  if (error) throw new Error(error.message);
  const ids = new Set((data ?? []).map((r) => r.actor as string | null).filter(Boolean) as string[]);
  const emails: Record<string, string> = {};
  if (ids.size) for (const usr of await listAllUsers(sb)) if (ids.has(usr.id)) emails[usr.id] = usr.email ?? usr.id;
  return ok({ source, rows: data ?? [], actors: emails });
});
