import { z } from 'zod';
import { fail, json, readJson, requireAccess, sameOrigin } from '@/lib/api';
import { MAX_UPLOAD_BYTES } from '@/lib/limits';
import { buildRunRequest } from '@/lib/rea/requests';
import { createAdmin } from '@/lib/supabase/admin';

export const runtime = 'nodejs';
type Ctx = { params: Promise<{ id: string }> };

const patch = z.object({
  question: z.string().trim().max(2000).optional(),
  seeds: z.array(z.string().trim().min(2).max(80)).max(12).optional(),
  name: z.string().trim().min(2).max(120).optional(),
  upload_path: z.string().max(400).optional(),
  upload_name: z.string().max(200).optional(),
  upload_bytes: z.number().int().positive().max(MAX_UPLOAD_BYTES).optional(),
});

export async function PATCH(req: Request, { params }: Ctx) {
  if (!sameOrigin(req)) return fail(403, 'Geçersiz kaynak.');
  const g = await requireAccess(); if ('res' in g) return g.res;
  const { id } = await params;
  const p = await g.a.store.getProject(g.a.actor.orgId, id); if (!p) return fail(404, 'Proje bulunamadı.');
  const b = await readJson(req, patch); if ('res' in b) return b.res;
  if (b.data.upload_path) {
    if (p.target_kind === 'web') return fail(400, 'Web projelerine dosya eklenemez.');
    const chk = buildRunRequest({ ...p, upload_path: b.data.upload_path, upload_name: b.data.upload_name ?? null, upload_bytes: b.data.upload_bytes ?? null });
    if (!chk.ok) return fail(400, chk.error);
  }
  await g.a.store.updateProject(p.org_id, id, { ...b.data, ...(b.data.upload_path ? { status: 'draft' as const } : {}) });
  return json({ ok: true });
}

export async function DELETE(req: Request, { params }: Ctx) {
  if (!sameOrigin(req)) return fail(403, 'Geçersiz kaynak.');
  const g = await requireAccess(); if ('res' in g) return g.res;
  const { id } = await params;
  const p = await g.a.store.getProject(g.a.actor.orgId, id); if (!p) return fail(404, 'Proje bulunamadı.');
  await g.a.store.deleteProject(p.org_id, id);
  if (p.upload_path && g.a.actor.mode === 'supabase') { try { await createAdmin()?.storage.from('rea-uploads').remove([p.upload_path]); } catch { /* yetim dosya kritik değil */ } }
  return json({ ok: true });
}
