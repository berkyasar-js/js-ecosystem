import type { SupabaseClient } from '@supabase/supabase-js';
import {
  BOARD_ATTACHMENT_EXTS, BOARD_ATTACHMENT_MAX_BYTES, BOARD_HISTORY_WINDOW, BOARD_MESSAGE_MAX_BYTES,
  boardChatModelOutputSchema, boardPlanSchema, type BoardAttachment, type BoardChatModelOutput, type BoardMessage, type BoardPlan, type BoardThread,
} from '@jscore/contracts';
import { DEMO_TODAY } from '@jscore/core/agents/demo';
import type { BoardChatTurn } from '@jscore/core/agents/board-chat';
import { getRepo } from '@jscore/core/repo';
import type { AdminCtx } from './admin-ctx';

/* ───────── Saf yardımcılar (test edilir) ───────── */

/** Türkçe karakter ve aksan duyarsız ad normalizasyonu: "Ural Çalışkan" → "ural caliskan". */
export function normalizeName(s: string): string {
  return s
    .replace(/[İIı]/g, 'i')
    .toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ').trim();
}

export interface EmployeeLite { id: string; code?: string | null; name: string; role_title?: string; weekly_hours?: number; open_tasks?: number }

/**
 * Plan atananını gerçek çalışana eşler: id → kod → tam ad → tek eşleşen kapsama (ad / ilk ad + soyad baş harfi).
 * Belirsiz (birden çok aday) ya da eşleşmeyen → null.
 */
export function matchEmployee(name: string | null | undefined, employees: EmployeeLite[], hints?: { employee_id?: string | null; employee_code?: string | null }): EmployeeLite | null {
  if (hints?.employee_id) { const e = employees.find((x) => x.id === hints.employee_id); if (e) return e; }
  if (hints?.employee_code) { const c = hints.employee_code.trim().toUpperCase(); const e = employees.find((x) => (x.code ?? '').toUpperCase() === c); if (e) return e; }
  const q = normalizeName(name ?? '');
  if (!q) return null;
  const byCode = employees.find((x) => (x.code ?? '').toUpperCase() === (name ?? '').trim().toUpperCase());
  if (byCode) return byCode;
  const exact = employees.filter((x) => normalizeName(x.name) === q);
  if (exact.length === 1) return exact[0];
  const contains = employees.filter((x) => { const n = normalizeName(x.name); return n.includes(q) || q.includes(n); });
  if (contains.length === 1) return contains[0];
  const [qf, ql] = q.split(' ');
  const loose = employees.filter((x) => { const [f, ...rest] = normalizeName(x.name).split(' '); return f === qf && (!ql || rest.some((r) => r.startsWith(ql))); });
  return loose.length === 1 ? loose[0] : null;
}

/** today (YYYY-MM-DD) + gün → ISO zaman damgası (öğlen UTC; saat dilimi kaymasında gün değişmez). */
export function dueAt(today: string, days: number | null | undefined): string | null {
  if (days === null || days === undefined || Number.isNaN(days)) return null;
  const d = new Date(`${today.slice(0, 10)}T12:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() + Math.max(0, Math.round(days)));
  return d.toISOString();
}

/** ```json … ``` çitlerini ve metin içindeki ilk JSON nesnesini ayıklar. */
export function stripFences(s: string): string {
  const t = s.trim();
  const fenced = t.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  if (fenced) return fenced[1].trim();
  const m = t.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (m) return m[1].trim();
  return t;
}
/** Model metni → {reply, plan}. JSON değilse ham metin yanıt olur, plan null. */
export function parseModelOutput(text: string): BoardChatModelOutput {
  const candidates = [stripFences(text)];
  const a = text.indexOf('{'), b = text.lastIndexOf('}');
  if (a >= 0 && b > a) candidates.push(text.slice(a, b + 1));
  for (const c of candidates) {
    try {
      const j: unknown = JSON.parse(c);
      if (!j || typeof j !== 'object') continue;
      const v = boardChatModelOutputSchema.safeParse(j);
      if (v.success) return { reply: v.data.reply || text.trim(), plan: v.data.plan ? normalizePlan(v.data.plan) : null };
      const p = boardPlanSchema.safeParse(j);
      if (p.success && (p.data.tasks.length || p.data.summary)) return { reply: p.data.summary || 'Plan hazır.', plan: normalizePlan(p.data) };
    } catch { /* sıradaki aday */ }
  }
  return { reply: text.trim(), plan: null };
}
export const normalizePlan = (p: BoardPlan): BoardPlan => ({ ...p, milestones: p.milestones ?? [], risks: p.risks ?? [] });

/** Görev açıklaması: plan açıklaması + kabul ölçütleri (markdown). */
export function taskDescription(description: string, acceptance: string[]): string | null {
  const parts: string[] = [];
  if (description.trim()) parts.push(description.trim());
  if (acceptance.length) parts.push(`**Kabul ölçütleri**\n${acceptance.map((a) => `- ${a}`).join('\n')}`);
  return parts.length ? parts.join('\n\n') : null;
}

export const sourceRef = (threadId: string, messageId: string) => `board:${threadId}:${messageId}`;

/** Ek doğrulama: uzantı, dosya başı ve mesaj başı bayt sınırı. Hata metni Türkçe. */
export function validateAttachments(list: Array<{ name: string; text: string }>): { ok: true; attachments: BoardAttachment[] } | { ok: false; error: string } {
  const out: BoardAttachment[] = [];
  let total = 0;
  for (const a of list) {
    const ext = a.name.toLowerCase().match(/\.[a-z]+$/)?.[0] ?? '';
    if (!(BOARD_ATTACHMENT_EXTS as readonly string[]).includes(ext)) return { ok: false, error: `Yalnızca .md / .txt dosyaları eklenebilir: ${a.name}` };
    const bytes = new TextEncoder().encode(a.text).length;
    if (bytes > BOARD_ATTACHMENT_MAX_BYTES) return { ok: false, error: `${a.name} çok büyük (${Math.round(bytes / 1024)} KB; sınır ${BOARD_ATTACHMENT_MAX_BYTES / 1024} KB)` };
    total += bytes;
    if (total > BOARD_MESSAGE_MAX_BYTES) return { ok: false, error: `Mesaj ekleri toplamı sınırı aşıyor (${BOARD_MESSAGE_MAX_BYTES / 1024} KB)` };
    out.push({ name: a.name, bytes, text: a.text });
  }
  return { ok: true, attachments: out };
}

/* ───────── Organizasyon anlık görüntüsü ───────── */

export interface OrgSnapshot {
  today: string;
  employees: EmployeeLite[];
  projects: Array<{ id: string; name: string; status: string; brand_id: string }>;
  brands: Array<{ id: string; name: string; client_id: string; status: string }>;
}

export async function orgSnapshot(ctx: AdminCtx): Promise<OrgSnapshot> {
  if (ctx.sb) {
    const sb = ctx.sb;
    const [emps, projects, brands, tasks] = await Promise.all([
      sb.from('employees').select('id,code,name,role_title,weekly_hours').eq('org_id', ctx.orgId).eq('status', 'active').order('name'),
      sb.from('projects').select('id,name,status,brand_id').eq('org_id', ctx.orgId).order('name'),
      sb.from('brands').select('id,name,client_id,status').eq('org_id', ctx.orgId).order('name'),
      sb.from('tasks').select('assignee_id').eq('org_id', ctx.orgId).neq('state', 'archive'),
    ]);
    if (emps.error) throw new Error(emps.error.message);
    const load = new Map<string, number>();
    for (const t of tasks.data ?? []) if (t.assignee_id) load.set(t.assignee_id as string, (load.get(t.assignee_id as string) ?? 0) + 1);
    return {
      today: new Date().toISOString().slice(0, 10),
      employees: (emps.data ?? []).map((e) => ({ id: e.id as string, code: (e.code as string | null) ?? null, name: e.name as string, role_title: (e.role_title as string) ?? '', weekly_hours: (e.weekly_hours as number) ?? 40, open_tasks: load.get(e.id as string) ?? 0 })),
      projects: (projects.data ?? []) as OrgSnapshot['projects'],
      brands: (brands.data ?? []) as OrgSnapshot['brands'],
    };
  }
  const repo = await getRepo();
  const [team, projects, brands, tasks] = await Promise.all([repo.team(), repo.listProjects(), repo.listBrands(), repo.listTasks()]);
  const load = new Map<string, number>();
  for (const t of tasks) if (t.assignee_id && t.state !== 'archive') load.set(t.assignee_id, (load.get(t.assignee_id) ?? 0) + 1);
  return {
    today: DEMO_TODAY,
    employees: team.filter((e) => e.status === 'active').map((e) => ({ id: e.id, code: e.id.length <= 3 ? e.id : null, name: e.name, role_title: e.role_title, weekly_hours: e.weekly_hours, open_tasks: load.get(e.id) ?? 0 })),
    projects: projects.map((p) => ({ id: p.id, name: p.name, status: p.status, brand_id: p.brand_id })),
    brands: brands.map((b) => ({ id: b.id, name: b.name, client_id: b.client_id, status: b.status })),
  };
}

/* ───────── İstem (prompt) ───────── */

export function systemPrompt(snap: OrgSnapshot, summary: string | null): string {
  const emp = snap.employees.map((e) => `- ${e.name}${e.code ? ` (${e.code})` : ''} · ${e.role_title || 'rol yok'} · ${e.weekly_hours ?? 40} sa/hafta · açık görev: ${e.open_tasks ?? 0}`).join('\n') || '- (çalışan listesi boş)';
  const prj = snap.projects.filter((p) => p.status === 'active' || p.status === 'planning').map((p) => `- ${p.name} [${p.status}]`).join('\n') || '- (aktif proje yok)';
  const brd = snap.brands.map((b) => `- ${b.name} [${b.status}]`).join('\n') || '- (marka yok)';
  return [
    'Sen Jobs Studio Yönetim Kurulu\'nun BAŞKANI\'sın (CHAIR). Kurulda CEO, CFO, COO, CMO, CTO, CHRO, CCO ve CLO bakış açıları var; bunları gerektiğinde kısa başlıklarla yansıtırsın ama tek bir sesle, kurucuya hitaben konuşursun.',
    'Kurucu burada projelerini geliştirir: fikir yazar, .md/.txt dosyaları paylaşır, sorular sorar. Görevin: Türkçe, somut, kısa ve uygulanabilir yanıt vermek; varsayımlarını açıkça söylemek; eksik bilgiyi sormak.',
    '',
    'KURALLAR',
    '- Her zaman Türkçe yaz. Markdown-lite kullan (başlık #, listeler, **kalın**); tablo ve ham HTML kullanma.',
    '- Görev ataması yaparken YALNIZCA aşağıdaki çalışan listesindeki gerçek kişileri kullan; tam adlarını aynen yaz. Kapasiteyi (haftalık saat, açık görev yükü) dikkate al; aşırı yüklü kişiye ek görev verme ya da bunu belirt.',
    '- Kurucu yeterli malzeme paylaştığında (fikir + hedef + kapsam ya da bir dosya) mutlaka yapılandırılmış plan üret: görev dağılımı (assignments) ve yapılacaklar listesi (tasks). Yetersizse plan null bırak ve questions ile sor.',
    '- Görevler: net başlık, kısa açıklama, atanan (çalışan adı), öncelik, tahmini süre (dakika), teslim (bugünden itibaren gün), bağımlılıklar (başka görev başlıkları), kabul ölçütleri, faz. 4–20 görev idealdir.',
    '- Kilometre taşları (milestones) ve riskler (risks) ekle. Bütçe/para konuşulursa CFO perspektifini ekle.',
    '',
    'ÇIKTI BİÇİMİ — yalnızca tek bir JSON nesnesi, çit (```) olmadan:',
    '{"reply": "<markdown yanıt>", "plan": null | {"summary": string, "assumptions": string[], "questions": string[], "assignments": [{"employee_name": string, "employee_code"?: string, "role_title": string, "responsibility": string, "workload_pct"?: number}], "tasks": [{"title": string, "description": string, "assignee_name"?: string, "priority": "low"|"normal"|"high", "estimate_minutes": number, "due_in_days"?: number, "depends_on"?: string[], "acceptance": string[], "phase"?: string}], "milestones"?: [{"name": string, "due_in_days": number, "tasks": string[]}], "risks"?: [{"risk": string, "mitigation": string, "owner"?: string}]}}',
    '',
    `BUGÜN: ${snap.today}`,
    '',
    'ÇALIŞANLAR (gerçek liste):',
    emp,
    '',
    'AKTİF PROJELER:',
    prj,
    '',
    'MARKALAR:',
    brd,
    summary ? `\nÖNCEKİ KONUŞMA ÖZETİ (eski mesajlar):\n${summary}` : '',
  ].join('\n');
}

/** Mesaj gövdesi + ekler (çitli bloklar) → modele giden metin. */
export function renderUserContent(m: Pick<BoardMessage, 'content' | 'attachments'>): string {
  const parts = [m.content.trim()];
  for (const a of m.attachments ?? []) parts.push(`--- Dosya: ${a.name} (${Math.round(a.bytes / 1024)} KB) ---\n\`\`\`\n${a.text}\n\`\`\``);
  return parts.filter(Boolean).join('\n\n');
}
/** Geçmişi model sırasına çevirir: son N mesaj; asistan mesajları özet olarak (plan JSON'u kısaltılmış). */
export function historyTurns(messages: BoardMessage[], window = BOARD_HISTORY_WINDOW): BoardChatTurn[] {
  return messages.slice(-window).filter((m) => m.role !== 'system').map((m) => m.role === 'user'
    ? { role: 'user' as const, content: renderUserContent(m) }
    : { role: 'assistant' as const, content: m.plan ? `${m.content}\n\n[Önceki plan özeti: ${m.plan.summary || '-'}; görevler: ${m.plan.tasks.map((t) => t.title).join(', ')}]` : m.content });
}
/** Pencere dışına taşan eski mesajlar için özet istemi (yalnızca history > pencere olduğunda). */
export function summaryTurns(messages: BoardMessage[], previous: string | null, window = BOARD_HISTORY_WINDOW): BoardChatTurn[] | null {
  const older = messages.slice(0, Math.max(0, messages.length - window));
  if (!older.length) return null;
  const body = older.map((m) => `[${m.role}] ${m.role === 'user' ? renderUserContent(m).slice(0, 4000) : m.content.slice(0, 2000)}`).join('\n\n');
  return [{ role: 'user', content: `${previous ? `Önceki özet:\n${previous}\n\n` : ''}Aşağıdaki konuşmayı kurucunun projesi, alınan kararlar, varsayımlar ve açık sorular odaklı 10–20 satırlık Türkçe bir özete indir. Yalnızca düz metin döndür.\n\n${body}` }];
}
export const shouldSummarize = (total: number, hasSummary: boolean, window = BOARD_HISTORY_WINDOW) => total > window && (!hasSummary || (total - window) % 10 === 0);

/* ───────── Demo yanıtı (model çağrısı yok) ───────── */

export function demoReply(content: string, attachments: BoardAttachment[], snap: OrgSnapshot): BoardChatModelOutput {
  const text = `${content}\n${attachments.map((a) => a.text).join('\n')}`;
  const rich = text.trim().length > 120 || attachments.length > 0;
  const firstLine = (content.trim().split('\n')[0] || attachments[0]?.name || 'proje').slice(0, 60);
  const pick = (i: number) => snap.employees[i % Math.max(1, snap.employees.length)];
  if (!rich || !snap.employees.length) {
    return {
      reply: `# Kurul notu (demo)\n\nTeşekkürler, **${firstLine}** konusunu aldık. Plan çıkarabilmemiz için şunları netleştirelim:\n\n- Hedef ve başarı ölçütü nedir?\n- Kapsam ve teslim tarihi?\n- Bütçe / kaynak sınırı var mı?\n\nBir .md/.txt brief eklersen kurul doğrudan görev dağılımı ve yapılacaklar listesi üretir. *(Demo modu: gerçek model çağrısı yapılmadı.)*`,
      plan: null,
    };
  }
  const [a, b, c] = [pick(1), pick(2), pick(4)];
  const plan: BoardPlan = {
    summary: `"${firstLine}" için 3 fazlı başlangıç planı: keşif, üretim, lansman. (Demo — deterministik örnek)`,
    assumptions: ['Kapsam paylaşılan brief ile sınırlı.', 'Ekip mevcut yükünün üstüne haftada ~6 saat ayırabilir.'],
    questions: ['Lansman için hedef tarih nedir?', 'Dış bütçe (medya/freelancer) ayrılacak mı?'],
    assignments: [
      { employee_name: a.name, employee_code: a.code ?? undefined, role_title: a.role_title ?? '', responsibility: 'Proje sahibi: kapsam, önceliklendirme, haftalık kurul raporu', workload_pct: 30 },
      { employee_name: b.name, employee_code: b.code ?? undefined, role_title: b.role_title ?? '', responsibility: 'Üretim ve kalite', workload_pct: 40 },
      { employee_name: c.name, employee_code: c.code ?? undefined, role_title: c.role_title ?? '', responsibility: 'Müşteri/iletişim ve lansman', workload_pct: 20 },
    ],
    tasks: [
      { title: 'Brief\'i netleştir ve kapsam dokümanı yaz', description: 'Paylaşılan materyali tek sayfalık kapsam dokümanına indir.', assignee_name: a.name, priority: 'high', estimate_minutes: 180, due_in_days: 2, depends_on: [], acceptance: ['Hedef, kapsam ve başarı ölçütü yazılı', 'Kurucu onayı alındı'], phase: 'Keşif' },
      { title: 'Rakip ve referans taraması', description: '5 referans, 3 rakip; güçlü/zayıf notlar.', assignee_name: c.name, priority: 'normal', estimate_minutes: 240, due_in_days: 4, depends_on: ['Brief\'i netleştir ve kapsam dokümanı yaz'], acceptance: ['Tek sayfa özet'], phase: 'Keşif' },
      { title: 'Konsept ve ilk taslaklar', description: '2 konsept yönü, her biri için 1 ana görsel taslağı.', assignee_name: b.name, priority: 'high', estimate_minutes: 600, due_in_days: 7, depends_on: ['Brief\'i netleştir ve kapsam dokümanı yaz'], acceptance: ['2 konsept sunuldu', 'Kurucu bir yön seçti'], phase: 'Üretim' },
      { title: 'Seçilen yönde üretim', description: 'Seçilen konseptin tüm çıktıları.', assignee_name: b.name, priority: 'normal', estimate_minutes: 900, due_in_days: 14, depends_on: ['Konsept ve ilk taslaklar'], acceptance: ['Tüm çıktılar iç revizeden geçti'], phase: 'Üretim' },
      { title: 'Lansman planı ve iletişim takvimi', description: 'Kanal, tarih, sorumlu.', assignee_name: c.name, priority: 'normal', estimate_minutes: 180, due_in_days: 12, depends_on: ['Rakip ve referans taraması'], acceptance: ['Takvim onaylandı'], phase: 'Lansman' },
      { title: 'Kurul geri bildirim toplantısı', description: 'Fazı kapat, öğrenimleri not et.', assignee_name: a.name, priority: 'low', estimate_minutes: 60, due_in_days: 16, depends_on: ['Seçilen yönde üretim', 'Lansman planı ve iletişim takvimi'], acceptance: ['Karar notu yazıldı'], phase: 'Lansman' },
    ],
    milestones: [{ name: 'Kapsam onayı', due_in_days: 2, tasks: ['Brief\'i netleştir ve kapsam dokümanı yaz'] }, { name: 'Konsept seçimi', due_in_days: 7, tasks: ['Konsept ve ilk taslaklar'] }, { name: 'Lansman', due_in_days: 16, tasks: ['Seçilen yönde üretim', 'Lansman planı ve iletişim takvimi'] }],
    risks: [{ risk: 'Kapsam genişlemesi', mitigation: 'Kapsam dokümanı dışındaki istekler yeni faz olarak ele alınır.', owner: a.name }, { risk: 'Ekip yükü', mitigation: `${b.name} üzerindeki açık görevler önceliklendirilir.`, owner: a.name }],
  };
  return {
    reply: `# Kurul görüşü (demo)\n\n**CEO:** "${firstLine}" net bir hedefe bağlanırsa iki hafta içinde ilk çıktı mümkün.\n**COO:** Üç faz öneriyoruz: keşif → üretim → lansman; aşağıdaki görev dağılımı ekibin mevcut yüküne göre kuruldu.\n**CFO:** Dış harcama öngörülmüyor; freelancer gerekirse ayrı onay.\n\nPlanı inceleyip seçtiğin görevleri tek tıkla sisteme aktarabilirsin. *(Demo modu: gerçek model çağrısı yapılmadı.)*`,
    plan,
  };
}

/* ───────── Depo: Supabase (servis rolü) ya da demo (süreç içi bellek) ───────── */

export interface ChatStore {
  listThreads(): Promise<BoardThread[]>;
  createThread(title: string, createdBy: string): Promise<BoardThread>;
  getThread(id: string): Promise<BoardThread | null>;
  patchThread(id: string, patch: { title?: string; status?: 'open' | 'archived'; summary?: string | null }): Promise<BoardThread | null>;
  deleteThread(id: string): Promise<boolean>;
  listMessages(threadId: string): Promise<BoardMessage[]>;
  getMessage(threadId: string, id: string): Promise<BoardMessage | null>;
  addMessage(m: Omit<BoardMessage, 'id' | 'org_id' | 'created_at' | 'demo'>): Promise<BoardMessage>;
}

const MSG_COLS = 'id,org_id,thread_id,role,content,attachments,plan,tokens_in,tokens_out,cost_usd,created_at';
class SupabaseChatStore implements ChatStore {
  constructor(private sb: SupabaseClient, private orgId: string) {}
  private async ok<T>(p: PromiseLike<{ data: T | null; error: { message: string } | null }>): Promise<T> { const { data, error } = await p; if (error) throw new Error(error.message); return data as T; }
  private msg = (r: Record<string, unknown>): BoardMessage => ({ ...(r as unknown as BoardMessage), cost_usd: Number(r.cost_usd ?? 0), attachments: (r.attachments as BoardAttachment[]) ?? [], plan: (r.plan as BoardPlan | null) ?? null });
  listThreads() { return this.ok<BoardThread[]>(this.sb.from('board_threads').select('*').eq('org_id', this.orgId).order('updated_at', { ascending: false })); }
  createThread(title: string, createdBy: string) { return this.ok<BoardThread>(this.sb.from('board_threads').insert({ org_id: this.orgId, title, created_by: createdBy }).select('*').single()); }
  getThread(id: string) { return this.ok<BoardThread | null>(this.sb.from('board_threads').select('*').eq('org_id', this.orgId).eq('id', id).maybeSingle()); }
  async patchThread(id: string, patch: { title?: string; status?: 'open' | 'archived'; summary?: string | null }) {
    const clean = Object.fromEntries(Object.entries(patch).filter(([, v]) => v !== undefined));
    return this.ok<BoardThread | null>(this.sb.from('board_threads').update({ ...clean, updated_at: new Date().toISOString() }).eq('org_id', this.orgId).eq('id', id).select('*').maybeSingle());
  }
  async deleteThread(id: string) { const rows = await this.ok<Array<{ id: string }>>(this.sb.from('board_threads').delete().eq('org_id', this.orgId).eq('id', id).select('id')); return rows.length > 0; }
  async listMessages(threadId: string) { return (await this.ok<Record<string, unknown>[]>(this.sb.from('board_messages').select(MSG_COLS).eq('org_id', this.orgId).eq('thread_id', threadId).order('created_at'))).map(this.msg); }
  async getMessage(threadId: string, id: string) { const r = await this.ok<Record<string, unknown> | null>(this.sb.from('board_messages').select(MSG_COLS).eq('org_id', this.orgId).eq('thread_id', threadId).eq('id', id).maybeSingle()); return r ? this.msg(r) : null; }
  async addMessage(m: Omit<BoardMessage, 'id' | 'org_id' | 'created_at' | 'demo'>) { return this.msg(await this.ok<Record<string, unknown>>(this.sb.from('board_messages').insert({ ...m, org_id: this.orgId }).select(MSG_COLS).single())); }
}

interface DemoDb { threads: BoardThread[]; messages: BoardMessage[]; seq: number }
const g = globalThis as unknown as { __jsBoardChatDemo?: Map<string, DemoDb> };
const demoDb = (orgId: string): DemoDb => { g.__jsBoardChatDemo ??= new Map(); let d = g.__jsBoardChatDemo.get(orgId); if (!d) { d = { threads: [], messages: [], seq: 0 }; g.__jsBoardChatDemo.set(orgId, d); } return d; };
/** Demo: süreç içi bellek (sunucu yeniden başlayınca silinir). Yalnızca arayüzü denemek için. */
class DemoChatStore implements ChatStore {
  private db: DemoDb;
  constructor(private orgId: string) { this.db = demoDb(orgId); }
  private id(p: string) { return `${p}_${++this.db.seq}_${Date.now().toString(36)}`; }
  async listThreads() { return [...this.db.threads].sort((a, b) => b.updated_at.localeCompare(a.updated_at)); }
  async createThread(title: string, createdBy: string) { const now = new Date().toISOString(); const t: BoardThread = { id: this.id('bt'), org_id: this.orgId, title, created_by: createdBy, status: 'open', summary: null, created_at: now, updated_at: now }; this.db.threads.push(t); return t; }
  async getThread(id: string) { return this.db.threads.find((t) => t.id === id) ?? null; }
  async patchThread(id: string, patch: { title?: string; status?: 'open' | 'archived'; summary?: string | null }) { const t = await this.getThread(id); if (!t) return null; if (patch.title !== undefined) t.title = patch.title; if (patch.status !== undefined) t.status = patch.status; if (patch.summary !== undefined) t.summary = patch.summary; t.updated_at = new Date().toISOString(); return t; }
  async deleteThread(id: string) { const n = this.db.threads.length; this.db.threads = this.db.threads.filter((t) => t.id !== id); this.db.messages = this.db.messages.filter((m) => m.thread_id !== id); return this.db.threads.length < n; }
  async listMessages(threadId: string) { return this.db.messages.filter((m) => m.thread_id === threadId); }
  async getMessage(threadId: string, id: string) { return this.db.messages.find((m) => m.thread_id === threadId && m.id === id) ?? null; }
  async addMessage(m: Omit<BoardMessage, 'id' | 'org_id' | 'created_at' | 'demo'>) { const row: BoardMessage = { ...m, id: this.id('bm'), org_id: this.orgId, created_at: new Date().toISOString() }; this.db.messages.push(row); const t = await this.getThread(m.thread_id); if (t) t.updated_at = row.created_at; return row; }
}

export const chatStore = (ctx: AdminCtx): ChatStore => (ctx.sb ? new SupabaseChatStore(ctx.sb, ctx.orgId) : new DemoChatStore(ctx.orgId));
