import { z } from 'zod';
import type { Role } from './roles';

/* ───────── Bildirim türleri ─────────
 * Tek `notify()` kanalı (core/notify) her üreticiyi bu türlerle yazar. Eski satırlar (task | approval | system) `normalizeKind` ile eşlenir. */
export const NOTIFICATION_KINDS = [
  'task_assigned', 'mention', 'comment', 'task_due', 'task_overdue',
  'approval_requested', 'approval_decided', 'approval_sla',
  'request_converted', 'announcement', 'board_plan', 'trello_change', 'unblocked', 'delegation', 'system',
] as const;
export type NotificationKind = (typeof NOTIFICATION_KINDS)[number];
/** 0018 öncesi satırlardaki türler; görünümde eşlenir. */
export type LegacyNotificationKind = 'task' | 'approval';
export const NOTIFICATION_KIND_LABELS: Record<NotificationKind, string> = {
  task_assigned: 'Görev atandı', mention: 'Anma', comment: 'Yorum', task_due: 'Bugün teslim', task_overdue: 'Gecikmiş görev',
  approval_requested: 'Onay istendi', approval_decided: 'Onay kararı', approval_sla: 'SLA aşımı',
  request_converted: 'Talep göreve dönüştü', announcement: 'Duyuru', board_plan: 'Kurul planı', trello_change: 'Trello değişikliği',
  unblocked: 'Önün açıldı', delegation: 'Delegasyon', system: 'Sistem',
};
/** Tercih ekranında gruplar (okunabilirlik). */
export const NOTIFICATION_KIND_GROUPS: Array<{ label: string; kinds: NotificationKind[] }> = [
  { label: 'Görevler', kinds: ['task_assigned', 'comment', 'mention', 'task_due', 'task_overdue', 'unblocked', 'trello_change'] },
  { label: 'Onaylar', kinds: ['approval_requested', 'approval_decided', 'approval_sla', 'delegation'] },
  { label: 'Organizasyon', kinds: ['announcement', 'request_converted', 'board_plan', 'system'] },
];
/** Anlık e-posta gönderilebilen türler (tercih + sessiz saat izin verirse); kalanlar yalnızca özete girer. */
export const INSTANT_EMAIL_KINDS: NotificationKind[] = ['approval_requested', 'mention', 'task_assigned'];
export function normalizeKind(k: string | undefined | null): NotificationKind {
  if (!k) return 'system';
  if ((NOTIFICATION_KINDS as readonly string[]).includes(k)) return k as NotificationKind;
  if (k === 'approval') return 'approval_requested';
  if (k === 'task') return 'task_assigned';
  return 'system';
}
export const notificationKindLabel = (k: string | undefined | null) => NOTIFICATION_KIND_LABELS[normalizeKind(k)];

/* ───────── Kullanıcı tercihleri: user_prefs.prefs.notifications ───────── */
const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;
export const kindPrefSchema = z.object({ inapp: z.boolean().default(true), email: z.boolean().default(true) });
export const notificationPrefsSchema = z.object({
  channels: z.object({ inapp: z.boolean().default(true), push: z.boolean().default(false), email: z.boolean().default(true) }).default({ inapp: true, push: false, email: true }),
  /** Tür başına kanal; eksik tür = varsayılan (inapp+email açık; task_due / comment e-postası kapalı → özete girer). */
  kinds: z.record(z.string(), kindPrefSchema).default({}),
  digest: z.enum(['off', 'daily', 'weekly']).default('daily'),
  /** Sessiz saatler (yerel saat, HH:MM). from > to ise gece yarısını aşar. null = yok. */
  quiet_hours: z.object({ from: z.string().regex(HHMM), to: z.string().regex(HHMM) }).nullable().default({ from: '22:00', to: '08:00' }),
  sound: z.boolean().default(false),
});
export type NotificationPrefs = z.infer<typeof notificationPrefsSchema>;
export type KindPref = z.infer<typeof kindPrefSchema>;
/** Tür için varsayılan kanal kararı (tercihte satır yoksa). */
export const DEFAULT_KIND_PREF: Record<NotificationKind, KindPref> = {
  task_assigned: { inapp: true, email: true }, mention: { inapp: true, email: true }, comment: { inapp: true, email: false },
  task_due: { inapp: true, email: false }, task_overdue: { inapp: true, email: true },
  approval_requested: { inapp: true, email: true }, approval_decided: { inapp: true, email: true }, approval_sla: { inapp: true, email: true },
  request_converted: { inapp: true, email: false }, announcement: { inapp: true, email: true }, board_plan: { inapp: true, email: true },
  trello_change: { inapp: true, email: false }, unblocked: { inapp: true, email: false }, delegation: { inapp: true, email: true }, system: { inapp: true, email: false },
};
export const DEFAULT_NOTIFICATION_PREFS: NotificationPrefs = notificationPrefsSchema.parse({});
/** Eski taslak şekli ({in_app, email_digest, mentions}) ya da kısmi nesneyi geçerli tercihe çevirir. */
export function coerceNotificationPrefs(raw: unknown): NotificationPrefs {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  if ('in_app' in r || 'email_digest' in r || 'mentions' in r) {
    return notificationPrefsSchema.parse({
      channels: { inapp: r.in_app !== false, push: false, email: true },
      kinds: r.mentions === false ? { mention: { inapp: false, email: false } } : {},
      digest: r.email_digest === true ? 'daily' : 'off',
    });
  }
  const p = notificationPrefsSchema.safeParse(r);
  return p.success ? p.data : DEFAULT_NOTIFICATION_PREFS;
}
export const kindPref = (p: NotificationPrefs, kind: NotificationKind): KindPref => ({ ...DEFAULT_KIND_PREF[kind], ...(p.kinds[kind] ?? {}) });

/* ───────── Organizasyon kuralları (notification_rules) ─────────
 * (tür, kanal) için: kural yok → herkese açık; {roles:[], enabled:false} → herkese kapalı; {roles:X, enabled:true} → yalnızca X (izin listesi);
 * {roles:X, enabled:false} → X hariç herkes. Kişinin rolüyle eşleşen kural varsa onun `enabled` değeri geçerlidir. */
export const NOTIFICATION_CHANNELS = ['in_app', 'email', 'slack'] as const;
export type NotificationChannel = (typeof NOTIFICATION_CHANNELS)[number];
export interface NotificationRule { id?: string; org_id?: string; event_type: string; channel: NotificationChannel; roles: Role[]; enabled: boolean }
export const notificationRuleSchema = z.object({
  id: z.string().optional(), event_type: z.string().min(1), channel: z.enum(NOTIFICATION_CHANNELS).default('in_app'),
  roles: z.array(z.string()).default([]), enabled: z.boolean().default(true),
});
export function orgRuleAllows(rules: NotificationRule[] | null | undefined, kind: string, channel: NotificationChannel, role: Role): boolean {
  const forKind = (rules ?? []).filter((r) => r.event_type === kind && r.channel === channel);
  if (!forKind.length) return true;
  const matching = forKind.filter((r) => !r.roles.length || r.roles.includes(role));
  if (matching.length) return matching.every((r) => r.enabled);
  // Rol hiçbir kuralda geçmiyor: izin listesi (enabled + roller) varsa kapalı, yoksa açık.
  return !forKind.some((r) => r.enabled && r.roles.length > 0);
}
/** Panel düzenleyicisi için kural → mod; `ruleFromMode` tersi (mod 'open' → kural yok). */
export type RuleMode = 'open' | 'only' | 'except' | 'closed';
export const RULE_MODE_LABELS: Record<RuleMode, string> = { open: 'Herkese açık', only: 'Yalnızca seçili roller', except: 'Seçili roller hariç', closed: 'Herkese kapalı' };
export function ruleMode(r: Pick<NotificationRule, 'roles' | 'enabled'> | null | undefined): RuleMode {
  if (!r) return 'open';
  if (!r.roles.length) return r.enabled ? 'open' : 'closed';
  return r.enabled ? 'only' : 'except';
}
export function ruleFromMode(mode: RuleMode, roles: Role[]): Pick<NotificationRule, 'roles' | 'enabled'> | null {
  if (mode === 'open') return null;
  if (mode === 'closed') return { roles: [], enabled: false };
  return { roles, enabled: mode === 'only' };
}
/** Varsayılan kurallar (seed + 0019): yalnızca açık yasaklar; geri kalan türler herkese açık. */
export const DEFAULT_NOTIFICATION_RULES: Array<Omit<NotificationRule, 'id' | 'org_id'>> = [
  { event_type: 'approval_requested', channel: 'in_app', roles: [], enabled: true },
  { event_type: 'approval_requested', channel: 'email', roles: [], enabled: true },
  { event_type: 'approval_decided', channel: 'email', roles: [], enabled: true },
  { event_type: 'task_overdue', channel: 'in_app', roles: [], enabled: true },
  { event_type: 'task_overdue', channel: 'email', roles: [], enabled: true },
  { event_type: 'mention', channel: 'email', roles: [], enabled: true },
  { event_type: 'task_assigned', channel: 'email', roles: [], enabled: true },
  { event_type: 'comment', channel: 'email', roles: [], enabled: false },
  { event_type: 'system', channel: 'email', roles: [], enabled: false },
  { event_type: 'trello_change', channel: 'email', roles: [], enabled: false },
];

/* ───────── Saat dilimi & sessiz saatler (saf; Intl) ───────── */
export interface LocalParts { date: string; hhmm: string; weekday: number; minutes: number }
/** ISO anı verilen IANA saat diliminde yerel parçalara çevirir (weekday: 0 Pazar … 1 Pazartesi). Geçersiz dilim → UTC. */
export function localParts(nowIso: string, timezone: string | null | undefined): LocalParts {
  const d = new Date(nowIso);
  let tz = timezone || 'UTC';
  let parts: Intl.DateTimeFormatPart[];
  try { parts = new Intl.DateTimeFormat('en-US', { timeZone: tz, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', weekday: 'short' }).formatToParts(d); }
  catch { tz = 'UTC'; parts = new Intl.DateTimeFormat('en-US', { timeZone: tz, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', weekday: 'short' }).formatToParts(d); }
  const g = (t: string) => parts.find((p) => p.type === t)?.value ?? '';
  const hh = g('hour') === '24' ? '00' : g('hour');
  const wd = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(g('weekday'));
  return { date: `${g('year')}-${g('month')}-${g('day')}`, hhmm: `${hh}:${g('minute')}`, weekday: wd < 0 ? 0 : wd, minutes: Number(hh) * 60 + Number(g('minute')) };
}
const toMin = (hhmm: string) => { const [h, m] = hhmm.split(':').map(Number); return h * 60 + m; };
/** Sessiz saat içinde mi? Aralık gece yarısını aşabilir (22:00–08:00). from === to → sessiz saat yok. */
export function inQuietHours(hhmm: string, q: { from: string; to: string } | null | undefined): boolean {
  if (!q || !HHMM.test(q.from) || !HHMM.test(q.to) || q.from === q.to) return false;
  const t = toMin(hhmm), a = toMin(q.from), b = toMin(q.to);
  return a < b ? t >= a && t < b : t >= a || t < b;
}

/* ───────── Kanal çözümleme ───────── */
export interface Delivery { inapp: boolean; push: boolean; email: 'instant' | 'digest' | 'off' }
export interface ResolveInput { prefs: NotificationPrefs; rules?: NotificationRule[] | null; kind: NotificationKind; role: Role; /** Yerel saat (HH:MM) — sessiz saat için. */ localHhmm?: string }
/** Kişi tercihi ∧ org kuralı ∧ sessiz saat → kanallar. Sessiz saatte anlık e-posta "digest"e düşer (özette yer alır). */
export function resolveDelivery(i: ResolveInput): Delivery {
  const kp = kindPref(i.prefs, i.kind);
  const inapp = i.prefs.channels.inapp && kp.inapp && orgRuleAllows(i.rules, i.kind, 'in_app', i.role);
  const push = inapp && i.prefs.channels.push;
  let email: Delivery['email'] = 'off';
  if (i.prefs.channels.email && kp.email && orgRuleAllows(i.rules, i.kind, 'email', i.role)) {
    const instant = INSTANT_EMAIL_KINDS.includes(i.kind) && !(i.localHhmm && inQuietHours(i.localHhmm, i.prefs.quiet_hours));
    email = instant ? 'instant' : i.prefs.digest === 'off' ? 'off' : 'digest';
  }
  return { inapp, push, email };
}

/* ───────── Hedef kitle & tekilleştirme ───────── */
export interface AudienceInput { employee_ids?: string[]; role?: Role | Role[]; all?: boolean; team?: string | null; except?: string | null }
export interface AudienceMember { id: string; app_role: Role; status?: 'active' | 'left'; team?: string | null }
/** Alıcı kümesi: açık kimlikler ∪ rol(ler) ∪ ekip ∪ herkes; ayrılanlar ve `except` (eylemi yapan) dışarıda; sıra korunur, tekrar yok. */
export function resolveAudience(a: AudienceInput, team: AudienceMember[]): string[] {
  const out: string[] = [];
  const add = (id: string | null | undefined) => { if (id && id !== a.except && !out.includes(id)) out.push(id); };
  const active = team.filter((t) => t.status !== 'left');
  for (const id of a.employee_ids ?? []) add(id);
  const roles = a.role ? (Array.isArray(a.role) ? a.role : [a.role]) : [];
  if (roles.length) for (const t of active) if (roles.includes(t.app_role)) add(t.id);
  if (a.team) for (const t of active) if ((t.team ?? '').toLocaleLowerCase('tr') === a.team.toLocaleLowerCase('tr')) add(t.id);
  if (a.all) for (const t of active) add(t.id);
  return out;
}
export const DEDUPE_WINDOW_MS = 24 * 60 * 60 * 1000;
/** (employee_id, dedupe_key) son 24 saatte yazılmışsa atlanır. `recent`: {employee_id, dedupe_key, created_at}. */
export function isDuplicate(recent: Array<{ employee_id: string; dedupe_key?: string | null; created_at: string }>, employeeId: string, key: string | undefined, nowIso: string): boolean {
  if (!key) return false;
  const since = new Date(nowIso).getTime() - DEDUPE_WINDOW_MS;
  return recent.some((r) => r.employee_id === employeeId && r.dedupe_key === key && new Date(r.created_at).getTime() >= since);
}

/* ───────── @anma tespiti (görev açıklaması / yorum) ───────── */
const trLower = (s: string) => s.toLocaleLowerCase('tr');
/** `@ad` (ilk ad, tr küçük harf) ya da `@Ad Soyad` geçen çalışanlar. Eylemi yapan hariç. */
export function mentionedEmployees(text: string | null | undefined, team: Array<{ id: string; name: string }>, except?: string | null): string[] {
  if (!text || !text.includes('@')) return [];
  const t = trLower(text);
  const out: string[] = [];
  for (const m of team) {
    if (m.id === except) continue;
    const full = trLower(m.name.trim());
    const first = full.split(/\s+/)[0];
    if (!first) continue;
    const hit = t.includes(`@${full}`) || new RegExp(`@${first.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?![\\p{L}\\p{N}_])`, 'u').test(t);
    if (hit && !out.includes(m.id)) out.push(m.id);
  }
  return out;
}

/* ───────── Bildirim merkezi: güne göre gruplama ───────── */
export interface DayGroup<T> { key: string; label: string; items: T[] }
/** Yerel güne göre gruplar: Bugün / Dün / `gün ay` (yeni → eski). */
export function groupByDay<T extends { created_at: string }>(items: T[], nowIso: string, timezone?: string | null): Array<DayGroup<T>> {
  const today = localParts(nowIso, timezone).date;
  const yesterday = localParts(new Date(new Date(nowIso).getTime() - 86400000).toISOString(), timezone).date;
  const months = ['Oca', 'Şub', 'Mar', 'Nis', 'May', 'Haz', 'Tem', 'Ağu', 'Eyl', 'Eki', 'Kas', 'Ara'];
  const groups = new Map<string, DayGroup<T>>();
  for (const it of [...items].sort((a, b) => b.created_at.localeCompare(a.created_at))) {
    const d = localParts(it.created_at, timezone).date;
    const label = d === today ? 'Bugün' : d === yesterday ? 'Dün' : `${Number(d.slice(8, 10))} ${months[Number(d.slice(5, 7)) - 1]}`;
    const g = groups.get(d) ?? { key: d, label, items: [] };
    g.items.push(it); groups.set(d, g);
  }
  return [...groups.values()];
}

/* ───────── Özet (digest) zamanlaması ───────── */
export const DIGEST_HHMM = '08:30';
/** Pencere: yerel 08:30–09:29 arası; günlük her gün, haftalık yalnızca Pazartesi; aynı yerel gün ikinci kez gönderilmez. */
export function digestDue(kind: 'daily' | 'weekly', lp: LocalParts, lastSentLocalDate: string | null | undefined, hhmm = DIGEST_HHMM): boolean {
  if (kind === 'weekly' && lp.weekday !== 1) return false;
  const start = toMin(hhmm);
  if (lp.minutes < start || lp.minutes >= start + 60) return false;
  return lastSentLocalDate !== lp.date;
}
/** Bugün biten / geciken görev bildirimleri yerel 08:00'den sonra, günde bir kez (dedupe anahtarı tarih içerir). */
export const dueScanOpen = (lp: LocalParts, hhmm = '08:00') => lp.minutes >= toMin(hhmm);
