import { z } from 'zod';
import { json } from '@jscore/core/api';
import { audit, adminRoute, ok, requireService, isResponse } from '@/lib/route';
import { BAN_FOREVER, canAssignRole, patchSchema, scopesFor, wouldRemoveLastOwner } from '@/lib/users';
import type { Role } from '@jscore/contracts';

type Ctx = { params: Promise<{ id: string }> };
const idOk = (id: string) => z.string().uuid().safeParse(id).success;

export const PATCH = adminRoute(async (ctx, req, { params }: Ctx) => {
  const sb = requireService(ctx); if (isResponse(sb)) return sb;
  const { id } = await params;
  if (!idOk(id)) return json({ error: 'Geçersiz kullanıcı' }, 400);
  const v = patchSchema.parse(await req.json().catch(() => null));
  const { data: cur } = await sb.from('memberships').select('role,scopes,status').eq('org_id', ctx.orgId).eq('user_id', id).maybeSingle();
  if (!cur) return json({ error: 'Bu organizasyonda böyle bir üye yok' }, 404);
  const curRole = cur.role as Role;
  const self = id === ctx.userId;
  if (self && (v.role || v.status === 'disabled')) return json({ error: 'Kendi rolünü değiştiremez veya kendini devre dışı bırakamazsın' }, 400);
  if (!canAssignRole(ctx.role, curRole) || (v.role && !canAssignRole(ctx.role, v.role))) return json({ error: 'Owner üzerinde yalnızca owner işlem yapabilir' }, 403);
  if (((v.role && v.role !== 'owner' && curRole === 'owner') || v.status === 'disabled') && (await wouldRemoveLastOwner(sb, ctx.orgId, id))) return json({ error: 'Son aktif owner değiştirilemez' }, 400);

  const update: Record<string, unknown> = {};
  const role = v.role ?? curRole;
  if (v.role) update.role = v.role;
  if (v.client_ids || v.brand_ids || v.role) {
    const old = (cur.scopes ?? {}) as { client_ids?: string[]; brand_ids?: string[] };
    const { scopes, error } = scopesFor(role, { client_ids: v.client_ids ?? old.client_ids, brand_ids: v.brand_ids ?? old.brand_ids });
    if (error) return json({ error }, 400);
    update.scopes = scopes;
  }
  if (v.status) update.status = v.status;
  if (Object.keys(update).length) {
    const { error } = await sb.from('memberships').update(update).eq('org_id', ctx.orgId).eq('user_id', id);
    if (error) { await audit(ctx, 'user.update', `user:${id}`, { error: error.message }, 'error'); throw new Error(error.message); }
  }
  if (v.employee_id !== undefined) {
    await sb.from('employees').update({ auth_user_id: null }).eq('org_id', ctx.orgId).eq('auth_user_id', id);
    if (v.employee_id) { const { error } = await sb.from('employees').update({ auth_user_id: id }).eq('org_id', ctx.orgId).eq('id', v.employee_id); if (error) throw new Error(error.message); }
  }
  if (v.status === 'disabled') {
    const { error: be } = await sb.auth.admin.updateUserById(id, { ban_duration: BAN_FOREVER });
    const { error: re } = await sb.rpc('admin_revoke_sessions', { p_user: id });
    if (be || re) await audit(ctx, 'user.deactivate', `user:${id}`, { ban: be?.message, revoke: re?.message }, 'error');
  } else if (v.status === 'active') {
    const { error } = await sb.auth.admin.updateUserById(id, { ban_duration: 'none' });
    if (error) throw new Error(`Üyelik açıldı ama oturum engeli kaldırılamadı: ${error.message}`);
  }
  await audit(ctx, v.status ? (v.status === 'disabled' ? 'user.deactivate' : 'user.reactivate') : 'user.update', `user:${id}`, { from_role: curRole, ...v });
  return ok();
});

export const DELETE = adminRoute(async (ctx, _req, { params }: Ctx) => {
  const sb = requireService(ctx); if (isResponse(sb)) return sb;
  const { id } = await params;
  if (!idOk(id)) return json({ error: 'Geçersiz kullanıcı' }, 400);
  if (id === ctx.userId) return json({ error: 'Kendi üyeliğini kaldıramazsın' }, 400);
  const { data: cur } = await sb.from('memberships').select('role').eq('org_id', ctx.orgId).eq('user_id', id).maybeSingle();
  if (!cur) return json({ error: 'Bu organizasyonda böyle bir üye yok' }, 404);
  if (!canAssignRole(ctx.role, cur.role as Role)) return json({ error: 'Owner üzerinde yalnızca owner işlem yapabilir' }, 403);
  if (await wouldRemoveLastOwner(sb, ctx.orgId, id)) return json({ error: 'Son aktif owner kaldırılamaz' }, 400);
  await sb.from('employees').update({ auth_user_id: null }).eq('org_id', ctx.orgId).eq('auth_user_id', id);
  const { error } = await sb.from('memberships').delete().eq('org_id', ctx.orgId).eq('user_id', id);
  if (error) { await audit(ctx, 'user.remove', `user:${id}`, { error: error.message }, 'error'); throw new Error(error.message); }
  await sb.rpc('admin_revoke_sessions', { p_user: id });
  await audit(ctx, 'user.remove', `user:${id}`, { role: cur.role });
  return ok();
});
