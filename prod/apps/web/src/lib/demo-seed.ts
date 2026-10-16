import type {
  AuditEvent, AccessToken, AgentPrompt, AgentRun, Approval, BoardDecision, Brand, Channel, Integration, McpServer, Me, Member, Message,
  Organization, OrgSettings, Project, Role, StagePlanItem, Task, TaskAssignment, TaskBid, TaskState, TaskType, TeamMember, Twin, TwinBid, Webhook,
} from '@jscore/contracts';
import { TASK_STATES } from '@jscore/contracts';
import { makeModuleSeed, type ModuleCols } from './demo-seed-modules';

export const ORG_JOBS = 'org_jobs';
export const ORG_EDIT = 'org_edit';
export const DEMO_MCP_TOKEN = 'jsdemo_token';

export interface DemoAccount { id: string; role: Role; name: string; initials: string; title: string; email: string; hint: string; employee_id: string; brand_ids: string[] }
export const DEMO_ACCOUNTS: DemoAccount[] = [
  { id: 'owner', role: 'owner', name: 'Batuhan Berk Yaşar', initials: 'BY', title: 'Kurucu / Organization Owner', email: 'batuhan@jobsstudio.example', hint: 'Kârlılık, risk, onay ve tüm modüller', employee_id: 'BY', brand_ids: [] },
  { id: 'account', role: 'account', name: 'Öykü Erelmalı', initials: 'OE', title: 'Brand Manager · Operasyon', email: 'oyku@jobsstudio.example', hint: 'Müşteri hesapları, gelen talepler, planlama', employee_id: 'OE', brand_ids: [] },
  { id: 'creative', role: 'creative', name: 'Seda Karabacak', initials: 'SK', title: 'Senior Art Director · Creative', email: 'seda@jobsstudio.example', hint: 'Benim işlerim, stüdyo, inceleme', employee_id: 'SK', brand_ids: [] },
  { id: 'finance', role: 'finance', name: 'Bengisu Arda', initials: 'BA', title: 'Mali İşler · Finance', email: 'bengisu@jobsstudio.example', hint: 'Tahsilat, gider, marj ve onaylar', employee_id: 'BA', brand_ids: [] },
  { id: 'hr', role: 'hr', name: 'Bengisu Arda', initials: 'BA', title: 'İK personel yöneticisi', email: 'ik@jobsstudio.example', hint: 'Özlük arşivi, izin, onboarding; bordro yetkisi yok', employee_id: 'BA', brand_ids: [] },
  { id: 'payroll', role: 'payroll', name: 'Bengisu Arda', initials: 'BA', title: 'Bordro yöneticisi', email: 'bordro@jobsstudio.example', hint: 'Payroll Vault, ücret geçmişi (step-up MFA)', employee_id: 'BA', brand_ids: [] },
  { id: 'client_admin', role: 'client_admin', name: 'Anova müşteri temsilcisi', initials: 'CL', title: 'Client Admin · Anova', email: 'marketing@anova.example', hint: 'Yalnızca Anova ve Wellana portal verisi', employee_id: '', brand_ids: ['c_anova', 'c_wellana'] },
  { id: 'client_viewer', role: 'client_viewer', name: 'Pınar Y.', initials: 'PY', title: 'Client Viewer · Anova', email: 'pinar@anova.example', hint: 'Yorum ve izleme; nihai onay Client Admin’de', employee_id: '', brand_ids: ['c_anova'] },
];

export const accountToMe = (a: DemoAccount, org_id: string): Me => ({
  id: `u_${a.id}`, name: a.name, email: a.email, initials: a.initials, title: a.title, role: a.role, org_id,
  employee_id: a.employee_id || undefined, client_id: a.brand_ids[0] ? a.brand_ids[0].replace('c_', 'cl_') : undefined, brand_ids: a.brand_ids,
  scopes: a.role === 'hr' ? ['can.read.hr_archive'] : a.role === 'payroll' ? ['can.read.payroll'] : [],
});

const orgs: Organization[] = [
  { id: ORG_JOBS, name: 'Jobs Studio', slug: 'jobs' },
  { id: ORG_EDIT, name: 'Edit Culture & Events', slug: 'edit' },
];

/* [id, ad, sektör, durum, account_owner, art_director, health, org, kota] */
type B = [string, string, string, Brand['status'], string, string, number, string, Record<string, number>?];
const brandRows: B[] = [
  ['c_badem', 'Badem Pınarı', 'FMCG · Su', 'active', 'SO', 'SK', 82, ORG_JOBS, { social_visual: 8, reels: 2 }],
  ['c_anova', 'Anova', 'Savunma & Havacılık', 'active', 'OE', 'DO', 78, ORG_JOBS, { social_visual: 2, reels: 1 }],
  ['c_alimar', 'Alimar', 'Gıda', 'active', 'SO', 'RV', 74, ORG_JOBS],
  ['c_dora', 'Dora', 'Mobilya', 'active', 'OE', 'SK', 88, ORG_JOBS],
  ['c_dogruer', 'Doğruer', 'İnşaat', 'active', 'SO', 'DO', 70, ORG_JOBS],
  ['c_noche', 'Noche', 'Yaşam & tasarım', 'active', 'OE', 'RV', 76, ORG_JOBS],
  ['c_paintfield', 'Paintfield', 'Boya', 'active', 'SO', 'SK', 80, ORG_JOBS],
  ['c_numesys', 'Numesys', 'Mühendislik yazılımı', 'active', 'OE', 'DO', 84, ORG_EDIT],
  ['c_wellana', 'Wellana', 'Sağlık & wellness', 'risky', 'OE', 'SK', 52, ORG_JOBS, { social_visual: 12 }],
  ['c_sensortek', 'Sensörtek', 'Endüstriyel sensör', 'active', 'SO', 'RV', 72, ORG_JOBS],
  ['c_edsis', 'Edsis', 'Eğitim teknolojisi', 'active', 'OE', 'DO', 79, ORG_JOBS],
  ['c_esen', 'Esen', 'Perakende', 'active', 'SO', 'SK', 81, ORG_JOBS],
  ['c_ozkaramete', 'Özkaramete', 'Gıda', 'active', 'OE', 'RV', 77, ORG_JOBS],
  ['c_batubaha', 'Batu Baha', 'Tekstil', 'active', 'SO', 'DO', 75, ORG_JOBS],
  ['c_premium', 'Premium İşitme', 'Sağlık', 'active', 'OE', 'SK', 83, ORG_JOBS],
  ['c_edit', 'Edit Culture & Events', 'Etkinlik (grup şirketi)', 'active', 'OE', 'RV', 90, ORG_EDIT],
  ['c_jobs', 'Jobs Studio', 'Ajans (kendi markası)', 'active', 'OE', 'SK', 95, ORG_JOBS],
  ['c_opsin', 'Opsin', 'Optik', 'risky', 'SO', 'DO', 48, ORG_JOBS],
  ['c_marinbase', 'Marinbase', 'Denizcilik', 'active', 'SO', 'RV', 73, ORG_JOBS],
  ['c_clayton', 'Clayton', 'Gayrimenkul', 'prospect', 'OE', 'DO', 60, ORG_JOBS],
  ['c_globmac', 'Globmac', 'Makine', 'prospect', 'SO', 'SK', 55, ORG_JOBS],
  ['c_kuzey', 'Kuzey Enerji', 'Enerji', 'active', 'SO', 'RV', 71, ORG_JOBS],
  ['c_lumio', 'Lumio', 'Aydınlatma', 'active', 'OE', 'DO', 69, ORG_JOBS],
  ['c_tarla', 'Tarla Sofrası', 'Gıda', 'prospect', 'SO', 'SK', 58, ORG_JOBS],
];
const brands: Brand[] = brandRows.map(([id, name, sector, status, owner, ad, health, org, quota]) => ({
  id, org_id: org, client_id: id.replace('c_', 'cl_'), name, sector, status, account_owner: owner, art_director: ad, copywriter: 'SO',
  compliance_flags: id === 'c_anova' ? ['savunma-sanayii-gizlilik'] : id === 'c_wellana' ? ['saglik-beyani'] : [], monthly_quota: quota ?? {}, health,
  internal: id === 'c_edit' || id === 'c_jobs', email: `info@${id.slice(2)}.example`,
}));

const stageIdx = (s: TaskState) => TASK_STATES.indexOf(s);
const buildPlan = (flow: TaskState, due: string, owner: string): StagePlanItem[] => {
  const end = new Date(`${due}T12:00:00Z`).getTime();
  const start = end - 28 * 86400000;
  const stages = TASK_STATES.slice(0, 7);
  return stages.map((stage, i) => ({
    stage, owner, done: i < stageIdx(flow),
    due_at: new Date(start + ((end - start) * (i + 1)) / stages.length).toISOString().slice(0, 10),
  }));
};
/* [id, brand, ad, tür, durum, flow_stage, flow_owner, due, bütçe(TL), client_visible, özet, org] */
type P = [string, string, string, string, Project['status'], TaskState, string, string, number, boolean, string, string];
const projectRows: P[] = [
  ['p1', 'c_wellana', 'Wellana · Sonbahar kampanyası', 'Kampanya', 'active', 'internal_review', 'SK', '2026-10-30', 420000, true, 'Sonbahar ürün serisi için çok kanallı kampanya: ana görsel, sosyal içerik seti ve mağaza içi uyarlamalar.', ORG_JOBS],
  ['p2', 'c_clayton', 'Clayton · Lansman teklifi', 'Marka deneyimi', 'planning', 'production', 'OE', '2026-11-06', 650000, false, 'Yeni konut projesi için lansman konsepti, satış ofisi deneyimi ve dijital varlıklar teklifi.', ORG_JOBS],
  ['p3', 'c_anova', 'Anova · Lansman filmi', 'Video prodüksiyon', 'active', 'production', 'HO', '2026-10-23', 280000, true, 'Yeni ürün serisi için 60 sn lansman filmi ve 3 kısa sosyal kesit.', ORG_JOBS],
  ['p4', 'c_numesys', 'Edit · Numesys yıl sonu etkinliği', 'Etkinlik', 'active', 'scope', 'RV', '2026-11-20', 320000, false, '320 kişilik yıl sonu buluşması: mekân, sahne, run-of-show ve içerik.', ORG_EDIT],
  ['p5', 'c_dora', 'Dora · Sürdürülebilirlik raporu', 'Strateji', 'done', 'archive', 'UC', '2026-10-02', 180000, false, '2026 sürdürülebilirlik iletişimi için konumlandırma ve içerik sistemi.', ORG_JOBS],
  ['p6', 'c_badem', 'Badem Pınarı · Ekim sosyal paketi', 'Sosyal medya', 'active', 'approval', 'SO', '2026-10-31', 54166, false, 'Aylık 8 post + 2 Reels sosyal paket; Ekim teması “kaynağından”.', ORG_JOBS],
  ['p7', 'c_anova', 'Anova · Ekim sosyal paketi', 'Sosyal medya', 'active', 'internal_review', 'DO', '2026-10-31', 62500, true, 'Aylık sözleşme: 2 sosyal görsel + 1 Reels; lansman dönemi ek talepleri teklifle yönetilir.', ORG_JOBS],
];
const projects: Project[] = projectRows.map(([id, brand_id, name, type, status, flow_stage, flow_owner, due, budget, vis, summary, org]) => ({
  id, org_id: org, brand_id, name, type, status, flow_stage, flow_owner, stage_plan: buildPlan(flow_stage, due, flow_owner), due_at: due, budget_minor: budget * 100, summary, client_visible: vis,
}));

/* [id, proje, başlık, atanan, durum, öncelik, due, planlanan dk, tür, adet, etiketler, client_visible] */
type T = [string, string, string, string, TaskState, Task['priority'], string, number, string, number, string[], boolean];
const taskRows: T[] = [
  ['t1', 'p1', 'Wellana ana görsel revizyonu v03', 'SK', 'internal_review', 'high', '2026-10-15', 480, 'main_visual', 1, ['tasarım', 'ana görsel'], true],
  ['t2', 'p2', 'Clayton teklif sunumu taslağı', 'OE', 'production', 'high', '2026-10-16', 360, 'proposal_deck', 1, ['teklif', 'sunum'], false],
  ['t3', 'p3', 'Anova lansman filmi offline kurgu', 'HO', 'production', 'high', '2026-10-17', 1200, 'video_edit', 1, ['video'], true],
  ['t4', 'p1', 'Wellana sosyal metin seti (12 post)', 'SO', 'plan', 'normal', '2026-10-19', 480, 'social_copy', 12, ['copy', 'sosyal'], false],
  ['t5', 'p4', 'Numesys etkinlik mekân alternatifleri', 'RV', 'scope', 'normal', '2026-10-21', 240, 'status_report', 1, ['etkinlik'], false],
  ['t6', 'p2', 'Clayton rakip analizi', 'DO', 'archive', 'normal', '2026-10-13', 420, 'proposal_deck', 1, ['araştırma'], false],
  ['t7', 'p3', 'Anova çekim günü planı', 'HO', 'archive', 'normal', '2026-10-09', 600, 'video_edit', 1, ['video'], true],
  ['t8', 'p5', 'Dora rapor teslimi', 'UC', 'archive', 'normal', '2026-10-02', 960, 'proposal_deck', 1, ['strateji'], false],
  ['t9', 'p6', 'Badem Pınarı Ekim post seti · görseller (8)', 'SK', 'approval', 'normal', '2026-10-16', 960, 'social_visual', 8, ['sosyal', 'tasarım'], false],
  ['t10', 'p6', 'Badem Pınarı Reels · “kaynağından” kurgu', 'HO', 'brief', 'normal', '2026-10-20', 480, 'reels', 1, ['reels'], false],
  ['t11', 'p7', 'Anova Ekim sosyal · 2 görsel', 'DO', 'internal_review', 'high', '2026-10-10', 480, 'social_visual', 2, ['sosyal'], true],
  ['t12', 'p1', 'Wellana Kasım yenileme teklifi hazırlığı', 'OE', 'brief', 'high', '2026-10-24', 240, 'proposal_deck', 1, ['teklif', 'yenileme'], false],
];
const projOrg = Object.fromEntries(projects.map((p) => [p.id, p.org_id]));
const tasks: Task[] = taskRows.map(([id, project_id, title, assignee_id, state, priority, due_at, planned_minutes, task_type, qty, labels, vis]) => ({
  id, org_id: projOrg[project_id], project_id, title, assignee_id, state, priority, due_at, planned_minutes, task_type, qty, source_ref: null, labels, client_visible: vis, created_at: '2026-10-01T09:00:00Z',
}));

export const TASK_TYPES: TaskType[] = [
  { key: 'main_visual', label: 'Ana görsel', sla_hours: 120, default_minutes: 480, unit_price_minor: 1800000 },
  { key: 'social_visual', label: 'Sosyal görsel', sla_hours: 72, default_minutes: 240, unit_price_minor: 725000 },
  { key: 'social_copy', label: 'Sosyal metin seti', sla_hours: 48, default_minutes: 120, unit_price_minor: 350000 },
  { key: 'reels', label: 'Reels / kısa video', sla_hours: 168, default_minutes: 480, unit_price_minor: 1450000 },
  { key: 'video_edit', label: 'Video kurgu', sla_hours: 168, default_minutes: 1200, unit_price_minor: 4500000 },
  { key: 'proposal_deck', label: 'Teklif / sunum', sla_hours: 96, default_minutes: 360, unit_price_minor: 1200000 },
  { key: 'status_report', label: 'Müşteri status raporu', sla_hours: 24, default_minutes: 60, unit_price_minor: 0 },
  { key: 'general', label: 'Genel', sla_hours: 72, default_minutes: 120, unit_price_minor: 0 },
];

const team: TeamMember[] = ([
  ['BY', 'Batuhan Berk Yaşar', 'Kurucu', 'owner', 40], ['UC', 'Ural Çalışkan', 'Executive Creative Director', 'creative', 36],
  ['OE', 'Öykü Erelmalı', 'Brand Manager', 'account', 34], ['SO', 'Selin Öztekeşin', 'Senior Marka Temsilcisi', 'account', 30],
  ['SK', 'Seda Karabacak', 'Senior Art Director', 'creative', 38], ['DO', 'Duygu Öztürk', 'Art Director', 'creative', 31],
  ['RV', 'Raif Vural', 'Art Director', 'creative', 28], ['HO', 'Hulusi Melih Özbay', 'Video & Kurgu', 'creative', 40],
  ['BA', 'Bengisu Arda', 'İK & Mali İşler', 'finance', 24], ['FA', 'Fatma Ş.', 'Account Executive', 'account', 32],
  ['ST', 'Selin Tekin', 'Account Executive', 'account', 30], ['BK', 'Berke A.', 'Junior Designer', 'creative', 40],
] as Array<[string, string, string, Role, number]>).map(([id, name, role_title, app_role, weekly_hours]) => ({ id, org_id: ORG_JOBS, name, role_title, app_role, status: 'active' as const, weekly_hours }));

/* [id, başlık, tür, durum, tutar(TL), proje, marka, kim, required_role, due, versiyon/not] */
type A = [string, string, Approval['action_type'], Approval['status'], number, string, string, string, Role, string, string];
const approvalRows: A[] = [
  ['a1', 'Wellana ana görseli', 'content', 'pending', 0, 'p1', 'c_wellana', 'SK', 'account', '2026-10-16', 'v03'],
  ['a2', 'Anova film storyboard', 'client_decision', 'pending', 0, 'p3', 'c_anova', 'HO', 'client_admin', '2026-10-15', 'v02'],
  ['a3', 'Dora rapor tasarımı', 'content', 'approved', 0, 'p5', 'c_dora', 'SK', 'account', '2026-10-02', 'v04'],
  ['a4', 'Anova motion freelancer ek bütçesi (19.500 TL · Seviye 1)', 'budget', 'pending', 19500, 'p3', 'c_anova', 'HO', 'pm', '2026-10-16', ''],
  ['a5', 'Numesys etkinlik sahne & LED kiralama (86.000 TL · Seviye 2)', 'budget', 'pending', 86000, 'p4', 'c_numesys', 'RV', 'owner', '2026-10-20', ''],
  ['a6', 'Anova · 1 ek sosyal görsel + lansman sunumu (kapsam dışı)', 'scope', 'pending', 14500, 'p7', 'c_anova', 'OE', 'account', '2026-10-15', ''],
  ['a7', 'Badem Pınarı Ekim takvimi · toplu müşteri onayı', 'client_decision', 'pending', 0, 'p6', 'c_badem', 'SO', 'client_admin', '2026-10-17', 'Ekim'],
  ['a8', 'Fatma Ş. → Account Manager rol yükseltme', 'access', 'pending', 0, '', '', 'BA', 'owner', '2026-10-18', ''],
];
const approvals: Approval[] = approvalRows.map(([id, title, action_type, status, amount, project_id, brand_id, by, required_role, due_at, version]) => ({
  id, org_id: projOrg[project_id] ?? ORG_JOBS, action_type, title, subject: { project_id: project_id || undefined, brand_id: brand_id || undefined, amount_minor: amount ? amount * 100 : undefined, version: version || undefined },
  required_role, status, requested_by: by, decided_by: status === 'approved' ? 'u_account' : null, decided_at: status === 'approved' ? '2026-10-02T10:00:00Z' : null,
  decision_note: status === 'approved' ? 'Baskı provası onaylandı.' : null, due_at, created_at: '2026-10-13T09:00:00Z',
}));

const channels: Channel[] = [
  { id: 'ch_inbox', org_id: ORG_JOBS, name: 'Akıllı Gelen Kutusu', kind: 'inbox', brand_id: null },
  { id: 'ch_general', org_id: ORG_JOBS, name: 'genel', kind: 'channel', brand_id: null },
  { id: 'ch_wellana', org_id: ORG_JOBS, name: 'wellana-kampanya', kind: 'channel', brand_id: 'c_wellana' },
  { id: 'ch_anova', org_id: ORG_JOBS, name: 'anova-lansman', kind: 'channel', brand_id: 'c_anova' },
  { id: 'ch_edit', org_id: ORG_EDIT, name: 'numesys-etkinlik', kind: 'channel', brand_id: 'c_numesys' },
  { id: 'ch_inbox_edit', org_id: ORG_EDIT, name: 'Akıllı Gelen Kutusu', kind: 'inbox', brand_id: null },
];
const msg = (id: string, ch: string, org: string, aid: string, an: string, body: string, at: string, meta: Message['meta'] = {}): Message => ({ id, org_id: org, channel_id: ch, author_id: aid, author_name: an, body, meta, created_at: at });
const messages: Message[] = [
  msg('m1', 'ch_inbox', ORG_JOBS, 'ext', 'Pınar Y. (Anova)', 'Merhaba, lansman haftası için 1 ek sosyal görsel ve kısa bir lansman sunumu rica edebilir miyiz? Cuma’ya yetişirse harika olur.', '2026-10-14T08:20:00Z', { from: 'marketing@anova.example', subject: 'Lansman için ek görsel ve sunum', brand_id: 'c_anova' }),
  msg('m2', 'ch_inbox', ORG_JOBS, 'ext', 'Deniz (Wellana)', 'v03 için tipografi yönü 2 olsun lütfen; sosyal uyarlamalar da aynı dilde gelsin. Revizyon notlarını ekte paylaştım.', '2026-10-14T07:45:00Z', { from: 'deniz@wellana.example', subject: 'Ana görsel revizyon notları', brand_id: 'c_wellana' }),
  msg('m3', 'ch_inbox', ORG_JOBS, 'ext', 'Badem Pınarı Pazarlama', 'Ekim takvimini inceledik, onay için portalda bekliyoruz. Reels sıralamasında küçük bir değişiklik isteyebiliriz.', '2026-10-13T16:10:00Z', { from: 'marka@bademipinari.example', subject: 'Ekim takvimi onayı', brand_id: 'c_badem' }),
  msg('m4', 'ch_inbox', ORG_JOBS, 'ext', 'Ali (Clayton)', 'Lansman teklifi için perşembe bir toplantı yapabilir miyiz? Sunum taslağını görmek isteriz.', '2026-10-13T11:00:00Z', { from: 'ali@clayton.example', subject: 'Lansman teklifi toplantısı', brand_id: 'c_clayton' }),
  msg('m5', 'ch_general', ORG_JOBS, 'u_owner', 'Batuhan Berk Yaşar', 'Haftalık kurul Cuma 10:00. Onay bekleyen kararlar JS Core üzerinde.', '2026-10-14T08:00:00Z'),
  msg('m6', 'ch_general', ORG_JOBS, 'u_account', 'Öykü Erelmalı', 'Anova ek talepleri kapsam dışı olarak onay merkezine düştü.', '2026-10-14T09:10:00Z'),
  msg('m7', 'ch_wellana', ORG_JOBS, 'u_creative', 'Seda Karabacak', 'v03 iç revizede; tipografi alternatif 2 ile devam ediyorum.', '2026-10-13T17:40:00Z'),
  msg('m8', 'ch_anova', ORG_JOBS, 'u_account', 'Öykü Erelmalı', 'Offline kurgu v1 Cuma teslim; müzik lisansı bekleniyor.', '2026-10-14T09:20:00Z'),
  msg('m9', 'ch_edit', ORG_EDIT, 'u_owner', 'Batuhan Berk Yaşar', 'Sahne & LED teklifi onay bekliyor (Seviye 2).', '2026-10-13T15:35:00Z'),
];

const board: BoardDecision[] = ([
  ['BD-101', 'cfo', 2, 'Numesys sahne & LED kiralama (86.000 TL) onaylansın', 'Bütçe %12 marj içinde; tedarikçi teklifi 3 alternatifle karşılaştırıldı.', 'medium', { cfo: 'yes', coo: 'yes', ceo: 'yes', clo: 'abstain' }],
  ['BD-102', 'cco', 2, 'Wellana (sağlık 52) için haftalık müşteri check-in başlat', 'Sağlık skoru düşük; revizyon turları uzuyor.', 'medium', { cco: 'yes', ceo: 'yes', coo: 'yes', cfo: 'abstain' }],
  ['BD-103', 'coo', 1, 'Video & Kurgu kapasitesine freelancer ekle', 'HO %110 yükte; Anova teslimi risk altında.', 'low', { coo: 'yes', chro: 'yes', cfo: 'no' }],
  ['BD-104', 'clo', 3, 'Anova savunma sanayii içerikleri için ek gizlilik protokolü', 'Sözleşmede yer alan gizlilik bayrağı uygulamada izlenmiyor.', 'high', { clo: 'yes', cto: 'yes', ceo: 'yes', cco: 'yes' }],
] as Array<[string, BoardDecision['proposed_by'], 1 | 2 | 3, string, string, BoardDecision['risk'], BoardDecision['votes']]>).map(([proposal_id, proposed_by, level, action, rationale, risk, votes]) => ({
  id: `bd_${proposal_id}`, org_id: ORG_JOBS, proposal_id, proposed_by, level, action, rationale, risk, votes, status: 'pending' as const, founder_answer: null, created_at: '2026-10-13T18:00:00Z', decided_at: null,
}));

const twin = (id: string, kind: Twin['kind'], name: string, employee_id: string | null, profile: Record<string, unknown>, opt_out = false, approved = true): Twin => ({
  id, org_id: ORG_JOBS, kind, name, employee_id, profile, defaults: { weekly_hours: profile.hours ?? 36, focus_blocks: '09:30-12:00' }, preferences: { notify: 'in_app' }, opt_out, approved_by_owner_at: approved ? '2026-09-20T10:00:00Z' : null,
});
const twins: Twin[] = [
  twin('tw1', 'person', 'Seda Karabacak · ikiz', 'SK', { skills: ['Ana görsel', 'Sosyal set', 'Sunum tasarımı'], hours: 38 }),
  twin('tw2', 'person', 'Hulusi Melih Özbay · ikiz', 'HO', { skills: ['Offline kurgu', 'Çekim', 'Motion'], hours: 40 }),
  twin('tw3', 'person', 'Öykü Erelmalı · ikiz', 'OE', { skills: ['Marka planı', 'Müşteri yönetimi', 'Teklif'], hours: 34 }, true),
  twin('tw5', 'person', 'Duygu Öztürk · ikiz', 'DO', { skills: ['Ana görsel', 'Banner', 'Sosyal set'], hours: 31 }),
  twin('tw4', 'role', 'Art Director · rol ikizi', null, { skills: ['Ana görsel', 'Sosyal set', 'Banner'], hours: 32 }),
];
const bids: TwinBid[] = [
  { id: 'bid1', title: 'Paintfield sonbahar kampanya seti', brand: 'Paintfield', budget_minor: 18000000, due_at: '2026-10-28', matches: [{ twin_id: 'tw1', score: 92 }, { twin_id: 'tw4', score: 81 }] },
  { id: 'bid2', title: 'Marinbase tanıtım filmi (45 sn)', brand: 'Marinbase', budget_minor: 36000000, due_at: '2026-11-10', matches: [{ twin_id: 'tw2', score: 88 }] },
  { id: 'bid3', title: 'Lumio ürün katalog tasarımı', brand: 'Lumio', budget_minor: 9500000, due_at: '2026-11-03', matches: [{ twin_id: 'tw4', score: 76 }, { twin_id: 'tw1', score: 70 }] },
];

const prompts: AgentPrompt[] = (['chair', 'ceo', 'cfo', 'coo', 'cmo', 'cto', 'chro', 'cco', 'clo', 'inbox_drafts', 'twin_person', 'twin_role', 'twin_bid', 'studio_draft'] as const).map((agent, i) => ({
  id: `ap${i}`, agent, version: 1, model: agent === 'inbox_drafts' || agent === 'twin_bid' ? 'claude-haiku-4-5' : 'claude-sonnet-4-5', is_active: true, output_schema: {},
  system_prompt: `Demo prompt · ${agent.toUpperCase()} — gerçek metin packages/prompts/prompts/${agent}.md dosyasındadır.`,
}));
const runs: AgentRun[] = [
  { id: 'r1', org_id: ORG_JOBS, agent: 'inbox_drafts', trigger: 'inbox', input: {}, output: {}, model: 'claude-haiku-4-5', tokens_in: 820, tokens_out: 310, cost_usd: 0.00237, latency_ms: 1480, status: 'demo', created_at: '2026-10-14T08:25:00Z' },
  { id: 'r2', org_id: ORG_JOBS, agent: 'chair', trigger: 'weekly_board', input: {}, output: {}, model: 'claude-sonnet-4-5', tokens_in: 6400, tokens_out: 1900, cost_usd: 0.0477, latency_ms: 9200, status: 'demo', created_at: '2026-10-11T07:00:00Z' },
  { id: 'r3', org_id: ORG_JOBS, agent: 'cfo', trigger: 'weekly_board', input: {}, output: {}, model: 'claude-sonnet-4-5', tokens_in: 3100, tokens_out: 800, cost_usd: 0.0213, latency_ms: 5100, status: 'demo', created_at: '2026-10-11T07:00:30Z' },
];

const integ = (id: string, provider: string, name: string, status: Integration['status'], scopes: string[]): Integration => ({ id, org_id: ORG_JOBS, provider, name, status, scopes, secret_ref: status === 'connected' ? `vault:${provider}` : null });
const integrations: Integration[] = [
  integ('i1', 'google', 'Google Workspace (Gmail · Takvim)', 'connected', ['gmail.readonly', 'calendar']),
  integ('i2', 'anthropic', 'Anthropic (Claude API)', 'connected', ['messages']),
  integ('i3', 'vimeo', 'Vimeo', 'connected', ['public', 'private']),
  integ('i4', 'minio', 'MinIO / S3 dosya deposu', 'connected', ['read', 'write']),
  integ('i5', 'slack', 'Slack', 'available', ['chat:write']),
  integ('i6', 'efatura', 'e-Fatura (Logo)', 'available', ['invoice']),
];
const mcp_servers: McpServer[] = [
  { id: 'mcp1', org_id: ORG_JOBS, name: 'JS Core MCP (bu uygulama)', url: '/api/mcp', status: 'connected', tools: ['project_status', 'create_task_draft'] },
  { id: 'mcp2', org_id: ORG_JOBS, name: 'Figma', url: 'https://mcp.figma.example', status: 'available', tools: [] },
];
const webhooks: Webhook[] = [
  { id: 'wh1', org_id: ORG_JOBS, provider: 'vimeo', url: '/api/webhooks/vimeo', events: ['video.transcode.complete'], active: true },
  { id: 'wh2', org_id: ORG_JOBS, provider: 'efatura', url: '/api/webhooks/efatura', events: ['invoice.paid'], active: false },
];
const tokens: AccessToken[] = [{ id: 'tok1', org_id: ORG_JOBS, name: 'Claude Desktop (demo)', token_prefix: 'jsdemo_…', scopes: ['mcp'], created_at: '2026-10-01T09:00:00Z', last_used_at: '2026-10-13T12:00:00Z' }];
const members: Member[] = DEMO_ACCOUNTS.map((a) => ({ user_id: `u_${a.id}`, name: a.name, email: a.email, role: a.role, status: 'active' as const }));

const settings = (name: string): OrgSettings => ({
  general: { name, locale: 'tr-TR', timezone: 'Europe/Istanbul', currency: 'TRY' },
  notifications: { rules: [
    { event: 'approval.created', channel: 'in_app', enabled: true }, { event: 'approval.decided', channel: 'email', enabled: true },
    { event: 'task.overdue', channel: 'in_app', enabled: true }, { event: 'invoice.overdue', channel: 'email', enabled: true }, { event: 'board.weekly', channel: 'slack', enabled: false },
  ] },
  structure: { flow_stages: TASK_STATES.map(String), work_hours: '09:00-18:00' },
  ai: { monthly_cap_usd: 50, default_model: 'claude-sonnet-4-5', board_enabled: true },
  security: { mfa_required: true, session_hours: 12, ip_allowlist: [] },
});

export interface DemoDb {
  orgs: Organization[]; team: TeamMember[]; brands: Brand[]; projects: Project[]; tasks: Task[]; taskTypes: TaskType[]; approvals: Approval[];
  channels: Channel[]; messages: Message[]; settings: Record<string, OrgSettings>; members: Member[]; prompts: AgentPrompt[]; runs: AgentRun[];
  cols: ModuleCols; audit: AuditEvent[];
  /** İhale teklifleri / atamalar: eski localStorage kayıtlarında yoktur → DemoRepo `??=` ile açar. */
  taskBids?: TaskBid[]; assignments?: TaskAssignment[];
  /** Trello demo durumu: örnek içe aktarma zamanı + kişi eşlemeleri (anahtar = memberKey(ad) → çalışan id). */
  trello?: { last_sync_at: string | null; member_map: Record<string, string> };
  board: BoardDecision[]; twins: Twin[]; bids: TwinBid[]; connect: { integrations: Integration[]; mcp_servers: McpServer[]; webhooks: Webhook[]; tokens: AccessToken[] };
}
export const makeDemoDb = (): DemoDb => structuredClone({
  orgs, team, brands, projects, tasks, taskTypes: TASK_TYPES, approvals, channels, messages,
  settings: { [ORG_JOBS]: settings('Jobs Studio'), [ORG_EDIT]: settings('Edit Culture & Events') },
  members, prompts, runs, board, twins, bids, cols: makeModuleSeed(), audit: [], connect: { integrations, mcp_servers, webhooks, tokens },
});
