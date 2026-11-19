import type { SupabaseClient } from '@supabase/supabase-js';
import type { Automation, Role } from '@jscore/contracts';
import { notify as notifyAll } from '@jscore/core/notify';
import { signBody } from '@jscore/core/hmac';
import { syncEvent } from '@jscore/core/integrations/trello-push';
import { syncHubSpotEvent } from '@jscore/core/integrations/hubspot-sync';
import type { HubSpotConfig, TrelloConfig } from '@jscore/contracts';
import type { DispatchPorts } from '@jscore/core/automations/dispatch';

type Row = Record<string, unknown>;
const flat = (r: Row) => { const { data, ...rest } = r; return { ...rest, ...((data as Row | null) ?? {}) }; };
const NOTIFY_ROLES: Role[] = ['owner', 'org_admin', 'operations'];

/** Servis rolüyle çalışır (RLS dışı) — yalnızca sunucu. Webhook gövdesi JSCORE_WEBHOOK_SECRET ile HMAC-SHA256 imzalanır (lib/hmac.ts). */
export function supabasePorts(sb: SupabaseClient, env: { webhookSecret?: string; fetch?: typeof fetch } = {}): DispatchPorts {
  const ok = async <T,>(p: PromiseLike<{ data: T | null; error: { message: string } | null }>) => { const { data, error } = await p; if (error) throw new Error(error.message); return data as T; };
  const doFetch = env.fetch ?? fetch;
  const trelloCfg = new Map<string, TrelloConfig | null>();
  const hubspotCfg = new Map<string, HubSpotConfig | null>();
  return {
    // Trello (görevler) + HubSpot (müşteri / kişi / fırsat) — biri hata verse diğeri sürer.
    integrationSync: async (ev) => {
      const errs: unknown[] = [];
      await syncEvent(sb, ev, trelloCfg).catch((e) => errs.push(e));
      await syncHubSpotEvent(sb, ev, hubspotCfg).catch((e) => errs.push(e));
      if (errs.length) throw errs[0];
    },
    now: () => new Date().toISOString(),
    async rules(org) { return (await ok<Row[]>(sb.from('automations').select('*').eq('org_id', org))).map((r) => flat(r) as unknown as Automation); },
    async logRun(org, run) { await ok(sb.from('automation_runs').insert({ org_id: org, data: run }).select('id')); },
    async touchRule(org, rule, firedAt) {
      const { id, org_id: _o, created_at: _c, brand_id: _b, ...data } = rule as unknown as Row;
      void _o; void _c; void _b;
      await ok(sb.from('automations').update({ data: { ...data, runs: (rule.runs ?? 0) + 1, last_fired_at: firedAt } }).eq('id', id as string).eq('org_id', org).select('id'));
    },
    async notify(org, n) {
      await notifyAll(sb, { org_id: org, kind: 'system', role: NOTIFY_ROLES, title: n.title, body: n.body, href: n.href });
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
