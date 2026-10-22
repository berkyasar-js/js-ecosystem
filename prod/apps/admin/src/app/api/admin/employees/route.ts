import { audit, adminRoute, ok, requireService, isResponse } from '@/lib/route';
import { listAllUsers } from '@/lib/users';
import { z } from 'zod';
import { json } from '@jscore/core/api';

export const dynamic = 'force-dynamic';

export const GET = adminRoute(async (ctx) => {
  const sb = requireService(ctx); if (isResponse(sb)) return sb;
  const [emps, mem, users] = await Promise.all([
    sb.from('employees').select('id,code,name,role_title,app_role,status,weekly_hours,auth_user_id').eq('org_id', ctx.orgId).order('name'),
    sb.from('memberships').select('user_id,role,status').eq('org_id', ctx.orgId),
    listAllUsers(sb),
  ]);
  if (emps.error) throw new Error(emps.error.message);
  const mail = new Map(users.map((u) => [u.id, u.email ?? '']));
  const memBy = new Map((mem.data ?? []).map((m) => [m.user_id as string, m]));
  return ok({
    employees: (emps.data ?? []).map((e) => ({ ...e, email: e.auth_user_id ? mail.get(e.auth_user_id as string) ?? '' : '', membership: e.auth_user_id ? memBy.get(e.auth_user_id as string) ?? null : null })),
    members: (mem.data ?? []).map((m) => ({ user_id: m.user_id, email: mail.get(m.user_id as string) ?? '', role: m.role })),
  });
});

const linkSchema = z.object({ employee_id: z.string().uuid(), user_id: z.string().uuid().nullable() });
/** Çalışan ↔ kullanıcı bağı (employees.auth_user_id). user_id null → bağı kaldır. */
export const PUT = adminRoute(async (ctx, req) => {
  const sb = requireService(ctx); if (isResponse(sb)) return sb;
  const v = linkSchema.parse(await req.json().catch(() => null));
  if (v.user_id) {
    const { data } = await sb.from('memberships').select('user_id').eq('org_id', ctx.orgId).eq('user_id', v.user_id).maybeSingle();
    if (!data) return json({ error: 'Bu kullanıcı organizasyonun üyesi değil' }, 400);
    await sb.from('employees').update({ auth_user_id: null }).eq('org_id', ctx.orgId).eq('auth_user_id', v.user_id).neq('id', v.employee_id);
  }
  const { error } = await sb.from('employees').update({ auth_user_id: v.user_id }).eq('org_id', ctx.orgId).eq('id', v.employee_id);
  if (error) { await audit(ctx, 'employee.link', `employee:${v.employee_id}`, { error: error.message }, 'error'); throw new Error(error.message); }
  await audit(ctx, v.user_id ? 'employee.link' : 'employee.unlink', `employee:${v.employee_id}`, { user_id: v.user_id });
  return ok();
});
