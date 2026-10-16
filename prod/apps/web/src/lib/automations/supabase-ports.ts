import type { SupabaseClient } from '@supabase/supabase-js';
import type { Automation } from '@jscore/contracts';
import { signBody } from '../hmac';
import { syncEvent } from '../integrations/trello-push';
import type { TrelloConfig } from '@jscore/contracts';
import type { DispatchPorts } from './dispatch';

type Row = Record<string, unknown>;
const flat = (r: Row) => { const { data, ...rest } = r; return { ...rest, ...((data as Row | null) ?? {}) }; };
const NOTIFY_ROLES = ['owner', 'org_admin', 'operations'];

/** Servis rolüyle çalışır (RLS dışı) — yalnızca sunucu. Webhook gövdesi JSCORE_WEBHOOK_SECRET ile HMAC-SHA256 imzalanır (lib/hmac.ts). */
export function supabasePorts(sb: SupabaseClient, env: { webhookSecret?: string; fetch?: typeof fetch } = {}): DispatchPorts {
  const ok = async <T,>(p: PromiseLike<{ data: T | null; error: { message: string } | null }>) => { const { data, error } = await p; if (error) throw new Error(error.message); return data as T; };
  const doFetch = env.fetch ?? fetch;
  const trelloCfg = new Map<string, TrelloConfig | null>();
  return {
    integrationSync: async (ev) => { await syncEvent(sb, ev, trelloCfg); },
    now: () => new Date().toISOString(),
    async rules(org) { return (await ok<Row[]>(sb.from('automations').select('*').eq('org_id', org))).map((r) => flat(r) as unknown as Automation); },
    async logRun(org, run) { await ok(sb.from('automation_runs').insert({ org_id: org, data: run }).select('id')); },
    async touchRule(org, rule, firedAt) {
      const { id, org_id: _o, created_at: _c, brand_id: _b, ...data } = rule as unknown as Row;
      void _o; void _c; void _b;
      await ok(sb.from('automations').update({ data: { ...data, runs: (rule.runs ?? 0) + 1, last_fired_at: firedAt } }).eq('id', id as string).eq('org_id', org).select('id'));
    },
    async notify(org, n) {
      const emps = await ok<Row[]>(sb.from('employees').select('id').eq('org_id', org).in('app_role', NOTIFY_ROLES));
      if (!emps.length) return;
      await ok(sb.from('notifications').insert(emps.map((e) => ({ org_id: org, data: { employee_id: e.id, kind: 'system', title: n.title, body: n.body, read: false, href: n.href } }))).select('id'));
    },
    async createTask(org, input) {
      const v = { planned_minutes: 0, qty: 1, priority: 'normal', ...input };
      return ok<{ id: string }>(sb.from('tasks').insert({ ...v, org_id: org }).select('id').single());
    },
    async setTaskState(org, id, state) { await ok(sb.from('tasks').update({ state }).eq('id', id).eq('org_id', org).select('id')); },
    async webhook(url, body) {
      if (!env.webhookSecret) throw new Error('JSCORE_WEBHOOK_SECRET tanımlı değil');
      const res = await doFetch(url, { method: 'POST', headers: { 'content-type': 'application/json', 'x-jscore-signature': `sha256=${signBody(body, env.webhookSecret)}` }, body, signal: AbortSignal.timeout(8000), redirect: 'error' });
      if (!res.ok) throw new Error(`Webhook ${res.status} döndü`);
    },
  };
}
