import { boardApplySchema, type BoardApplyResult } from '@jscore/contracts';
import { json } from '@jscore/core/api';
import { audit, adminRoute, ok } from '@/lib/route';
import { chatStore, dueAt, matchEmployee, orgSnapshot, sourceRef, taskDescription } from '@/lib/board-chat';

export const dynamic = 'force-dynamic';
type P = { params: Promise<{ id: string }> };

/**
 * Plandaki seçili görevleri gerçek görev olarak sisteme aktarır (public.tasks; servis rolü).
 * Atanan adı çalışan adına aksan duyarsız eşlenir; eşleşmeyenler atanmadan oluşturulur ve yanıtta listelenir.
 * Yeni proje istenirse (new_project) minimal geçerli satır (brand_id zorunlu) oluşturulur.
 */
export const POST = adminRoute(async (ctx, req, { params }: P) => {
  const { id } = await params;
  const v = boardApplySchema.parse(await req.json().catch(() => null));
  const store = chatStore(ctx);
  const message = await store.getMessage(id, v.message_id);
  if (!message?.plan) return json({ error: 'Bu mesajda uygulanacak plan yok' }, 404);
  const plan = message.plan;
  const picked = (v.task_indexes ?? plan.tasks.map((_, i) => i)).filter((i) => i >= 0 && i < plan.tasks.length).map((i) => plan.tasks[i]);
  if (!picked.length) return json({ error: 'Aktarılacak görev seçilmedi' }, 400);
  const snap = await orgSnapshot(ctx);
  const ref = sourceRef(id, message.id);

  const unmatched = new Set<string>();
  const rows = picked.map((t) => {
    const hint = plan.assignments.find((a) => t.assignee_name && a.employee_name === t.assignee_name);
    const emp = t.assignee_name ? matchEmployee(t.assignee_name, snap.employees, hint ? { employee_id: hint.employee_id, employee_code: hint.employee_code } : undefined) : null;
    if (t.assignee_name && !emp) unmatched.add(t.assignee_name);
    const labels = Array.from(new Set(['kurul', ...(t.phase ? [t.phase.trim()] : [])].filter(Boolean)));
    return {
      org_id: ctx.orgId, title: t.title, assignee_id: emp?.id ?? null, priority: t.priority, planned_minutes: t.estimate_minutes,
      due_at: dueAt(snap.today, t.due_in_days), labels, source_ref: ref, state: 'brief' as const, task_type: 'general',
      description: taskDescription(t.description, t.acceptance),
    };
  });

  if (!ctx.sb) {
    // Demo: sunucu tarafı demo deposu kalıcı değildir; yalnızca sonucu simüle et.
    const project = v.project_id ? snap.projects.find((p) => p.id === v.project_id) : null;
    const r: BoardApplyResult = { created: rows.length, project_id: project?.id ?? 'demo', project_name: project?.name ?? v.new_project?.name ?? 'Yeni proje', unmatched_assignees: [...unmatched], task_ids: [], demo: true };
    return ok(r, 201);
  }
  const sb = ctx.sb;

  let projectId = v.project_id ?? null;
  let projectName = '';
  if (projectId) {
    const { data } = await sb.from('projects').select('id,name').eq('org_id', ctx.orgId).eq('id', projectId).maybeSingle();
    if (!data) return json({ error: 'Proje bulunamadı' }, 404);
    projectName = data.name as string;
  } else if (v.new_project) {
    const np = v.new_project;
    let brandId = np.brand_id ?? null;
    if (brandId && !snap.brands.some((b) => b.id === brandId)) return json({ error: 'Marka bulunamadı' }, 404);
    if (!brandId && np.client_id) brandId = snap.brands.find((b) => b.client_id === np.client_id)?.id ?? null;
    if (!brandId) brandId = snap.brands[0]?.id ?? null;
    if (!brandId) return json({ error: 'Yeni proje için en az bir marka tanımlı olmalı (projeler bir markaya bağlıdır)' }, 400);
    const { data, error } = await sb.from('projects').insert({ org_id: ctx.orgId, brand_id: brandId, name: np.name, type: 'kurul', status: 'active', summary: plan.summary || null, source_ref: ref }).select('id,name').single();
    if (error) {
      // source_ref kolonu yoksa (0007 öncesi şema) onsuz dene.
      const retry = await sb.from('projects').insert({ org_id: ctx.orgId, brand_id: brandId, name: np.name, type: 'kurul', status: 'active', summary: plan.summary || null }).select('id,name').single();
      if (retry.error) { await audit(ctx, 'board.chat.apply', `board_thread:${id}`, { error: retry.error.message }, 'error'); throw new Error(retry.error.message); }
      projectId = retry.data.id as string; projectName = retry.data.name as string;
    } else { projectId = data.id as string; projectName = data.name as string; }
    await audit(ctx, 'project.create', `project:${projectId}`, { name: projectName, brand_id: brandId, from: ref });
  }
  if (!projectId) return json({ error: 'Proje seçilmedi' }, 400);

  const payload = rows.map((r) => ({ ...r, project_id: projectId }));
  let ins = await sb.from('tasks').insert(payload).select('id');
  if (ins.error && /description/.test(ins.error.message)) ins = await sb.from('tasks').insert(payload.map((r) => { const { description, ...rest } = r; void description; return rest; })).select('id');
  if (ins.error) { await audit(ctx, 'board.chat.apply', `board_thread:${id}`, { error: ins.error.message }, 'error'); throw new Error(ins.error.message); }
  const task_ids = (ins.data ?? []).map((r) => r.id as string);
  const result: BoardApplyResult = { created: task_ids.length, project_id: projectId, project_name: projectName, unmatched_assignees: [...unmatched], task_ids };
  await audit(ctx, 'board.chat.apply', `board_thread:${id}`, { message_id: message.id, project_id: projectId, created: task_ids.length, unmatched: result.unmatched_assignees, new_project: !!v.new_project });
  return ok(result, 201);
});
