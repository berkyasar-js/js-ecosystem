import { z } from 'zod';
import { diffPermissions, effectivePermissions, permissionChanges, permissionOverridesSchema, type PermissionOverrides } from '@jscore/contracts';
import { audit, adminRoute, ok, requireService, isResponse } from '@/lib/route';
import { readSettings } from '@/lib/settings';

export const dynamic = 'force-dynamic';
const bodySchema = z.object({ permissions: permissionOverridesSchema });

/** Yetki matrisi (0018): organizations.settings.permissions — yalnızca varsayılandan sapmalar saklanır; her kayıt `admin.permissions.update` denetim kaydı (değişen hücreler). */
export const GET = adminRoute(async (ctx) => {
  const sb = requireService(ctx); if (isResponse(sb)) return sb;
  const { settings } = await readSettings(sb, ctx.orgId);
  const overrides = (settings.permissions as PermissionOverrides | undefined) ?? {};
  return ok({ overrides, effective: effectivePermissions(overrides) });
});

export const PATCH = adminRoute(async (ctx, req) => {
  const sb = requireService(ctx); if (isResponse(sb)) return sb;
  const body = bodySchema.parse(await req.json().catch(() => null));
  const cur = await readSettings(sb, ctx.orgId);
  const before = (cur.settings.permissions as PermissionOverrides | undefined) ?? {};
  // Gelen tam ya da kısmi matris → normalize: yalnızca sapmalar
  const next = diffPermissions(effectivePermissions(body.permissions as PermissionOverrides) as unknown as Record<string, Record<string, boolean>>);
  const changes = permissionChanges(before, next);
  const settings = { ...cur.settings, permissions: next };
  const { error } = await sb.from('organizations').update({ settings }).eq('id', ctx.orgId);
  if (error) { await audit(ctx, 'permissions.update', `organizations/${ctx.orgId}`, { error: error.message }, 'error'); throw new Error(error.message); }
  await audit(ctx, 'permissions.update', `organizations/${ctx.orgId}`, { changes: changes.map((c) => `${c.role}:${c.cap}=${c.to}`), count: changes.length });
  return ok({ overrides: next, changes });
});
