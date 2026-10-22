import type { SupabaseClient } from '@supabase/supabase-js';
import { adminRoute, ok, requireService, isResponse } from '@/lib/route';
import { readSettings } from '@/lib/settings';
import { capStatus } from '@jscore/core/agents/cap';

export const dynamic = 'force-dynamic';

const count = async (sb: SupabaseClient, table: string, org: string) => {
  const { count: c, error } = await sb.from(table).select('id', { count: 'exact', head: true }).eq('org_id', org);
  return error ? null : c ?? 0;
};

export const GET = adminRoute(async (ctx) => {
  const sb = requireService(ctx); if (isResponse(sb)) return sb;
  const org = ctx.orgId;
  const month = new Date().toISOString().slice(0, 7);
  const [settings, members, disabled, employees, projects, tasks, approvals, tokens, backlog, lastDone, trello, syncErr, recent, runs] = await Promise.all([
    readSettings(sb, org),
    sb.from('memberships').select('user_id', { count: 'exact', head: true }).eq('org_id', org).eq('status', 'active'),
    sb.from('memberships').select('user_id', { count: 'exact', head: true }).eq('org_id', org).eq('status', 'disabled'),
    count(sb, 'employees', org), count(sb, 'projects', org), count(sb, 'tasks', org),
    sb.from('approvals').select('id', { count: 'exact', head: true }).eq('org_id', org).eq('status', 'pending'),
    sb.from('access_tokens').select('id', { count: 'exact', head: true }).eq('org_id', org).is('revoked_at', null),
    sb.from('events').select('id', { count: 'exact', head: true }).eq('org_id', org).is('processed_at', null),
    sb.from('events').select('processed_at').eq('org_id', org).not('processed_at', 'is', null).order('processed_at', { ascending: false }).limit(1),
    sb.from('integrations').select('status,config,last_sync_at').eq('org_id', org).eq('provider', 'trello').maybeSingle(),
    sb.from('integration_sync_log').select('id', { count: 'exact', head: true }).eq('org_id', org).eq('ok', false).gte('created_at', new Date(Date.now() - 864e5).toISOString()),
    sb.from('audit_events').select('id,actor,action,resource,outcome,occurred_at').eq('org_id', org).order('occurred_at', { ascending: false }).limit(10),
    sb.from('agent_runs').select('cost_usd,status,created_at').eq('org_id', org).gte('created_at', `${month}-01`).order('created_at', { ascending: false }).limit(1000),
  ]);
  const spent = (runs.data ?? []).reduce((a, r) => a + Number(r.cost_usd), 0);
  const cfg = (trello.data?.config ?? {}) as { token?: string; api_key?: string; mode?: string; webhook_ids?: Record<string, string> };
  const lastProcessed = (lastDone.data?.[0]?.processed_at as string | undefined) ?? null;
  const backlogN = backlog.count ?? 0;
  const cronStale = backlogN > 0 && (!lastProcessed || Date.now() - Date.parse(lastProcessed) > 30 * 60_000);
  return ok({
    health: {
      supabase: { ok: true, detail: 'Servis rolü bağlantısı çalışıyor' },
      anthropic: { ok: Boolean(process.env.ANTHROPIC_API_KEY), detail: process.env.ANTHROPIC_API_KEY ? 'ANTHROPIC_API_KEY tanımlı (yönetim panelinde)' : 'Yönetim panelinde ANTHROPIC_API_KEY yok — Kurul çalıştırılamaz' },
      trello: { ok: !!(cfg.api_key && cfg.token), detail: cfg.api_key && cfg.token ? `Bağlı · mod ${cfg.mode ?? 'two_way'} · ${Object.keys(cfg.webhook_ids ?? {}).length} webhook · son eşitleme ${trello.data?.last_sync_at ?? '—'}` : 'Bağlı değil' },
      cron: { ok: !cronStale, detail: lastProcessed ? `Son işlenen olay ${lastProcessed} · bekleyen ${backlogN}` : backlogN ? `${backlogN} olay bekliyor, hiç işlenmemiş` : 'Bekleyen olay yok' },
      env: { service_role: Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY), app_url: Boolean(process.env.NEXT_PUBLIC_APP_URL), cron_secret: Boolean(process.env.CRON_SECRET), webhook_secret: Boolean(process.env.JSCORE_WEBHOOK_SECRET) },
    },
    counts: { members: members.count ?? 0, disabled: disabled.count ?? 0, employees, projects, tasks, pending_approvals: approvals.count ?? 0, api_tokens: tokens.count ?? 0, sync_errors_24h: syncErr.count ?? 0 },
    ai: capStatus(spent, settings.settings.ai),
    recent_audit: recent.data ?? [],
    org: { name: settings.name, slug: settings.slug },
  });
});
