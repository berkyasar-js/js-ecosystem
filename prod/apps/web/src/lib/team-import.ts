import { TEAM_SHEET_COLUMNS, TEAM_SHEET_IGNORED, type Role, type TeamImportRow } from '@jscore/contracts';

/**
 * "Ekip" sayfası satırlarını (SheetJS `sheet_to_json` çıktısı: başlık → hücre) kurulum satırlarına çevirir.
 * YALNIZCA ad / pozisyon / ekip / bağlı olduğu / el kitabı rolü / statü / işe giriş okunur. Maaş ve kişisel veri sütunları
 * hiç okunmaz (TEAM_SHEET_IGNORED); dosya tarayıcıdan çıkmaz. Saf ve testli.
 */
export interface TeamImportResult { rows: TeamImportRow[]; ignored_columns: string[]; unknown_columns: string[]; skipped: number }

const norm = (s: string) => s.toLocaleLowerCase('tr').replace(/\s+/g, ' ').trim();
const WANTED = Object.fromEntries(Object.entries(TEAM_SHEET_COLUMNS).map(([k, v]) => [norm(v), k])) as Record<string, keyof typeof TEAM_SHEET_COLUMNS>;

/** Excel seri tarihi ya da metin (dd.mm.yyyy, yyyy-mm-dd, dd/mm/yyyy) → 'YYYY-MM-DD'. */
export function toIsoDate(v: unknown): string | null {
  if (v == null || v === '') return null;
  if (v instanceof Date) return Number.isNaN(v.getTime()) ? null : v.toISOString().slice(0, 10);
  if (typeof v === 'number' && v > 20000 && v < 80000) return new Date(Date.UTC(1899, 11, 30) + Math.round(v) * 86400000).toISOString().slice(0, 10);
  const s = String(v).trim();
  let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (m) return `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}`;
  m = s.match(/^(\d{1,2})[./](\d{1,2})[./](\d{4})/);
  if (m) return `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
  return null;
}
/** Statü metni → active/left ('ayrıl', 'pasif', 'çıkış' → left). */
export const toStatus = (v: unknown): 'active' | 'left' => (/ayrıl|pasif|çık|left|inactive/i.test(String(v ?? '')) ? 'left' : 'active');
/** El kitabı rolü → uygulama rolü tahmini (bilinmiyorsa creative). */
export function guessAppRole(handbook: string | null, title: string): Role {
  const s = norm(`${handbook ?? ''} ${title}`);
  if (/kurucu|founder|owner|genel müdür/.test(s)) return 'owner';
  if (/finans|mali|muhasebe/.test(s)) return 'finance';
  if (/insan kaynak|ik\b|hr\b/.test(s)) return 'hr';
  if (/bordro|payroll/.test(s)) return 'payroll';
  if (/operasyon|proje yönet|pm\b|producer/.test(s)) return 'pm';
  if (/account|hesap|marka temsil|brand manager|müşteri/.test(s)) return 'account';
  if (/freelance/.test(s)) return 'freelancer';
  return 'creative';
}

export function parseTeamRows(input: Array<Record<string, unknown>>): TeamImportResult {
  const headers = new Set<string>();
  for (const r of input) for (const k of Object.keys(r)) headers.add(k);
  const ignored_columns: string[] = []; const unknown_columns: string[] = [];
  const map = new Map<string, keyof typeof TEAM_SHEET_COLUMNS>();
  for (const h of headers) {
    const key = WANTED[norm(h)];
    if (key) map.set(h, key);
    else if (TEAM_SHEET_IGNORED.test(h)) ignored_columns.push(h);
    else unknown_columns.push(h);
  }
  const rows: TeamImportRow[] = []; let skipped = 0;
  for (const r of input) {
    const get = (k: keyof typeof TEAM_SHEET_COLUMNS) => { for (const [h, key] of map) if (key === k) return r[h]; return undefined; };
    const name = String(get('name') ?? '').replace(/\s+/g, ' ').trim();
    if (name.length < 2) { skipped++; continue; }
    const title = String(get('title') ?? '').trim();
    const handbook = String(get('handbook_role') ?? '').trim() || null;
    const team = String(get('team') ?? '').trim() || null;
    const manager = String(get('manager') ?? '').replace(/\s+/g, ' ').trim() || null;
    rows.push({ name, title, team, manager_name: manager, status: toStatus(get('status')), hired_at: toIsoDate(get('start')), handbook_role: handbook, app_role: guessAppRole(handbook, title) });
  }
  return { rows, ignored_columns, unknown_columns, skipped };
}

/** "Bağlı olduğu" adını kayıtlı çalışan kimliğine çözer (tam ad; yoksa ilk ad + soyad baş harfi; belirsizse null). */
export function resolveManager(name: string | null, people: Array<{ id: string; name: string }>): string | null {
  if (!name) return null;
  const n = norm(name);
  const exact = people.filter((p) => norm(p.name) === n);
  if (exact.length === 1) return exact[0].id;
  const loose = people.filter((p) => norm(p.name).startsWith(n) || n.startsWith(norm(p.name)));
  return loose.length === 1 ? loose[0].id : null;
}
