import { describe, expect, it, vi } from 'vitest';
import {
  DEFAULT_NOTIFICATION_PREFS, coerceNotificationPrefs, digestDue, dueScanOpen, groupByDay, inQuietHours, isDuplicate, kindPref, localParts, mentionedEmployees,
  normalizeKind, orgRuleAllows, resolveAudience, resolveDelivery, ruleFromMode, ruleMode, userPrefsSchema,
  type NotificationRule, type Task,
} from '@jscore/contracts';
import { DemoRepo } from '@jscore/core/repo/demo';
import { notify } from '@jscore/core/notify';
import { sendEmail, emailProviderStatus } from '@jscore/core/notify/email';
import { buildDigest, renderDigestEmail, renderInstantEmail } from '@jscore/core/notify/templates';
import { signUnsubscribe, verifyUnsubscribe } from '@jscore/core/notify/unsubscribe';
import { buildInbox } from '../inbox';

const task = (p: Partial<Task>): Task => ({ id: 't', org_id: 'o', project_id: 'p1', title: 'Görev', assignee_id: 'SK', state: 'production', priority: 'normal', due_at: '2026-10-14', planned_minutes: 60, task_type: 'general', qty: 1, source_ref: null, labels: [], client_visible: false, created_at: '2026-10-01T09:00:00Z', ...p });
const team = [
  { id: 'BY', app_role: 'owner' as const, status: 'active' as const, name: 'Batuhan Berk Yaşar', team: 'Yönetim' },
  { id: 'OE', app_role: 'account' as const, status: 'active' as const, name: 'Öykü Erelmalı', team: 'Hesap' },
  { id: 'SK', app_role: 'creative' as const, status: 'active' as const, name: 'Seda Karabacak', team: 'Kreatif' },
  { id: 'XX', app_role: 'creative' as const, status: 'left' as const, name: 'Ayrılan Kişi', team: 'Kreatif' },
];

/* ═══════════ Tercihler ═══════════ */
describe('bildirim tercihleri', () => {
  it('varsayılanlar: uygulama içi + e-posta açık, push kapalı, günlük özet, 22:00–08:00 sessiz, ses kapalı', () => {
    expect(DEFAULT_NOTIFICATION_PREFS.channels).toEqual({ inapp: true, push: false, email: true });
    expect(DEFAULT_NOTIFICATION_PREFS.digest).toBe('daily');
    expect(DEFAULT_NOTIFICATION_PREFS.quiet_hours).toEqual({ from: '22:00', to: '08:00' });
    expect(DEFAULT_NOTIFICATION_PREFS.sound).toBe(false);
    expect(kindPref(DEFAULT_NOTIFICATION_PREFS, 'comment')).toEqual({ inapp: true, email: false });
  });
  it('eski taslak şekli dönüştürülür; userPrefsSchema içinden de geçer', () => {
    const p = coerceNotificationPrefs({ in_app: false, email_digest: true, mentions: false });
    expect(p.channels.inapp).toBe(false); expect(p.digest).toBe('daily'); expect(kindPref(p, 'mention').inapp).toBe(false);
    const u = userPrefsSchema.parse({ notifications: { in_app: true, email_digest: false, mentions: true } });
    expect(u.notifications.digest).toBe('off'); expect(u.notifications.channels.inapp).toBe(true);
    expect(userPrefsSchema.parse({}).notifications).toEqual(DEFAULT_NOTIFICATION_PREFS);
    expect(coerceNotificationPrefs({ channels: { push: true }, digest: 'weekly' }).digest).toBe('weekly');
    expect(coerceNotificationPrefs({ digest: 'hourly' })).toEqual(DEFAULT_NOTIFICATION_PREFS); // geçersiz → varsayılan
  });
  it('normalizeKind eski türleri eşler', () => {
    expect(normalizeKind('approval')).toBe('approval_requested'); expect(normalizeKind('task')).toBe('task_assigned'); expect(normalizeKind('mention')).toBe('mention'); expect(normalizeKind('xyz')).toBe('system');
  });
});

/* ═══════════ Saat dilimi & sessiz saat ═══════════ */
describe('yerel saat ve sessiz saatler', () => {
  it('localParts İstanbul (+03) ve UTC', () => {
    expect(localParts('2026-10-14T05:31:00Z', 'Europe/Istanbul')).toMatchObject({ date: '2026-10-14', hhmm: '08:31', weekday: 3 });
    expect(localParts('2026-10-13T22:30:00Z', 'Europe/Istanbul').date).toBe('2026-10-14');   // gece yarısını aşar
    expect(localParts('2026-10-12T06:00:00Z', 'UTC')).toMatchObject({ hhmm: '06:00', weekday: 1 });  // Pazartesi
    expect(localParts('2026-10-12T06:00:00Z', 'Mars/Olympus').hhmm).toBe('06:00');          // geçersiz → UTC
  });
  it('inQuietHours gece yarısını aşan aralık', () => {
    const q = { from: '22:00', to: '08:00' };
    expect(inQuietHours('23:15', q)).toBe(true); expect(inQuietHours('03:00', q)).toBe(true); expect(inQuietHours('08:00', q)).toBe(false); expect(inQuietHours('12:00', q)).toBe(false);
    expect(inQuietHours('12:30', { from: '12:00', to: '13:00' })).toBe(true);
    expect(inQuietHours('12:30', { from: '09:00', to: '09:00' })).toBe(false); expect(inQuietHours('12:30', null)).toBe(false);
  });
  it('resolveDelivery: sessiz saatte anlık e-posta özete düşer; e-posta kanalı kapalıysa off; push yalnızca inapp açıkken', () => {
    const prefs = { ...DEFAULT_NOTIFICATION_PREFS, channels: { inapp: true, push: true, email: true } };
    expect(resolveDelivery({ prefs, kind: 'mention', role: 'creative', localHhmm: '14:00' })).toEqual({ inapp: true, push: true, email: 'instant' });
    expect(resolveDelivery({ prefs, kind: 'mention', role: 'creative', localHhmm: '23:30' }).email).toBe('digest');
    expect(resolveDelivery({ prefs: { ...prefs, digest: 'off' }, kind: 'mention', role: 'creative', localHhmm: '23:30' }).email).toBe('off');
    expect(resolveDelivery({ prefs, kind: 'comment', role: 'creative', localHhmm: '14:00' }).email).toBe('off');            // tür varsayılanı e-posta kapalı
    expect(resolveDelivery({ prefs, kind: 'task_overdue', role: 'creative', localHhmm: '14:00' }).email).toBe('digest');   // anlık tür değil
    expect(resolveDelivery({ prefs: { ...prefs, channels: { inapp: false, push: true, email: false } }, kind: 'mention', role: 'creative' })).toEqual({ inapp: false, push: false, email: 'off' });
    expect(resolveDelivery({ prefs: { ...prefs, kinds: { mention: { inapp: false, email: true } } }, kind: 'mention', role: 'creative', localHhmm: '10:00' })).toMatchObject({ inapp: false, email: 'instant' });
  });
});

/* ═══════════ Org kuralları ═══════════ */
describe('organizasyon kuralları', () => {
  const rules: NotificationRule[] = [
    { event_type: 'comment', channel: 'email', roles: [], enabled: false },                  // herkese kapalı
    { event_type: 'approval_requested', channel: 'email', roles: ['owner', 'account'], enabled: true }, // yalnızca
    { event_type: 'trello_change', channel: 'in_app', roles: ['finance'], enabled: false },  // finance hariç
  ];
  it('kural yok → açık; kapalı / yalnızca / hariç', () => {
    expect(orgRuleAllows(rules, 'mention', 'email', 'creative')).toBe(true);
    expect(orgRuleAllows(rules, 'comment', 'email', 'owner')).toBe(false);
    expect(orgRuleAllows(rules, 'approval_requested', 'email', 'account')).toBe(true);
    expect(orgRuleAllows(rules, 'approval_requested', 'email', 'creative')).toBe(false);
    expect(orgRuleAllows(rules, 'approval_requested', 'in_app', 'creative')).toBe(true);      // başka kanal
    expect(orgRuleAllows(rules, 'trello_change', 'in_app', 'finance')).toBe(false);
    expect(orgRuleAllows(rules, 'trello_change', 'in_app', 'pm')).toBe(true);
    expect(orgRuleAllows(null, 'comment', 'email', 'owner')).toBe(true);
  });
  it('mod ↔ kural gidiş dönüş', () => {
    expect(ruleMode(null)).toBe('open'); expect(ruleMode({ roles: [], enabled: false })).toBe('closed'); expect(ruleMode({ roles: ['pm'], enabled: true })).toBe('only'); expect(ruleMode({ roles: ['pm'], enabled: false })).toBe('except');
    expect(ruleFromMode('open', ['pm'])).toBeNull(); expect(ruleFromMode('closed', ['pm'])).toEqual({ roles: [], enabled: false }); expect(ruleFromMode('only', ['pm'])).toEqual({ roles: ['pm'], enabled: true });
    expect(resolveDelivery({ prefs: DEFAULT_NOTIFICATION_PREFS, rules, kind: 'approval_requested', role: 'creative', localHhmm: '10:00' }).email).toBe('off');
  });
});

/* ═══════════ Hedef kitle, tekilleştirme, anma, gruplama ═══════════ */
describe('hedef kitle ve tekilleştirme', () => {
  it('resolveAudience: kimlik ∪ rol ∪ ekip ∪ herkes; ayrılan ve except dışarıda; sıra korunur', () => {
    expect(resolveAudience({ employee_ids: ['SK', 'SK'] }, team)).toEqual(['SK']);
    expect(resolveAudience({ role: 'owner', employee_ids: ['SK'] }, team)).toEqual(['SK', 'BY']);
    expect(resolveAudience({ role: ['owner', 'account'], except: 'BY' }, team)).toEqual(['OE']);
    expect(resolveAudience({ team: 'kreatif' }, team)).toEqual(['SK']);
    expect(resolveAudience({ all: true }, team)).toEqual(['BY', 'OE', 'SK']);
    expect(resolveAudience({}, team)).toEqual([]);
  });
  it('isDuplicate 24 saat penceresi', () => {
    const recent = [{ employee_id: 'SK', dedupe_key: 'due:2026-10-14', created_at: '2026-10-14T06:00:00Z' }];
    expect(isDuplicate(recent, 'SK', 'due:2026-10-14', '2026-10-14T18:00:00Z')).toBe(true);
    expect(isDuplicate(recent, 'OE', 'due:2026-10-14', '2026-10-14T18:00:00Z')).toBe(false);
    expect(isDuplicate(recent, 'SK', 'due:2026-10-14', '2026-10-15T07:00:00Z')).toBe(false);   // > 24 sa
    expect(isDuplicate(recent, 'SK', undefined, '2026-10-14T18:00:00Z')).toBe(false);
  });
  it('mentionedEmployees: @ilkad (tr küçük harf), @Ad Soyad; eylemi yapan hariç; kelime sınırı', () => {
    expect(mentionedEmployees('@seda bakar mısın, @Öykü de', team)).toEqual(['OE', 'SK']);
    expect(mentionedEmployees('@Seda Karabacak lütfen', team, 'SK')).toEqual([]);
    expect(mentionedEmployees('@sedanur değil', team)).toEqual([]);
    expect(mentionedEmployees('@ÖYKÜ', team)).toEqual(['OE']);
    expect(mentionedEmployees('anma yok', team)).toEqual([]); expect(mentionedEmployees(null, team)).toEqual([]);
  });
  it('groupByDay: Bugün / Dün / gün ay (yerel)', () => {
    const items = [{ id: 'a', created_at: '2026-10-14T06:00:00Z' }, { id: 'b', created_at: '2026-10-13T21:30:00Z' }, { id: 'c', created_at: '2026-10-13T10:00:00Z' }, { id: 'd', created_at: '2026-10-01T10:00:00Z' }];
    const g = groupByDay(items, '2026-10-14T12:00:00Z', 'Europe/Istanbul');
    expect(g.map((x) => [x.label, x.items.map((i) => i.id)])).toEqual([['Bugün', ['a', 'b']], ['Dün', ['c']], ['1 Eki', ['d']]]);   // b: 00:30 yerel → bugün
  });
  it('özet zamanlaması: 08:30–09:29 penceresi, haftalık yalnızca Pazartesi, aynı gün tekrar yok; günlük tarama 08:00 sonrası', () => {
    const wed = localParts('2026-10-14T05:45:00Z', 'Europe/Istanbul'); // Çarşamba 08:45
    expect(digestDue('daily', wed, null)).toBe(true); expect(digestDue('daily', wed, '2026-10-14')).toBe(false); expect(digestDue('daily', wed, '2026-10-13')).toBe(true);
    expect(digestDue('weekly', wed, null)).toBe(false);
    expect(digestDue('weekly', localParts('2026-10-12T05:45:00Z', 'Europe/Istanbul'), null)).toBe(true);
    expect(digestDue('daily', localParts('2026-10-14T07:00:00Z', 'Europe/Istanbul'), null)).toBe(false);  // 10:00 → pencere dışı
    expect(dueScanOpen(localParts('2026-10-14T04:30:00Z', 'Europe/Istanbul'))).toBe(false); expect(dueScanOpen(wed)).toBe(true);
  });
});

/* ═══════════ Özet içeriği & şablonlar ═══════════ */
describe('özet ve e-posta şablonları', () => {
  const tasks = [task({ id: 'a', title: 'Geciken', due_at: '2026-10-10' }), task({ id: 'b', title: 'Bugünkü', due_at: '2026-10-14' }), task({ id: 'c', title: 'Haftaya', due_at: '2026-10-18' }), task({ id: 'd', title: 'Başkasının', assignee_id: 'OE', due_at: '2026-10-10' }), task({ id: 'e', title: 'Bitti', state: 'delivery', due_at: '2026-10-10' })];
  it('buildDigest günlük: geciken + bugün + onaylar + okunmamış + dünkü duyuru; haftalıkta bu hafta', () => {
    const d = buildDigest({ period: 'daily', today: '2026-10-14', employeeId: 'SK', tasks, approvals: [{ id: 'ap', title: 'Bütçe', due_at: '2026-10-15', action_type: 'budget' }], unread: 3, announcements: [{ id: 'an', title: 'Ofis', created_at: '2026-10-13T09:00:00Z' }, { id: 'old', title: 'Eski', created_at: '2026-10-01T09:00:00Z' }] });
    expect(d.sections.map((s) => [s.key, s.count])).toEqual([['overdue', 1], ['due_today', 1], ['approvals', 1], ['announcements', 1], ['unread', 3]]);
    expect(d.headline).toBe('1 geciken · 1 bugün biten · 1 bekleyen onay'); expect(d.empty).toBe(false);
    const w = buildDigest({ period: 'weekly', today: '2026-10-14', since: '2026-10-07', employeeId: 'SK', tasks, approvals: [], unread: 0, announcements: [] });
    expect(w.sections.map((s) => s.key)).toEqual(['overdue', 'due_today', 'due_week']);
    expect(buildDigest({ period: 'daily', today: '2026-10-14', employeeId: 'ZZ', tasks, approvals: [], unread: 0, announcements: [] })).toMatchObject({ empty: true, headline: 'Her şey yolunda' });
  });
  it('renderDigestEmail: konu, derin bağlantılar, abonelik bağlantısı', () => {
    const d = buildDigest({ period: 'daily', today: '2026-10-14', employeeId: 'SK', tasks, approvals: [], unread: 1, announcements: [] });
    const m = renderDigestEmail(d, { appUrl: 'https://app.example/', orgName: 'Jobs', recipientName: 'Seda Karabacak', today: '2026-10-14', unsubscribeUrl: 'https://app.example/api/notify/unsubscribe?t=x' });
    expect(m.subject).toBe('Günlük özet · 14 Ekim 2026 — 1 geciken · 1 bugün biten');
    expect(m.html).toContain('https://app.example/app/projects/p1?task=a'); expect(m.html).toContain('Merhaba Seda,'); expect(m.html).toContain('api/notify/unsubscribe');
    expect(m.text).toContain('Geciken işlerin (1)'); expect(m.html).not.toContain('<script');
  });
  it('renderInstantEmail: tür başlığı + CTA; HTML kaçışı', () => {
    const m = renderInstantEmail({ kind: 'approval_requested', title: 'Onay sırası sende: Bütçe <x>', body: 'adım 1/2', href: '/app/approvals' }, { appUrl: 'https://app.example', orgName: 'Jobs', recipientName: 'Öykü' });
    expect(m.subject).toBe('Onay sırası sende: Bütçe <x>'); expect(m.html).toContain('&lt;x&gt;'); expect(m.html).toContain('https://app.example/app/approvals'); expect(m.text).toContain('Onayı aç: https://app.example/app/approvals');
  });
});

/* ═══════════ Abonelikten çıkma token'ı ═══════════ */
describe('unsubscribe token', () => {
  const S = 'çok-gizli';
  it('imzala / doğrula; süre; kurcalama; yanlış sır', () => {
    const t = signUnsubscribe({ u: 'user-1', k: 'email' }, S, 1_000);
    expect(verifyUnsubscribe(t, S, 1_000)).toEqual({ u: 'user-1', k: 'email', e: 1_000 + 90 * 86400 });
    expect(verifyUnsubscribe(t, S, 1_000 + 91 * 86400)).toBeNull();
    expect(verifyUnsubscribe(t, 'başka', 1_000)).toBeNull();
    const [body, sig] = t.split('.');
    expect(verifyUnsubscribe(`${Buffer.from(JSON.stringify({ u: 'user-2', k: 'email', e: 9e9 })).toString('base64url')}.${sig}`, S, 1_000)).toBeNull();
    expect(verifyUnsubscribe(`${body}.${sig.slice(0, -2)}xx`, S, 1_000)).toBeNull();
    expect(verifyUnsubscribe('bozuk', S)).toBeNull(); expect(verifyUnsubscribe(t, undefined)).toBeNull();
    expect(() => signUnsubscribe({ u: 'x', k: 'digest' }, '')).toThrow();
  });
});

/* ═══════════ E-posta sağlayıcısı ═══════════ */
describe('sendEmail', () => {
  it('sağlayıcı yoksa atlanır ve günlüğe yazılır', async () => {
    const lines: string[] = [];
    expect(emailProviderStatus({} as NodeJS.ProcessEnv)).toMatchObject({ provider: 'log', configured: false });
    const r = await sendEmail({ to: 'a@b.co', subject: 'S', html: '<p>h</p>', text: 't' }, { env: {} as NodeJS.ProcessEnv, log: (l) => lines.push(l) });
    expect(r.status).toBe('skipped'); expect(lines[0]).toContain('a@b.co');
  });
  it('Resend: başarılı ve hatalı yanıt; geçersiz alıcı', async () => {
    const env = { RESEND_API_KEY: 're_x', EMAIL_FROM: 'JS <n@x.co>' } as unknown as NodeJS.ProcessEnv;
    const calls: Array<{ url: string; init: RequestInit }> = [];
    const okFetch = vi.fn(async (url: string | URL | Request, init?: RequestInit) => { calls.push({ url: String(url), init: init! }); return new Response(JSON.stringify({ id: 'msg_1' }), { status: 200 }); }) as unknown as typeof fetch;
    const r = await sendEmail({ to: 'a@b.co', subject: 'S', html: '<p>h</p>', text: 't', unsubscribeUrl: 'https://u' }, { env, fetch: okFetch });
    expect(r).toEqual({ status: 'sent', provider: 'resend', provider_id: 'msg_1' });
    const body = JSON.parse(calls[0].init.body as string);
    expect(body.from).toBe('JS <n@x.co>'); expect(body.to).toEqual(['a@b.co']); expect(body.headers['List-Unsubscribe']).toBe('<https://u>');
    expect((calls[0].init.headers as Record<string, string>).authorization).toBe('Bearer re_x');
    const badFetch = (async () => new Response(JSON.stringify({ message: 'Invalid from' }), { status: 422 })) as unknown as typeof fetch;
    expect(await sendEmail({ to: 'a@b.co', subject: 'S', html: '', text: '' }, { env, fetch: badFetch })).toMatchObject({ status: 'error', error: 'Invalid from' });
    expect((await sendEmail({ to: 'yok', subject: 'S', html: '', text: '' }, { env })).status).toBe('error');
  });
});

/* ═══════════ DemoRepo uçtan uca: notify + üreticiler + merkez ═══════════ */
const kv = () => { const m = new Map<string, string>(); return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => { m.set(k, v); } }; };
describe('DemoRepo bildirimleri (0019)', () => {
  const T = '2026-10-14T10:00:00Z';
  it('görev atama → sorumluya "atandı" (eylemi yapan hariç); yeniden atama; 24 sa tekilleştirme', async () => {
    const storage = kv();
    const owner = new DemoRepo({ accountId: 'owner', now: () => T, storage });
    const creative = new DemoRepo({ accountId: 'creative', now: () => T, storage });
    const got: string[] = [];
    const off = creative.subscribeNotifications((n) => got.push(n.kind));
    const t = await owner.createTask({ project_id: 'p1', title: 'Yeni afiş', assignee_id: 'SK', due_at: '2026-10-20', priority: 'normal', planned_minutes: 60, task_type: 'general', qty: 1, state: 'brief' });
    const mine = await creative.listNotifications({ mine: true });
    expect(mine[0]).toMatchObject({ kind: 'task_assigned', employee_id: 'SK', read: false, href: `/app/projects/p1?task=${t.id}`, dedupe_key: `assigned:${t.id}:SK` });
    expect(got).toEqual(['task_assigned']);
    expect((await owner.listNotifications({ mine: true })).some((n) => n.dedupe_key === `assigned:${t.id}:SK`)).toBe(false);
    // Aynı kişiye tekrar atama (önce başkasına, sonra geri) → aynı anahtar 24 sa içinde yazılmaz
    await owner.updateTask(t.id, { assignee_id: 'OE' });
    await owner.updateTask(t.id, { assignee_id: 'SK' });
    expect((await creative.listNotifications({ mine: true })).filter((n) => n.dedupe_key === `assigned:${t.id}:SK`)).toHaveLength(1);
    expect((await new DemoRepo({ accountId: 'account', now: () => T, storage }).listNotifications({ mine: true }))[0]).toMatchObject({ kind: 'task_assigned', title: `Görev sana devredildi: Yeni afiş` });
    // kendine atama → bildirim yok
    const before = (await owner.listNotifications({ mine: true })).length;
    await owner.updateTask(t.id, { assignee_id: 'BY' });
    expect((await owner.listNotifications({ mine: true })).length).toBe(before);
    off();
  });
  it('yorum → sorumluya "yorum", @anma → anılana "anma" (sorumlu anıldıysa yalnızca anma); açıklama anması', async () => {
    const storage = kv();
    const owner = new DemoRepo({ accountId: 'owner', now: () => T, storage });
    const t = await owner.createTask({ project_id: 'p1', title: 'Kampanya', assignee_id: 'OE', due_at: '2026-10-20', priority: 'normal', planned_minutes: 60, task_type: 'general', qty: 1, state: 'brief' });
    await owner.addComment(t.id, '@seda görsel yönü için bak lütfen');
    const sk = await new DemoRepo({ accountId: 'creative', now: () => T, storage }).listNotifications({ mine: true });
    const oe = await new DemoRepo({ accountId: 'account', now: () => T, storage }).listNotifications({ mine: true });
    expect(sk[0]).toMatchObject({ kind: 'mention', title: 'Batuhan Berk Yaşar seni andı: Kampanya' });
    expect(oe.filter((n) => n.title.includes('Kampanya')).map((n) => n.kind).sort()).toEqual(['comment', 'task_assigned']);
    await owner.addComment(t.id, '@öykü senin için not');
    expect((await new DemoRepo({ accountId: 'account', now: () => T, storage }).listNotifications({ mine: true })).filter((n) => n.title.includes('Kampanya')).map((n) => n.kind).sort()).toEqual(['comment', 'mention', 'task_assigned']);
    await owner.updateTask(t.id, { description: 'Brief: @seda ile konuş' });
    expect((await new DemoRepo({ accountId: 'creative', now: () => T, storage }).listNotifications({ mine: true })).filter((n) => n.title.includes('Kampanya')).map((n) => n.kind)).toEqual(['mention', 'mention']);
    // gelen kutusu yeni türleri tanır
    const items = buildInbox({ me: { role: 'creative', employee_id: 'SK', name: 'Seda Karabacak' }, tasks: [], approvals: [], notifications: sk, today: '2026-10-14', done: [] });
    expect(items.find((x) => x.title.includes('Kampanya'))).toMatchObject({ kind: 'mention', id: `mention:${sk[0].id}` });
  });
  it('notify(): rol hedefi, org kuralı (herkese kapalı / yalnızca roller), dedupe_key, except', async () => {
    const storage = kv();
    const owner = new DemoRepo({ accountId: 'owner', now: () => T, storage });
    const r1 = await notify(owner, { kind: 'system', role: ['owner', 'account'], title: 'Sistem', body: 'b', dedupe_key: 'sys:1' });
    expect(r1.recipients).toEqual(expect.arrayContaining(['BY', 'OE'])); expect(r1.recipients).not.toContain('SK');
    expect((await notify(owner, { kind: 'system', role: ['owner', 'account'], title: 'Sistem', body: 'b', dedupe_key: 'sys:1' })).inserted).toBe(0);
    await owner.saveNotificationRules([{ event_type: 'system', channel: 'in_app', roles: [], enabled: false }, { event_type: 'announcement', channel: 'in_app', roles: ['owner'], enabled: true }]);
    expect((await owner.listNotificationRules()).map((r) => r.event_type)).toEqual(['system', 'announcement']);
    const r2 = await notify(owner, { kind: 'system', all: true, title: 'Sistem', body: 'b' });
    expect(r2.inserted).toBe(0); expect(r2.skipped).toBeGreaterThan(0);
    const r3 = await notify(owner, { kind: 'announcement', all: true, except: 'BY', title: 'Duyuru', body: 'b' });
    expect(r3.inserted).toBe(0);                                                                  // yalnızca owner → owner except → kimse
    const r4 = await notify(owner, { kind: 'announcement', all: true, title: 'Duyuru', body: 'b' });
    expect(r4.recipients.every((id) => team.find((t) => t.id === id)?.app_role !== 'creative')).toBe(true); expect(r4.recipients).toContain('BY');
    await expect(new DemoRepo({ accountId: 'creative', now: () => T, storage }).saveNotificationRules([])).rejects.toThrow(/owner/);
  });
  it('duyuru → hedef kitle; talep → göreve dönüştü → talep eden; onay → sıradakine "onay istendi", karar → talep edene', async () => {
    const storage = kv();
    const owner = new DemoRepo({ accountId: 'owner', now: () => T, storage });
    await owner.save('announcements', { author_user_id: 'u_owner', author_name: 'BY', title: 'Ofis kapalı', body: 'Cuma', audience: { roles: ['creative'] }, requires_ack: true, poll: null });
    const sk = new DemoRepo({ accountId: 'creative', now: () => T, storage });
    expect((await sk.listNotifications({ mine: true }))[0]).toMatchObject({ kind: 'announcement', title: 'Duyuru: Ofis kapalı', href: '/app/announcements' });
    expect((await new DemoRepo({ accountId: 'account', now: () => T, storage }).listNotifications({ mine: true })).some((n) => n.kind === 'announcement')).toBe(false);
    const req = await sk.save('requests', { kind: 'brief', title: 'Yeni ekran', body: 'b', status: 'new', requester_employee_id: 'SK', requester_name: 'Seda', brand_id: null, project_id: 'p1', task_id: null });
    const t = await owner.createTask({ project_id: 'p1', title: 'Yeni ekran', assignee_id: null, due_at: '2026-10-20', priority: 'normal', planned_minutes: 60, task_type: 'general', qty: 1, state: 'brief' });
    await owner.save('requests', { id: req.id, status: 'converted', task_id: t.id, project_id: 'p1' });
    expect((await sk.listNotifications({ mine: true }))[0]).toMatchObject({ kind: 'request_converted', href: `/app/projects/p1?task=${t.id}` });
    const a = await sk.createApproval({ action_type: 'budget', title: 'Bütçe talebi', required_role: 'owner', due_at: '2026-10-16', subject: { amount_minor: 100000 } });
    const own = await owner.listNotifications({ mine: true });
    expect(own.find((n) => n.dedupe_key === `approval:${a.id}:step:0`)).toMatchObject({ kind: 'approval_requested' });
    await owner.decideApproval(a.id, 'approved');
    expect((await sk.listNotifications({ mine: true }))[0]).toMatchObject({ kind: 'approval_decided', title: 'Onaylandı: Bütçe talebi' });
  });
  it('okundu işaretleme yalnızca kendi satırlarım; listNotifications sırası ve limit', async () => {
    const storage = kv();
    const owner = new DemoRepo({ accountId: 'owner', now: () => T, storage });
    await notify(owner, { kind: 'system', employee_ids: ['SK', 'BY'], title: 'A', body: 'b' });
    const sk = new DemoRepo({ accountId: 'creative', now: () => T, storage });
    const mine = await sk.listNotifications({ mine: true, limit: 1 });
    expect(mine).toHaveLength(1);
    const theirs = (await owner.listNotifications({ mine: true }))[0];
    await sk.markNotificationsRead([mine[0].id, theirs.id]);
    expect((await sk.listNotifications({ mine: true }))[0].read).toBe(true);
    expect((await owner.listNotifications({ mine: true }))[0].read).toBe(false);
  });
});
