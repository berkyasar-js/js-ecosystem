import { twinBidOutputSchema, type Task, type TaskBid } from '@jscore/contracts';
import type { Repo } from './repo/types';

/**
 * Görevi ihaleye açar. Demo: DemoRepo deterministik teklifleri kendi üretir (agents/demo.ts).
 * Supabase: aktif `twin_bid` promptu ile sunucu ajanı (POST /api/agents/run — maliyet tavanı dahil) çalışır, çıktı zod ile doğrulanıp yazılır.
 */
export async function requestBids(repo: Repo, task: Task, doFetch: typeof fetch = fetch): Promise<TaskBid[]> {
  if (repo.mode === 'demo') return repo.openTaskForBids(task.id);
  const twins = (await repo.listTwins()).filter((t) => t.kind === 'person' && !t.opt_out && t.employee_id && t.approved_by_owner_at);
  const input = {
    task: { id: task.id, title: task.title, task_type: task.task_type, priority: task.priority, planned_minutes: task.planned_minutes },
    twins: twins.map((t) => ({ id: t.id, employee_id: t.employee_id, name: t.name, skills: (t.profile.skills as string[]) ?? [], weekly_hours: Number(t.defaults.weekly_hours ?? 36) })),
  };
  if (!twins.length) throw new Error('Teklif verebilecek onaylı kişi ikizi yok');
  const res = await doFetch('/api/agents/run', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ agent: 'twin_bid', input }) });
  const j = (await res.json()) as { output?: unknown; error?: string };
  if (!res.ok || !j.output) throw new Error(j.error ?? 'twin_bid ajanı çalışmadı');
  return repo.openTaskForBids(task.id, twinBidOutputSchema.parse(j.output).bids);
}
