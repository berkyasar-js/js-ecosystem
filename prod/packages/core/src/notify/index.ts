import type { SupabaseClient } from '@supabase/supabase-js';
import { isDuplicate, orgRuleAllows, resolveAudience, type AudienceInput, type AudienceMember, type NotificationKind, type NotificationRule, type Role } from '@jscore/contracts';
import type { Repo } from '../repo/types';

/**
 * Tek bildirim kapısı: her üretici (görev atama, anma, yorum, onay, talep, duyuru, kurul, Trello, cron) buradan geçer.
 * Hedef kitle (kişi / rol / ekip / herkes) → org kuralı (notification_rules, in_app) → 24 sa tekilleştirme (employee_id + dedupe_key) → `notifications.data` satırı.
 * Kaynak ya kullanıcı bağlamındaki Repo (RLS; demo + Supabase aynı) ya da servis rolü istemcisi (cron / yönetim).
 * E-posta burada gönderilmez: satır yazılır, `/api/jobs/notify` anlık e-posta / özet için tercihleri okuyup gönderir (tarayıcıdan sır çıkmaz).
 */
export interface NotifyInput extends AudienceInput {
  /** Servis rolü yolunda zorunlu; Repo yolunda repo'nun aktif organizasyonu kullanılır. */
  org_id?: string;
  kind: NotificationKind; title: string; body: string; href?: string;
  /** Aynı kişi için 24 saat içinde tekrarı önler (ör. `due:<task>:<tarih>`). */
  dedupe_key?: string;
}
export interface NotifyResult { recipients: string[]; inserted: number; skipped: number }
export type NotifySink = Repo | SupabaseClient;

interface NotifyIO {
  team(orgId: string | undefined): Promise<AudienceMember[]>;
  rules(orgId: string | undefined): Promise<NotificationRule[]>;
  recent(orgId: string | undefined, key: string, nowIso: string): Promise<Array<{ employee_id: string; dedupe_key?: string | null; created_at: string }>>;
  insert(orgId: string | undefined, rows: Array<Record<string, unknown>>): Promise<void>;
}
const isRepo = (s: NotifySink): s is Repo => typeof (s as Repo).listNotificationRules === 'function' && typeof (s as Repo).save === 'function';
type Row = Record<string, unknown>;

function repoIO(repo: Repo): NotifyIO {
  return {
    team: async () => (await repo.team()) as AudienceMember[],
    rules: () => repo.listNotificationRules().catch(() => [] as NotificationRule[]),
    recent: async (_o, key, nowIso) => {
      const since = new Date(new Date(nowIso).getTime() - 24 * 3600 * 1000).toISOString();
      const rows = await repo.listNotifications({ since, dedupe_key: key, limit: 500 }).catch(() => []);
      return rows.map((n) => ({ employee_id: n.employee_id, dedupe_key: n.dedupe_key, created_at: n.created_at }));
    },
    insert: async (_o, rows) => { for (const r of rows) await repo.save('notifications', r as never).catch(() => undefined); },
  };
}
const flat = (r: Row) => { const { data, ...rest } = r; return { ...rest, ...((data as Row | null) ?? {}) }; };
export function adminIO(sb: SupabaseClient): NotifyIO {
  const ok = async <T,>(p: PromiseLike<{ data: T | null; error: { message: string } | null }>) => { const { data, error } = await p; if (error) throw new Error(error.message); return data as T; };
  return {
    team: async (org) => (await ok<Row[]>(sb.from('employees').select('id,app_role,status,team').eq('org_id', org!))) as unknown as AudienceMember[],
    rules: async (org) => (await ok<Row[]>(sb.from('notification_rules').select('*').eq('org_id', org!))).map((r) => ({ id: r.id as string, event_type: r.event_type as string, channel: r.channel as NotificationRule['channel'], roles: (r.roles as Role[]) ?? [], enabled: r.enabled !== false })),
    recent: async (org, key, nowIso) => {
      const since = new Date(new Date(nowIso).getTime() - 24 * 3600 * 1000).toISOString();
      const rows = await ok<Row[]>(sb.from('notifications').select('created_at,data').eq('org_id', org!).gte('created_at', since).filter('data->>dedupe_key', 'eq', key));
      return rows.map((r) => { const f = flat(r); return { employee_id: f.employee_id as string, dedupe_key: f.dedupe_key as string, created_at: f.created_at as string }; });
    },
    insert: async (org, rows) => { if (rows.length) await ok(sb.from('notifications').insert(rows.map((data) => ({ org_id: org, data }))).select('id')); },
  };
}

export async function notify(sink: NotifySink, input: NotifyInput, now?: () => string): Promise<NotifyResult> {
  const io = isRepo(sink) ? repoIO(sink) : adminIO(sink);
  now ??= isRepo(sink) && sink.clock ? () => sink.clock!() : () => new Date().toISOString();
  if (!isRepo(sink) && !input.org_id) throw new Error('notify: servis rolü yolunda org_id gerekli');
  const team = await io.team(input.org_id).catch(() => [] as AudienceMember[]);
  const needsTeam = !!(input.role || input.team || input.all);
  const audience = resolveAudience(input, team);
  if (!audience.length) return { recipients: [], inserted: 0, skipped: 0 };
  const rules = await io.rules(input.org_id);
  const nowIso = now();
  const recent = input.dedupe_key ? await io.recent(input.org_id, input.dedupe_key, nowIso).catch(() => []) : [];
  const roleOf = (id: string): Role | null => team.find((t) => t.id === id)?.app_role ?? null;
  const rows: Row[] = [];
  let skipped = 0;
  for (const id of audience) {
    const role = roleOf(id);
    // Rol bilinmiyorsa (ekip okunamadı) kural uygulanmaz; açık kimlikle gelen alıcı yazılır.
    if (role && !orgRuleAllows(rules, input.kind, 'in_app', role)) { skipped++; continue; }
    if (!role && needsTeam) { skipped++; continue; }
    if (isDuplicate(recent, id, input.dedupe_key, nowIso)) { skipped++; continue; }
    rows.push({ employee_id: id, kind: input.kind, title: input.title, body: input.body, read: false, href: input.href ?? '/app/inbox', dedupe_key: input.dedupe_key ?? null });
  }
  await io.insert(input.org_id, rows);
  return { recipients: rows.map((r) => r.employee_id as string), inserted: rows.length, skipped };
}

/** Kısa yol: belirli kişilere (eylemi yapan hariç). */
export const notifyEmployees = (sink: NotifySink, ids: Iterable<string>, n: Omit<NotifyInput, 'employee_ids'>, except?: string | null) =>
  notify(sink, { ...n, employee_ids: [...new Set(ids)], except: except ?? n.except ?? null });
