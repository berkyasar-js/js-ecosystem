import { agentSpendTry, boardApplySchema, decideAgentWrite, type AgentActionPayload, type AgentPolicy, type BoardApplyResult } from '@jscore/contracts';
import { DEFAULT_USD_TRY } from '@jscore/core/agents/cap';
import { json } from '@jscore/core/api';
import { getRepo } from '@jscore/core/repo';
import { audit, adminRoute, ok } from '@/lib/route';
import { chatStore, dueAt, matchEmployee, orgSnapshot, sourceRef, taskDescription } from '@/lib/board-chat';
import { readSettings } from '@/lib/settings';

export const dynamic = 'force-dynamic';
type P = { params: Promise<{ id: string }> };

/**
 * Plandaki seçili görevleri sisteme aktarır. 0017 ajan yönetişimi: CHAIR politikası (agent_policies) 'Uygula' değilse ya da bütçe/otomatik onay kuralı
 * izin vermiyorsa görevler yerine `approvals` (action_type='agent', subject.payload) açılır; owner Gelen Kutusu / Onay Merkezi / panelden onaylayınca
 * `executeAgentAction` uygular (kim onayladı = kim yazdı). 'Uygula' modunda servis rolüyle doğrudan yazılır: proje (gerekirse) → kilometre taşları → görevler → proje üyeleri.
 * Atanan adı çalışan adına aksan duyarsız eşlenir; eşleşmeyenler atanmadan oluşturulur ve yanıtta listelenir.
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
  const msOf = (t: typeof picked[number]) => plan.milestones?.find((m) => m.tasks.includes(t.title))?.name ?? null;
  const rows = picked.map((t) => {
    const hint = plan.assignments.find((a) => t.assignee_name && a.employee_name === t.assignee_name);
    const emp = t.assignee_name ? matchEmployee(t.assignee_name, snap.employees, hint ? { employee_id: hint.employee_id, employee_code: hint.employee_code } : undefined) : null;
    if (t.assignee_name && !emp) unmatched.add(t.assignee_name);
    const labels = Array.from(new Set(['kurul', ...(t.phase ? [t.phase.trim()] : [])].filter(Boolean)));
    return { title: t.title, assignee_id: emp?.id ?? null, priority: t.priority, planned_minutes: t.estimate_minutes, due_at: dueAt(snap.today, t.due_in_days), labels, description: taskDescription(t.description, t.acceptance) ?? undefined, milestone: msOf(t) };
  });
  const milestones = (plan.milestones ?? []).map((m) => ({ name: m.name, due_at: dueAt(snap.today, m.due_in_days) }));
  const members = Array.from(new Set(plan.assignments.map((a) => matchEmployee(a.employee_name, snap.employees, { employee_id: a.employee_id, employee_code: a.employee_code })?.id).filter((x): x is string => !!x)));

  // Proje seçimi / yeni proje için marka
  let brandId: string | null = null;
  if (!v.project_id && v.new_project) {
    const np = v.new_project;
    brandId = np.brand_id ?? null;
    if (brandId && !snap.brands.some((b) => b.id === brandId)) return json({ error: 'Marka bulunamadı' }, 404);
    if (!brandId && np.client_id) brandId = snap.brands.find((b) => b.client_id === np.client_id)?.id ?? null;
    if (!brandId) brandId = snap.brands[0]?.id ?? null;
    if (!brandId) return json({ error: 'Yeni proje için en az bir marka tanımlı olmalı (projeler bir markaya bağlıdır)' }, 400);
  }
  if (v.project_id && !snap.projects.some((p) => p.id === v.project_id)) return json({ error: 'Proje bulunamadı' }, 404);
  const payload: AgentActionPayload = { kind: 'board_plan_apply', project_id: v.project_id, new_project: v.new_project && brandId ? { name: v.new_project.name, brand_id: brandId } : undefined, tasks: rows, milestones, members };

  /* ───── Politika: CHAIR modu + aylık bütçe (₺) ───── */
  const repo = await getRepo();
  const policies = ctx.sb
    ? ((await ctx.sb.from('agent_policies').select('agent,data').eq('org_id', ctx.orgId)).data ?? []).map((r) => ({ agent: r.agent as string, ...(r.data as Omit<AgentPolicy, 'agent'>) }))
    : await repo.list('agent_policies').catch(() => [] as AgentPolicy[]);
  const policy = policies.find((p) => p.agent === 'chair') ?? null;
  const settings = ctx.sb ? (await readSettings(ctx.sb, ctx.orgId)).settings : await repo.getSettings();
  const usdTry = settings.ai.usd_try ?? DEFAULT_USD_TRY;
  const month = snap.today.slice(0, 7);
  const runs = ctx.sb ? ((await ctx.sb.from('agent_runs').select('agent,cost_usd,created_at').eq('org_id', ctx.orgId).gte('created_at', `${month}-01`)).data ?? []) as Array<{ agent: string; cost_usd: number; created_at: string }> : await repo.listAgentRuns();
  const verdict = decideAgentWrite(policy, { action: 'task.create', items: rows.length, spent_try: agentSpendTry(runs, 'chair', month, usdTry) });
  if (verdict.verdict === 'blocked') { await audit(ctx, 'board.chat.apply', `board_thread:${id}`, { blocked: verdict.reason }, 'deny'); return json({ error: verdict.reason, code: 'budget_exceeded' }, 402); }

  if (verdict.verdict === 'approval') {
    const projectName = v.project_id ? snap.projects.find((p) => p.id === v.project_id)?.name ?? '' : v.new_project?.name ?? '';
    const title = `Kurul planı: ${projectName || 'proje'} · ${rows.length} görev`;
    const due = dueAt(snap.today, 3) ?? new Date().toISOString();
    const approval = await repo.createApproval({ action_type: 'agent', title, required_role: 'owner', due_at: due, subject: { project_id: v.project_id, brand_id: brandId ?? undefined, agent: 'chair', run_id: message.id, note: verdict.reason, payload } });
    await audit(ctx, 'board.chat.apply', `board_thread:${id}`, { message_id: message.id, approval_id: approval.id, reason: verdict.reason, tasks: rows.length, mode: policy?.mode ?? 'ask' });
    const r: BoardApplyResult = { created: 0, project_id: v.project_id ?? '', project_name: projectName, unmatched_assignees: [...unmatched], task_ids: [], pending_approval: true, approval_id: approval.id, demo: !ctx.sb || undefined };
    return ok(r, 202);
  }

  /* ───── 'Uygula' modu: doğrudan yaz ───── */
  if (!ctx.sb) {
    // Demo: sunucu tarafı demo deposu kalıcı değildir; yalnızca sonucu simüle et.
    const project = v.project_id ? snap.projects.find((p) => p.id === v.project_id) : null;
    const r: BoardApplyResult = { created: rows.length, project_id: project?.id ?? 'demo', project_name: project?.name ?? v.new_project?.name ?? 'Yeni proje', unmatched_assignees: [...unmatched], task_ids: [], demo: true, milestones: milestones.length, members: members.length };
    return ok(r, 201);
  }
  const sb = ctx.sb;
  let projectId = v.project_id ?? null;
  let projectName = '';
  if (projectId) {
    projectName = snap.projects.find((p) => p.id === projectId)?.name ?? '';
  } else if (v.new_project && brandId) {
    const np = v.new_project;
    const { data, error } = await sb.from('projects').insert({ org_id: ctx.orgId, brand_id: brandId, name: np.name, type: 'kurul', status: 'active', summary: plan.summary || null, source_ref: ref }).select('id,name').single();
    if (error) {
      const retry = await sb.from('projects').insert({ org_id: ctx.orgId, brand_id: brandId, name: np.name, type: 'kurul', status: 'active', summary: plan.summary || null }).select('id,name').single();
      if (retry.error) { await audit(ctx, 'board.chat.apply', `board_thread:${id}`, { error: retry.error.message }, 'error'); throw new Error(retry.error.message); }
      projectId = retry.data.id as string; projectName = retry.data.name as string;
    } else { projectId = data.id as string; projectName = data.name as string; }
    await audit(ctx, 'project.create', `project:${projectId}`, { name: projectName, brand_id: brandId, from: ref });
  }
  if (!projectId) return json({ error: 'Proje seçilmedi' }, 400);

  // Kilometre taşları (0017 tablosu yoksa sessizce atlanır)
  const msIds = new Map<string, string>();
  for (const m of milestones) {
    const r = await sb.from('milestones').insert({ org_id: ctx.orgId, project_id: projectId, status: 'planned', due_at: m.due_at, data: { name: m.name } }).select('id').single();
    if (!r.error) msIds.set(m.name, r.data.id as string);
  }
  const base = rows.map(({ milestone, ...r }) => ({ ...r, org_id: ctx.orgId, project_id: projectId, source_ref: ref, state: 'brief' as const, task_type: 'general', milestone_id: milestone ? msIds.get(milestone) ?? null : null }));
  let ins = await sb.from('tasks').insert(base).select('id');
  if (ins.error && /milestone_id/.test(ins.error.message)) ins = await sb.from('tasks').insert(base.map(({ milestone_id, ...r }) => { void milestone_id; return r; })).select('id');
  if (ins.error && /description/.test(ins.error.message)) ins = await sb.from('tasks').insert(base.map(({ description, milestone_id, ...r }) => { void description; void milestone_id; return r; })).select('id');
  if (ins.error) { await audit(ctx, 'board.chat.apply', `board_thread:${id}`, { error: ins.error.message }, 'error'); throw new Error(ins.error.message); }
  const task_ids = (ins.data ?? []).map((r) => r.id as string);
  // Proje üyeleri: plandaki atananlar + görev sorumluları (katılımcı); tekrar varsa yok sayılır
  const want = Array.from(new Set([...members, ...rows.map((r) => r.assignee_id).filter((x): x is string => !!x)]));
  let added = 0;
  if (want.length) {
    const have = new Set((((await sb.from('project_members').select('employee_id').eq('project_id', projectId)).data ?? []) as Array<{ employee_id: string }>).map((r) => r.employee_id));
    const rowsM = want.filter((e) => !have.has(e)).map((employee_id) => ({ org_id: ctx.orgId, project_id: projectId, employee_id, role: 'collaborator' }));
    if (rowsM.length) { const r = await sb.from('project_members').insert(rowsM); if (!r.error) added = rowsM.length; }
  }
  const result: BoardApplyResult = { created: task_ids.length, project_id: projectId, project_name: projectName, unmatched_assignees: [...unmatched], task_ids, milestones: msIds.size, members: added };
  await audit(ctx, 'board.chat.apply', `board_thread:${id}`, { message_id: message.id, project_id: projectId, created: task_ids.length, unmatched: result.unmatched_assignees, new_project: !!v.new_project, milestones: msIds.size, members: added, mode: 'act' });
  return ok(result, 201);
});
