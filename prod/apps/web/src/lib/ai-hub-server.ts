import { ACCESS_TIER_LABELS, ROLE_LABELS, accessTier, canAccessModule, isClientRole, moduleEntitled, type Me, type OrgSettings } from '@jscore/contracts';
import { ForbiddenError, type Repo } from '@jscore/core/repo/types';
import { createAdmin } from '@jscore/core/supabase/admin';
import { departmentSpendUsd, quotaStatus, type HubContext, type QuotaStatus, type SpendRow } from '@jscore/ai-hub';

/** AI Çalışma Alanı kapısı + bağlam: iç rol, modül erişimi, modül anahtarı; bağlam yalnızca kullanıcının RLS'ten geçen kayıtlarından kurulur. */
export async function hubAccess(repo: Repo): Promise<{ me: Me; settings: OrgSettings; context: HubContext }> {
  const me = await repo.me();
  if (!me) throw new ForbiddenError('Oturum yok');
  if (isClientRole(me.role) || !canAccessModule(me.role, 'aihub')) throw new ForbiddenError('AI Çalışma Alanı için yetkin yok');
  const settings = await repo.getSettings();
  if (!moduleEntitled('aihub', settings.feature_flags)) throw new ForbiddenError('AI Çalışma Alanı yönetici tarafından kapatıldı');
  const safe = <T,>(p: Promise<T[]>) => p.catch(() => [] as T[]);
  const [team, brands, projects] = await Promise.all([safe(repo.team()), safe(repo.listBrands()), safe(repo.listProjects())]);
  const self = me.employee_id ? team.find((m) => m.id === me.employee_id) : undefined;
  return {
    me, settings,
    context: {
      org: settings.general.name, name: me.name, title: me.title || null, roleLabel: ROLE_LABELS[me.role],
      tierLabel: ACCESS_TIER_LABELS[accessTier({ role: me.role, employee_id: me.employee_id }, team)],
      department: self?.team ?? null, brands: brands.map((b) => b.name), projects: projects.filter((p) => p.status !== 'done').map((p) => p.name),
    },
  };
}

/** Departmanın ay içi harcaması ve kotası. Supabase'de satırlar servis rolüyle (yalnızca kendi org'u, yalnızca bu ay) okunur. */
export async function departmentQuota(repo: Repo, me: Me, settings: OrgSettings, department: string | null, month: string): Promise<QuotaStatus | null> {
  if (!department) return null;
  const cap = settings.ai.department_caps_usd?.[department];
  let rows: SpendRow[] = [];
  const admin = repo.mode === 'supabase' ? createAdmin() : null;
  if (admin) {
    const { data, error } = await admin.from('agent_runs').select('input, cost_usd, created_at').eq('org_id', me.org_id).gte('created_at', `${month}-01T00:00:00Z`).limit(5000);
    if (error) throw new Error(error.message);
    rows = (data ?? []) as SpendRow[];
  } else rows = (await repo.listAgentRuns().catch(() => [])) as unknown as SpendRow[];
  return quotaStatus(departmentSpendUsd(rows, department, month), cap);
}
