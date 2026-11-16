import { audienceMatches, mentionedEmployees, type Announcement, type Me, type Task, type TaskComment, type TeamMember, type WorkRequest } from '@jscore/contracts';
import { notify, type NotifySink } from './index';
import type { Repo } from '../repo/types';

/**
 * Üreticiler: Repo yazmalarından sonra çağrılır (Demo + Supabase aynı). Hata bildirimi yazmayı asla bozmaz (çağıran `.catch`ler).
 * Eylemi yapan kişi (me.employee_id) hiçbir zaman kendine bildirim almaz.
 */
export const taskHref = (t: Pick<Task, 'id' | 'project_id'>) => `/app/projects/${t.project_id}?task=${t.id}`;
const short = (s: string, n = 140) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);

/** Görev oluşturuldu / güncellendi: yeni sorumluya "atandı", açıklamada anılanlara "anma". */
export async function onTaskWritten(repo: Repo, me: Me | null, after: Task, before: Pick<Task, 'assignee_id' | 'description'> | null, team: TeamMember[]): Promise<void> {
  const by = me?.employee_id ?? null;
  const href = taskHref(after);
  if (after.assignee_id && after.assignee_id !== (before?.assignee_id ?? null)) {
    await notify(repo, { kind: 'task_assigned', employee_ids: [after.assignee_id], except: by, title: before ? `Görev sana devredildi: ${after.title}` : `Sana görev atandı: ${after.title}`, body: `${me?.name ?? 'Sistem'} atadı${after.due_at ? ` · teslim ${after.due_at.slice(0, 10)}` : ''}`, href, dedupe_key: `assigned:${after.id}:${after.assignee_id}` });
  }
  const desc = after.description ?? null;
  if (desc && desc !== (before?.description ?? null)) {
    const ids = mentionedEmployees(desc, team, by);
    if (ids.length) await notify(repo, { kind: 'mention', employee_ids: ids, except: by, title: `${me?.name ?? 'Biri'} seni andı: ${after.title}`, body: 'Görev açıklamasında anıldın', href, dedupe_key: `mention:task:${after.id}` });
  }
}

/** Yorum: görevin sorumlusuna "yorum" (yazan değilse), yorumda anılanlara "anma". */
export async function onComment(repo: Repo, me: Me | null, task: Pick<Task, 'id' | 'project_id' | 'title' | 'assignee_id'>, comment: Pick<TaskComment, 'id' | 'body'>, team: TeamMember[]): Promise<void> {
  const by = me?.employee_id ?? null;
  const href = taskHref(task);
  const mentioned = mentionedEmployees(comment.body, team, by);
  if (mentioned.length) await notify(repo, { kind: 'mention', employee_ids: mentioned, except: by, title: `${me?.name ?? 'Biri'} seni andı: ${task.title}`, body: short(comment.body), href, dedupe_key: `mention:comment:${comment.id}` });
  if (task.assignee_id && task.assignee_id !== by && !mentioned.includes(task.assignee_id)) {
    await notify(repo, { kind: 'comment', employee_ids: [task.assignee_id], except: by, title: `Görevine yorum: ${task.title}`, body: `${me?.name ?? 'Biri'}: ${short(comment.body)}`, href, dedupe_key: `comment:${comment.id}` });
  }
}

/** Duyuru yayımlandı: hedef kitledeki herkese (yazan hariç). Proje üyeliği hedefi için `projectMembers` (employee_id → project_ids). */
export async function onAnnouncement(sink: NotifySink, orgId: string | undefined, me: Me | null, a: Pick<Announcement, 'id' | 'title' | 'audience' | 'requires_ack'>, team: TeamMember[], projectMembers: Record<string, string[]> = {}): Promise<void> {
  const ids = team.filter((t) => t.status !== 'left' && audienceMatches(a.audience, { role: t.app_role, team: t.team, employee_id: t.id, project_ids: projectMembers[t.id] ?? [] })).map((t) => t.id);
  if (!ids.length) return;
  await notify(sink, { org_id: orgId, kind: 'announcement', employee_ids: ids, except: me?.employee_id ?? null, title: `Duyuru: ${a.title}`, body: a.requires_ack ? 'Okundu onayı bekleniyor' : `${me?.name ?? 'Yönetim'} yayımladı`, href: '/app/announcements', dedupe_key: `announcement:${a.id}` });
}

/** Talep göreve dönüştü: talep eden çalışana. */
export async function onRequestConverted(repo: Repo, me: Me | null, r: Pick<WorkRequest, 'id' | 'title' | 'requester_employee_id' | 'task_id' | 'project_id'>): Promise<void> {
  if (!r.requester_employee_id) return;
  const href = r.task_id && r.project_id ? taskHref({ id: r.task_id, project_id: r.project_id }) : '/app/requests';
  await notify(repo, { kind: 'request_converted', employee_ids: [r.requester_employee_id], except: me?.employee_id ?? null, title: `Talebin göreve dönüştü: ${r.title}`, body: `${me?.name ?? 'Ekip'} görev açtı`, href, dedupe_key: `request:${r.id}:converted` });
}

/** Kurul planı hazır: owner'lara (plan üreten mesaj). */
export const onBoardPlanReady = (sink: NotifySink, orgId: string | undefined, info: { thread_id: string; message_id: string; tasks: number; title?: string }) =>
  notify(sink, { org_id: orgId, kind: 'board_plan', role: 'owner', title: `Kurul planı hazır${info.title ? `: ${info.title}` : ''}`, body: `${info.tasks} görev önerildi · panelden incele ve uygula`, href: '/app/approvals', dedupe_key: `board_plan:${info.message_id}` });
