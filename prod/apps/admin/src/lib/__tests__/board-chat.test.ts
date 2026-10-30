import { describe, expect, it } from 'vitest';
import { boardApplySchema, boardMessageCreateSchema, boardPlanSchema } from '@jscore/contracts';
import { demoReply, dueAt, historyTurns, matchEmployee, normalizeName, parseModelOutput, shouldSummarize, stripFences, taskDescription, validateAttachments, type OrgSnapshot } from '../board-chat';

const EMP = [
  { id: 'e1', code: 'UC', name: 'Ural Çalışkan', role_title: 'ECD', weekly_hours: 36, open_tasks: 2 },
  { id: 'e2', code: 'OE', name: 'Öykü Erelmalı', role_title: 'Brand Manager', weekly_hours: 34, open_tasks: 1 },
  { id: 'e3', code: 'SO', name: 'Selin Öztekeşin', role_title: 'Senior Marka Temsilcisi', weekly_hours: 30, open_tasks: 0 },
  { id: 'e4', code: 'ST', name: 'Selin Tekin', role_title: 'Account Executive', weekly_hours: 30, open_tasks: 4 },
  { id: 'e5', code: 'HO', name: 'Hulusi Melih Özbay', role_title: 'Video & Kurgu', weekly_hours: 40, open_tasks: 0 },
];
const SNAP: OrgSnapshot = { today: '2026-10-14', employees: EMP, projects: [{ id: 'p1', name: 'Lansman', status: 'active', brand_id: 'b1' }], brands: [{ id: 'b1', name: 'Marka', client_id: 'c1', status: 'active' }] };

describe('normalizeName / matchEmployee (aksan duyarsız)', () => {
  it('Türkçe karakterleri ve büyük/küçük harfi eşitler', () => {
    expect(normalizeName('Ural Çalışkan')).toBe('ural caliskan');
    expect(normalizeName('ÖYKÜ ERELMALI')).toBe('oyku erelmali');
    expect(normalizeName('İsmail Şık')).toBe('ismail sik');
    expect(normalizeName('  selin   öztekeşin ')).toBe('selin oztekesin');
  });
  it('tam ad (aksansız yazım) eşleşir', () => {
    expect(matchEmployee('ural caliskan', EMP)?.id).toBe('e1');
    expect(matchEmployee('URAL ÇALIŞKAN', EMP)?.id).toBe('e1');
    expect(matchEmployee('Oyku Erelmali', EMP)?.id).toBe('e2');
  });
  it('kod, kimlik ve ipuçları eşleşir', () => {
    expect(matchEmployee('HO', EMP)?.id).toBe('e5');
    expect(matchEmployee('bilinmeyen', EMP, { employee_id: 'e3' })?.id).toBe('e3');
    expect(matchEmployee('bilinmeyen', EMP, { employee_code: 'st' })?.id).toBe('e4');
  });
  it('belirsiz ilk ad eşleşmez; tek aday kısmi ad eşleşir', () => {
    expect(matchEmployee('Selin', EMP)).toBeNull();
    expect(matchEmployee('Selin T.', EMP)?.id).toBe('e4');
    expect(matchEmployee('Melih Özbay', EMP)?.id).toBe('e5');
    expect(matchEmployee('Ural', EMP)?.id).toBe('e1');
    expect(matchEmployee('', EMP)).toBeNull();
    expect(matchEmployee('Ahmet Yılmaz', EMP)).toBeNull();
  });
});

describe('dueAt (teslim tarihi)', () => {
  it('bugün + gün; ay sonunu aşar; null korunur', () => {
    expect(dueAt('2026-10-14', 0)?.slice(0, 10)).toBe('2026-10-14');
    expect(dueAt('2026-10-14', 3)?.slice(0, 10)).toBe('2026-10-17');
    expect(dueAt('2026-10-30', 5)?.slice(0, 10)).toBe('2026-11-04');
    expect(dueAt('2026-12-31', 1)?.slice(0, 10)).toBe('2027-01-01');
    expect(dueAt('2026-10-14', -2)?.slice(0, 10)).toBe('2026-10-14');
    expect(dueAt('2026-10-14', null)).toBeNull();
    expect(dueAt('2026-10-14', undefined)).toBeNull();
  });
});

describe('model çıktısı ayrıştırma', () => {
  const PLAN = { summary: 'Özet', assumptions: [], questions: ['Tarih?'], assignments: [{ employee_name: 'Ural Çalışkan', role_title: 'ECD', responsibility: 'Konsept' }], tasks: [{ title: 'Brief yaz', description: 'd', assignee_name: 'Ural Çalışkan', priority: 'high', estimate_minutes: 120, due_in_days: 2, acceptance: ['ok'] }] };
  it('çitleri soyar', () => {
    expect(stripFences('```json\n{"a":1}\n```')).toBe('{"a":1}');
    expect(stripFences('```\n{"a":1}\n```')).toBe('{"a":1}');
    expect(stripFences('{"a":1}')).toBe('{"a":1}');
  });
  it('çitli JSON → reply + plan', () => {
    const out = parseModelOutput('```json\n' + JSON.stringify({ reply: '# Merhaba', plan: PLAN }) + '\n```');
    expect(out.reply).toBe('# Merhaba');
    expect(out.plan?.tasks[0].title).toBe('Brief yaz');
    expect(out.plan?.tasks[0].depends_on).toEqual([]);
    expect(out.plan?.milestones).toEqual([]);
  });
  it('önsöz + JSON → ilk nesne alınır; plan null olabilir', () => {
    const out = parseModelOutput('İşte yanıt:\n{"reply":"Selam","plan":null}');
    expect(out).toEqual({ reply: 'Selam', plan: null });
  });
  it('JSON değilse ham metin yanıt olur', () => {
    const out = parseModelOutput('Bu düz bir yanıt { değil } json');
    expect(out.plan).toBeNull();
    expect(out.reply).toContain('düz bir yanıt');
  });
  it('bozuk öncelik/tahmin değerleri varsayılana düşer (catch)', () => {
    const p = boardPlanSchema.parse({ tasks: [{ title: 'Görev X', priority: 'urgent', estimate_minutes: 'çok' }] });
    expect(p.tasks[0].priority).toBe('normal');
    expect(p.tasks[0].estimate_minutes).toBe(120);
  });
});

describe('istek şemaları', () => {
  it('boş mesaj ve boş ek reddedilir; ek tek başına yeter', () => {
    expect(boardMessageCreateSchema.safeParse({ content: '  ' }).success).toBe(false);
    expect(boardMessageCreateSchema.safeParse({ content: '', attachments: [{ name: 'a.md', text: '# x' }] }).success).toBe(true);
  });
  it('ek doğrulama: uzantı ve boyut', () => {
    expect(validateAttachments([{ name: 'brief.md', text: 'merhaba' }])).toMatchObject({ ok: true, attachments: [{ name: 'brief.md', bytes: 7 }] });
    expect(validateAttachments([{ name: 'x.pdf', text: '' }])).toMatchObject({ ok: false });
    expect(validateAttachments([{ name: 'big.txt', text: 'a'.repeat(200 * 1024 + 1) }])).toMatchObject({ ok: false });
    const r = validateAttachments([1, 2, 3, 4].map((i) => ({ name: `f${i}.txt`, text: 'a'.repeat(199 * 1024) })));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/toplamı/);
  });
  it('apply: proje ya da yeni proje zorunlu', () => {
    expect(boardApplySchema.safeParse({ message_id: 'm' }).success).toBe(false);
    expect(boardApplySchema.safeParse({ message_id: 'm', project_id: 'p' }).success).toBe(true);
    expect(boardApplySchema.safeParse({ message_id: 'm', new_project: { name: 'Yeni' }, task_indexes: [0, 2] }).success).toBe(true);
  });
});

describe('demo yanıtı', () => {
  it('kısa mesajda soru sorar, plan yok', () => {
    const out = demoReply('Merhaba', [], SNAP);
    expect(out.plan).toBeNull();
    expect(out.reply).toMatch(/demo/i);
  });
  it('brief ekiyle plan üretir; atananlar gerçek çalışanlardır ve şemaya uyar', () => {
    const out = demoReply('Yeni lansman', [{ name: 'brief.md', bytes: 10, text: '# Brief\nHedef...' }], SNAP);
    expect(out.plan).not.toBeNull();
    const plan = boardPlanSchema.parse(out.plan);
    expect(plan.tasks.length).toBeGreaterThanOrEqual(4);
    for (const t of plan.tasks) expect(matchEmployee(t.assignee_name, EMP)).not.toBeNull();
    for (const a of plan.assignments) expect(EMP.some((e) => e.name === a.employee_name)).toBe(true);
    expect(plan.milestones?.length).toBeGreaterThan(0);
  });
  it('deterministiktir', () => {
    const a = demoReply('Uzun bir fikir '.repeat(20), [], SNAP), b = demoReply('Uzun bir fikir '.repeat(20), [], SNAP);
    expect(a).toEqual(b);
  });
});

describe('bağlam / özet', () => {
  it('ekler çitli blok olarak satır içine alınır; pencere uygulanır', () => {
    const msgs = Array.from({ length: 35 }, (_, i) => ({ id: `m${i}`, org_id: 'o', thread_id: 't', role: (i % 2 ? 'assistant' : 'user') as 'user' | 'assistant', content: `msg ${i}`, attachments: i === 34 ? [{ name: 'b.md', bytes: 3, text: '# B' }] : [], plan: null, tokens_in: 0, tokens_out: 0, cost_usd: 0, created_at: '' }));
    const turns = historyTurns(msgs);
    expect(turns).toHaveLength(30);
    expect(turns[0].content).toBe('msg 5');
    expect(turns[29].content).toContain('--- Dosya: b.md');
    expect(turns[29].content).toContain('```\n# B\n```');
  });
  it('özet: pencere aşıldığında ilk kez, sonra her 10 mesajda', () => {
    expect(shouldSummarize(30, false)).toBe(false);
    expect(shouldSummarize(31, false)).toBe(true);
    expect(shouldSummarize(31, true)).toBe(false);
    expect(shouldSummarize(40, true)).toBe(true);
    expect(shouldSummarize(41, true)).toBe(false);
  });
  it('görev açıklaması kabul ölçütlerini markdown olarak ekler', () => {
    expect(taskDescription('Açıklama', ['a', 'b'])).toBe('Açıklama\n\n**Kabul ölçütleri**\n- a\n- b');
    expect(taskDescription('', [])).toBeNull();
  });
});
