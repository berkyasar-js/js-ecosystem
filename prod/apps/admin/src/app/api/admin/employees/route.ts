import { audit, adminRoute, ok, requireService, isResponse } from '@/lib/route';
import { listAllUsers } from '@/lib/users';
import { z } from 'zod';
import { json } from '@jscore/core/api';

export const dynamic = 'force-dynamic';

export const GET = adminRoute(async (ctx) => {
  const sb = requireService(ctx); if (isResponse(sb)) return sb;
  const [emps, mem, users] = await Promise.all([
    sb.from('employees').select('id,code,name,role_title,app_role,status,weekly_hours,auth_user_id,team,manager_id,hired_at').eq('org_id', ctx.orgId).order('name'),
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

const hierSchema = z.object({ employee_id: z.string().uuid(), team: z.string().trim().max(80).nullable().optional(), manager_id: z.string().uuid().nullable().optional(), hired_at: z.string().min(8).nullable().optional() }).strict();
/** Ekipler & hiyerarşi (0016): team / manager_id / hired_at. Kişi kendi yöneticisi olamaz; yönetici aynı organizasyondan olmalı. */
export const PATCH = adminRoute(async (ctx, req) => {
  const sb = requireService(ctx); if (isResponse(sb)) return sb;
  const { employee_id, ...patch } = hierSchema.parse(await req.json().catch(() => null));
  if (patch.manager_id === employee_id) return json({ error: 'Kişi kendi yöneticisi olamaz' }, 400);
  if (patch.manager_id) {
    const { data } = await sb.from('employees').select('id,manager_id').eq('org_id', ctx.orgId);
    const byId = new Map((data ?? []).map((e) => [e.id as string, e.manager_id as string | null]));
    if (!byId.has(patch.manager_id)) return json({ error: 'Yönetici bu organizasyonda değil' }, 400);
    // Döngü: önerilen yöneticinin üst zinciri bu kişiden geçiyorsa reddet.
    for (let cur: string | null | undefined = patch.manager_id, n = 0; cur && n < 100; cur = byId.get(cur), n++) if (cur === employee_id) return json({ error: 'Bu atama döngü oluşturur' }, 400);
  }
  const { error } = await sb.from('employees').update(patch).eq('org_id', ctx.orgId).eq('id', employee_id);
  if (error) { await audit(ctx, 'employee.hierarchy', `employee:${employee_id}`, { ...patch, error: error.message }, 'error'); throw new Error(error.message); }
  await audit(ctx, 'employee.hierarchy', `employee:${employee_id}`, patch);
  return ok();
});
