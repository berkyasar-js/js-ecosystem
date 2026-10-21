import type { Priority, TaskState, TrelloConfig, TrelloImportResult } from '@jscore/contracts';

/**
 * Trello → JS Work eşleme çekirdeği: SAF fonksiyonlar (G/Ç yok) + port tabanlı idempotent `runImport`.
 * Sunucu (Supabase servis rolü) ve DemoRepo aynı çekirdeği kullanır; yalnızca `TrelloStore` portu farklıdır.
 */

/* ───────── Trello API şekilleri (kullanılan alanlar) ───────── */
export interface TrelloBoard { id: string; name: string }
export interface TrelloList { id: string; name: string; closed?: boolean; idBoard: string }
export interface TrelloLabel { id?: string; name?: string; color?: string | null }
export interface TrelloCard {
  id: string; name: string; idList: string; idBoard?: string; due?: string | null; dueComplete?: boolean; labels?: TrelloLabel[];
  idMembers?: string[]; dateLastActivity?: string; desc?: string; shortLink?: string; closed?: boolean;
  badges?: { checkItems?: number; checkItemsChecked?: number; comments?: number; attachments?: number }; idChecklists?: string[];
  /** Kapak: renk ya da görsel ek (idAttachment). */
  cover?: { color?: string | null; idAttachment?: string | null; size?: string | null } | null;
}
export interface TrelloMember { id: string; fullName: string; username?: string }
export interface TrelloSnapshot {
  boards: TrelloBoard[]; lists: TrelloList[]; cards: TrelloCard[]; members: TrelloMember[];
  /** Kart ayrıntıları (cardId → checklist/yorum/ek): yalnızca demo örneği ve testlerde dolu; sunucu bunları kart başına ayrıca çeker. */
  details?: Record<string, import('./trello-details').CardDetails>;
}

/* ───────── Metin yardımcıları ───────── */
const TR_FOLD: Record<string, string> = { ı: 'i', İ: 'i', ş: 's', Ş: 's', ğ: 'g', Ğ: 'g', ü: 'u', Ü: 'u', ö: 'o', Ö: 'o', ç: 'c', Ç: 'c', â: 'a', Â: 'a', î: 'i', û: 'u' };
/** Türkçe karakterleri sadeleştirir, küçük harfe çevirir; uzunluk korunur (indeksler asıl metinle hizalı). */
export const fold = (s: string): string => Array.from(s).map((c) => TR_FOLD[c] ?? c).join('').toLowerCase();
const words = (s: string) => s.split(/\s+/).filter(Boolean);

const MONTHS: Array<[string, string]> = [
  ['ocak', 'Ocak'], ['subat', 'Şubat'], ['mart', 'Mart'], ['nisan', 'Nisan'], ['mayis', 'Mayıs'], ['haziran', 'Haziran'],
  ['temmuz', 'Temmuz'], ['agustos', 'Ağustos'], ['eylul', 'Eylül'], ['ekim', 'Ekim'], ['kasim', 'Kasım'], ['aralik', 'Aralık'],
];
const MONTH_RE = new RegExp(`(?<![a-z])(${MONTHS.map((m) => m[0]).join('|')})(?:\\s*['’‘\`´]?\\s*(\\d{4}|\\d{2}))?(?![a-z0-9])`);

/** "Kasım'26" / "Mart'25" / "Kasım 2026" → 'sm:2026-11'. Yıl yoksa verilen varsayılan 2 haneli yıl kullanılır. */
export function smMonthLabel(month: { index: number; yy: string }): string {
  return `sm:20${month.yy.padStart(2, '0')}-${String(month.index).padStart(2, '0')}`;
}

/* ───────── Kart adı ───────── */
export interface ParsedCardName {
  jobNo: string | null; title: string;
  /** Ayraçtan (ay / " SM" / "-") önceki metin; ayraç yoksa null. */
  brandText: string | null;
  month: { index: number; label: string; yy: string } | null; sm: boolean;
}
/** "184_Anova Kasım'26 SM" → {jobNo:'184', title:"Anova Kasım'26 SM", brandText:'Anova', month:{Kasım,26}, sm:true}. */
export function parseCardName(raw: string, currentYY = String(new Date().getFullYear()).slice(2)): ParsedCardName {
  const name = raw.normalize('NFC').trim();
  const jm = name.match(/^(\d{1,5})\s*_\s*(.+)$/);
  const jobNo = jm ? jm[1] : null;
  const title = (jm ? jm[2] : name).trim();
  const f = fold(title);
  const mm = f.match(MONTH_RE);
  const sm = /(?<![a-z0-9])sm(?![a-z0-9])/.test(f);
  const month = mm ? { index: MONTHS.findIndex((m) => m[0] === mm[1]) + 1, label: MONTHS.find((m) => m[0] === mm[1])![1], yy: mm[2] ? mm[2].slice(-2) : currentYY } : null;
  const cuts: number[] = [];
  if (mm?.index !== undefined) cuts.push(mm.index);
  const smi = f.search(/(?<![a-z0-9])sm(?![a-z0-9])/);
  if (smi > 0) cuts.push(smi);
  const di = f.search(/[-–—]/);
  if (di > 0) cuts.push(di);
  let brandText: string | null = null;
  if (cuts.length) {
    brandText = title.slice(0, Math.min(...cuts)).replace(/[\s'’‘`´.,:;_]+$/g, '').replace(/\d+$/, '').trim() || null;
  }
  return { jobNo, title, brandText, month, sm };
}

/** Marka çözümü: kelime öneklerini uzundan kısaya dener (tam ad, ya da tek kelime = markanın ilk kelimesi, benzersizse). */
export function matchBrand(parsed: ParsedCardName, brands: ReadonlyArray<{ id: string; name: string }>): { id: string | null; name: string } {
  const src = parsed.brandText ?? parsed.title;
  const ws = words(src);
  const folded = brands.map((b) => ({ b, f: fold(b.name).trim() }));
  for (let n = ws.length; n >= 1; n--) {
    const p = fold(ws.slice(0, n).join(' ')).replace(/\d+$/, '').trim();
    if (!p) continue;
    const exact = folded.find((x) => x.f === p);
    if (exact) return { id: exact.b.id, name: exact.b.name };
    if (n === 1 && p.length >= 3) {
      const first = folded.filter((x) => x.f.split(' ')[0] === p);
      if (first.length === 1) return { id: first[0].b.id, name: first[0].b.name };
    }
  }
  const fallback = (parsed.brandText ?? ws[0] ?? 'Bilinmeyen').replace(/\d+$/, '').trim() || (ws[0] ?? 'Bilinmeyen');
  return { id: null, name: fallback };
}

/* ───────── Liste türü ───────── */
export type ListKind = 'template' | 'approval' | 'delivery' | 'production' | 'paused' | 'plan' | 'person' | 'ideas' | 'other';
export interface ListInfo { kind: ListKind; /** yalnızca kind='person': değiştiricisiz kişi adı */ person?: string; review?: boolean }
const PERSON_MODS = ['kontrol', 'masaustu', 'cekim'];
/** Kişi olmayan liste adı sözcükleri (katlanmış, tam sözcük): bunlar "eşlenemeyen üye" olarak raporlanmaz. */
export const NON_PERSON_TOKENS: ReadonlySet<string> = new Set(['isler', 'onay', 'teslim', 'sablon', 'sablonlar', 'salonu', 'sm']);
export const isNonPersonList = (name: string): boolean => fold(name.normalize('NFC')).split(/[^a-z0-9]+/).filter(Boolean).some((t) => NON_PERSON_TOKENS.has(t));
export function classifyList(name: string): ListInfo {
  const f = fold(name.normalize('NFC')).trim();
  if (f.includes('sablon')) return { kind: 'template' };
  if (f.includes('odullu')) return { kind: 'ideas' };
  if (f.includes('bekleme')) return { kind: 'paused' };
  if (/(^|\s)onay(\s|$)/.test(f)) return { kind: 'approval' };
  if (f.includes('teslim')) return { kind: 'delivery' };
  if (f.includes('produksiyon') || f.includes('kurulum') || /(^|\s)baski(\s|$)/.test(f)) return { kind: 'production' };
  if (MONTH_RE.test(f) || /(^|[^a-z0-9])sm($|[^a-z0-9])/.test(f)) return { kind: 'plan' };
  if (isNonPersonList(name)) return { kind: 'other' };
  const toks = words(name.normalize('NFC').replace(/[^\p{L}\p{N}\s.]/gu, ' '));
  const keep = toks.filter((t) => !PERSON_MODS.includes(fold(t)));
  return { kind: 'person', person: keep.join(' ').trim() || name.trim(), review: toks.some((t) => fold(t) === 'kontrol') };
}

/* ───────── Kişi eşleme ───────── */
/** member_map anahtarı: katlanmış, noktalama/boşluk sadeleştirilmiş ad. */
export const memberKey = (name: string) => fold(name.normalize('NFC')).replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim();
const ALIASES: Record<string, string> = { sedos: 'seda', sedo: 'seda' };

export function resolveEmployee(
  rawName: string, employees: ReadonlyArray<{ id: string; name: string }>, memberMap: Readonly<Record<string, string>> = {},
): string | null {
  const key = memberKey(rawName);
  if (!key) return null;
  if (memberMap[key] && employees.some((e) => e.id === memberMap[key])) return memberMap[key];
  const toks = key.split(' ').map((t) => ALIASES[t] ?? t);
  const full = toks.join(' ');
  const exact = employees.filter((e) => memberKey(e.name) === full);
  if (exact.length === 1) return exact[0].id;
  const [first, ...rest] = toks;
  let cands = employees.filter((e) => memberKey(e.name).split(' ').includes(first));
  if (rest.length) {
    const narrowed = cands.filter((e) => { const nt = memberKey(e.name).split(' '); return rest.some((r) => nt.some((t) => t !== first && t.startsWith(r))); });
    if (narrowed.length) cands = narrowed;
  }
  return cands.length === 1 ? cands[0].id : null;
}

/* ───────── Tersinir liste / üye eşlemesi (JS → Trello yazımı için) ───────── */
export type ListMapEntry = NonNullable<TrelloConfig['list_map']>[string];
const STAGE_OF_KIND: Record<Exclude<ListKind, 'template'>, TaskState> = { approval: 'approval', delivery: 'delivery', production: 'production', paused: 'brief', plan: 'plan', person: 'production', ideas: 'brief', other: 'production' };
/** listId → {board, kind, stage, person?, employee?, review?}; şablon ve arşivli listeler dışarıda. */
export function buildListMap(lists: ReadonlyArray<TrelloList>, employees: ReadonlyArray<{ id: string; name: string }>, memberMap: Readonly<Record<string, string>> = {}): Record<string, ListMapEntry> {
  const out: Record<string, ListMapEntry> = {};
  for (const l of lists) {
    if (l.closed) continue;
    const info = classifyList(l.name);
    if (info.kind === 'template') continue;
    const e: ListMapEntry = { board: l.idBoard, kind: info.kind, stage: info.kind === 'person' && info.review ? 'internal_review' : STAGE_OF_KIND[info.kind] };
    if (info.kind === 'person') {
      e.person = info.person; if (info.review) e.review = true;
      const emp = info.person ? resolveEmployee(info.person, employees, memberMap) : null;
      if (emp) e.employee = emp;
    }
    out[l.id] = e;
  }
  return out;
}
/** employee id → Trello üye id (tam ad / eşleme ile çözülebilen panolu üyeler). */
export function buildMemberIds(members: ReadonlyArray<TrelloMember>, employees: ReadonlyArray<{ id: string; name: string }>, memberMap: Readonly<Record<string, string>> = {}): Record<string, string> {
  const out: Record<string, string> = {};
  for (const m of members) { const e = resolveEmployee(m.fullName, employees, memberMap); if (e && !out[e]) out[e] = m.id; }
  return out;
}

/* ───────── Çakışma kuralı: son yazan kazanır ───────── */
/** JS tarafı yazma mı? Yalnızca son Trello senkronundan SONRA yapılmış yazma (updated_at > synced_at). synced_at yok → hayır (ilk/birleştirme yazmaları engellemez). */
export function jsEditedSinceSync(updatedAt: string | undefined | null, syncedAt: string | undefined | null): boolean {
  const u = updatedAt ? Date.parse(updatedAt) : NaN, s = syncedAt ? Date.parse(syncedAt) : NaN;
  if (Number.isNaN(u) || Number.isNaN(s)) return false;
  return u > s;
}
/** Geri itme adayı mı? Son yazma Trello'dan geldiyse (sync_origin='trello' ya da updated_at <= synced_at) itilmez. */
export function isTrelloOriginWrite(t: { sync_origin?: string | null; updated_at?: string | null; synced_at?: string | null }): boolean {
  if (t.sync_origin === 'trello') return true;
  const u = t.updated_at ? Date.parse(t.updated_at) : NaN, s = t.synced_at ? Date.parse(t.synced_at) : NaN;
  return !Number.isNaN(u) && !Number.isNaN(s) && u <= s;
}
/**
 * 'push' = JS daha yeni (Trello'dan gelen değişiklik atlanır), 'pull' = Trello daha yeni / eşit / bilinmiyor.
 * JS ancak gerçek bir JS yazması varsa (updated_at > synced_at) VE kartın dateLastActivity'sinden yeniyse kazanır.
 */
export function resolveConflict(taskUpdatedAt: string | undefined | null, cardActivity: string | undefined | null, syncedAt: string | undefined | null): 'pull' | 'push' {
  if (!jsEditedSinceSync(taskUpdatedAt, syncedAt)) return 'pull';
  const t = Date.parse(taskUpdatedAt as string), c = cardActivity ? Date.parse(cardActivity) : NaN;
  if (Number.isNaN(c)) return 'pull';
  return t > c ? 'push' : 'pull';
}
/** Kartın Trello'daki son etkinliği JS görevinden yeniyse JS → Trello yazımı atlanır (Trello kazanır). */
export const trelloIsNewer = (taskUpdatedAt: string | undefined | null, cardActivity: string | undefined | null) => {
  const t = taskUpdatedAt ? Date.parse(taskUpdatedAt) : NaN, c = cardActivity ? Date.parse(cardActivity) : NaN;
  return !Number.isNaN(t) && !Number.isNaN(c) && t <= c;
};

export interface ReconcilePlan { pullCards: TrelloCard[]; missing: StoreTask[]; pushTasks: StoreTask[]; unlinked: StoreTask[] }
/**
 * Saatlik uzlaştırma seçimi (saf): since'ten beri değişen kartlar çekilir (ya da henüz görevi olmayanlar), Trello'da açık kart listesinde
 * olmayan (arşivlenmemiş) Trello görevleri "kayıp" sayılır, since'ten beri JS'te değişen (ve Trello kaynaklı olmayan) görevler itilir,
 * kartı olmayan Trello-projesi görevleri `unlinked` olarak kart oluşturmaya adaydır.
 */
export function reconcilePlan(
  cards: ReadonlyArray<TrelloCard>, tasks: ReadonlyArray<StoreTask & { sync_origin?: string | null }>, since: string | null | undefined,
  opts: { trelloProjectIds?: ReadonlySet<string> } = {},
): ReconcilePlan {
  const sinceMs = since ? Date.parse(since) : 0;
  const byRef = new Map(tasks.map((t) => [t.source_ref, t]));
  const open = new Set(cards.map((c) => `trello:${c.id}`));
  const changed = (iso?: string | null) => !sinceMs || !iso || Date.parse(iso) > sinceMs;
  const pullCards = cards.filter((c) => !byRef.has(`trello:${c.id}`) || changed(c.dateLastActivity));
  const linked = tasks.filter((t) => t.source_ref.startsWith('trello:') && !t.source_ref.startsWith('trello:board:') && !t.source_ref.includes('pending'));
  const missing = linked.filter((t) => !open.has(t.source_ref) && t.state !== 'archive' && !t.labels.includes('trello:vanished'));
  const pushTasks = linked.filter((t) => !isTrelloOriginWrite(t) && !!sinceMs && !!t.updated_at && Date.parse(t.updated_at) > sinceMs);
  const unlinked = tasks.filter((t) => !t.source_ref && !!opts.trelloProjectIds?.has(t.project_id) && !isTrelloOriginWrite(t));
  return { pullCards, missing, pushTasks, unlinked };
}

/* ───────── mapCard ───────── */
export interface MapCtx {
  now: string;
  board: TrelloBoard; list: TrelloList | undefined;
  brands: ReadonlyArray<{ id: string; name: string }>;
  employees: ReadonlyArray<{ id: string; name: string }>;
  /** Trello üye id → fullName */
  members: Readonly<Record<string, string>>;
  memberMap?: Readonly<Record<string, string>>;
}
export interface TaskDraft {
  source_ref: string; project_id: string; title: string; assignee_id: string | null; state: TaskState; priority: Priority;
  due_at: string | null; planned_minutes: number; task_type: string; labels: string[];
}
export interface MappedCard {
  skipped: boolean; ref: string; brandId: string | null; brandName: string; projectName: string; projectType: 'imported';
  draft: Omit<TaskDraft, 'project_id'>; unmapped: string[]; jobNo: string | null;
}
const uniq = <T,>(a: T[]) => Array.from(new Set(a));

export const canonicalProjectName = (brand: string) => `${brand} · Trello`;

export function mapCard(card: TrelloCard, ctx: MapCtx): MappedCard {
  const info = ctx.list ? classifyList(ctx.list.name) : ({ kind: 'person' } as ListInfo);
  const parsed = parseCardName(card.name, ctx.now.slice(2, 4));
  const brand = matchBrand(parsed, ctx.brands);
  const archivedList = !!ctx.list?.closed;
  const archived = archivedList || !!card.closed;
  const smMonthly = parsed.sm && !!parsed.month;
  const projectName = canonicalProjectName(brand.name);

  // atanan: kişi listesi → kart üyeleri (sırayla)
  const unmapped: string[] = [];
  let assignee: string | null = null;
  if (info.kind === 'person' && info.person) {
    assignee = resolveEmployee(info.person, ctx.employees, ctx.memberMap);
    if (!assignee && !archivedList) unmapped.push(info.person); // arşivli listenin adı kişi olmayabilir (ör. "Eski Kuyruk")
  }
  if (!assignee) {
    for (const mid of card.idMembers ?? []) {
      const nm = ctx.members[mid];
      if (!nm) continue;
      const id = resolveEmployee(nm, ctx.employees, ctx.memberMap);
      if (id) { assignee = id; break; }
      unmapped.push(nm);
    }
  }

  const state: TaskState = archived ? 'archive'
    : info.kind === 'approval' ? 'approval' : info.kind === 'delivery' ? 'delivery' : info.kind === 'production' ? 'production'
    : info.kind === 'paused' || info.kind === 'ideas' ? 'brief' : info.kind === 'plan' ? 'plan' : info.review ? 'internal_review' : 'production';

  const due = card.due ?? null;
  const overdue = !!due && !card.dueComplete && Date.parse(due) < Date.parse(ctx.now) && !archived;
  const total = card.badges?.checkItems ?? 0;
  const labels = uniq([
    'trello', `board:${ctx.board.name}`,
    ...(card.labels ?? []).map((l) => (l.name?.trim() || l.color || '')).filter(Boolean),
    ...(parsed.jobNo ? [`job:${parsed.jobNo}`] : []),
    ...(info.kind === 'paused' ? ['waiting'] : []),
    ...(info.kind === 'ideas' ? ['ödül-fikri'] : []),
    ...(smMonthly ? [smMonthLabel(parsed.month!)] : []),
    ...(archivedList ? ['trello:archived-list'] : []),
    ...(card.closed ? ['trello:closed'] : []),
    ...(total > 0 ? [`checklist ${card.badges?.checkItemsChecked ?? 0}/${total}`] : []),
  ]);
  const title = (parsed.title.length >= 2 ? parsed.title : card.name).slice(0, 200);
  return {
    skipped: info.kind === 'template', ref: `trello:${card.id}`, brandId: brand.id, brandName: brand.name, projectName,
    projectType: 'imported', jobNo: parsed.jobNo, unmapped,
    draft: {
      source_ref: `trello:${card.id}`, title, assignee_id: assignee, state, priority: overdue ? 'high' : 'normal', due_at: due,
      planned_minutes: total * 30, task_type: parsed.sm ? 'social_visual' : 'general', labels,
    },
  };
}

/* ───────── İdempotent içe aktarma (port tabanlı) ───────── */
export interface StoreTask extends TaskDraft { id: string; updated_at?: string; synced_at?: string | null }
export interface SyncLogDraft { direction: 'push' | 'pull' | 'reconcile'; entity: string; entity_id: string | null; external_id: string | null; action: string; ok: boolean; message: string }
export interface StoreProject { id: string; name: string; brand_id?: string | null; source_ref?: string | null; status?: string }
export const MERGED_SUFFIX = ' (birleştirildi)';
export interface TrelloStore {
  load(): Promise<{ brands: Array<{ id: string; name: string }>; employees: Array<{ id: string; name: string }>; projects: StoreProject[]; tasks: StoreTask[] }>;
  /** İstemci + marka (status='prospect') oluşturur. */
  createBrand(name: string): Promise<{ id: string; name: string }>;
  createProject(p: { brand_id: string; name: string; type: string; source_ref?: string }): Promise<{ id: string }>;
  /** İsteğe bağlı: eksik 'trello:board:<id>' proje bağını yazar. */
  setProjectRef?(id: string, ref: string): Promise<void>;
  /** İsteğe bağlı (birleştirme): projedeki TÜM görevleri (Trello kaynaklı olmayanlar dahil) başka projeye taşır; taşınan sayıyı döner. */
  moveProjectTasks?(fromId: string, toId: string): Promise<number>;
  /** İsteğe bağlı (birleştirme): proje durumu / adı. Proje asla silinmez. */
  updateProject?(id: string, patch: { status?: string; name?: string }): Promise<void>;
  createTasks(rows: TaskDraft[]): Promise<void>;
  updateTask(id: string, patch: Partial<TaskDraft>): Promise<void>;
}
const ms = (s: string | null) => (s ? Date.parse(s) : null);
export function taskChanges(cur: TaskDraft, next: TaskDraft): Partial<TaskDraft> {
  const patch: Partial<TaskDraft> = {};
  if (cur.project_id !== next.project_id) patch.project_id = next.project_id;
  if (cur.title !== next.title) patch.title = next.title;
  if ((cur.assignee_id ?? null) !== next.assignee_id) patch.assignee_id = next.assignee_id;
  if (cur.state !== next.state) patch.state = next.state;
  if (cur.priority !== next.priority) patch.priority = next.priority;
  if (ms(cur.due_at ?? null) !== ms(next.due_at)) patch.due_at = next.due_at;
  if (cur.planned_minutes !== next.planned_minutes) patch.planned_minutes = next.planned_minutes;
  if (cur.task_type !== next.task_type) patch.task_type = next.task_type;
  if ([...cur.labels].sort().join('|') !== [...next.labels].sort().join('|')) patch.labels = next.labels;
  return patch;
}
/** Trello kaynaklı (ya da Trello adlandırmalı) proje mi? 'trello:*' source_ref, "<Marka> <Ay'YY> SM" ya da "<Marka> · Trello". */
function isTrelloProject(p: StoreProject, brandName: string): boolean {
  if (p.name.endsWith(MERGED_SUFFIX)) return false;
  if (p.source_ref?.startsWith('trello:')) return true;
  const n = fold(p.name.normalize('NFC')).trim(), b = fold(brandName).trim();
  if (n === fold(canonicalProjectName(brandName))) return true;
  if (!n.startsWith(b + ' ')) return false;
  const rest = n.slice(b.length + 1);
  return new RegExp(`^(${MONTHS.map((m) => m[0]).join('|')})\\s*['’‘\`´]?\\s*(\\d{4}|\\d{2})?\\s+sm$`).test(rest);
}

/**
 * Marka başına TEK proje ("<Marka> · Trello"): aynı markanın Trello kaynaklı diğer projelerinin görevleri kanonik projeye taşınır,
 * boşalan projeler 'done' + " (birleştirildi)" son ekiyle bırakılır (silinmez). İdempotent: ikinci çalıştırmada değişiklik yok.
 */
export async function consolidateTrelloProjects(
  st: Awaited<ReturnType<TrelloStore['load']>>, store: TrelloStore, opts: { boardRef?: string; log?: (e: SyncLogDraft) => void },
): Promise<{ merged: number; created: number; projects: StoreProject[] }> {
  const out = { merged: 0, created: 0, projects: st.projects };
  if (!store.moveProjectTasks || !store.updateProject) return out;
  const byBrand = new Map<string, StoreProject[]>();
  for (const p of st.projects) {
    if (!p.brand_id) continue;
    const brand = st.brands.find((b) => b.id === p.brand_id);
    if (brand && isTrelloProject(p, brand.name)) byBrand.set(brand.id, [...(byBrand.get(brand.id) ?? []), p]);
  }
  const projects = [...st.projects];
  for (const [brandId, group] of byBrand) {
    const brand = st.brands.find((b) => b.id === brandId)!;
    const cname = canonicalProjectName(brand.name);
    const canon = group.find((p) => p.name === cname) ?? group.find((p) => fold(p.name) === fold(cname));
    const leftovers = group.filter((p) => p !== canon);
    if (!leftovers.length) continue;
    let target = canon;
    if (!target) {
      const ref = leftovers.find((p) => p.source_ref?.startsWith('trello:board:'))?.source_ref ?? undefined;
      const created = await store.createProject({ brand_id: brandId, name: cname, type: 'imported', source_ref: opts.boardRef ?? ref });
      target = { id: created.id, name: cname, brand_id: brandId, source_ref: opts.boardRef ?? ref ?? null, status: 'active' };
      projects.push(target); out.created++;
    }
    for (const lo of leftovers) {
      const moved = await store.moveProjectTasks(lo.id, target.id);
      for (const t of st.tasks) if (t.project_id === lo.id) t.project_id = target.id;
      const name = lo.name + MERGED_SUFFIX;
      await store.updateProject(lo.id, { status: 'done', name });
      const i = projects.findIndex((p) => p.id === lo.id);
      if (i >= 0) projects[i] = { ...lo, name, status: 'done' };
      out.merged++;
      opts.log?.({ direction: 'reconcile', entity: 'project', entity_id: lo.id, external_id: lo.source_ref ?? null, action: 'merged', ok: true, message: `${lo.name} → ${target.name} (${moved} görev)` });
    }
  }
  out.projects = projects;
  return out;
}

const boardOf = (snap: TrelloSnapshot): TrelloBoard | undefined => snap.boards[0] ?? (snap.lists[0] ? { id: snap.lists[0].idBoard, name: '?' } : undefined);
async function pool<T>(items: T[], n: number, fn: (x: T) => Promise<void>) {
  let i = 0;
  await Promise.all(Array.from({ length: Math.min(n, items.length) }, async () => { while (i < items.length) await fn(items[i++]); }));
}

/** Görev yazıldıktan sonra kart başına çağrılır (ayrıntı eşlemesi: açıklama, kapak, checklist, yorum, ek). Sıralı; hata içe aktarmayı durdurmaz. */
export type CardDetailsHook = (info: { card: TrelloCard; ref: string; taskId: string; jsNewer: boolean }) => Promise<void>;
export async function runImport(snap: TrelloSnapshot, store: TrelloStore, opts: { now: string; memberMap?: Record<string, string>; concurrency?: number; onLog?: (e: SyncLogDraft) => void; details?: CardDetailsHook }): Promise<TrelloImportResult> {
  const res: TrelloImportResult = {
    boards: snap.boards.length, lists: snap.lists.length, cards_seen: snap.cards.length, skipped_templates: 0, brands_created: [],
    projects_created: 0, projects_updated: 0, tasks_created: 0, tasks_updated: 0, tasks_unchanged: 0, tasks_skipped: 0, unmapped_members: [], errors: [],
  };
  const st = await store.load();
  const brands = [...st.brands];
  const log = opts.onLog ?? (() => undefined);
  const firstBoard = snap.boards[0] ?? boardOf(snap);
  const cons = await consolidateTrelloProjects(st, store, { boardRef: firstBoard ? `trello:board:${firstBoard.id}` : undefined, log }).catch((e) => { res.errors.push(`birleştirme: ${e instanceof Error ? e.message : String(e)}`); return null; });
  if (cons) { res.projects_merged = cons.merged; res.projects_created += cons.created; }
  const live = cons?.projects ?? st.projects;
  const projects = new Map(live.filter((p) => !p.name.endsWith(MERGED_SUFFIX)).map((p) => [p.name, p.id]));
  const refless = new Set(live.filter((p) => !p.source_ref).map((p) => p.id));
  const touched = new Set<string>();
  const existing = new Map(st.tasks.map((t) => [t.source_ref, t]));
  const boards = new Map(snap.boards.map((b) => [b.id, b]));
  const lists = new Map(snap.lists.map((l) => [l.id, l]));
  const members = Object.fromEntries(snap.members.map((m) => [m.id, m.fullName]));
  const unmapped = new Map<string, number>();
  const creates: TaskDraft[] = [];
  const updates: Array<[string, Partial<TaskDraft>]> = [];
  const seenRefs = new Set<string>();
  const done: Array<{ card: TrelloCard; ref: string }> = [];
  const jsNewer = new Set<string>();

  for (const card of snap.cards) {
    try {
      const list = lists.get(card.idList);
      const board = boards.get(card.idBoard ?? list?.idBoard ?? '') ?? { id: '', name: '?' };
      const m = mapCard(card, { now: opts.now, board, list, brands, employees: st.employees, members, memberMap: opts.memberMap });
      if (m.skipped) { res.skipped_templates++; continue; }
      if (seenRefs.has(m.ref)) continue; // aynı kart iki kez gelirse
      seenRefs.add(m.ref);
      done.push({ card, ref: m.ref });
      let brandId = m.brandId;
      if (!brandId) {
        const b = await store.createBrand(m.brandName);
        brands.push(b); brandId = b.id; res.brands_created.push(b.name);
      }
      const boardRef = board.id ? `trello:board:${board.id}` : undefined;
      let pid = projects.get(m.projectName);
      if (!pid) { pid = (await store.createProject({ brand_id: brandId, name: m.projectName, type: m.projectType, source_ref: boardRef })).id; projects.set(m.projectName, pid); touched.add(m.projectName); res.projects_created++; }
      else if (!touched.has(m.projectName)) { touched.add(m.projectName); res.projects_updated++; }
      if (boardRef && refless.has(pid) && store.setProjectRef) { refless.delete(pid); await store.setProjectRef(pid, boardRef).catch(() => undefined); }
      for (const n of uniq(m.unmapped)) unmapped.set(n, (unmapped.get(n) ?? 0) + 1);
      const draft: TaskDraft = { ...m.draft, project_id: pid };
      const cur = existing.get(m.ref);
      if (cur && resolveConflict(cur.updated_at, card.dateLastActivity, cur.synced_at) === 'push') jsNewer.add(m.ref);
      if (!cur) { creates.push(draft); log({ direction: 'pull', entity: 'task', entity_id: null, external_id: card.id, action: 'created', ok: true, message: draft.title }); }
      else {
        const patch = taskChanges(cur, draft);
        if (!Object.keys(patch).length) res.tasks_unchanged++;
        else if (resolveConflict(cur.updated_at, card.dateLastActivity, cur.synced_at) === 'push') {
          res.tasks_skipped = (res.tasks_skipped ?? 0) + 1;
          log({ direction: 'pull', entity: 'task', entity_id: cur.id, external_id: card.id, action: 'skipped_conflict', ok: true, message: `JS daha yeni (${cur.updated_at}) · Trello ${card.dateLastActivity}: ${Object.keys(patch).join(', ')}` });
        } else { updates.push([cur.id, patch]); log({ direction: 'pull', entity: 'task', entity_id: cur.id, external_id: card.id, action: 'updated', ok: true, message: Object.keys(patch).join(', ') }); }
      }
    } catch (e) { if (res.errors.length < 20) res.errors.push(`${card.name}: ${e instanceof Error ? e.message : String(e)}`); }
  }
  for (let i = 0; i < creates.length; i += 100) {
    const chunk = creates.slice(i, i + 100);
    try { await store.createTasks(chunk); res.tasks_created += chunk.length; } catch (e) { res.errors.push(`görev ekleme: ${e instanceof Error ? e.message : String(e)}`); }
  }
  await pool(updates, opts.concurrency ?? 3, async ([id, patch]) => {
    try { await store.updateTask(id, patch); res.tasks_updated++; } catch (e) { if (res.errors.length < 20) res.errors.push(`güncelleme: ${e instanceof Error ? e.message : String(e)}`); }
  });
  if (opts.details && done.length) {
    const ids = new Map((await store.load()).tasks.map((t) => [t.source_ref, t.id]));
    for (const { card, ref } of done) {
      const taskId = ids.get(ref);
      if (!taskId) continue;
      try { await opts.details({ card, ref, taskId, jsNewer: jsNewer.has(ref) }); } catch (e) { if (res.errors.length < 20) res.errors.push(`ayrıntı ${card.name}: ${e instanceof Error ? e.message : String(e)}`); }
    }
  }
  res.unmapped_members = [...unmapped].map(([name, cards]) => ({ name, cards })).sort((a, b) => b.cards - a.cards || a.name.localeCompare(b.name));
  return res;
}
