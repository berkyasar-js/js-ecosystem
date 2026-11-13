import { describe, expect, it } from 'vitest';
import { DEFAULT_SETUP, MODULE_PRODUCT, NAV_GROUPS, SETUP_PACKS, activeNavGroup, markInboxDone, moduleFlagKey, nextSetupStep, packsFromFlags, packsToFlags, setupProgress, showSetupCard, toggleFavorite, type Approval, type SetupState, type Task, type TeamMember } from '@jscore/contracts';
import { DemoRepo } from '@jscore/core/repo/demo';
import { crumbFor, mobileTabs, navGroups } from '../nav';
import { buildInbox, filterInbox, inboxCounts } from '../inbox';
import { inProgressAndNext, needsYou, planBuckets, teamPulse } from '../home';
import { answerLocally, detectIntent } from '../ask';
import { guessAppRole, parseTeamRows, resolveManager, toIsoDate, toStatus } from '../team-import';

const task = (p: Partial<Task>): Task => ({ id: 't', org_id: 'o', project_id: 'p1', title: 'Görev', assignee_id: 'SK', state: 'production', priority: 'normal', due_at: '2026-10-14', planned_minutes: 60, task_type: 'general', qty: 1, source_ref: null, labels: [], client_visible: false, created_at: '2026-10-01', ...p });
const approval = (p: Partial<Approval>): Approval => ({ id: 'a', org_id: 'o', action_type: 'content', title: 'Onay', subject: {}, required_role: 'account', status: 'pending', requested_by: 'SK', decided_by: null, decided_at: null, decision_note: null, due_at: '2026-10-15', created_at: '2026-10-10', ...p });
const member = (id: string, hours = 40): TeamMember => ({ id, org_id: 'o', name: `Kişi ${id}`, role_title: '', app_role: 'creative', status: 'active', weekly_hours: hours });

describe('gruplu gezinme', () => {
  it('owner tüm grupları görür; modülleri kapalı grup düşer', () => {
    const all = navGroups('owner', undefined);
    expect(all.map((g) => g.id)).toEqual(NAV_GROUPS.map((g) => g.id));
    const noFin = navGroups('owner', { finance: false, insights: false });
    expect(noFin.some((g) => g.id === 'finance')).toBe(false);
    const part = navGroups('owner', { finance: false }).find((g) => g.id === 'finance')!;
    expect(part.children.map((c) => c.module)).toEqual(['insights']);
    expect(part.href).toBe('/app/insights');
  });
  it('rol erişimi ve settings.nav uygulanır', () => {
    const fl = navGroups('freelancer', undefined);
    expect(fl.some((g) => g.id === 'finance' || g.id === 'clients')).toBe(false);
    expect(fl.find((g) => g.id === 'projects')!.children.map((c) => c.module)).toEqual(['mywork', 'tasks']);
    const custom = navGroups('owner', undefined, { order: ['messages', 'home'], hidden: { owner: ['studio', 'social'] } });
    expect(custom.slice(0, 2).map((g) => g.id)).toEqual(['messages', 'home']);
    expect(custom.find((g) => g.id === 'production')!.children[0].module).toBe('media');
    expect(mobileTabs(custom).map((g) => g.id).sort()).toEqual(['apps', 'home', 'inbox', 'messages', 'projects']);
  });
  it('aktif grup ve ekmek kırıntısı', () => {
    const g = navGroups('owner', undefined);
    expect(activeNavGroup('/app/studio?tab=brief', g)?.id).toBe('production');
    expect(activeNavGroup('/app/projects/p1', g)?.id).toBe('projects');
    expect(crumbFor('/app/mywork', g)).toEqual({ group: 'Projeler', sub: 'Görevlerim' });
    expect(crumbFor('/app/setup', g).group).toBe('Kurulum');
  });
  it('favori ve tamam kümeleri sınırlı', () => {
    expect(toggleFavorite(['a'], 'a')).toEqual([]);
    expect(toggleFavorite(Array.from({ length: 12 }, (_, i) => `m${i}`), 'x')).toHaveLength(12);
    expect(markInboxDone(['a'], 'a')).toEqual(['a']);
  });
});

describe('gelen kutusu kuyruğu', () => {
  const me = { role: 'account' as const, employee_id: 'SK', name: 'Seda Karabacak' };
  const base = { me, today: '2026-10-14', done: [] as string[], approvals: [approval({ id: 'a1' }), approval({ id: 'a2', required_role: 'owner' }), approval({ id: 'a3', status: 'approved' })],
    notifications: [
      { id: 'n1', org_id: 'o', created_at: '2026-10-13', employee_id: 'SK', kind: 'mention' as const, title: 'Anıldın', body: 'x', read: false },
      { id: 'n2', org_id: 'o', created_at: '2026-10-13', employee_id: 'SK', kind: 'task' as const, title: 'Okundu', body: 'x', read: true },
      { id: 'n3', org_id: 'o', created_at: '2026-10-13', employee_id: 'OE', kind: 'task' as const, title: 'Başkasının', body: 'x', read: false },
    ],
    tasks: [task({ id: 't1', due_at: '2026-10-10' }), task({ id: 't2', due_at: '2026-10-14' }), task({ id: 't3', due_at: '2026-10-20', sync_origin: 'trello', synced_at: '2026-10-12T10:00:00Z' }), task({ id: 't4', assignee_id: 'OE', due_at: '2026-10-01' }), task({ id: 't5', due_at: '2026-10-01', state: 'delivery' })] };
  it('yalnızca bana düşenleri toplar, gecikmişler önde', () => {
    const items = buildInbox(base);
    expect(items.map((x) => x.id)).toContain('approval:a1');
    expect(items.map((x) => x.id)).not.toContain('approval:a2');
    expect(items.map((x) => x.id)).not.toContain('notification:n2');
    expect(items.map((x) => x.id)).not.toContain('notification:n3');
    expect(items.map((x) => x.id)).not.toContain('due:t4');
    expect(items.map((x) => x.id)).not.toContain('due:t5');
    expect(items[0].id).toBe('due:t1');
    expect(items.find((x) => x.id === 'trello:t3')).toBeTruthy();
    expect(inboxCounts(items).mention).toBe(1);
    expect(filterInbox(items, 'approval')).toHaveLength(1);
  });
  it('tamam denenler ve eski Trello değişiklikleri düşer', () => {
    const items = buildInbox({ ...base, done: ['due:t1', 'approval:a1'], trelloWindowDays: 1 });
    expect(items.map((x) => x.id)).not.toContain('due:t1');
    expect(items.map((x) => x.id)).not.toContain('trello:t3');
  });
});

describe('ana sayfa yardımcıları', () => {
  const tasks = [task({ id: 't1', due_at: '2026-10-10', priority: 'high' }), task({ id: 't2', due_at: '2026-10-14' }), task({ id: 't3', due_at: '2026-10-18', state: 'brief' }), task({ id: 't4', due_at: '2026-11-30', state: 'plan', labels: ['waiting'] }), task({ id: 't5', assignee_id: 'OE', due_at: '2026-10-01', planned_minutes: 2400 })];
  it('plan kovaları ve aşama sayımı', () => {
    const b = planBuckets(tasks, 'SK', '2026-10-14');
    expect([b.overdue.length, b.today.length, b.week.length, b.later.length]).toEqual([1, 1, 1, 1]);
    expect(b.byStage.find((s) => s.stage === 'production')?.count).toBe(2);
    const pn = inProgressAndNext(tasks, 'SK');
    expect(pn.inProgress.map((t) => t.id)).toEqual(['t1', 't2']);
    expect(pn.next.map((t) => t.id)).toEqual(['t3', 't4']);
  });
  it('senden bekleyenler ve ekip nabzı', () => {
    const ny = needsYou('account', [approval({ id: 'a1' }), approval({ id: 'a2', required_role: 'owner' })], tasks, 'SK', '2026-10-14');
    expect(ny.decide.map((a) => a.id)).toEqual(['a1']);
    expect(ny.blocked.map((t) => t.id)).toEqual(['t1', 't4']);
    const pulse = teamPulse(tasks, [member('SK'), member('OE', 40), member('XX')], '2026-10-14');
    expect(pulse.map((r) => r.member.id)).toEqual(['OE', 'SK']);
    expect(pulse[0].loadPct).toBe(100);
    expect(pulse[0].overdue).toBe(1);
  });
});

describe('Sor (yerel)', () => {
  const ctx = { tasks: [task({ id: 't1', due_at: '2026-10-14' }), task({ id: 't2', due_at: '2026-10-01' })], projects: [{ id: 'p1', org_id: 'o', brand_id: 'b1', name: 'Anova Lansman', type: 'x', status: 'active' as const, flow_stage: 'production' as const, flow_owner: 'SK', stage_plan: [], due_at: '2026-11-01', budget_minor: 0, summary: '', client_visible: false }], brands: [], team: [member('SK')], approvals: [approval({})], today: '2026-10-14' };
  it('niyet algılar', () => {
    expect(detectIntent('Bugün ne teslim?')).toBe('due_today');
    expect(detectIntent('neler gecikti')).toBe('overdue');
    expect(detectIntent('kim yoğun?')).toBe('overloaded');
    expect(detectIntent('bekleyen onaylar')).toBe('approvals');
    expect(detectIntent('')).toBe('help');
  });
  it('proje ve kişi adına odaklanır', () => {
    expect(answerLocally('Anova Lansman ne durumda?', ctx).href).toBe('/app/projects/p1');
    expect(answerLocally('Kişi SK neler yapıyor', ctx).intent).toBe('person');
    expect(answerLocally('neler gecikti', ctx).title).toBe('Geciken: 1');
    expect(answerLocally('bugün', ctx).lines[0]).toContain('Görev');
  });
});

describe('kurulum', () => {
  it('paket → bayrak ve geri', () => {
    const flags = packsToFlags(['finance'], { crm: true }, moduleFlagKey);
    expect(flags.finance).toBe(true); expect(flags.insights).toBe(true); expect(flags.studio).toBe(false); expect(flags.crm).toBe(false);
    expect(packsFromFlags(flags, moduleFlagKey)).toEqual(['finance']);
    expect(packsFromFlags(undefined, moduleFlagKey)).toHaveLength(SETUP_PACKS.length);
    expect(SETUP_PACKS.flatMap((p) => p.modules).every((m) => m in MODULE_PRODUCT || m === 'twins')).toBe(true);
  });
  it('ilerleme ve kart görünürlüğü', () => {
    expect(setupProgress(DEFAULT_SETUP)).toEqual({ done: 0, total: 5, pct: 0, complete: false });
    const s: SetupState = { ...DEFAULT_SETUP, done: ['org', 'team'] };
    expect(nextSetupStep(s)).toBe('modules');
    expect(setupProgress(s).pct).toBe(40);
    expect(showSetupCard('owner', s)).toBe(true);
    expect(showSetupCard('creative', s)).toBe(false);
    expect(showSetupCard('owner', { ...s, completed_at: '2026-10-14' })).toBe(false);
  });
  it('XLSX "Ekip" satırları: yalnızca izinli sütunlar, maaş yok sayılır', () => {
    const r = parseTeamRows([
      { 'Ad Soyad': 'Seda Karabacak', Pozisyon: 'Senior Art Director', Ekip: 'Kreatif', 'Bağlı olduğu': 'Ural Çalışkan', 'El kitabı rolü': 'Kreatif', Statü: 'Aktif', 'İşe giriş': 45000, 'Brüt Maaş': 120000, 'TC Kimlik': '1', Telefon: 'x' },
      { 'Ad Soyad': 'Bengisu Arda', Pozisyon: 'Mali İşler', Statü: 'Ayrıldı', 'İşe giriş': '03.02.2021', 'Not': 'x' },
      { 'Ad Soyad': '', Pozisyon: 'boş' },
    ]);
    expect(r.rows).toHaveLength(2); expect(r.skipped).toBe(1);
    expect(r.ignored_columns.sort()).toEqual(['Brüt Maaş', 'TC Kimlik', 'Telefon']);
    expect(r.unknown_columns).toEqual(['Not']);
    expect(r.rows[0]).toMatchObject({ name: 'Seda Karabacak', team: 'Kreatif', manager_name: 'Ural Çalışkan', status: 'active', hired_at: '2023-03-15', app_role: 'creative' });
    expect(r.rows[1]).toMatchObject({ status: 'left', hired_at: '2021-02-03', app_role: 'finance' });
    expect(JSON.stringify(r.rows)).not.toContain('120000');
  });
  it('tarih / statü / rol / yönetici çözümü', () => {
    expect(toIsoDate('2024-1-5')).toBe('2024-01-05'); expect(toIsoDate('5/1/2024')).toBe('2024-01-05'); expect(toIsoDate('yok')).toBeNull();
    expect(toStatus('pasif')).toBe('left'); expect(guessAppRole('Kurucu', '')).toBe('owner'); expect(guessAppRole(null, 'Account Executive')).toBe('account');
    const people = [{ id: '1', name: 'Ural Çalışkan' }, { id: '2', name: 'Öykü Erelmalı' }, { id: '3', name: 'Öykü Er' }];
    expect(resolveManager('Ural Çalışkan', people)).toBe('1'); expect(resolveManager('Öykü', people)).toBeNull(); expect(resolveManager(null, people)).toBeNull();
  });
});

describe('DemoRepo 0016 yüzeyi', () => {
  it('çalışan ekle/güncelle, tercihler, marka + proje', async () => {
    const repo = new DemoRepo({ accountId: 'owner' });
    const e = await repo.addEmployee({ name: 'Yeni Kişi', role_title: 'Designer', team: 'Kreatif', manager_id: 'UC' });
    expect(e.manager_id).toBe('UC');
    await expect(repo.updateEmployee(e.id, { manager_id: e.id })).rejects.toThrow();
    expect((await repo.updateEmployee(e.id, { team: 'Video' })).team).toBe('Video');
    expect((await repo.team()).find((t) => t.id === 'SK')?.manager_id).toBe('UC');
    expect((await repo.getPrefs()).favorites).toEqual([]);
    expect((await repo.savePrefs({ favorites: ['crm'], welcome_done: true })).welcome_done).toBe(true);
    const b = await repo.createBrand({ name: 'Yeni Marka', sector: 'Gıda' });
    const p = await repo.createProject({ brand_id: b.id, name: 'İlk proje' });
    expect((await repo.listProjects()).some((x) => x.id === p.id)).toBe(true);
    await expect(new DemoRepo({ accountId: 'creative' }).addEmployee({ name: 'X Y' })).rejects.toThrow();
    const st = await repo.saveSettings({ setup: { ...DEFAULT_SETUP, done: ['org'] } });
    expect(st.setup?.done).toEqual(['org']);
  });
});
