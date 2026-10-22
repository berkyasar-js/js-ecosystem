import { after } from 'next/server';
import { fail, json, requireAccess, sameOrigin } from '@/lib/api';
import { workerStore } from '@/lib/auth';
import { RUN_MAX_DURATION_S } from '@/lib/limits';
import { buildRunRequest } from '@/lib/rea/requests';
import { executeRun } from '@/lib/rea/runner';

export const runtime = 'nodejs';
/** Vercel işlev süresi: after() ile çalışan analiz de bu sınır içinde kalır. */
export const maxDuration = 300; // = RUN_MAX_DURATION_S (Next sabit literal ister)
type Ctx = { params: Promise<{ id: string }> };

const STALE_MS = (RUN_MAX_DURATION_S + 60) * 1000;

export async function POST(req: Request, { params }: Ctx) {
  if (!sameOrigin(req)) return fail(403, 'Geçersiz kaynak.');
  const g = await requireAccess(); if ('res' in g) return g.res;
  const { id } = await params;
  const { actor, store } = g.a;
  const project = await store.getProject(actor.orgId, id);
  if (!project) return fail(404, 'Proje bulunamadı.');

  const rq = buildRunRequest(project);
  if (!rq.ok) return fail(400, rq.error);
  if (actor.mode === 'demo' && rq.request.mode !== 'web') return fail(400, 'Demo modunda yalnızca URL analizi çalışır. Supabase bağlayınca yükleme açılır.');

  const worker = workerStore(actor);
  if (!worker) return fail(500, 'SUPABASE_SERVICE_ROLE_KEY tanımlı değil (arka plan işçisi için gerekli).');

  const last = await store.latestRun(actor.orgId, id);
  if (last && (last.status === 'queued' || last.status === 'running') && Date.now() - new Date(last.created_at).getTime() < STALE_MS) return fail(409, 'Bu proje için bir analiz zaten çalışıyor.');

  const run = await store.createRun(project);
  await store.updateProject(actor.orgId, id, { status: 'queued' });
  after(async () => { await executeRun(actor, worker, project, run); });
  return json({ run_id: run.id }, 202);
}
