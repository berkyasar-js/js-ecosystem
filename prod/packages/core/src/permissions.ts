import { CAP_DENIED_MESSAGE, can, canEditTask, delegationNeedsApproval, wouldCycle, type CanCtx, type Capability, type CollKey, type Delegation, type Me, type PermissionOverrides, type ProjectMember, type Task, type TaskLink } from '@jscore/contracts';
import { ForbiddenError, type Repo } from './repo/types';

/**
 * Yetki bağlamı (0018): org sapmaları (settings.permissions) + aktif delegasyonlar + proje üyeliği rolü. Repo başına kısa süreli önbellek (30 sn):
 * tarayıcıda art arda yazmalarda ek sorgu yapılmaz; RLS yine sert tabandır (buradaki kontrol RLS'ten gevşek olamaz, yalnızca daha sıkı olabilir).
 */
interface Cached { at: number; overrides: PermissionOverrides | null; delegations: Delegation[]; members: ProjectMember[] }
const cache = new WeakMap<Repo, Cached>();
const TTL = 30_000;
export function invalidatePermissionCache(repo: Repo) { cache.delete(repo); }
export async function permissionContext(repo: Repo, me: Me | null, projectId?: string | null, task?: Pick<Task, 'assignee_id'> | null): Promise<CanCtx> {
  let c = cache.get(repo);
  if (!c || Date.now() - c.at > TTL) {
    const safe = async <T,>(p: Promise<T[]>) => p.catch(() => [] as T[]);
    const [settings, delegations, members] = await Promise.all([repo.getSettings().catch(() => null), safe(repo.list('delegations')), safe(repo.list('project_members'))]);
    c = { at: Date.now(), overrides: (settings?.permissions as PermissionOverrides | undefined) ?? null, delegations: delegations as Delegation[], members: members as ProjectMember[] };
    cache.set(repo, c);
  }
  const projectRole = projectId && me?.employee_id ? c.members.find((m) => m.project_id === projectId && m.employee_id === me.employee_id)?.role ?? null : null;
  return { overrides: c.overrides, delegations: c.delegations, projectRole, task: task ?? null };
}
/** Yetki yoksa ForbiddenError (Türkçe mesaj). */
export async function assertCan(repo: Repo, me: Me | null, cap: Capability, o: { projectId?: string | null; task?: Pick<Task, 'assignee_id'> | null } = {}): Promise<CanCtx> {
  const ctx = await permissionContext(repo, me, o.projectId, o.task);
  if (!can(me, cap, ctx)) throw new ForbiddenError(CAP_DENIED_MESSAGE(cap));
  return ctx;
}
/** Görev düzenleme: her görev ∥ kendi görevi. */
export async function assertCanEditTask(repo: Repo, me: Me | null, task: Pick<Task, 'assignee_id' | 'project_id'>): Promise<CanCtx> {
  const ctx = await permissionContext(repo, me, task.project_id, task);
  if (!canEditTask(me, task, ctx)) throw new ForbiddenError(CAP_DENIED_MESSAGE(task.assignee_id && task.assignee_id !== me?.employee_id ? 'tasks.edit_any' : 'tasks.edit_own'));
  return ctx;
}

/**
 * Koleksiyon yazmalarında 0018 kuralları (Demo + Supabase `save` çağırır):
 * - requests güncelleme → requests.triage · announcements oluşturma → announcements.post · approval_policies → delegations.manage (owner/org_admin)
 * - task_links → tasks.link + döngü yasağı (A→…→B varken B→A engeli)
 * - delegations: oluşturan kendisi (from = ben) ya da delegations.manage; self-servis ve hassas yetkiler (approvals.decide, finance.*) → status 'pending' (owner onayı)
 */
export async function guardCollectionSave(repo: Repo, me: Me | null, kind: CollKey, merged: Record<string, unknown>, cur: Record<string, unknown> | null): Promise<void> {
  if (kind === 'requests' && cur && (merged.status !== cur.status || merged.task_id !== cur.task_id)) await assertCan(repo, me, 'requests.triage', { projectId: (merged.project_id as string | null) ?? null });
  if (kind === 'announcements' && !cur) await assertCan(repo, me, 'announcements.post');
  if (kind === 'approval_policies') await assertCan(repo, me, 'delegations.manage');
  if (kind === 'task_links' && !cur) {
    await assertCan(repo, me, 'tasks.link');
    if (merged.kind === 'blocks') {
      const links = (await repo.list('task_links').catch(() => [] as TaskLink[])) as TaskLink[];
      if (wouldCycle(merged.from_task_id as string, merged.to_task_id as string, links)) throw new ForbiddenError('Bu bağ döngü oluşturur (görev dolaylı olarak kendini engeller)');
    }
  }
  if (kind === 'delegations') {
    const ctx = await permissionContext(repo, me);
    const admin = can(me, 'delegations.manage', ctx);
    if (!cur) {
      if (!admin && merged.from_employee_id !== me?.employee_id) throw new ForbiddenError('Yalnızca kendi yetkini delege edebilirsin');
      if (!admin || me?.role !== 'owner') { if (delegationNeedsApproval((merged.caps as string[]) ?? [])) merged.status = 'pending'; }
    } else if (!admin && cur.from_employee_id !== me?.employee_id) throw new ForbiddenError('Bu delegasyonu değiştirme yetkin yok');
    else if (!admin && merged.status === 'active' && cur.status === 'pending') throw new ForbiddenError('Bekleyen delegasyonu yalnızca owner onayı etkinleştirir');
  }
}
