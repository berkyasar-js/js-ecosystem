import { describe, expect, it } from 'vitest';
import { CAPABILITIES, DEFAULT_APPROVAL_POLICIES, DEFAULT_PERMISSIONS, ROLES, approvalPolicySchema, buildSteps, diffPermissions, effectivePermissions, permissionChanges, resolvePolicy, type PermissionOverrides } from '@jscore/contracts';
import { DemoRepo } from '@jscore/core/repo/demo';
import { ForbiddenError } from '@jscore/core/repo/types';

const kv = () => { const m = new Map<string, string>(); return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => { m.set(k, v); } }; };

describe('yetki matrisi (panel)', () => {
  it('kısmi/tam matris → yalnızca sapmalar; tekrar uygulama kararlı (idempotent)', () => {
    const partial: PermissionOverrides = { creative: { 'tasks.delete': true, 'tasks.create': true /* varsayılanla aynı → düşer */ } };
    const norm = diffPermissions(effectivePermissions(partial) as unknown as Record<string, Record<string, boolean>>);
    expect(norm).toEqual({ creative: { 'tasks.delete': true } });
    expect(diffPermissions(effectivePermissions(norm) as unknown as Record<string, Record<string, boolean>>)).toEqual(norm);
    expect(permissionChanges({}, norm)).toEqual([{ role: 'creative', cap: 'tasks.delete', from: false, to: true }]);
    expect(permissionChanges(norm, {})).toEqual([{ role: 'creative', cap: 'tasks.delete', from: true, to: false }]);
  });
  it('varsayılan matris tüm rol×yetki hücrelerini kapsar; owner her iş yetkisine sahip, bordro hariç', () => {
    for (const r of ROLES) expect(Object.keys(DEFAULT_PERMISSIONS[r]).sort()).toEqual([...CAPABILITIES].sort());
    expect(CAPABILITIES.filter((c) => !DEFAULT_PERMISSIONS.owner[c])).toEqual(['people.view_salary']);
    expect(CAPABILITIES.filter((c) => DEFAULT_PERMISSIONS.client_viewer[c])).toEqual([]);
  });
  it('demo: owner matrisi kaydeder, creative için Repo yazması kapanır, varsayılana dönünce açılır', async () => {
    const storage = kv();
    const owner = new DemoRepo({ accountId: 'owner', storage });
    await owner.saveSettings({ permissions: { creative: { 'tasks.create': false } } });
    await expect(new DemoRepo({ accountId: 'creative', storage }).createTask({ project_id: 'p3', title: 'Deneme görevi', due_at: '2026-10-20' })).rejects.toBeInstanceOf(ForbiddenError);
    await owner.saveSettings({ permissions: {} });
    expect((await new DemoRepo({ accountId: 'creative', storage }).createTask({ project_id: 'p3', title: 'Deneme görevi', due_at: '2026-10-20' })).title).toBe('Deneme görevi');
    await expect(new DemoRepo({ accountId: 'creative', storage }).saveSettings({ permissions: {} })).rejects.toBeInstanceOf(ForbiddenError);
  });
});

describe('onay akışları (panel)', () => {
  it('politika şeması: adım en az bir hedef ister; koşul anahtarları sıkı', () => {
    expect(() => approvalPolicySchema.parse({ name: 'xx', action_type: 'budget', steps: [{ mode: 'any', sla_hours: 1 }] })).toThrow();
    expect(() => approvalPolicySchema.parse({ name: 'xx', action_type: 'budget', steps: [{ role: 'owner' }], condition: { foo: 1 } })).toThrow();
    const p = approvalPolicySchema.parse({ name: 'xx', action_type: 'task_stage', steps: [{ role: 'account' }], condition: { to_states: ['delivery'], brand_status: ['risky'] } });
    expect(p.steps[0]).toMatchObject({ mode: 'any', sla_hours: 48 }); expect(p.escalation).toBeNull(); expect(p.active).toBe(true);
  });
  it('varsayılan 5 politika örnek konularda beklenen zinciri verir (test aracı ile aynı yol)', () => {
    const policies = DEFAULT_APPROVAL_POLICIES.map((p, i) => ({ ...p, id: `ap${i + 1}`, org_id: 'o', created_at: `2026-10-0${i + 1}T00:00:00Z` }));
    const team = [{ id: 'BY', app_role: 'owner' as const, status: 'active' as const, manager_id: null }, { id: 'UC', app_role: 'creative' as const, status: 'active' as const, manager_id: 'BY' }, { id: 'SK', app_role: 'creative' as const, status: 'active' as const, manager_id: 'UC' }, { id: 'BA', app_role: 'finance' as const, status: 'active' as const, manager_id: 'BY' }];
    const budget = resolvePolicy(policies, 'budget', { amount_minor: 8_600_000 })!;
    expect(budget.name).toBe('Bütçe > ₺25.000');
    expect(buildSteps(budget.steps, { requesterEmployeeId: 'SK', team }).map((s) => s.approvers[0] ?? s.approver_role)).toEqual(['UC', 'finance', 'owner']);
    expect(resolvePolicy(policies, 'task_stage', { to_state: 'delivery', brand: { id: 'b', status: 'risky' } })?.name).toBe('Riskli marka teslimi');
    expect(resolvePolicy(policies, 'task_stage', { to_state: 'delivery', brand: { id: 'b', status: 'active' } })).toBeNull();
    expect(resolvePolicy(policies, 'agent', {})?.steps).toEqual([{ role: 'owner', mode: 'any', sla_hours: 72 }]);
    expect(resolvePolicy(policies, 'content', {})).toBeNull();
  });
  it('demo: yalnızca owner/org_admin politika yazar; tohumda 5 politika', async () => {
    const storage = kv();
    expect((await new DemoRepo({ accountId: 'owner', storage }).list('approval_policies')).map((p) => p.name)).toEqual(DEFAULT_APPROVAL_POLICIES.map((p) => p.name));
    await expect(new DemoRepo({ accountId: 'account', storage }).save('approval_policies', { name: 'X', action_type: 'content', condition: {}, steps: [{ role: 'owner', mode: 'any', sla_hours: 1 }], escalation: null, active: true })).rejects.toBeInstanceOf(ForbiddenError);
    const saved = await new DemoRepo({ accountId: 'owner', storage }).save('approval_policies', { name: 'İçerik onayı', action_type: 'content', condition: { labels: ['acil'] }, steps: [{ role: 'account', mode: 'any', sla_hours: 8 }], escalation: null, active: true });
    expect(saved.id).toBeTruthy();
  });
});
