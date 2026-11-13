import { canDecideApproval, type Approval, type Me, type Notification, type Task } from '@jscore/contracts';
import { byDue, isDone, isOverdue } from '@/components/work/work-utils';

/** Tek kuyruk öğesi: bildirim, bana düşen onay, anma, görevimde Trello kaynaklı değişiklik, bugün biten / geciken görev. */
export type InboxKind = 'notification' | 'approval' | 'mention' | 'trello' | 'due';
export interface InboxItem {
  /** `<kind>:<kaynak id>` — prefs.inbox_done ile eşleşir. */
  id: string; kind: InboxKind; title: string; body: string; href: string;
  /** Sıralama anahtarı (ISO tarih); gecikmişler öne. */
  at: string; urgent: boolean;
  /** Bildirim kaynağıysa okundu bayrağı. */
  read?: boolean; notification_id?: string; approval_id?: string; task_id?: string;
}
export const INBOX_KIND_LABELS: Record<InboxKind, string> = { approval: 'Onay', due: 'Teslim', mention: 'Anma', trello: 'Trello', notification: 'Bildirim' };
export type InboxFilter = 'all' | InboxKind;

export interface InboxInput {
  me: Pick<Me, 'role' | 'employee_id' | 'name'>; tasks: Task[]; approvals: Approval[]; notifications: Notification[];
  today: string; done: string[];
  /** Trello kaynaklı değişikliklerde geriye bakış (gün). */
  trelloWindowDays?: number;
}
const daysAgo = (today: string, n: number) => new Date(new Date(`${today}T00:00:00Z`).getTime() - n * 86400000).toISOString().slice(0, 10);

/** Saf: kuyruğu kurar. `done` kümesindekiler ve okunmuş bildirimler dışarıda kalır (yalnızca "dikkat isteyenler"). */
export function buildInbox(i: InboxInput): InboxItem[] {
  const me = i.me.employee_id;
  const out: InboxItem[] = [];
  const first = i.me.name.split(/\s+/)[0]?.toLocaleLowerCase('tr') ?? '';
  for (const n of i.notifications) {
    if (me && n.employee_id !== me) continue;
    if (n.read) continue;
    const kind: InboxKind = n.kind === 'mention' ? 'mention' : 'notification';
    out.push({ id: `${kind}:${n.id}`, kind, title: n.title, body: n.body, href: n.href ?? '/app/overview', at: n.created_at, urgent: n.kind === 'approval', read: n.read, notification_id: n.id });
  }
  for (const a of i.approvals) {
    if (a.status !== 'pending' || !canDecideApproval(i.me.role, a.required_role)) continue;
    out.push({ id: `approval:${a.id}`, kind: 'approval', title: a.title, body: `${a.action_type} · karar bekliyor`, href: '/app/approvals', at: a.due_at || a.created_at, urgent: !!a.due_at && a.due_at.slice(0, 10) <= i.today, approval_id: a.id });
  }
  const since = daysAgo(i.today, i.trelloWindowDays ?? 7);
  for (const t of i.tasks) {
    if (!me || t.assignee_id !== me || isDone(t)) continue;
    const due = t.due_at?.slice(0, 10);
    if (due && due <= i.today) out.push({ id: `due:${t.id}`, kind: 'due', title: t.title, body: isOverdue(t, i.today) ? `Gecikti · ${due}` : 'Bugün teslim', href: `/app/projects/${t.project_id}?task=${t.id}`, at: t.due_at as string, urgent: isOverdue(t, i.today), task_id: t.id });
    if (t.sync_origin === 'trello' && t.synced_at && t.synced_at.slice(0, 10) >= since) out.push({ id: `trello:${t.id}`, kind: 'trello', title: t.title, body: 'Trello’da değişti', href: `/app/projects/${t.project_id}?task=${t.id}`, at: t.synced_at, urgent: false, task_id: t.id });
    if (t.description && first && t.description.toLocaleLowerCase('tr').includes(`@${first}`) && !i.notifications.some((n) => n.kind === 'mention' && n.body.includes(t.title)))
      out.push({ id: `mention:task-${t.id}`, kind: 'mention', title: t.title, body: 'Açıklamada anıldın', href: `/app/projects/${t.project_id}?task=${t.id}`, at: t.updated_at ?? t.created_at, urgent: false, task_id: t.id });
  }
  const done = new Set(i.done);
  return out.filter((x) => !done.has(x.id)).sort((a, b) => Number(b.urgent) - Number(a.urgent) || byDue({ due_at: a.at }, { due_at: b.at }));
}
export const filterInbox = (items: InboxItem[], f: InboxFilter) => (f === 'all' ? items : items.filter((x) => x.kind === f));
export const inboxCounts = (items: InboxItem[]): Record<InboxFilter, number> => ({
  all: items.length, approval: 0, due: 0, mention: 0, trello: 0, notification: 0,
  ...items.reduce<Partial<Record<InboxKind, number>>>((acc, x) => ({ ...acc, [x.kind]: (acc[x.kind] ?? 0) + 1 }), {}),
});
