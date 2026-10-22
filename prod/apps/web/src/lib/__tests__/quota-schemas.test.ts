import { describe, expect, it } from 'vitest';
import {
  ROLES, ROLE_MODULES, MODULES, applySchema, approvalDecisionSchema, canDecideApproval, hasPermission, inboxDraftsOutputSchema,
  jsonRpcRequestSchema, orgSettingsSchema, outputSchemaFor, taskCreateSchema, AGENTS, isClientRole,
} from '@jscore/contracts';
import { annotateDrafts, evaluateQuota, usedThisMonth } from '../quota';
import { demoAgentOutput, demoInboxDrafts } from '@jscore/core/agents/demo';
import { costUsd } from '@jscore/core/agents/cost';
import { makeDemoDb, TASK_TYPES } from '@jscore/core/demo-seed';

describe('quota rule', () => {
  it('within quota', () => {
    const r = evaluateQuota({ quota: { social_visual: 2 }, used: { social_visual: 0 }, task_type: 'social_visual', qty: 2 });
    expect(r).toMatchObject({ within: true, over_by: 0, requires_approval: false, remaining: 2 });
  });
  it('over quota requires approval with price', () => {
    const r = evaluateQuota({ quota: { social_visual: 2 }, used: { social_visual: 2 }, task_type: 'social_visual', qty: 1, unit_price_minor: 725000 });
    expect(r).toMatchObject({ within: false, over_by: 1, requires_approval: true, suggested_amount_minor: 725000 });
  });
  it('partial overage', () => {
    expect(evaluateQuota({ quota: { reels: 1 }, used: { reels: 0 }, task_type: 'reels', qty: 3 }).over_by).toBe(2);
  });
  it('types without a limit are unmetered', () => {
    expect(evaluateQuota({ quota: {}, used: {}, task_type: 'main_visual', qty: 99 })).toMatchObject({ limit: null, within: true });
  });
  it('Anova inbox scenario: 1 extra visual exceeds, deck is free', () => {
    const db = makeDemoDb();
    const pb = Object.fromEntries(db.projects.map((p) => [p.id, p.brand_id]));
    const used = usedThisMonth(db.tasks, pb, 'c_anova', new Date('2026-10-14T12:00:00Z'));
    expect(used.social_visual).toBe(2);
    const out = demoInboxDrafts({ subject: 'Lansman için ek görsel ve sunum', body: '1 ek sosyal görsel ve kısa bir lansman sunumu. Cuma’ya yetişirse.' });
    const ann = annotateDrafts(out.drafts, db.brands.find((b) => b.id === 'c_anova'), used, TASK_TYPES);
    expect(ann.find((d) => d.task_type === 'social_visual')?.quota.requires_approval).toBe(true);
    expect(ann.find((d) => d.task_type === 'proposal_deck')?.quota.requires_approval).toBe(false);
    expect(ann[0].priority).toBe('high');
  });
});

describe('schemas & permissions', () => {
  it('task create applies defaults and rejects bad input', () => {
    expect(taskCreateSchema.parse({ project_id: 'p1', title: 'Merhaba', due_at: '2026-10-20' })).toMatchObject({ state: 'brief', priority: 'normal', qty: 1 });
    expect(taskCreateSchema.safeParse({ project_id: 'p1', title: 'x', due_at: '2026-10-20' }).success).toBe(false);
  });
  it('approval decision / rpc / apply / settings', () => {
    expect(approvalDecisionSchema.safeParse({ decision: 'maybe' }).success).toBe(false);
    expect(jsonRpcRequestSchema.safeParse({ jsonrpc: '2.0', id: 1, method: 'tools/list' }).success).toBe(true);
    expect(jsonRpcRequestSchema.safeParse({ id: 1 }).success).toBe(false);
    expect(applySchema.safeParse({ name: 'Ada', email: 'bad', consent: true }).success).toBe(false);
    expect(applySchema.safeParse({ name: 'Ada', email: 'a@b.co', consent: false }).success).toBe(false);
    expect(orgSettingsSchema.safeParse(makeDemoDb().settings.org_jobs).success).toBe(true);
  });
  it('agent outputs validate for every agent (demo)', () => {
    for (const a of AGENTS) expect(outputSchemaFor(a).safeParse(demoAgentOutput(a, { subject: 'x', body: 'y' })).success).toBe(true);
    expect(inboxDraftsOutputSchema.safeParse({ summary: 's', drafts: [{ title: 'a' }] }).success).toBe(false);
  });
  it('owner/admin do not get payroll or hr_archive by default', () => {
    for (const r of ['owner', 'org_admin'] as const) {
      expect(hasPermission(r, 'payroll', 'salary', 'read')).toBe(false);
      expect(hasPermission(r, 'hr', 'hr_archive', 'read')).toBe(false);
      expect(hasPermission(r, 'work', 'task', 'update')).toBe(true);
    }
    expect(hasPermission('owner', 'payroll', 'salary', 'read', ['payroll:*:*'])).toBe(true);
    expect(hasPermission('payroll', 'payroll', 'salary', 'read')).toBe(true);
    expect(hasPermission('hr', 'hr', 'hr_archive', 'read')).toBe(true);
    expect(hasPermission('client_viewer', 'work', 'task', 'update')).toBe(false);
  });
  it('approval authority matrix', () => {
    expect(canDecideApproval('owner', 'owner')).toBe(true);
    expect(canDecideApproval('org_admin', 'owner')).toBe(false);
    expect(canDecideApproval('account', 'pm')).toBe(true);
    expect(canDecideApproval('creative', 'account')).toBe(false);
    expect(canDecideApproval('client_admin', 'client_admin')).toBe(true);
    expect(canDecideApproval('client_viewer', 'client_admin')).toBe(false);
  });
  it('every role has modules from the catalog; clients cannot see internal ones', () => {
    const ids = new Set(MODULES.map((m) => m.id));
    for (const r of ROLES) expect(ROLE_MODULES[r].every((m) => ids.has(m))).toBe(true);
    for (const r of ROLES.filter(isClientRole)) expect(ROLE_MODULES[r]).not.toContain('board');
    expect(ROLE_MODULES.payroll).not.toContain('board');
  });
  it('cost calc', () => {
    expect(costUsd('claude-sonnet-4-5', 1_000_000, 1_000_000)).toBe(18);
    expect(costUsd('claude-haiku-4-5', 1000, 1000)).toBe(0.006);
  });
});
