import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { COLLECTIONS, COLL_KEYS, canReadColl, leaveSchema, moduleEntitled, type Proposal } from '@jscore/contracts';
import { DemoRepo, type KV } from '../repo/demo';
import { ForbiddenError } from '../repo/types';
import { bumpProposal, contractUsage, marginFormula, offerToEmployee, proposalTotals, surveyBelowThreshold, surveyStats, toCsv, weeklyCapacity } from '../domain';
import { evaluateQuota } from '../quota';
import { buildPdf } from '../pdf';
import { proposalPdfBytes } from '../proposal-pdf';
import { navModules } from '../nav';
import { projectMargins } from '@/components/modules/finance';

const mem = (): KV & { data: Record<string, string> } => { const data: Record<string, string> = {}; return { data, getItem: (k) => data[k] ?? null, setItem: (k, v) => { data[k] = v; } }; };
const WEEK = '2026-10-26';

describe('kota', () => {
  it('sözleşme hakları ve kota aşımı (evaluateQuota + contractUsage)', () => {
    const q = evaluateQuota({ quota: { social_visual: 2 }, used: { social_visual: 2 }, task_type: 'social_visual', qty: 1, unit_price_minor: 725000 });
    expect(q.requires_approval).toBe(true);
    expect(q.suggested_amount_minor).toBe(725000);
    const u = contractUsage({ inclusions: { social_visual: 2, reels: 1 }, revision_limit: 2, revisions_used: 2 }, { social_visual: 3, reels: 0 });
    expect(u.rights.find((r) => r.key === 'social_visual')).toMatchObject({ over: true, pct: 150 });
    expect(u.rights.find((r) => r.key === 'reels')?.over).toBe(false);
    expect(u.revision.pct).toBe(100);
  });
});

describe('marj formülü', () => {
  it('marj = gelir − (Σ saat × saatlik maliyet + direkt gider)', () => {
    const m = marginFormula({ revenue_minor: 1_000_000, hours: [{ hours: 10, hourly_cost_minor: 20_000 }, { hours: 5, hourly_cost_minor: 40_000 }], direct_expense_minor: 100_000 });
    expect(m).toMatchObject({ labor_minor: 400_000, cost_minor: 500_000, margin_minor: 500_000, margin_pct: 50 });
    expect(marginFormula({ revenue_minor: 0, hours: [], direct_expense_minor: 5 }).margin_pct).toBe(0);
  });
  it('proje marjı yalnızca onaylı/ödenmiş giderleri sayar ve kişi maliyeti çıktıda yoktur', async () => {
    const r = new DemoRepo({ accountId: 'finance' });
    const [projects, tasks, time_entries, cost_rates, expenses] = await Promise.all([r.listProjects(), r.listTasks(), r.list('time_entries'), r.list('cost_rates'), r.list('expenses')]);
    const rows = projectMargins({ projects, tasks, time_entries, cost_rates, expenses });
    const p3 = rows.find((x) => x.project.id === 'p3')!;
    expect(p3.direct_minor).toBe(4_200_000); // paid; bekleyen 19.500 TL dahil değil
    expect(Object.keys(p3)).not.toContain('hourly_cost_minor');
  });
});

describe('kapasite ve izin', () => {
  it('izin onayı o haftanın kapasitesini düşürür', async () => {
    const repo = new DemoRepo({ accountId: 'account' });
    const sk = (await repo.team()).find((t) => t.id === 'SK')!;
    const before = weeklyCapacity(sk, WEEK, await repo.list('allocations'), await repo.list('leaves'));
    expect(before.capacity).toBe(38);
    await repo.decideLeave('lv1', 'approved');
    const after = weeklyCapacity(sk, WEEK, await repo.list('allocations'), await repo.list('leaves'));
    expect(after.capacity).toBe(0);
    expect(after.leave_days).toBe(5);
    expect(after.load_pct).toBeGreaterThan(100);
  });
  it('kendi iznini onaylayamaz, yetkisiz rol karar veremez, tarih sırası zod ile doğrulanır', async () => {
    await expect(new DemoRepo({ accountId: 'creative' }).decideLeave('lv1', 'approved')).rejects.toBeInstanceOf(ForbiddenError);
    expect(leaveSchema.safeParse({ employee_id: 'SK', type: 'yillik', start: '2026-10-10', end: '2026-10-01', days: 1, status: 'pending', note: '' }).success).toBe(false);
  });
});

describe('pipeline taşıma yetkisi', () => {
  it('creative taşıyamaz; account taşır ve audit yazılır', async () => {
    await expect(new DemoRepo({ accountId: 'creative' }).moveDeal('d1', 'won')).rejects.toBeInstanceOf(ForbiddenError);
    const acc = new DemoRepo({ accountId: 'account' });
    expect((await acc.moveDeal('d1', 'won')).stage).toBe('won');
    await expect(acc.moveDeal('d1', 'bogus' as never)).rejects.toThrow();
    const owner = new DemoRepo({ accountId: 'owner' });
    const ok = await owner.save('crm_deals', { brand_id: null, company: 'Test A.Ş.', title: 'Deneme', stage: 'new', value_minor: 1, owner: 'OE', source: '', next_step: '' });
    expect((await owner.listAudit()).some((e) => e.action === 'crm_deals.create' && e.resource === `crm_deals/${ok.id}`)).toBe(true);
  });
});

describe('portal kapsamı', () => {
  it('client yalnızca kendi markası + client_visible kayıtları görür; iç modüller kapalı', async () => {
    const v = new DemoRepo({ accountId: 'client_viewer' });
    expect((await v.list('client_requests')).every((r) => r.brand_id === 'c_anova')).toBe(true);
    const media = await v.list('media_assets');
    expect(media.length).toBeGreaterThan(0);
    expect(media.every((m) => m.brand_id === 'c_anova' && m.client_visible)).toBe(true);
    for (const k of ['crm_deals', 'invoices', 'budgets', 'hr_docs', 'cost_rates', 'ledger_entries'] as const) await expect(v.list(k)).rejects.toBeInstanceOf(ForbiddenError);
    expect((await v.list('surveys')).length).toBeGreaterThan(0); // brand_id'siz anket tanımları
    expect((await v.list('survey_responses')).every((r) => r.brand_id === 'c_anova')).toBe(true);
  });
  it('client başka markaya yazamaz; viewer talep açamaz ama anket cevaplar; toplu onay yalnızca client_admin', async () => {
    const admin = new DemoRepo({ accountId: 'client_admin' });
    const brief = { goal: 'Hedef', audience: 'Kitle', deliverable: 'Çıktı', message: 'Mesaj', deadline: '2026-11-01' };
    await expect(admin.save('client_requests', { brand_id: 'c_badem', title: 'Yetkisiz', status: 'new', created_by: 'x', brief })).rejects.toBeInstanceOf(ForbiddenError);
    expect((await admin.save('client_requests', { brand_id: 'c_wellana', title: 'Yeni talep', status: 'new', created_by: 'x', brief })).id).toBeTruthy();
    const viewer = new DemoRepo({ accountId: 'client_viewer' });
    await expect(viewer.save('client_requests', { brand_id: 'c_anova', title: 'Yeni talep', status: 'new', created_by: 'x', brief })).rejects.toBeInstanceOf(ForbiddenError);
    expect((await viewer.save('survey_responses', { survey_id: 'sv1', brand_id: 'c_anova', score: 5, comment: '' })).id).toBeTruthy();
    await expect(viewer.approveSocialBatch('c_anova')).rejects.toBeInstanceOf(ForbiddenError);
    expect(await admin.approveSocialBatch('c_anova')).toBe(1);
  });
});

describe('anket eşiği', () => {
  it('CSAT ortalaması ve NPS eşik altı müşteriyi riskli işaretler', () => {
    expect(surveyStats('csat', [{ score: 2 }, { score: 3 }]).value).toBe(2.5);
    expect(surveyBelowThreshold('csat', [{ score: 2 }, { score: 3 }], 4)).toBe(true);
    expect(surveyBelowThreshold('csat', [{ score: 5 }, { score: 4 }], 4)).toBe(false);
    expect(surveyStats('nps', [{ score: 9 }, { score: 10 }, { score: 3 }]).value).toBe(33);
    expect(surveyBelowThreshold('nps', [{ score: 3 }, { score: 5 }, { score: 9 }], 0)).toBe(true);
    expect(surveyBelowThreshold('nps', [], 0)).toBe(false);
  });
});

describe('teklif → çalışan', () => {
  it('offerToEmployee benzersiz kod, profil ve 5 onboarding adımı üretir', () => {
    const r = offerToEmployee({ id: 'cd4', name: 'Onur Başaran', email: 'o@x.example' }, { role_title: 'Art Director', app_role: 'creative', start_date: '2026-11-16' }, [{ id: 'OB' }]);
    expect(r.member.id).toBe('OB2'); expect(r.profile.start_date).toBe('2026-11-16'); expect(r.tasks).toHaveLength(5);
  });
  it('hireCandidate çalışan + onboarding + ilk görev oluşturur; ikinci kez reddedilir', async () => {
    const repo = new DemoRepo({ accountId: 'hr' });
    const { member, checklist } = await repo.hireCandidate('cd4');
    expect((await repo.team()).some((t) => t.id === member.id)).toBe(true);
    expect(checklist.every((c) => c.flow === 'onboarding' && c.employee_id === member.id)).toBe(true);
    expect((await repo.list('candidates')).find((c) => c.id === 'cd4')).toMatchObject({ stage: 'hired', employee_id: member.id });
    expect((await repo.listTasks()).some((t) => t.source_ref === 'candidate:cd4' && t.assignee_id === member.id)).toBe(true);
    await expect(repo.hireCandidate('cd4')).rejects.toBeInstanceOf(ForbiddenError);
    await expect(new DemoRepo({ accountId: 'creative' }).hireCandidate('cd3')).rejects.toBeInstanceOf(ForbiddenError);
  });
  it('/apply kuyruğu aday olarak içeri alınır', async () => {
    const storage = mem(); const repo = new DemoRepo({ accountId: 'hr', storage });
    await repo.submitApplication('art-director', { name: 'Yeni Aday', email: 'y@a.example' });
    const before = (await repo.list('candidates')).length;
    expect(await repo.ingestApplications()).toBe(1);
    const c = (await repo.list('candidates')).at(-1)!;
    expect(c).toMatchObject({ name: 'Yeni Aday', stage: 'applied', source: 'apply', job_id: 'jb1' });
    expect((await repo.list('candidates')).length).toBe(before + 1);
    expect(await repo.ingestApplications()).toBe(0);
  });
});

describe('hassas veri', () => {
  it('özlük arşivi yalnızca İK; owner varsayılan kapalı; bordro yalnızca payroll', async () => {
    await expect(new DemoRepo({ accountId: 'owner' }).list('hr_docs')).rejects.toBeInstanceOf(ForbiddenError);
    expect((await new DemoRepo({ accountId: 'hr' }).list('hr_docs')).length).toBeGreaterThan(0);
    await expect(new DemoRepo({ accountId: 'hr' }).list('payroll_runs')).rejects.toBeInstanceOf(ForbiddenError);
    const runs = await new DemoRepo({ accountId: 'payroll' }).list('payroll_runs');
    expect(JSON.stringify(runs)).not.toMatch(/salary|maas|maaş/i);
    expect(canReadColl('finance', 'perf_reviews')).toBe(false);
  });
});

describe('CSV ve PDF', () => {
  it('CSV: BOM, virgül/tırnak kaçışı, CRLF', () => {
    const csv = toCsv([['a', 'b,c'], ['"q"', 1, null]]);
    expect(csv.charCodeAt(0)).toBe(0xfeff);
    expect(csv).toContain('"b,c"'); expect(csv).toContain('"""q"""'); expect(csv).toContain('\r\n');
  });
  it('PDF: geçerli başlık/EOF, çok sayfa ve teklif belgesi', () => {
    const txt = (b: Uint8Array) => Array.from(b, (c) => String.fromCharCode(c)).join('');
    const doc = buildPdf({ title: 'Test', blocks: Array.from({ length: 80 }, (_, i) => ({ t: 'p' as const, text: `Satır ${i} ığüşiöç` })) });
    const s = txt(doc.bytes);
    expect(s.startsWith('%PDF-1.4')).toBe(true); expect(s.trimEnd().endsWith('%%EOF')).toBe(true); expect(doc.pages).toBeGreaterThan(1);
    const p: Proposal = { id: 'pr1', org_id: 'o', created_at: '', brand_id: 'c_anova', deal_id: null, number: 'TKL-1', title: 'Deneme', version: 1, status: 'draft', vat_pct: 20, payment_terms_days: 30, valid_until: '2026-11-01', history: [], lines: [{ desc: 'Kalem', qty: 2, unit_minor: 100000 }] };
    expect(txt(proposalPdfBytes(p, 'Anova'))).toContain('/Type /Catalog');
    expect(proposalTotals(p.lines, 20)).toEqual({ subtotal: 200000, vat: 40000, total: 240000 });
    expect(bumpProposal(p, '2026-10-14')).toMatchObject({ version: 2, status: 'draft' });
  });
});

describe('entitlement → menü', () => {
  it('feature_flags false olan ürünün modülü menüden düşer; owner flag’i kaydedebilir, creative kaydedemez', async () => {
    expect(navModules('owner', {}).some((m) => m.id === 'crm')).toBe(true);
    const hidden = navModules('owner', { crm: false, finance: false }).map((m) => m.id);
    expect(hidden).not.toContain('crm'); expect(hidden).not.toContain('finance'); expect(hidden).toContain('marketplace');
    expect(moduleEntitled('overview', { crm: false })).toBe(true);
    const owner = new DemoRepo({ accountId: 'owner' });
    await owner.saveSettings({ feature_flags: { hire: false } });
    expect(navModules('owner', (await owner.getSettings()).feature_flags).some((m) => m.id === 'hire')).toBe(false);
    await expect(new DemoRepo({ accountId: 'creative' }).saveSettings({ feature_flags: { crm: false } })).rejects.toBeInstanceOf(ForbiddenError);
  });
});

describe('şema', () => {
  it('0005 migration her koleksiyon tablosunu oluşturur ve RLS açar (mevcut tablolar ALTER)', () => {
    const sql = readFileSync(fileURLToPath(new URL('../../../../../packages/schema/supabase/migrations/0005_modules.sql', import.meta.url)), 'utf8');
    const existing = new Set(['time_entries', 'invoices', 'surveys', 'survey_responses']);
    for (const k of COLL_KEYS) {
      const t = COLLECTIONS[k].table;
      if (existing.has(t)) expect(sql).toContain(`alter table public.${t} add column if not exists data`);
      else { expect(sql).toContain(`create table public.${t} (`); expect(sql).toContain(`alter table public.${t} enable row level security;`); expect(sql).toContain(`create policy ${t}_r on`); }
    }
    expect(sql).toContain('function public.hire_candidate');
  });
  it('koleksiyon önekleri benzersiz', () => { const p = COLL_KEYS.map((k) => COLLECTIONS[k].prefix); expect(new Set(p).size).toBe(p.length); });
});
