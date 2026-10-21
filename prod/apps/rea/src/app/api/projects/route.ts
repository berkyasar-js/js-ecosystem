import { z } from 'zod';
import { fail, json, readJson, requireAccess, sameOrigin } from '@/lib/api';
import { MAX_UPLOAD_BYTES } from '@/lib/limits';
import { buildRunRequest, normalizeWebUrl } from '@/lib/rea/requests';

export const runtime = 'nodejs';

const body = z.object({
  name: z.string().trim().min(2).max(120),
  target_kind: z.enum(['web', 'bundle', 'local']),
  target_url: z.string().trim().max(500).nullable().optional(),
  upload_path: z.string().max(400).nullable().optional(),
  upload_name: z.string().max(200).nullable().optional(),
  upload_bytes: z.number().int().positive().max(MAX_UPLOAD_BYTES).nullable().optional(),
  question: z.string().trim().max(2000).default(''),
  seeds: z.array(z.string().trim().min(2).max(80)).max(12).default([]),
});

export async function GET() {
  const g = await requireAccess(); if ('res' in g) return g.res;
  return json({ projects: await g.a.store.listProjects(g.a.actor.orgId) });
}

export async function POST(req: Request) {
  if (!sameOrigin(req)) return fail(403, 'Geçersiz kaynak.');
  const g = await requireAccess(); if ('res' in g) return g.res;
  const b = await readJson(req, body); if ('res' in b) return b.res;
  const d = b.data;
  const orgId = g.a.actor.orgId;
  let target_url = d.target_url ?? null;
  if (d.target_kind === 'web') {
    const n = normalizeWebUrl(target_url ?? '');
    if (!n.ok) return fail(400, n.error);
    target_url = n.url;
  }
  const upload_path = d.target_kind === 'web' ? null : d.upload_path ?? null;
  if (d.target_kind !== 'web') {
    const chk = buildRunRequest({ target_kind: d.target_kind, target_url, upload_path, upload_name: d.upload_name ?? null, upload_bytes: d.upload_bytes ?? null, org_id: orgId });
    if (!chk.ok) return fail(400, chk.error);
  }
  const p = await g.a.store.createProject(orgId, g.a.actor.userId, {
    name: d.name, target_kind: d.target_kind, target_url, upload_path, upload_name: d.upload_name ?? null, upload_bytes: d.upload_bytes ?? null, question: d.question, seeds: d.seeds,
  });
  return json({ project: p }, 201);
}
