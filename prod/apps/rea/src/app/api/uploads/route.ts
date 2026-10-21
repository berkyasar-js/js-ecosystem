import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { fail, json, readJson, requireAccess, sameOrigin } from '@/lib/api';
import { validateUpload } from '@/lib/rea/requests';
import { createAdmin } from '@/lib/supabase/admin';

export const runtime = 'nodejs';

const body = z.object({ kind: z.enum(['bundle', 'local']), filename: z.string().min(1).max(300), size: z.number().int().positive() });

/** Büyük dosyalar Vercel gövde sınırını (4,5 MB) aşar; tarayıcı imzalı URL ile doğrudan Supabase Storage'a yükler. */
export async function POST(req: Request) {
  if (!sameOrigin(req)) return fail(403, 'Geçersiz kaynak.');
  const g = await requireAccess(); if ('res' in g) return g.res;
  const b = await readJson(req, body); if ('res' in b) return b.res;
  if (g.a.actor.mode === 'demo') return fail(400, 'Demo modunda dosya yükleme kapalı. Supabase bağlayınca açılır; URL analizini deneyebilirsin.');
  const v = validateUpload(b.data.kind, b.data.filename, b.data.size);
  if (!v.ok) return fail(400, v.error);
  const admin = createAdmin();
  if (!admin) return fail(500, 'SUPABASE_SERVICE_ROLE_KEY tanımlı değil.');
  const path = `${g.a.actor.orgId}/${randomUUID()}/${v.safeName}`;
  const { data, error } = await admin.storage.from('rea-uploads').createSignedUploadUrl(path);
  if (error || !data) return fail(500, `Yükleme adresi oluşturulamadı: ${error?.message ?? 'bilinmeyen'}`);
  return json({ path, token: data.token, name: v.safeName });
}
