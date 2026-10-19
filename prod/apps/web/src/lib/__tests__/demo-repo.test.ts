import { describe, expect, it } from 'vitest';
import { DemoRepo, DEMO_STORAGE_KEY, type KV } from '../repo/demo';
import { ForbiddenError } from '../repo/types';
import { ORG_EDIT, ORG_JOBS } from '../demo-seed';

const mem = (): KV & { data: Record<string, string> } => {
  const data: Record<string, string> = {};
  return { data, getItem: (k) => data[k] ?? null, setItem: (k, v) => { data[k] = v; } };
};

describe('DemoRepo', () => {
  it('seeds 24 brands across both orgs and filters by org', async () => {
    const all = [...(await new DemoRepo({ orgId: ORG_JOBS }).listBrands()), ...(await new DemoRepo({ orgId: ORG_EDIT }).listBrands())];
    expect(all).toHaveLength(24);
    expect((await new DemoRepo({ orgId: ORG_EDIT }).listProjects()).map((p) => p.id)).toEqual(['p4']);
  });

  it('client roles only see their brands and client-visible items', async () => {
    const viewer = new DemoRepo({ accountId: 'client_viewer' });
    const projects = await viewer.listProjects();
    expect(projects.every((p) => p.brand_id === 'c_anova' && p.client_visible)).toBe(true);
    const tasks = await viewer.listTasks();
    expect(tasks.length).toBeGreaterThan(0);
    expect(tasks.every((t) => t.client_visible)).toBe(true);
    await expect(viewer.listInbox()).rejects.toBeInstanceOf(ForbiddenError);
    await expect(viewer.createTask({ project_id: 'p3', title: 'x y', due_at: '2026-10-20' })).rejects.toBeInstanceOf(ForbiddenError);
    const admin = new DemoRepo({ accountId: 'client_admin' });
    expect((await admin.listApprovals()).every((a) => a.required_role.startsWith('client'))).toBe(true);
  });

  it('creates and moves tasks, persisting through storage', async () => {
    const storage = mem();
    const repo = new DemoRepo({ accountId: 'account', storage });
    const t = await repo.createTask({ project_id: 'p1', title: 'Yeni görev', due_at: '2026-10-20' });
    expect(t.state).toBe('brief');
    await repo.moveTask(t.id, 'production');
    expect(storage.data[DEMO_STORAGE_KEY]).toBeTruthy();
    const again = new DemoRepo({ accountId: 'account', storage });
    expect((await again.listTasks()).find((x) => x.id === t.id)?.state).toBe('production');
  });

  it('updateTask patches assignee/due/priority, validates, and is blocked for client roles', async () => {
    const storage = mem();
    const repo = new DemoRepo({ accountId: 'account', storage });
    const t = await repo.createTask({ project_id: 'p1', title: 'Güncellenecek', due_at: '2026-10-20' });
    const u = await repo.updateTask(t.id, { priority: 'high', due_at: '2026-10-25', assignee_id: null });
    expect(u).toMatchObject({ priority: 'high', due_at: '2026-10-25', assignee_id: null, state: 'brief' });
    expect((await new DemoRepo({ accountId: 'account', storage }).listTasks()).find((x) => x.id === t.id)?.priority).toBe('high');
    await expect(repo.updateTask(t.id, { due_at: 'x' })).rejects.toThrow();
    await expect(repo.updateTask('nope', { priority: 'low' })).rejects.toThrow();
    await expect(new DemoRepo({ accountId: 'client_viewer' }).updateTask('t1', { priority: 'low' })).rejects.toBeInstanceOf(ForbiddenError);
  });

  it('server mode (no storage) is per-instance and stateless across instances', async () => {
    const a = new DemoRepo({ accountId: 'account' });
    await a.createTask({ project_id: 'p1', title: 'Geçici', due_at: '2026-10-20' });
    expect((await new DemoRepo({ accountId: 'account' }).listTasks()).some((t) => t.title === 'Geçici')).toBe(false);
  });

  it('enforces approval authority', async () => {
    await expect(new DemoRepo({ accountId: 'creative', orgId: ORG_EDIT }).decideApproval('a5', 'approved')).rejects.toBeInstanceOf(ForbiddenError);
    const owner = new DemoRepo({ accountId: 'owner', orgId: ORG_EDIT, now: () => '2026-10-14T10:00:00Z' });
    const a = await owner.decideApproval('a5', 'approved', 'tamam');
    expect(a).toMatchObject({ status: 'approved', decided_at: '2026-10-14T10:00:00Z', decision_note: 'tamam' });
    await expect(owner.decideApproval('a5', 'rejected')).rejects.toBeInstanceOf(ForbiddenError);
    const orgAdminLike = new DemoRepo({ accountId: 'account' });
    expect((await orgAdminLike.decideApproval('a6', 'approved')).status).toBe('approved');
  });

  it('only owner answers board decisions', async () => {
    await expect(new DemoRepo({ accountId: 'account' }).listBoardDecisions()).rejects.toBeInstanceOf(ForbiddenError);
    const owner = new DemoRepo({ accountId: 'owner' });
    expect(await owner.decideBoard('bd_BD-101', 'EVET')).toMatchObject({ status: 'approved', founder_answer: 'EVET' });
    expect(await owner.decideBoard('bd_BD-102', 'ERTELE')).toMatchObject({ status: 'deferred' });
    expect(await owner.decideBoard('bd_BD-103', 'HAYIR')).toMatchObject({ status: 'rejected' });
  });

  it('messages: send + subscribe', async () => {
    const repo = new DemoRepo({ accountId: 'account' });
    const got: string[] = [];
    const off = repo.subscribeMessages('ch_general', (m) => got.push(m.body));
    await repo.sendMessage('ch_general', ' selam ');
    off();
    await repo.sendMessage('ch_general', 'ikinci');
    expect(got).toEqual(['selam']);
    await expect(repo.sendMessage('ch_general', '  ')).rejects.toThrow();
  });

  it('settings are owner/admin only and validated', async () => {
    await expect(new DemoRepo({ accountId: 'creative' }).saveSettings({ ai: { monthly_cap_usd: 1, default_model: 'm', board_enabled: false } })).rejects.toBeInstanceOf(ForbiddenError);
    const owner = new DemoRepo({ accountId: 'owner' });
    expect((await owner.saveSettings({ ai: { monthly_cap_usd: 99, default_model: 'm', board_enabled: true } })).ai.monthly_cap_usd).toBe(99);
    await expect(owner.saveSettings({ ai: { monthly_cap_usd: -1, default_model: 'm', board_enabled: true } })).rejects.toThrow();
  });
});
