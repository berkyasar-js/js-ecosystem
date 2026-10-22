import { json } from '@jscore/core/api';
import { audit, adminRoute, ok, requireService, isResponse } from '@/lib/route';
import { appCallback, canAssignRole, findUserByEmail, inviteSchema, listAllUsers, scopesFor } from '@/lib/users';

export const dynamic = 'force-dynamic';

export const GET = adminRoute(async (ctx) => {
  const sb = requireService(ctx); if (isResponse(sb)) return sb;
  const [mem, emps, clients, users] = await Promise.all([
    sb.from('memberships').select('user_id,role,scopes,status,created_at').eq('org_id', ctx.orgId),
    sb.from('employees').select('id,name,role_title,code,status,auth_user_id').eq('org_id', ctx.orgId).order('name'),
    sb.from('clients').select('id,name').eq('org_id', ctx.orgId).order('name'),
    listAllUsers(sb),
  ]);
  if (mem.error) throw new Error(mem.error.message);
  const byId = new Map(users.map((u) => [u.id, u]));
  const empBy = new Map((emps.data ?? []).filter((e) => e.auth_user_id).map((e) => [e.auth_user_id as string, e]));
  const rows = (mem.data ?? []).map((m) => {
    const u = byId.get(m.user_id as string);
    const e = empBy.get(m.user_id as string);
    return {
      user_id: m.user_id, email: u?.email ?? '', role: m.role, status: m.status ?? 'active', scopes: m.scopes ?? {}, created_at: m.created_at,
      employee_id: e?.id ?? null, employee_name: e?.name ?? null,
      name: (e?.name as string) ?? (u?.user_metadata?.full_name as string) ?? u?.email ?? String(m.user_id).slice(0, 8),
      last_sign_in_at: u?.last_sign_in_at ?? null, confirmed: !!u?.email_confirmed_at || !!u?.last_sign_in_at, invited_at: u?.invited_at ?? null,
      banned_until: (u as { banned_until?: string | null } | undefined)?.banned_until ?? null,
      mfa_factors: (u?.factors ?? []).filter((f) => f.status === 'verified').length,
      providers: (u?.app_metadata?.providers as string[] | undefined) ?? [],
    };
  }).sort((a, b) => a.name.localeCompare(b.name, 'tr'));
  return ok({ users: rows, employees: emps.data ?? [], clients: clients.data ?? [], me: ctx.userId, my_role: ctx.role });
});

export const POST = adminRoute(async (ctx, req) => {
  const sb = requireService(ctx); if (isResponse(sb)) return sb;
  const v = inviteSchema.parse(await req.json().catch(() => null));
  if (!canAssignRole(ctx.role, v.role)) return json({ error: 'Owner rolünü yalnızca owner verebilir' }, 403);
  const { scopes, error: scopeErr } = scopesFor(v.role, v);
  if (scopeErr) return json({ error: scopeErr }, 400);

  let user = await findUserByEmail(sb, v.email);
  let invited = false;
  if (!user) {
    const { data, error } = await sb.auth.admin.inviteUserByEmail(v.email, { redirectTo: appCallback() });
    if (error) { await audit(ctx, 'user.invite', `email:${v.email}`, { error: error.message }, 'error'); return json({ error: `Davet gönderilemedi: ${error.message}` }, 502); }
    user = data.user; invited = true;
  }
  const { error: mErr } = await sb.from('memberships').upsert({ user_id: user.id, org_id: ctx.orgId, role: v.role, scopes, status: 'active' }, { onConflict: 'user_id,org_id' });
  if (mErr) { await audit(ctx, 'user.invite', `user:${user.id}`, { error: mErr.message }, 'error'); throw new Error(mErr.message); }
  if (v.employee_id) {
    await sb.from('employees').update({ auth_user_id: null }).eq('org_id', ctx.orgId).eq('auth_user_id', user.id).neq('id', v.employee_id);
    const { error: eErr } = await sb.from('employees').update({ auth_user_id: user.id }).eq('org_id', ctx.orgId).eq('id', v.employee_id);
    if (eErr) throw new Error(`Üyelik oluşturuldu ama çalışan bağlanamadı: ${eErr.message}`);
  }
  await audit(ctx, invited ? 'user.invite' : 'user.add', `user:${user.id}`, { email: v.email, role: v.role, employee_id: v.employee_id ?? null, scopes });
  return ok({ user_id: user.id, invited }, 201);
});
