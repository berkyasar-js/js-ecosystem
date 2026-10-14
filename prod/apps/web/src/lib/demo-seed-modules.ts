import { COLLECTIONS, type CollKey, type Records, type SaveInput } from '@jscore/contracts';

const J = 'org_jobs';
const E = 'org_edit';
export type ModuleCols = { [K in CollKey]?: Records[K][] };

function rows<K extends CollKey>(kind: K, data: Array<SaveInput<K> & { created_at?: string }>, org = J): Records[K][] {
  const p = COLLECTIONS[kind].prefix;
  return data.map((d, i) => ({ created_at: '2026-10-01T09:00:00Z', org_id: org, ...d, id: d.id ?? `${p}${i + 1}` }) as unknown as Records[K]);
}
const W = ['2026-10-12', '2026-10-19', '2026-10-26', '2026-11-02', '2026-11-09', '2026-11-16'];
const TEAM_HOURS: Record<string, number> = { BY: 40, UC: 36, OE: 34, SO: 30, SK: 38, DO: 31, RV: 28, HO: 40, BA: 24, FA: 32, ST: 30, BK: 40 };
/** Tahsis: [kişi, [6 haftalık saat], proje] — HO video yükü >40 ve SK yoğun. */
const ALLOC: Array<[string, number[], string]> = [
  ['SK', [38, 36, 34, 30, 26, 24], 'p1'], ['HO', [44, 46, 38, 30, 28, 24], 'p3'], ['OE', [30, 32, 28, 26, 24, 24], 'p2'], ['SO', [28, 28, 26, 22, 14, 8], 'p6'],
  ['DO', [26, 30, 28, 24, 22, 22], 'p7'], ['RV', [20, 24, 26, 30, 32, 34], 'p4'], ['UC', [28, 26, 24, 24, 22, 22], 'p5'], ['BK', [34, 30, 20, 8, 0, 0], 'p6'],
  ['FA', [26, 28, 26, 24, 24, 24], 'p1'], ['ST', [24, 22, 20, 16, 4, 0], 'p6'], ['BA', [16, 16, 16, 16, 16, 16], 'p5'],
];

export function makeModuleSeed(): ModuleCols {
  const c: ModuleCols = {};
  c.crm_deals = rows('crm_deals', [
    { brand_id: 'c_clayton', company: 'Clayton', title: 'Konut lansman paketi', stage: 'proposal', value_minor: 65000000, owner: 'OE', source: 'Referans', next_step: 'Perşembe sunum toplantısı' },
    { brand_id: 'c_globmac', company: 'Globmac', title: 'Fuar standı ve katalog', stage: 'talk', value_minor: 38000000, owner: 'SO', source: 'Web formu', next_step: 'Keşif görüşmesi' },
    { brand_id: 'c_tarla', company: 'Tarla Sofrası', title: 'Marka yenileme', stage: 'new', value_minor: 24000000, owner: 'SO', source: 'LinkedIn', next_step: 'İlk arama' },
    { brand_id: 'c_wellana', company: 'Wellana', title: 'Kasım yenileme (retainer)', stage: 'proposal', value_minor: 54000000, owner: 'OE', source: 'Mevcut müşteri', next_step: 'Teklif v2 gönder' },
    { brand_id: 'c_paintfield', company: 'Paintfield', title: 'Sonbahar kampanya seti', stage: 'won', value_minor: 18000000, owner: 'SO', source: 'İhale', next_step: 'Kick-off' },
    { brand_id: null, company: 'Zenit Gıda', title: 'Ambalaj tasarımı', stage: 'lost', value_minor: 12000000, owner: 'FA', source: 'Soğuk arama', next_step: 'Bütçe uyuşmadı' },
    { brand_id: 'c_lumio', company: 'Lumio', title: 'Ürün katalog tasarımı', stage: 'talk', value_minor: 9500000, owner: 'FA', source: 'İhale', next_step: 'Örnek iş gönder' },
  ]);
  c.crm_contacts = rows('crm_contacts', [
    { brand_id: 'c_anova', name: 'Pınar Y.', title: 'Pazarlama Müdürü', email: 'pinar@anova.example', phone: '+90 212 555 01 01', primary: true, client_visible: true },
    { brand_id: 'c_wellana', name: 'Deniz K.', title: 'Marka Yöneticisi', email: 'deniz@wellana.example', phone: '+90 212 555 01 02', primary: true, client_visible: true },
    { brand_id: 'c_badem', name: 'Elif T.', title: 'Dijital Pazarlama', email: 'elif@badem.example', phone: '+90 212 555 01 03', primary: true },
    { brand_id: 'c_clayton', name: 'Ali Çetin', title: 'Satış Direktörü', email: 'ali@clayton.example', phone: '+90 212 555 01 04', primary: true },
    { brand_id: 'c_anova', name: 'Mert S.', title: 'Satın Alma', email: 'mert@anova.example', phone: '+90 212 555 01 05', primary: false, client_visible: true },
  ]);
  c.crm_proposals = rows('crm_proposals', [
    { brand_id: 'c_clayton', deal_id: 'd1', number: 'TKL-2026-041', title: 'Clayton lansman paketi', version: 2, status: 'sent', vat_pct: 20, payment_terms_days: 30, valid_until: '2026-11-15',
      lines: [{ desc: 'Lansman konsepti ve yaratıcı yön', qty: 1, unit_minor: 22000000 }, { desc: 'Satış ofisi deneyim tasarımı', qty: 1, unit_minor: 26000000 }, { desc: 'Dijital varlık seti', qty: 12, unit_minor: 1400000 }],
      history: [{ version: 1, total_minor: 61000000, at: '2026-10-05' }, { version: 2, total_minor: 64800000, at: '2026-10-11' }] },
    { brand_id: 'c_wellana', deal_id: 'd4', number: 'TKL-2026-044', title: 'Wellana Kasım yenileme', version: 1, status: 'draft', vat_pct: 20, payment_terms_days: 45, valid_until: '2026-11-05',
      lines: [{ desc: 'Aylık retainer (sosyal + kampanya)', qty: 3, unit_minor: 15000000 }, { desc: 'Ek çekim günü', qty: 1, unit_minor: 9000000 }], history: [{ version: 1, total_minor: 64800000, at: '2026-10-13' }] },
  ]);
  c.crm_contracts = rows('crm_contracts', [
    { brand_id: 'c_badem', title: 'Badem Pınarı · Sosyal retainer', type: 'retainer', start: '2026-01-01', end: '2026-12-31', monthly_fee_minor: 5416600, inclusions: { social_visual: 8, reels: 2 }, revision_limit: 3, revisions_used: 2, auto_renew: true, status: 'active' },
    { brand_id: 'c_anova', title: 'Anova · Aylık sosyal sözleşme', type: 'retainer', start: '2026-03-01', end: '2026-11-30', monthly_fee_minor: 6250000, inclusions: { social_visual: 2, reels: 1 }, revision_limit: 2, revisions_used: 2, auto_renew: false, status: 'expiring' },
    { brand_id: 'c_wellana', title: 'Wellana · Kampanya sözleşmesi', type: 'project', start: '2026-08-15', end: '2026-11-15', monthly_fee_minor: 14000000, inclusions: { social_visual: 12 }, revision_limit: 3, revisions_used: 3, auto_renew: false, status: 'expiring' },
  ]);
  c.time_entries = rows('time_entries', [
    { employee_id: 'SK', task_id: 't1', minutes: 210, note: 'Tipografi alternatifleri', worked_on: '2026-10-13', started_at: null, ended_at: null },
    { employee_id: 'SK', task_id: 't9', minutes: 150, note: 'Post seti', worked_on: '2026-10-13', started_at: null, ended_at: null },
    { employee_id: 'HO', task_id: 't3', minutes: 420, note: 'Offline kurgu', worked_on: '2026-10-13', started_at: null, ended_at: null },
    { employee_id: 'OE', task_id: 't2', minutes: 180, note: 'Sunum akışı', worked_on: '2026-10-13', started_at: null, ended_at: null },
    { employee_id: 'DO', task_id: 't11', minutes: 240, note: 'Anova görseller', worked_on: '2026-10-12', started_at: null, ended_at: null },
    { employee_id: 'SK', task_id: 't1', minutes: 300, note: 'Revizyon v03', worked_on: '2026-10-12', started_at: null, ended_at: null },
  ]);
  c.notifications = rows('notifications', [
    { employee_id: 'SK', kind: 'approval', title: 'Wellana ana görseli onay bekliyor', body: 'v03 · iç revize sonrası hesap onayı', read: false, href: '/app/approvals' },
    { employee_id: 'SK', kind: 'task', title: 'Badem Pınarı post seti yarın teslim', body: '8 görsel · onay aşamasında', read: false, href: '/app/tasks' },
    { employee_id: 'SK', kind: 'mention', title: 'Öykü seni andı', body: '#wellana-kampanya: tipografi yönü 2', read: true },
    { employee_id: 'OE', kind: 'system', title: 'Anova sözleşmesi 47 gün içinde bitiyor', body: 'Yenileme görüşmesi planla', read: false, href: '/app/crm?tab=contracts' },
    { employee_id: 'HO', kind: 'task', title: 'Anova offline kurgu 3 gün kaldı', body: 'Kapasite %110', read: false },
  ]);
  c.task_requests = rows('task_requests', [{ task_id: 't4', employee_id: 'SO', kind: 'help', note: 'Wellana metin setinde 12 post için ek copywriter', new_due: null, to_employee: 'FA', status: 'open' }]);
  c.allocations = rows('allocations', ALLOC.flatMap(([emp, hrs, project]) => hrs.map((hours, i) => ({ employee_id: emp, week: W[i], hours, project_id: project }))));
  c.leaves = rows('leaves', [
    { employee_id: 'SK', type: 'yillik', start: '2026-10-26', end: '2026-10-30', days: 5, status: 'pending', note: 'Yıllık izin' },
    { employee_id: 'DO', type: 'yillik', start: '2026-11-09', end: '2026-11-11', days: 3, status: 'approved', note: '' },
    { employee_id: 'HO', type: 'mazeret', start: '2026-10-20', end: '2026-10-20', days: 1, status: 'approved', note: 'Resmi işlem' },
    { employee_id: 'OE', type: 'hastalik', start: '2026-09-22', end: '2026-09-23', days: 2, status: 'approved', note: 'Rapor' },
    { employee_id: 'RV', type: 'yillik', start: '2026-11-02', end: '2026-11-06', days: 5, status: 'pending', note: '' },
  ]);
  const sk = (employee_id: string, skill: string, level: number) => ({ employee_id, skill, level });
  c.skills = rows('skills', [sk('SK', 'Ana görsel', 5), sk('SK', 'Tipografi', 5), sk('SK', 'Sosyal set', 4), sk('HO', 'Offline kurgu', 5), sk('HO', 'Motion', 4), sk('HO', 'Çekim', 4), sk('DO', 'Sosyal set', 4), sk('DO', 'Banner', 4), sk('RV', 'Etkinlik grafiği', 4), sk('OE', 'Teklif', 5), sk('SO', 'Metin yazarlığı', 4), sk('BK', 'Sosyal set', 3)]);
  c.equipment = rows('equipment', [
    { name: 'Sony FX3 kamera seti', category: 'Kamera', status: 'available' }, { name: 'Aputure 600d ışık', category: 'Işık', status: 'available' },
    { name: 'Rode kablosuz mikrofon', category: 'Ses', status: 'available' }, { name: 'DJI RS3 gimbal', category: 'Stabilizasyon', status: 'maintenance' }, { name: 'Prodüksiyon laptop (M3 Max)', category: 'Bilgisayar', status: 'available' },
  ]);
  c.equipment_bookings = rows('equipment_bookings', [
    { equipment_id: 'eq1', employee_id: 'HO', start: '2026-10-19', end: '2026-10-21', project_id: 'p3' }, { equipment_id: 'eq2', employee_id: 'HO', start: '2026-10-19', end: '2026-10-21', project_id: 'p3' },
  ]);
  c.rate_cards = rows('rate_cards', [
    { name: 'Motion designer (freelance)', discipline: 'Motion', unit: 'gün', rate_minor: 650000, level: 'senior', status: 'active' }, { name: 'Video editör (freelance)', discipline: 'Kurgu', unit: 'gün', rate_minor: 500000, level: 'mid', status: 'active' },
    { name: 'Copywriter (freelance)', discipline: 'Metin', unit: 'iş', rate_minor: 180000, level: 'mid', status: 'active' }, { name: 'İllüstratör (freelance)', discipline: 'İllüstrasyon', unit: 'iş', rate_minor: 420000, level: 'senior', status: 'paused' },
  ]);
  c.budgets = rows('budgets', [
    { project_id: 'p1', brand_id: 'c_wellana', planned_minor: 32000000, note: 'Hedef marj %30' }, { project_id: 'p3', brand_id: 'c_anova', planned_minor: 21000000, note: 'Freelancer motion dahil' },
    { project_id: 'p6', brand_id: 'c_badem', planned_minor: 3800000, note: 'Retainer' }, { project_id: 'p7', brand_id: 'c_anova', planned_minor: 4400000, note: 'Retainer' }, { project_id: 'p5', brand_id: 'c_dora', planned_minor: 13000000, note: 'Kapandı' },
  ]);
  c.suppliers = rows('suppliers', [
    { name: 'Lensworks Kamera Kiralama', category: 'Ekipman', contact: 'Tolga B.', email: 'info@lensworks.example', rating: 4, terms_days: 30, status: 'active' },
    { name: 'Sahne Atölyesi', category: 'Sahne & LED', contact: 'Cem A.', email: 'teklif@sahne.example', rating: 5, terms_days: 45, status: 'active' },
    { name: 'LED Pro', category: 'Sahne & LED', contact: 'Nur Y.', email: 'sales@ledpro.example', rating: 3, terms_days: 15, status: 'active' },
    { name: 'Baskı Merkezi', category: 'Baskı', contact: 'Kemal D.', email: 'bm@baski.example', rating: 4, terms_days: 30, status: 'active' },
    { name: 'Eski Ses Stüdyosu', category: 'Ses', contact: 'Arda Ö.', email: 'ses@eski.example', rating: 2, terms_days: 0, status: 'blocked' },
  ]);
  c.expenses = rows('expenses', [
    { project_id: 'p3', brand_id: 'c_anova', category: 'Çekim & ekipman', amount_minor: 4200000, supplier_id: 'su1', date: '2026-10-09', status: 'paid', note: 'Çekim günü kiralama', company: J },
    { project_id: 'p3', brand_id: 'c_anova', category: 'Freelancer', amount_minor: 1950000, supplier_id: null, date: '2026-10-12', status: 'pending', note: 'Motion ek bütçe (onay bekliyor)', company: J },
    { project_id: 'p1', brand_id: 'c_wellana', category: 'Baskı', amount_minor: 1800000, supplier_id: 'su4', date: '2026-10-07', status: 'approved', note: 'Mağaza içi uyarlama prova', company: J },
    { project_id: 'p6', brand_id: 'c_badem', category: 'Stok görsel', amount_minor: 240000, supplier_id: null, date: '2026-10-02', status: 'paid', note: 'Lisans', company: J },
    { project_id: 'p4', brand_id: 'c_numesys', category: 'Sahne & LED', amount_minor: 8600000, supplier_id: 'su2', date: '2026-10-13', status: 'pending', note: 'Seviye 2 onayında', company: E },
    { project_id: null, brand_id: null, category: 'Yazılım', amount_minor: 1450000, supplier_id: null, date: '2026-10-01', status: 'paid', note: 'Lisanslar', company: J },
  ]);
  c.purchase_requests = rows('purchase_requests', [
    { title: 'Numesys sahne & LED kiralama', project_id: 'p4', amount_minor: 8600000, stage: 'approval', requested_by: 'RV', chosen_supplier: 'su2', approval_id: 'a5',
      quotes: [{ supplier_id: 'su2', amount_minor: 8600000, days: 3 }, { supplier_id: 'su3', amount_minor: 9400000, days: 2 }] },
    { title: 'Anova çekim ışık seti', project_id: 'p3', amount_minor: 1200000, stage: 'compare', requested_by: 'HO', chosen_supplier: null, approval_id: null, quotes: [{ supplier_id: 'su1', amount_minor: 1200000, days: 1 }] },
    { title: 'Wellana mağaza içi baskı', project_id: 'p1', amount_minor: 1800000, stage: 'ordered', requested_by: 'SK', chosen_supplier: 'su4', approval_id: null, quotes: [{ supplier_id: 'su4', amount_minor: 1800000, days: 5 }] },
  ]);
  c.invoices = rows('invoices', [
    { brand_id: 'c_badem', project_id: 'p6', number: 'FTR-2026-0188', amount_minor: 6500000, status: 'paid', issued_at: '2026-09-01', due_at: '2026-10-01', paid_at: '2026-09-29' },
    { brand_id: 'c_anova', project_id: 'p3', number: 'FTR-2026-0191', amount_minor: 14000000, status: 'pending', issued_at: '2026-09-25', due_at: '2026-10-25', paid_at: null },
    { brand_id: 'c_wellana', project_id: 'p1', number: 'FTR-2026-0183', amount_minor: 21000000, status: 'overdue', issued_at: '2026-08-20', due_at: '2026-09-19', paid_at: null },
    { brand_id: 'c_dora', project_id: 'p5', number: 'FTR-2026-0179', amount_minor: 18000000, status: 'paid', issued_at: '2026-08-12', due_at: '2026-09-11', paid_at: '2026-09-18' },
    { brand_id: 'c_opsin', project_id: null, number: 'FTR-2026-0170', amount_minor: 7200000, status: 'overdue', issued_at: '2026-07-30', due_at: '2026-08-29', paid_at: null },
    { brand_id: 'c_anova', project_id: 'p7', number: 'FTR-2026-0195', amount_minor: 6250000, status: 'pending', issued_at: '2026-10-01', due_at: '2026-10-31', paid_at: null },
  ]);
  const le = (company: string, date: string, kind: 'income' | 'expense' | 'intercompany', account: string, amount_minor: number, memo: string) => ({ company, date, kind, account, amount_minor, memo });
  c.ledger_entries = rows('ledger_entries', [
    le(J, '2026-10-01', 'income', '600 Satışlar', 41000000, 'Eylül fatura tahsilatları'), le(J, '2026-10-05', 'expense', '770 Genel yönetim', 22500000, 'Ofis, yazılım, kira'),
    le(J, '2026-10-08', 'intercompany', '120 Edit Events', 3000000, 'Edit için prodüksiyon hizmeti'), le(E, '2026-10-02', 'income', '600 Satışlar', 24000000, 'Numesys ön ödeme'),
    le(E, '2026-10-09', 'expense', '740 Hizmet üretim', 9800000, 'Mekân kaporası'), le(E, '2026-10-08', 'intercompany', '320 Jobs Studio', 3000000, 'Jobs prodüksiyon hizmeti'),
  ]);
  const cr = (employee_id: string, h: number) => ({ employee_id, hourly_cost_minor: h });
  c.cost_rates = rows('cost_rates', [cr('SK', 55000), cr('HO', 52000), cr('OE', 60000), cr('SO', 45000), cr('DO', 48000), cr('RV', 46000), cr('UC', 70000), cr('FA', 42000), cr('BK', 30000)]);

  const names = Object.keys(TEAM_HOURS);
  c.hr_profiles = rows('hr_profiles', names.map((id, i) => ({
    employee_id: id, dept: ['BY', 'BA'].includes(id) ? 'Yönetim' : ['OE', 'SO', 'FA', 'ST'].includes(id) ? 'Hesap' : 'Kreatif', manager: id === 'BY' ? '' : 'BY', start_date: `202${i % 4}-0${(i % 9) + 1}-15`,
    end_date: id === 'ST' ? '2026-11-12' : id === 'BK' ? '2026-10-30' : null, status: id === 'ST' || id === 'BK' ? 'offboarding' as const : 'active' as const,
    employment: id === 'BK' ? 'intern' as const : 'full' as const, phone: `+90 532 555 00 ${String(10 + i)}`, email: `${id.toLowerCase()}@jobsstudio.example`, leave_total: 14 + (i % 3) * 2,
  })));
  c.hr_docs = rows('hr_docs', names.flatMap((id, i) => ['Kimlik', 'İş sözleşmesi', 'SGK işe giriş', 'KVKK aydınlatma', 'Gizlilik taahhüdü'].map((t) => ({
    employee_id: id, doc_type: t, status: (id === 'FA' && t === 'Gizlilik taahhüdü') || (id === 'DO' && t === 'KVKK aydınlatma') ? 'missing' as const : (id === 'RV' && t === 'Kimlik') ? 'expired' as const : 'ok' as const,
    expires_at: t === 'Kimlik' ? `20${30 + (i % 3)}-03-01` : null, retention_until: `2036-12-31`,
  }))));
  c.hr_assets = rows('hr_assets', [
    { employee_id: 'SK', item: 'MacBook Pro 16"', serial: 'JS-LT-014', assigned_at: '2025-02-10', returned_at: null }, { employee_id: 'HO', item: 'Mac Studio + ekran', serial: 'JS-DT-003', assigned_at: '2024-06-01', returned_at: null },
    { employee_id: 'ST', item: 'MacBook Air', serial: 'JS-LT-021', assigned_at: '2025-04-01', returned_at: null }, { employee_id: 'BK', item: 'MacBook Air', serial: 'JS-LT-030', assigned_at: '2026-03-01', returned_at: null },
  ]);
  c.trainings = rows('trainings', [
    { employee_id: 'SK', title: 'Figma ileri seviye', status: 'done', date: '2026-06-10', hours: 8 }, { employee_id: 'DO', title: 'Motion temelleri', status: 'planned', date: '2026-11-04', hours: 12 }, { employee_id: 'OE', title: 'Müzakere teknikleri', status: 'planned', date: '2026-11-18', hours: 6 },
  ]);
  c.perf_reviews = rows('perf_reviews', [
    { employee_id: 'SK', period: '2026 H1', score: 4.6, note: 'Güçlü tipografi; mentorluk' }, { employee_id: 'HO', period: '2026 H1', score: 4.2, note: 'Yük dengesi gözden geçirilmeli' }, { employee_id: 'DO', period: '2026 H1', score: 4.0, note: '' },
  ]);
  c.shifts = rows('shifts', [
    { employee_id: 'HO', date: '2026-10-13', start: '09:00', end: '20:00', kind: 'mesai', hours: 2 }, { employee_id: 'SK', date: '2026-10-13', start: '09:30', end: '18:30', kind: 'vardiya', hours: 0 }, { employee_id: 'HO', date: '2026-10-19', start: '06:00', end: '18:00', kind: 'vardiya', hours: 0 },
  ]);
  c.advances = rows('advances', [
    { employee_id: 'RV', kind: 'masraf', amount_minor: 185000, status: 'pending', note: 'Mekân keşfi ulaşım' }, { employee_id: 'HO', kind: 'avans', amount_minor: 500000, status: 'approved', note: 'Çekim günü harcırah' },
  ]);
  const ck = (employee_id: string, flow: 'onboarding' | 'offboarding', title: string, done: boolean, due: string, owner: string) => ({ employee_id, flow, title, done, due, owner });
  c.checklists = rows('checklists', [
    ck('ST', 'offboarding', 'Devir planı (hesaplar ve açık işler)', false, '2026-11-05', 'OE'), ck('ST', 'offboarding', 'Zimmet iadesi', false, '2026-11-12', 'BA'), ck('ST', 'offboarding', 'Erişimlerin kapatılması', false, '2026-11-12', 'BY'),
    ck('ST', 'offboarding', 'Çıkış mülakatı', false, '2026-11-10', 'BA'), ck('ST', 'offboarding', 'Kıdem/ihbar hesabı (bordro)', false, '2026-11-12', 'BA'), ck('ST', 'offboarding', 'Müşterilere tanıtım e-postası', true, '2026-10-30', 'OE'),
    ck('BK', 'offboarding', 'Staj sonu değerlendirmesi', false, '2026-10-28', 'UC'), ck('BK', 'offboarding', 'Zimmet iadesi', false, '2026-10-30', 'BA'), ck('BK', 'offboarding', 'Erişimlerin kapatılması', false, '2026-10-30', 'BY'),
    ck('BK', 'offboarding', 'Dosya ve proje devri', false, '2026-10-27', 'SK'), ck('BK', 'offboarding', 'Çıkış mülakatı', false, '2026-10-29', 'BA'),
  ]);
  c.payroll_runs = rows('payroll_runs', [
    { period: '2026-09', status: 'paid', employee_count: 12, note: 'Tutarlar Payroll Vault’ta' }, { period: '2026-10', status: 'draft', employee_count: 12, note: '2 çıkış (ST 12.11, BK 30.10)' },
  ]);
  c.import_batches = rows('import_batches', [
    { phase: 'A', title: 'Çalışan kartları', rows: 12, ok: 12, failed: 0, status: 'done' }, { phase: 'B', title: 'Özlük belgeleri', rows: 60, ok: 57, failed: 3, status: 'done' },
    { phase: 'C', title: 'İzin bakiyeleri', rows: 12, ok: 0, failed: 0, status: 'pending' }, { phase: 'D', title: 'Zimmet ve eğitim', rows: 9, ok: 0, failed: 0, status: 'pending' },
  ]);
  c.jobs = rows('jobs', [
    { slug: 'art-director', title: 'Art Director', dept: 'Kreatif', location: 'İstanbul · Hibrit', type: 'Tam zamanlı', status: 'open', headcount: 1, description: 'Marka kampanyalarında görsel yön ve ekip liderliği.' },
    { slug: 'motion-designer', title: 'Motion Designer', dept: 'Kreatif', location: 'İstanbul', type: 'Tam zamanlı', status: 'open', headcount: 1, description: 'Sosyal ve lansman filmleri için hareketli grafik.' },
    { slug: 'junior-account', title: 'Junior Account Executive', dept: 'Hesap', location: 'İstanbul', type: 'Tam zamanlı', status: 'draft', headcount: 1, description: 'Müşteri hesabı koordinasyonu (Selin Tekin devri).' },
  ]);
  const cd = (job_id: string, name: string, stage: Records['candidates']['stage'], score: number, talent_pool = false) => ({ job_id, name, email: `${name.split(' ')[0].toLowerCase()}@aday.example`, portfolio: 'https://portfolio.example', note: '', stage, score, source: 'apply' as const, talent_pool, employee_id: null });
  c.candidates = rows('candidates', [
    cd('jb1', 'Ece Yıldız', 'applied', 0), cd('jb1', 'Kaan Aydın', 'interview', 72), cd('jb1', 'Melis Tan', 'case', 81), cd('jb1', 'Onur Başaran', 'offer', 88),
    cd('jb2', 'Zeynep Arı', 'applied', 0), cd('jb2', 'Barış Koç', 'interview', 69), cd('jb2', 'Defne Er', 'rejected', 40, true),
  ]);
  c.interviews = rows('interviews', [
    { candidate_id: 'cd2', at: '2026-10-16T11:00:00Z', interviewer: 'UC', kind: 'Tanışma', scores: { Portfolyo: 4, İletişim: 4, 'Kültür uyumu': 3 }, notes: 'İyi portfolyo, deneyim sınırlı.', recommendation: 'hold' },
    { candidate_id: 'cd4', at: '2026-10-09T10:00:00Z', interviewer: 'SK', kind: 'Case sunumu', scores: { Portfolyo: 5, İletişim: 4, 'Kültür uyumu': 5 }, notes: 'Case çok güçlü.', recommendation: 'hire' },
  ]);
  c.offers = rows('offers', [{ candidate_id: 'cd4', role_title: 'Art Director', app_role: 'creative', start_date: '2026-11-16', status: 'sent' }]);
  c.client_requests = rows('client_requests', [
    { brand_id: 'c_anova', title: 'Lansman haftası ek sosyal görsel', status: 'review', created_by: 'Pınar Y.', brief: { goal: 'Lansman farkındalığı', audience: 'Sektör profesyonelleri', deliverable: '1 sosyal görsel + kısa sunum', message: 'Güvenilir ve yenilikçi', deadline: '2026-10-16' } },
  ]);
  c.surveys = rows('surveys', [
    { title: 'Teslim sonrası memnuniyet (CSAT)', kind: 'csat', brand_id: null, threshold: 4 }, { title: 'Tavsiye skoru (NPS)', kind: 'nps', brand_id: null, threshold: 0 },
  ]);
  const sr = (survey_id: string, brand_id: string, score: number, comment: string) => ({ survey_id, brand_id, score, comment });
  c.survey_responses = rows('survey_responses', [
    sr('sv1', 'c_anova', 5, 'Hızlı ve net.'), sr('sv1', 'c_anova', 4, ''), sr('sv1', 'c_wellana', 2, 'Revizyon turları uzadı.'), sr('sv1', 'c_wellana', 3, ''), sr('sv1', 'c_badem', 5, ''),
    sr('sv2', 'c_anova', 9, ''), sr('sv2', 'c_wellana', 5, 'Süreç yorucu.'), sr('sv2', 'c_badem', 10, ''), sr('sv2', 'c_dora', 8, ''),
  ]);
  const ma = (brand_id: string, project_id: string | null, name: string, kind: Records['media_assets']['kind'], size_mb: number, storage: Records['media_assets']['storage'], client_visible: boolean, version = 1, duration_s = 0) => ({
    brand_id, project_id, name, kind, size_mb, storage, status: 'ok' as const, retention_until: '2027-10-14', client_visible, version, duration_s,
    versions: Array.from({ length: version }, (_, i) => ({ v: i + 1, at: `2026-10-${String(5 + i * 3).padStart(2, '0')}`, note: i ? 'Revize' : 'İlk kesim' })),
  });
  c.media_assets = rows('media_assets', [
    ma('c_anova', 'p3', 'Anova lansman filmi · offline kurgu', 'video', 1840, 'vimeo', true, 2, 62), ma('c_wellana', 'p1', 'Wellana ana görsel v03', 'image', 24, 'minio', true, 3),
    ma('c_badem', 'p6', 'Badem Ekim reels taslak', 'video', 420, 'minio', false, 1, 28), ma('c_anova', 'p3', 'Çekim günü ham materyal', 'video', 18200, 's3', false, 1, 3600),
    ma('c_dora', 'p5', 'Dora sürdürülebilirlik raporu.pdf', 'doc', 12, 'minio', false, 4),
  ]);
  c.review_comments = rows('review_comments', [
    { asset_id: 'ma1', version: 2, timecode_s: 12, author: 'Pınar Y.', body: 'Logo biraz erken geliyor.', resolved: false, client_visible: true, brand_id: 'c_anova' },
    { asset_id: 'ma1', version: 2, timecode_s: 41, author: 'Hulusi Melih Özbay', body: 'Müzik lisansı gelince final miks.', resolved: false, client_visible: false, brand_id: 'c_anova' },
    { asset_id: 'ma2', version: 3, timecode_s: 0, author: 'Deniz K.', body: 'Tipografi yönü 2 olsun.', resolved: true, client_visible: true, brand_id: 'c_wellana' },
  ]);
  c.share_links = rows('share_links', [
    { brand_id: 'c_anova', asset_ids: ['ma1'], token: 'demo', expires_at: '2026-10-21', password: false, downloads: 3, max_downloads: 10, status: 'active', client_visible: true },
    { brand_id: 'c_wellana', asset_ids: ['ma2'], token: 'wl8f2k', expires_at: '2026-10-01', password: true, downloads: 5, max_downloads: 5, status: 'expired', client_visible: true },
  ]);
  c.transfers = rows('transfers', [{ name: 'Anova_ham_materyal_02.zip', size_mb: 6400, progress: 100, status: 'done' }]);
  c.studio_items = rows('studio_items', [
    { kind: 'memory', brand_id: 'c_badem', title: 'Badem Pınarı Brand Memory', body: 'Ton: sade, doğal, güven veren. Renkler: derin mavi + krem. Kaçın: sağlık iddiaları, “en iyi” üstünlükleri.', data: { tone: 'sade, doğal', forbidden: ['en iyi', 'tedavi'] } },
    { kind: 'memory', brand_id: 'c_wellana', title: 'Wellana Brand Memory', body: 'Ton: sıcak ve bilgilendirici. Sağlık beyanı içeren her içerik hukuk onayı ister.', data: { tone: 'sıcak', forbidden: ['garanti', 'kesin iyileştirir'] } },
    { kind: 'brief', brand_id: 'c_badem', title: 'Ekim teması: kaynağından', body: 'Hedef: bilinirlik. Kitle: 25-40 aile. Çıktı: 8 post + 2 reels. Mesaj: kaynağından sofranıza. Tarih: 31 Ekim.', data: {} },
  ]);
  const sp = (brand_id: string, date: string, channel: string, format: string, copy: string, status: Records['social_posts']['status'], client_visible = true) => ({ brand_id, date, channel, format, copy, status, client_visible });
  c.social_posts = rows('social_posts', [
    sp('c_badem', '2026-10-15', 'Instagram', 'Post', 'Kaynağından sofranıza.', 'review'), sp('c_badem', '2026-10-17', 'Instagram', 'Reels', 'Bir damlanın yolculuğu.', 'review'), sp('c_badem', '2026-10-20', 'Instagram', 'Post', 'Pazartesi tazeliği.', 'draft', false),
    sp('c_badem', '2026-10-22', 'LinkedIn', 'Post', 'Sürdürülebilir ambalaj.', 'approved'), sp('c_badem', '2026-10-24', 'Instagram', 'Post', 'Hafta sonu ilhamı.', 'idea', false), sp('c_anova', '2026-10-21', 'LinkedIn', 'Post', 'Yeni ürün serisi yakında.', 'review'),
    sp('c_wellana', '2026-10-19', 'Instagram', 'Post', 'Sonbahar rutini.', 'scheduled'),
  ]);
  c.decks = rows('decks', [
    { title: 'Clayton lansman teklifi sunumu', brand_id: 'c_clayton', template: false, slides: 18, status: 'draft' }, { title: 'Aylık rapor şablonu', brand_id: null, template: true, slides: 8, status: 'final' },
    { title: 'Teklif sunumu şablonu', brand_id: null, template: true, slides: 12, status: 'final' }, { title: 'Wellana Eylül raporu', brand_id: 'c_wellana', template: false, slides: 10, status: 'final' },
  ]);
  c.campaigns = rows('campaigns', [
    { name: 'Jobs Studio · Sonbahar tanıtım', brand_id: 'c_jobs', channel: 'LinkedIn', budget_minor: 4500000, spend_minor: 2100000, leads: 14, status: 'running', start: '2026-10-01', end: '2026-11-15' },
    { name: 'Edit · Yıl sonu etkinlik duyurusu', brand_id: 'c_edit', channel: 'E-posta', budget_minor: 1500000, spend_minor: 300000, leads: 6, status: 'running', start: '2026-10-10', end: '2026-11-20' },
    { name: 'Referans vaka çalışması', brand_id: 'c_jobs', channel: 'Web', budget_minor: 800000, spend_minor: 800000, leads: 9, status: 'done', start: '2026-08-01', end: '2026-09-15' },
  ]);
  c.segments = rows('segments', [{ name: 'Mevcut müşteriler', rule: 'status = active', size: 21 }, { name: 'Prospect · Gıda & FMCG', rule: 'sector in (Gıda, FMCG)', size: 38 }, { name: 'Etkinlik katılımcıları', rule: 'tag = event', size: 112 }]);
  c.newsletters = rows('newsletters', [
    { subject: 'Ekim bülteni: 3 kampanya, 1 ödül', segment_id: 'sg1', status: 'scheduled', sent_at: null, open_rate: 0 }, { subject: 'Eylül bülteni', segment_id: 'sg1', status: 'sent', sent_at: '2026-09-28', open_rate: 46 },
  ]);
  c.mkt_leads = rows('mkt_leads', [
    { name: 'Hakan P.', email: 'hakan@firma.example', source: 'LinkedIn', campaign_id: 'cp1', status: 'mql', score: 64 }, { name: 'Sibel U.', email: 'sibel@firma.example', source: 'Web', campaign_id: 'cp3', status: 'sql', score: 82 },
    { name: 'Tuna G.', email: 'tuna@firma.example', source: 'E-posta', campaign_id: 'cp2', status: 'new', score: 35 }, { name: 'Gül N.', email: 'gul@firma.example', source: 'Web', campaign_id: 'cp3', status: 'customer', score: 95 },
  ]);
  const ev = (event: string, kind: Records['event_items']['kind'], title: string, at: string, owner: string, status: string, amount_minor = 0, note = '') => ({ event, kind, title, at, owner, status, amount_minor, note });
  const evs: Array<SaveInput<'event_items'>> = [
    ev('Numesys Yıl Sonu', 'portfolio', 'Numesys yıl sonu buluşması · 320 kişi', '2026-11-20T18:00:00Z', 'RV', 'planlama', 32000000), ev('Edit Kokteyl Gecesi', 'portfolio', 'Müşteri kokteyli · 80 kişi', '2026-12-04T19:00:00Z', 'OE', 'teklif', 9000000),
    ev('Numesys Yıl Sonu', 'show', 'Kapı açılışı ve karşılama', '2026-11-20T17:30:00Z', 'RV', 'bekliyor'), ev('Numesys Yıl Sonu', 'show', 'Açılış konuşması', '2026-11-20T18:15:00Z', 'BY', 'bekliyor'),
    ev('Numesys Yıl Sonu', 'show', 'Ödül töreni', '2026-11-20T19:30:00Z', 'RV', 'bekliyor'), ev('Numesys Yıl Sonu', 'show', 'Akşam yemeği ve müzik', '2026-11-20T20:30:00Z', 'OE', 'bekliyor'),
    ev('Numesys Yıl Sonu', 'vendor', 'Sahne Atölyesi · sahne & LED', '2026-11-18T09:00:00Z', 'RV', 'teklif', 8600000), ev('Numesys Yıl Sonu', 'vendor', 'Lezzet Catering · 320 kişilik menü', '2026-11-20T15:00:00Z', 'OE', 'onaylandı', 12500000),
    ev('Numesys Yıl Sonu', 'budget', 'Mekân', '2026-10-09T00:00:00Z', 'OE', 'kaporası ödendi', 9800000), ev('Numesys Yıl Sonu', 'budget', 'Catering', '2026-10-20T00:00:00Z', 'OE', 'planlı', 12500000), ev('Numesys Yıl Sonu', 'budget', 'Sahne & LED', '2026-10-20T00:00:00Z', 'RV', 'onay bekliyor', 8600000),
  ];
  c.event_items = [...rows('event_items', evs, E), ...rows('event_items', evs.map((e, i) => ({ ...e, id: `ev${evs.length + i + 1}` })), J)];
  c.automations = rows('automations', [
    { name: 'Teslim sonrası CSAT', trigger: 'task.state = delivery', condition: 'proje.client_visible = true', action: 'CSAT anketini müşteri kişisine gönder', status: 'published', version: 2, template: 'csat-after-delivery', runs: 14,
      history: [{ version: 1, at: '2026-09-01', status: 'draft' }, { version: 2, at: '2026-09-04', status: 'published' }] },
    { name: 'Geciken fatura hatırlatma', trigger: 'invoice.overdue', condition: 'gün gecikme >= 3', action: 'Finans kanalına bildirim + e-posta taslağı', status: 'published', version: 1, template: null, runs: 6, history: [{ version: 1, at: '2026-09-10', status: 'published' }] },
    { name: 'Kapasite uyarısı', trigger: 'allocation.updated', condition: 'haftalık yük > 40 saat', action: 'Operasyona bildirim', status: 'draft', version: 1, template: null, runs: 0, history: [{ version: 1, at: '2026-10-12', status: 'draft' }] },
  ]);
  c.automation_runs = rows('automation_runs', [
    { automation_id: 'au1', status: 'ok', error: null, payload: 'task t7 → anket gönderildi', created_at: '2026-10-09T15:00:00Z' }, { automation_id: 'au2', status: 'error', error: 'SMTP zaman aşımı (efatura bağlı değil)', payload: 'FTR-2026-0183', created_at: '2026-10-13T09:00:00Z' },
    { automation_id: 'au1', status: 'pending_approval', error: null, payload: 'task t11 → müşteri onayı bekleniyor', created_at: '2026-10-13T16:00:00Z' },
  ]);
  return c;
}
