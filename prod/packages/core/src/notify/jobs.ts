import type { SupabaseClient } from '@supabase/supabase-js';
import {
  INSTANT_EMAIL_KINDS, coerceNotificationPrefs, digestDue, dueScanOpen, localParts, normalizeKind, resolveDelivery,
  type Approval, type ApprovalStep, type Delegation, type NotificationPrefs, type NotificationRule, type Role, type Task, type TeamMember,
} from '@jscore/contracts';
import { myTurn } from '../approvals/engine';
import { adminIO, notify } from './index';
import { sendEmail, type EmailResult } from './email';
import { resolveOrgSender } from './email-gmail';
import { buildDigest, renderDigestEmail, renderInstantEmail, type MailCtx } from './templates';
import { signUnsubscribe, unsubscribeUrl } from './unsubscribe';

/**
 * Bildirim işleri (servis rolü; cron `/api/jobs/notify`, 5 dk):
 *  instant — anlık e-posta (onay istendi / anma / atandı): tercih + org kuralı + sessiz saat; sonucu notifications.data.email_state + email_log
 *  due     — yerel 08:00 sonrası günde bir kez: geciken / bugün biten görevler → sorumluya uygulama içi bildirim (dedupe tarih içerir)
 *  trello  — son penceredeki Trello kaynaklı (pull) görev değişiklikleri → sorumluya (günde bir kez / görev)
 *  digest  — günlük 08:30 (org saat dilimi) / haftalık Pazartesi: bugün biten + geciken + bekleyen onaylar + okunmamış sayısı + duyurular
 */
export type NotifyJob = 'instant' | 'due' | 'trello' | 'digest';
export interface JobDeps { now?: () => string; send?: typeof sendEmail; appUrl?: string; secret?: string; /** Trello penceresi (dk). */ trelloWindowMin?: number; /** Özet penceresini yok say (test gönderimi). */ force?: boolean; only?: NotifyJob[] }
export interface JobReport { orgs: number; instant: { checked: number; sent: number; skipped: number; digest: number; errors: number }; due: { notified: number }; trello: { notified: number }; digest: { sent: number; skipped: number; errors: number }; errors: string[] }

type Row = Record<string, unknown>;
const flat = <T,>(r: Row): T => { const { data, ...rest } = r; return { ...rest, ...((data as Row | null) ?? {}) } as T; };
const isDone = (t: Pick<Task, 'state'>) => t.state === 'delivery' || t.state === 'archive';
interface Emp extends TeamMember { auth_user_id: string | null }
interface Person { emp: Emp; email: string | null; prefs: NotificationPrefs }

export async function runNotifyJobs(sb: SupabaseClient, deps: JobDeps = {}): Promise<JobReport> {
  const now = deps.now ?? (() => new Date().toISOString());
  /** `deps.send` verilmezse org başına sağlayıcı çözülür (Gmail posta kutusu / Resend / günlük — settings.notifications.email_provider). */
  const defaultSend = deps.send;
  const appUrl = deps.appUrl ?? process.env.NEXT_PUBLIC_APP_URL ?? 'https://js-ecosystem-app.vercel.app';
  const secret = deps.secret ?? process.env.JSCORE_WEBHOOK_SECRET ?? '';
  const only = new Set<NotifyJob>(deps.only ?? ['instant', 'due', 'trello', 'digest']);
  const rep: JobReport = { orgs: 0, instant: { checked: 0, sent: 0, skipped: 0, digest: 0, errors: 0 }, due: { notified: 0 }, trello: { notified: 0 }, digest: { sent: 0, skipped: 0, errors: 0 }, errors: [] };
  const ok = async <T,>(p: PromiseLike<{ data: T | null; error: { message: string } | null }>) => { const { data, error } = await p; if (error) throw new Error(error.message); return data as T; };
  const orgs = await ok<Array<{ id: string; name: string; settings: Row | null }>>(sb.from('organizations').select('id,name,settings'));
  rep.orgs = orgs.length;
  const userCache = new Map<string, string | null>();
  const emailOf = async (uid: string | null) => {
    if (!uid) return null;
    if (!userCache.has(uid)) { const { data } = await sb.auth.admin.getUserById(uid).catch(() => ({ data: { user: null } })); userCache.set(uid, data.user?.email ?? null); }
    return userCache.get(uid) ?? null;
  };
  const logEmail = async (org: string, userId: string | null, kind: string, to: string, subject: string, r: EmailResult) =>
    sb.from('email_log').insert({ org_id: org, user_id: userId, kind, to_email: to, subject, status: r.status, provider_id: r.provider_id ?? null, error: r.error ?? null }).then(() => undefined, () => undefined);

  for (const org of orgs) {
    const nowIso = now();
    const settings = (org.settings ?? {}) as { general?: { timezone?: string; name?: string } };
    const tz = settings.general?.timezone || 'Europe/Istanbul';
    const lp = localParts(nowIso, tz);
    const orgName = settings.general?.name || org.name;
    try {
      const emps = (await ok<Row[]>(sb.from('employees').select('id,org_id,name,role_title,app_role,status,weekly_hours,team,manager_id,auth_user_id').eq('org_id', org.id))) as unknown as Emp[];
      const uids = emps.map((e) => e.auth_user_id).filter((x): x is string => !!x);
      const prefRows = uids.length ? await ok<Array<{ user_id: string; prefs: Row }>>(sb.from('user_prefs').select('user_id,prefs').in('user_id', uids)) : [];
      const prefsOf = (uid: string | null) => coerceNotificationPrefs((prefRows.find((p) => p.user_id === uid)?.prefs as { notifications?: unknown } | undefined)?.notifications);
      const people = new Map<string, Person>();
      for (const emp of emps) people.set(emp.id, { emp, email: null, prefs: prefsOf(emp.auth_user_id) });
      const rules = await adminIO(sb).rules(org.id).catch(() => [] as NotificationRule[]);
      const send: typeof sendEmail = defaultSend ?? (await resolveOrgSender(sb, org.id).then((r) => r.send, () => sendEmail));
      const mail = async (p: Person, kind: 'email' | 'digest', m: { subject: string; html: string; text: string }, logKind: string) => {
        p.email ??= await emailOf(p.emp.auth_user_id);
        if (!p.email) return { status: 'skipped', provider: 'log', error: 'Çalışanın e-posta adresi yok (auth bağlı değil)' } as EmailResult;
        const unsub = secret && p.emp.auth_user_id ? unsubscribeUrl(appUrl, signUnsubscribe({ u: p.emp.auth_user_id, k: kind }, secret)) : undefined;
        const r = await send({ to: p.email, subject: m.subject, html: m.html, text: m.text, unsubscribeUrl: unsub });
        await logEmail(org.id, p.emp.auth_user_id, logKind, p.email, m.subject, r);
        return r;
      };
      const ctxFor = (p: Person, kind: 'email' | 'digest'): MailCtx => ({ appUrl, orgName, recipientName: p.emp.name, preferencesUrl: `${appUrl}/app/profile?tab=notifications`, unsubscribeUrl: secret && p.emp.auth_user_id ? unsubscribeUrl(appUrl, signUnsubscribe({ u: p.emp.auth_user_id, k: kind }, secret)) : null });

      /* ── instant ── */
      if (only.has('instant')) {
        const since = new Date(new Date(nowIso).getTime() - 24 * 3600 * 1000).toISOString();
        const rows = await ok<Row[]>(sb.from('notifications').select('id,created_at,data').eq('org_id', org.id).gte('created_at', since).is('data->>email_state', null).order('created_at').limit(200));
        for (const r of rows) {
          const d = (r.data as Row) ?? {};
          const kind = normalizeKind(d.kind as string);
          const p = people.get(d.employee_id as string);
          rep.instant.checked++;
          let state: 'sent' | 'skipped' | 'digest' | 'error' = 'skipped';
          if (p && INSTANT_EMAIL_KINDS.includes(kind)) {
            const del = resolveDelivery({ prefs: p.prefs, rules, kind, role: p.emp.app_role as Role, localHhmm: lp.hhmm });
            if (del.email === 'instant') {
              const res = await mail(p, 'email', renderInstantEmail({ kind, title: String(d.title ?? ''), body: String(d.body ?? ''), href: d.href as string | undefined }, ctxFor(p, 'email')), `instant:${kind}`);
              state = res.status === 'sent' ? 'sent' : res.status === 'error' ? 'error' : 'skipped';
            } else if (del.email === 'digest') state = 'digest';
          } else if (p && kind !== 'system') state = 'digest';
          rep.instant[state === 'sent' ? 'sent' : state === 'error' ? 'errors' : state === 'digest' ? 'digest' : 'skipped']++;
          await sb.from('notifications').update({ data: { ...d, email_state: state } }).eq('id', r.id as string);
        }
      }

      const needTasks = only.has('due') || only.has('digest') || only.has('trello');
      const tasks = needTasks ? ((await ok<Row[]>(sb.from('tasks').select('id,org_id,project_id,title,assignee_id,state,priority,due_at,created_at,sync_origin,synced_at').eq('org_id', org.id).not('assignee_id', 'is', null))) as unknown as Task[]) : [];
      const open = tasks.filter((t) => !isDone(t));

      /* ── due / overdue (uygulama içi, günde bir) ── */
      if (only.has('due') && (deps.force || dueScanOpen(lp))) {
        const byEmp = new Map<string, { overdue: Task[]; today: Task[] }>();
        for (const t of open) {
          const d = t.due_at?.slice(0, 10); if (!d || d > lp.date || !t.assignee_id) continue;
          const b = byEmp.get(t.assignee_id) ?? { overdue: [], today: [] };
          (d < lp.date ? b.overdue : b.today).push(t); byEmp.set(t.assignee_id, b);
        }
        for (const [emp, b] of byEmp) {
          if (b.overdue.length) {
            const one = b.overdue.length === 1 ? b.overdue[0] : null;
            const r = await notify(sb, { org_id: org.id, kind: 'task_overdue', employee_ids: [emp], title: one ? `Gecikti: ${one.title}` : `${b.overdue.length} görevin gecikti`, body: one ? `Teslim ${one.due_at?.slice(0, 10)} idi` : b.overdue.slice(0, 3).map((t) => t.title).join(' · '), href: one ? `/app/projects/${one.project_id}?task=${one.id}` : '/app/mywork', dedupe_key: `overdue:${lp.date}` }, now);
            rep.due.notified += r.inserted;
          }
          if (b.today.length) {
            const one = b.today.length === 1 ? b.today[0] : null;
            const r = await notify(sb, { org_id: org.id, kind: 'task_due', employee_ids: [emp], title: one ? `Bugün teslim: ${one.title}` : `Bugün ${b.today.length} işin bitiyor`, body: one ? 'Bugün teslim edilmeli' : b.today.slice(0, 3).map((t) => t.title).join(' · '), href: one ? `/app/projects/${one.project_id}?task=${one.id}` : '/app/mywork', dedupe_key: `due:${lp.date}` }, now);
            rep.due.notified += r.inserted;
          }
        }
      }

      /* ── trello kaynaklı değişiklikler ── */
      if (only.has('trello')) {
        const since = new Date(new Date(nowIso).getTime() - (deps.trelloWindowMin ?? 15) * 60000).toISOString();
        const log = await ok<Row[]>(sb.from('integration_sync_log').select('entity_id,action,created_at').eq('org_id', org.id).eq('provider', 'trello').eq('direction', 'pull').eq('entity', 'task').eq('ok', true).gte('created_at', since).limit(200)).catch(() => [] as Row[]);
        for (const id of new Set(log.map((l) => l.entity_id as string).filter(Boolean))) {
          const t = tasks.find((x) => x.id === id);
          if (!t?.assignee_id) continue;
          const r = await notify(sb, { org_id: org.id, kind: 'trello_change', employee_ids: [t.assignee_id], title: `Trello’da değişti: ${t.title}`, body: 'Görevin Trello tarafında güncellendi', href: `/app/projects/${t.project_id}?task=${t.id}`, dedupe_key: `trello:${t.id}:${lp.date}` }, now);
          rep.trello.notified += r.inserted;
        }
      }

      /* ── özet ── */
      if (only.has('digest')) {
        const candidates = [...people.values()].filter((p) => p.emp.status !== 'left' && p.emp.auth_user_id && p.prefs.channels.email && p.prefs.digest !== 'off');
        if (candidates.length) {
          const kinds = new Set(candidates.map((p) => p.prefs.digest));
          const windowOpen = deps.force || [...kinds].some((k) => digestDue(k as 'daily' | 'weekly', lp, null));
          if (windowOpen) {
            const sinceLog = new Date(new Date(nowIso).getTime() - 8 * 86400000).toISOString();
            const logs = await ok<Array<{ user_id: string; kind: string; created_at: string }>>(sb.from('email_log').select('user_id,kind,created_at').eq('org_id', org.id).in('kind', ['digest_daily', 'digest_weekly']).gte('created_at', sinceLog));
            const lastOf = (uid: string, kind: string) => logs.filter((l) => l.user_id === uid && l.kind === kind).map((l) => localParts(l.created_at, tz).date).sort().pop() ?? null;
            const [approvals, steps, delegations, anns, notes] = await Promise.all([
              ok<Approval[]>(sb.from('approvals').select('*').eq('org_id', org.id).eq('status', 'pending')),
              ok<Row[]>(sb.from('approval_steps').select('*').eq('org_id', org.id).eq('status', 'pending')).then((r) => r.map((x) => flat<ApprovalStep>(x))).catch(() => [] as ApprovalStep[]),
              ok<Row[]>(sb.from('delegations').select('*').eq('org_id', org.id).eq('status', 'active')).then((r) => r.map((x) => flat<Delegation>(x))).catch(() => [] as Delegation[]),
              ok<Row[]>(sb.from('announcements').select('id,created_at,data').eq('org_id', org.id).gte('created_at', sinceLog)).then((r) => r.map((x) => flat<{ id: string; title: string; created_at: string }>(x))).catch(() => []),
              ok<Row[]>(sb.from('notifications').select('id,data').eq('org_id', org.id).filter('data->>read', 'eq', 'false')).catch(() => [] as Row[]),
            ]);
            const allSteps = steps.length ? steps : [];
            for (const p of candidates) {
              const kind = p.prefs.digest as 'daily' | 'weekly';
              const logKind = `digest_${kind}`;
              if (!deps.force && !digestDue(kind, lp, lastOf(p.emp.auth_user_id!, logKind))) continue;
              try {
                const turn = myTurn({ role: p.emp.app_role as Role, employee_id: p.emp.id }, approvals, allSteps, { team: emps, delegations, now: nowIso });
                const content = buildDigest({ period: kind, today: lp.date, since: kind === 'weekly' ? new Date(new Date(`${lp.date}T00:00:00Z`).getTime() - 7 * 86400000).toISOString().slice(0, 10) : undefined, employeeId: p.emp.id, tasks: open, approvals: approvals.filter((a) => turn.has(a.id)), unread: notes.filter((n) => ((n.data as Row) ?? {}).employee_id === p.emp.id).length, announcements: anns });
                if (content.empty) { p.email ??= await emailOf(p.emp.auth_user_id); await logEmail(org.id, p.emp.auth_user_id, logKind, p.email ?? '', 'Özet (boş)', { status: 'skipped', provider: 'log', error: 'İçerik boş' }); rep.digest.skipped++; continue; }
                const r = await mail(p, 'digest', renderDigestEmail(content, { ...ctxFor(p, 'digest'), today: lp.date }), logKind);
                rep.digest[r.status === 'sent' ? 'sent' : r.status === 'error' ? 'errors' : 'skipped']++;
              } catch (e) { rep.digest.errors++; rep.errors.push(`${org.id}/${p.emp.id}: ${e instanceof Error ? e.message : 'özet hatası'}`); }
            }
          }
        }
      }
    } catch (e) { rep.errors.push(`${org.id}: ${e instanceof Error ? e.message : 'hata'}`); }
  }
  return rep;
}
