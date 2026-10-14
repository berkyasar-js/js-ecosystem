import type { Brand, InboxDraft, Task, TaskType } from '@jscore/contracts';

export interface QuotaResult {
  task_type: string; limit: number | null; used: number; requested: number; remaining: number; over_by: number;
  within: boolean; requires_approval: boolean; suggested_amount_minor: number;
}

/** Aylık sözleşme kotası kuralı: limit tanımlı ve used+requested > limit ise kapsam dışı → onay (scope) gerekir. */
export function evaluateQuota(opts: { quota: Record<string, number>; used: Record<string, number>; task_type: string; qty: number; unit_price_minor?: number }): QuotaResult {
  const limit = opts.quota[opts.task_type];
  const used = opts.used[opts.task_type] ?? 0;
  if (limit === undefined) {
    return { task_type: opts.task_type, limit: null, used, requested: opts.qty, remaining: Infinity, over_by: 0, within: true, requires_approval: false, suggested_amount_minor: 0 };
  }
  const remaining = Math.max(0, limit - used);
  const over_by = Math.max(0, used + opts.qty - limit);
  return {
    task_type: opts.task_type, limit, used, requested: opts.qty, remaining, over_by, within: over_by === 0,
    requires_approval: over_by > 0, suggested_amount_minor: over_by * (opts.unit_price_minor ?? 0),
  };
}

/** Markanın bu ayki kullanımı: kota anahtarına denk gelen görevlerin qty toplamı. */
export function usedThisMonth(tasks: Task[], projectBrand: Record<string, string>, brandId: string, now = new Date()): Record<string, number> {
  const ym = now.toISOString().slice(0, 7);
  const used: Record<string, number> = {};
  for (const t of tasks) {
    if (projectBrand[t.project_id] !== brandId) continue;
    if (!t.created_at.startsWith(ym) && !t.due_at.startsWith(ym)) continue;
    used[t.task_type] = (used[t.task_type] ?? 0) + t.qty;
  }
  return used;
}

export function annotateDrafts(drafts: InboxDraft[], brand: Brand | undefined, used: Record<string, number>, types: TaskType[]) {
  const running = { ...used };
  return drafts.map((d) => {
    const unit = types.find((t) => t.key === d.task_type)?.unit_price_minor ?? 0;
    const q = evaluateQuota({ quota: brand?.monthly_quota ?? {}, used: running, task_type: d.task_type, qty: d.qty, unit_price_minor: unit });
    running[d.task_type] = (running[d.task_type] ?? 0) + d.qty;
    return { ...d, quota: q };
  });
}
