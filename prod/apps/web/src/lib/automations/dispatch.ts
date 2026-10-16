import { TASK_STATES, taskCreateSchema, type Automation, type AutomationActionKind, type TaskCreate, type TaskState } from '@jscore/contracts';

/** core.events satırı (Supabase) ya da DemoRepo'nun ürettiği eşdeğeri. type = `<tablo>.<insert|update>` (+ webhook.<sağlayıcı>). */
export interface AutomationEvent {
  id?: string; org_id: string; type: string; aggregate: string; aggregate_id: string;
  payload: { new?: Record<string, unknown> | null; old?: Record<string, unknown> | null } & Record<string, unknown>;
}
export interface RunLog { automation_id: string; status: 'ok' | 'error'; error: string | null; payload: string; event_type: string; event_id: string | null }

/** Saf dispatcher çekirdeği; veri erişimi ve yan etkiler portlardan geçer (demo: bellek, Supabase: servis rolü). */
export interface DispatchPorts {
  rules(orgId: string): Promise<Automation[]>;
  logRun(orgId: string, run: RunLog): Promise<void>;
  touchRule(orgId: string, rule: Automation, firedAt: string): Promise<void>;
  notify(orgId: string, n: { title: string; body: string; href?: string }): Promise<void>;
  createTask(orgId: string, input: TaskCreate): Promise<{ id: string }>;
  setTaskState(orgId: string, taskId: string, state: TaskState): Promise<void>;
  /** İmzalama (HMAC) sunucu portunda yapılır; demo simüle eder. */
  webhook(url: string, body: string): Promise<void>;
  /** Otomasyondan BAĞIMSIZ entegrasyon senkronu (ör. JS → Trello yazımı). Her olay için, kurallardan önce çağrılır; hata dispatcher'ı durdurmaz. */
  integrationSync?(ev: AutomationEvent): Promise<void>;
  now(): string;
}
export interface DispatchResult { automation_id: string; name: string; status: 'ok' | 'error'; detail: string }

/* ───────── Kural çözümleme ───────── */
export interface ResolvedRule { event: string; filter: Record<string, string> }
const LEGACY: Array<[RegExp, (m: RegExpMatchArray) => ResolvedRule]> = [
  [/^task\.state\s*=\s*(\w+)$/, (m) => ({ event: 'tasks.update', filter: { 'new.state': m[1] } })],
  [/^task\.created$/, () => ({ event: 'tasks.insert', filter: {} })],
  [/^invoice\.overdue$/, () => ({ event: 'invoices.update', filter: { 'new.status': 'overdue' } })],
  [/^allocation\.updated$/, () => ({ event: 'allocations.update', filter: {} })],
  [/^approval\.created$/, () => ({ event: 'approvals.insert', filter: {} })],
  [/^candidate\.stage\s*=\s*(\w+)$/, (m) => ({ event: 'candidates.update', filter: { 'new.stage': m[1] } })],
  [/^leave\.approved$/, () => ({ event: 'leaves.update', filter: { 'new.status': 'approved' } })],
];
export function resolveRule(a: Pick<Automation, 'event' | 'filter' | 'trigger'>): ResolvedRule | null {
  if (a.event) return { event: a.event, filter: a.filter ?? {} };
  const t = a.trigger.trim();
  for (const [re, fn] of LEGACY) { const m = t.match(re); if (m) return fn(m); }
  return /^[a-z_]+\.[a-z_]+$/.test(t) ? { event: t, filter: a.filter ?? {} } : null;
}
export function actionKindOf(a: Pick<Automation, 'action_kind' | 'action'>): AutomationActionKind {
  if (a.action_kind) return a.action_kind;
  if (/görev taslağı|görev oluştur/i.test(a.action)) return 'create_task';
  if (/slack|webhook/i.test(a.action)) return 'webhook';
  if (/durum/i.test(a.action)) return 'set_status';
  return 'notify';
}

/* ───────── Eşleştirme ───────── */
export function getPath(ev: AutomationEvent, path: string): unknown {
  const walk = (root: unknown, parts: string[]) => parts.reduce<unknown>((o, k) => (o && typeof o === 'object' ? (o as Record<string, unknown>)[k] : undefined), root);
  const parts = path.split('.');
  const direct = walk(ev.payload, parts);
  if (direct !== undefined) return direct;
  // Genel koleksiyon tabloları: alanlar `data jsonb` içinde.
  return parts[0] === 'new' || parts[0] === 'old' ? walk(ev.payload, [parts[0], 'data', ...parts.slice(1)]) : undefined;
}
const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

/** Olay türü eşleşmeli, filtre eşitlikleri sağlanmalı; update olaylarında filtrelenen alan gerçekten değişmiş olmalı (geçiş semantiği). */
export function matches(rule: ResolvedRule, ev: AutomationEvent): boolean {
  if (rule.event !== ev.type) return false;
  const entries = Object.entries(rule.filter);
  if (!entries.every(([path, want]) => String(getPath(ev, path)) === want)) return false;
  if (ev.type.endsWith('.update') && ev.payload.old && entries.some(([p]) => p.startsWith('new.'))) {
    return entries.some(([p]) => p.startsWith('new.') && !same(getPath(ev, p), getPath(ev, p.replace(/^new\./, 'old.'))));
  }
  return true;
}

/** Yalnızca http(s) ve özel/iç ağ olmayan hedefler. */
export function isSafeWebhookUrl(raw: string): boolean {
  let u: URL;
  try { u = new URL(raw); } catch { return false; }
  if (u.protocol !== 'https:' && u.protocol !== 'http:') return false;
  const h = u.hostname.toLowerCase();
  if (h === 'localhost' || h.endsWith('.local') || h.endsWith('.internal') || h === '[::1]' || h === '0.0.0.0') return false;
  if (/^127\./.test(h) || /^10\./.test(h) || /^192\.168\./.test(h) || /^169\.254\./.test(h) || /^172\.(1[6-9]|2\d|3[01])\./.test(h)) return false;
  return true;
}

const render = (tpl: string, ev: AutomationEvent) =>
  tpl.replace(/\{\{\s*([\w.]+)\s*\}\}/g, (_, p: string) => {
    const v = p === 'type' ? ev.type : p === 'id' ? ev.aggregate_id : getPath(ev, p);
    return v === undefined || v === null ? '' : String(v);
  });

/** Tek olayı yayımlanmış kurallara karşı değerlendirir; her eşleşme için aksiyonu çalıştırıp günlük yazar. */
export async function dispatchEvent(ev: AutomationEvent, ports: DispatchPorts): Promise<DispatchResult[]> {
  // Entegrasyon senkronu otomasyon kurallarından bağımsız çalışır (kural yok / otomasyon kaynaklı olay olsa da).
  if (ports.integrationSync) { try { await ports.integrationSync(ev); } catch { /* senkron hatası günlüğe yazılır; dispatch sürer */ } }
  // Döngü koruması: otomasyonun kendi oluşturduğu kayıtlar yeniden tetiklemez.
  if (String(ev.payload.new?.source_ref ?? '').startsWith('automation:')) return [];
  const results: DispatchResult[] = [];
  for (const a of await ports.rules(ev.org_id)) {
    if (a.status !== 'published') continue;
    const rule = resolveRule(a);
    if (!rule || !matches(rule, ev)) continue;
    const now = ports.now();
    let status: 'ok' | 'error' = 'ok';
    let detail = '';
    try { detail = await runAction(a, ev, ports); } catch (e) { status = 'error'; detail = e instanceof Error ? e.message : 'Hata'; }
    await ports.logRun(ev.org_id, { automation_id: a.id, status, error: status === 'error' ? detail : null, payload: status === 'ok' ? detail : `${ev.type} · ${ev.aggregate_id}`, event_type: ev.type, event_id: ev.id ?? null });
    await ports.touchRule(ev.org_id, a, now);
    results.push({ automation_id: a.id, name: a.name, status, detail });
  }
  return results;
}

async function runAction(a: Automation, ev: AutomationEvent, p: DispatchPorts): Promise<string> {
  const cfg = a.action_config ?? {};
  const kind = actionKindOf(a);
  const org = ev.org_id;
  if (kind === 'notify') {
    const body = render(cfg.message ?? a.action, ev);
    await p.notify(org, { title: a.name, body, href: '/app/automations' });
    return `bildirim: ${body}`;
  }
  if (kind === 'create_task') {
    const projectId = cfg.project_id ?? String(getPath(ev, 'new.project_id') ?? '');
    if (!projectId) throw new Error('Proje belirlenemedi (action_config.project_id gerekli)');
    const input = taskCreateSchema.parse({
      project_id: projectId, title: render(cfg.title ?? 'Otomasyon görevi · {{new.title}}', ev).trim() || a.name, due_at: p.now().slice(0, 10),
      task_type: cfg.task_type ?? 'general', state: 'brief', source_ref: `automation:${a.id}`,
    });
    const t = await p.createTask(org, input);
    return `görev oluşturuldu: ${t.id}`;
  }
  if (kind === 'set_status') {
    const state = cfg.state as TaskState | undefined;
    if (!state || !(TASK_STATES as readonly string[]).includes(state)) throw new Error('Geçerli bir hedef aşama gerekli (action_config.state)');
    const taskId = ev.aggregate === 'tasks' ? ev.aggregate_id : String(getPath(ev, 'new.task_id') ?? '');
    if (!taskId) throw new Error('Olayda görev bulunamadı');
    if (ev.aggregate === 'tasks' && ev.payload.new?.state === state) return `görev zaten ${state}`;
    await p.setTaskState(org, taskId, state);
    return `görev ${taskId} → ${state}`;
  }
  const url = cfg.url ?? '';
  if (!isSafeWebhookUrl(url)) throw new Error('Webhook URL geçersiz veya izinli değil');
  await p.webhook(url, JSON.stringify({ automation: { id: a.id, name: a.name }, event: { id: ev.id ?? null, type: ev.type, aggregate: ev.aggregate, aggregate_id: ev.aggregate_id }, payload: ev.payload }));
  return `webhook çağrıldı: ${new URL(url).host}`;
}
