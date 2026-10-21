import { fail, json, requireAccess, sameOrigin } from '@/lib/api';
import { AI_MODEL } from '@/lib/env';
import { AiConfigError, synthesizeFlow } from '@/lib/ai/synthesize';

export const runtime = 'nodejs';
export const maxDuration = 120;
type Ctx = { params: Promise<{ id: string }> };

export async function POST(req: Request, { params }: Ctx) {
  if (!sameOrigin(req)) return fail(403, 'Geçersiz kaynak.');
  const g = await requireAccess(); if ('res' in g) return g.res;
  const { id } = await params;
  const { actor, store } = g.a;
  const project = await store.getProject(actor.orgId, id);
  if (!project) return fail(404, 'Proje bulunamadı.');
  const runs = await store.latestRun(actor.orgId, id);
  if (!runs || runs.status !== 'done' || !runs.digest) return fail(409, 'Önce başarılı bir analiz çalışması gerekli.');
  try {
    const flow = await synthesizeFlow(project, runs);
    const finding = await store.addFinding(actor.orgId, actor.userId, { project_id: id, run_id: runs.id, title: `Özellik akışı — ${new Date().toISOString().slice(0, 10)}`, body: flow, model: AI_MODEL });
    return json({ finding }, 201);
  } catch (e) {
    if (e instanceof AiConfigError) return fail(503, 'Yapay zekâ anahtarı (ANTHROPIC_API_KEY) tanımlı değil.');
    return fail(502, e instanceof Error ? e.message : 'Sentez başarısız.');
  }
}
