import {
  activeVersion, canManageAgent, nextVersionNumber, versionTransitionAllowed, type AgentVersion, type Me, type PersonalAgent,
} from '@jscore/contracts';
import { ForbiddenError, NotFoundError, type Repo } from './repo/types';

/**
 * Kişisel ajan filosu — uygulama katmanı (Demo + Supabase aynı kurallar; Supabase'de RLS + tetikleyiciler sert tabandır, bkz. 0022).
 * Akış: taslak öner → (ajan sahibi / lideri / ajans sahibi) onayla → yürürlükte; önceki sürüm "eski" olur. Geri alma = eski sürümün kopyası yeni sürüm olarak onaylanır.
 */
const actorOf = (me: Me | null) => ({ role: me?.role ?? 'client_viewer', employee_id: me?.employee_id ?? null }) as { role: Me['role']; employee_id: string | null };

/** Aktörün yönetebildiği ajanlar ve sürümleri (demo'da satır düzeyi süzme burada; Supabase'de RLS zaten süzer). */
export async function listManagedAgents(repo: Repo): Promise<{ agents: PersonalAgent[]; versions: AgentVersion[] }> {
  const me = await repo.me();
  if (!me) return { agents: [], versions: [] };
  const [all, versions, team] = await Promise.all([repo.list('personal_agents'), repo.list('agent_versions'), repo.team().catch(() => [])]);
  const agents = all.filter((a) => canManageAgent(actorOf(me), a, team));
  const ids = new Set(agents.map((a) => a.id));
  return { agents, versions: versions.filter((v) => ids.has(v.agent_id)) };
}

/** Koleksiyon yazma kuralları (`guardCollectionSave` çağırır). */
export async function guardPersonalAgentSave(repo: Repo, me: Me | null, kind: 'personal_agents' | 'agent_versions', merged: Record<string, unknown>, cur: Record<string, unknown> | null): Promise<void> {
  const team = await repo.team().catch(() => []);
  const actor = actorOf(me);
  if (kind === 'personal_agents') {
    if (!canManageAgent(actor, { owner_employee_id: merged.owner_employee_id as string }, team)) throw new ForbiddenError('Bu kişi adına ajan yönetme yetkin yok');
    if (cur && !canManageAgent(actor, { owner_employee_id: cur.owner_employee_id as string }, team)) throw new ForbiddenError('Bu ajanı yönetme yetkin yok');
    if (!cur && merged.current_version !== 0) throw new ForbiddenError('Yeni ajan sürümsüz başlar');
    if (cur && merged.current_version !== cur.current_version) {
      const versions = await repo.list('agent_versions');
      if (!versions.some((v) => v.agent_id === cur.id && v.version === merged.current_version && v.status === 'active')) throw new ForbiddenError('Yürürlükteki sürüm yalnızca onaylanan sürümle değişir');
    }
    return;
  }
  const agent = (await repo.list('personal_agents')).find((a) => a.id === merged.agent_id);
  if (!agent) throw new NotFoundError('Ajan');
  if (!canManageAgent(actor, agent, team)) throw new ForbiddenError('Bu ajanın sürümlerini yönetme yetkin yok');
  if (!cur) {
    if (merged.status !== 'draft') throw new ForbiddenError('Sürüm taslak olarak eklenir; yürürlüğe almak için onay gerekir');
    const versions = await repo.list('agent_versions');
    if (merged.version !== nextVersionNumber(agent.id, versions)) throw new ForbiddenError('Sürüm numarası sıradaki numara olmalı');
    return;
  }
  for (const k of ['agent_id', 'version', 'author', 'instructions', 'change_note'] as const) if (merged[k] !== cur[k]) throw new ForbiddenError('Sürüm içeriği değiştirilemez; yeni bir sürüm oluştur');
  if (JSON.stringify(merged.can) !== JSON.stringify(cur.can) || JSON.stringify(merged.cannot) !== JSON.stringify(cur.cannot)) throw new ForbiddenError('Sürüm içeriği değiştirilemez; yeni bir sürüm oluştur');
  if (!versionTransitionAllowed(cur.status as AgentVersion['status'], merged.status as AgentVersion['status'])) throw new ForbiddenError(`Geçersiz sürüm durumu geçişi: ${String(cur.status)} → ${String(merged.status)}`);
}

export interface VersionDraft { instructions: string; can: string[]; cannot: string[]; change_note: string }
/** Yeni taslak sürüm (yürürlüğe girmez). `author='agent'`: ajanın kendi önerdiği güncelleme. */
export async function proposeVersion(repo: Repo, agentId: string, draft: VersionDraft, author: AgentVersion['author'] = 'user'): Promise<AgentVersion> {
  const me = await repo.me();
  const versions = await repo.list('agent_versions');
  return repo.save('agent_versions', {
    agent_id: agentId, version: nextVersionNumber(agentId, versions), status: 'draft', author,
    created_by: me?.employee_id ?? null, decided_by: null, decided_at: null, ...draft,
  });
}
/** Taslağı yürürlüğe alır: önceki yürürlükteki sürüm "eski" olur, ajanın güncel sürümü ilerler. */
export async function approveVersion(repo: Repo, versionId: string, now: () => string = () => new Date().toISOString()): Promise<AgentVersion> {
  const me = await repo.me();
  const versions = await repo.list('agent_versions');
  const v = versions.find((x) => x.id === versionId);
  if (!v) throw new NotFoundError('Sürüm');
  if (v.status !== 'draft') throw new ForbiddenError('Yalnızca taslak sürüm onaylanır');
  const prev = activeVersion(v.agent_id, versions);
  if (prev) await repo.save('agent_versions', { id: prev.id, status: 'superseded' });
  const out = await repo.save('agent_versions', { id: v.id, status: 'active', decided_by: me?.employee_id ?? null, decided_at: now() });
  const agent = (await repo.list('personal_agents')).find((a) => a.id === v.agent_id);
  if (agent && agent.current_version !== v.version) await repo.save('personal_agents', { id: agent.id, current_version: v.version });
  return out;
}
export async function rejectVersion(repo: Repo, versionId: string, now: () => string = () => new Date().toISOString()): Promise<AgentVersion> {
  const me = await repo.me();
  return repo.save('agent_versions', { id: versionId, status: 'rejected', decided_by: me?.employee_id ?? null, decided_at: now() });
}
/** Geri alma: seçilen eski sürümün içeriği yeni bir sürüm olarak eklenir ve onaylanır (geçmiş silinmez). */
export async function rollbackTo(repo: Repo, versionId: string): Promise<AgentVersion> {
  const versions = await repo.list('agent_versions');
  const v = versions.find((x) => x.id === versionId);
  if (!v) throw new NotFoundError('Sürüm');
  if (v.status !== 'superseded') throw new ForbiddenError('Yalnızca eski bir sürüme geri dönülebilir');
  const draft = await proposeVersion(repo, v.agent_id, { instructions: v.instructions, can: v.can, cannot: v.cannot, change_note: `v${v.version} sürümüne geri dönüş` });
  return approveVersion(repo, draft.id);
}
