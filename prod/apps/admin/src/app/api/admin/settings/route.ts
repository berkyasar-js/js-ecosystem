import { z } from 'zod';
import { orgSettingsPatchSchema } from '@jscore/contracts';
import { audit, adminRoute, ok, requireService, isResponse } from '@/lib/route';
import { diffSettings, readSettings, sanitizePatch } from '@/lib/settings';

export const dynamic = 'force-dynamic';
const bodySchema = z.object({ settings: orgSettingsPatchSchema.optional(), slug: z.string().trim().regex(/^[a-z0-9][a-z0-9-]{1,48}$/, 'Slug küçük harf, rakam ve tire içermeli').optional() });

export const GET = adminRoute(async (ctx) => {
  const sb = requireService(ctx); if (isResponse(sb)) return sb;
  return ok(await readSettings(sb, ctx.orgId));
});

export const PATCH = adminRoute(async (ctx, req) => {
  const sb = requireService(ctx); if (isResponse(sb)) return sb;
  const body = bodySchema.parse(await req.json().catch(() => null));
  const cur = await readSettings(sb, ctx.orgId);
  const patch = sanitizePatch(body.settings ?? {});
  const next = { ...cur.settings, ...patch };
  const update: Record<string, unknown> = { settings: next, name: next.general.name };
  if (body.slug && body.slug !== cur.slug) update.slug = body.slug;
  const { error } = await sb.from('organizations').update(update).eq('id', ctx.orgId);
  if (error) { await audit(ctx, 'settings.update', `organizations/${ctx.orgId}`, { error: error.message }, 'error'); throw new Error(error.code === '23505' ? 'Bu slug başka bir organizasyonda kullanılıyor' : error.message); }
  await audit(ctx, 'settings.update', `organizations/${ctx.orgId}`, { ...diffSettings(cur.settings, next), slug: update.slug });
  return ok({ settings: next, slug: (update.slug as string) ?? cur.slug });
});
