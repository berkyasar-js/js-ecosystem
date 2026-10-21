import { fail, json, requireAccess } from '@/lib/api';
import { RUN_MAX_DURATION_S } from '@/lib/limits';

export const runtime = 'nodejs';
type Ctx = { params: Promise<{ id: string }> };

/** İlerleme yoklaması. İşlev ölürse (zaman aşımı) takılı kalan çalışma "hata"ya çevrilir. */
export async function GET(_req: Request, { params }: Ctx) {
  const g = await requireAccess(); if ('res' in g) return g.res;
  const { id } = await params;
  const { actor, store } = g.a;
  const run = await store.getRun(actor.orgId, id);
  if (!run) return fail(404, 'Çalışma bulunamadı.');
  if ((run.status === 'running' || run.status === 'queued') && Date.now() - new Date(run.started_at ?? run.created_at).getTime() > (RUN_MAX_DURATION_S + 45) * 1000) {
    await store.updateRun(actor.orgId, id, { status: 'failed', progress: 100, message: 'Hata', error: 'Çalışma süre sınırında sonlandı (sunucu işlevi yanıt vermedi).', finished_at: new Date().toISOString() });
    await store.updateProject(actor.orgId, run.project_id, { status: 'failed' });
    run.status = 'failed'; run.error = 'Çalışma süre sınırında sonlandı (sunucu işlevi yanıt vermedi).';
  }
  const { digest, ...light } = run; void digest;
  return json({ run: light });
}
