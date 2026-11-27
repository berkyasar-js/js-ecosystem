/**
 * @jscore/agents — ajan orkestrasyonu, saf çekirdek (istemci + sunucu + test).
 * Kadro `.claude/agents` altındaki Agency rollerinden üretilir (scripts/gen.mjs → roster.json).
 * Çalıştırmalar yeni tablo gerektirmez: `agent_runs.agent = 'agency:<slug>'`, bağlam `input` içinde.
 */
import rosterJson from './roster.json';

export interface AgencyRole { slug: string; name: string; division: string; description: string; emoji: string; vibe: string }
export const AGENCY_ROSTER = rosterJson as AgencyRole[];
export const agencyRole = (slug: string): AgencyRole | undefined => AGENCY_ROSTER.find((r) => r.slug === slug);

export interface DivisionDef { id: string; label: string; color: string }
/** Bölümler (kaynak depodaki klasörler); renkler 3B ofiste halı / avatar rengi. */
export const DIVISIONS: DivisionDef[] = [
  { id: 'engineering', label: 'Mühendislik', color: '#4f8cff' },
  { id: 'specialized', label: 'Uzmanlık', color: '#8c7bff' },
  { id: 'marketing', label: 'Pazarlama', color: '#ff8a3d' },
  { id: 'game-development', label: 'Oyun Geliştirme', color: '#c56bff' },
  { id: 'gis', label: 'CBS & Harita', color: '#2fc9b5' },
  { id: 'security', label: 'Güvenlik', color: '#ff5d6c' },
  { id: 'design', label: 'Tasarım', color: '#ff6fb5' },
  { id: 'sales', label: 'Satış', color: '#35c98a' },
  { id: 'testing', label: 'Test & Kalite', color: '#f5b83d' },
  { id: 'paid-media', label: 'Ücretli Medya', color: '#e8cf3a' },
  { id: 'project-management', label: 'Proje Yönetimi', color: '#3db8f5' },
  { id: 'academic', label: 'Akademik', color: '#a98cff' },
  { id: 'product', label: 'Ürün', color: '#e274f0' },
  { id: 'spatial-computing', label: 'Uzamsal Bilişim', color: '#36d3e6' },
  { id: 'support', label: 'Destek', color: '#9bd64a' },
  { id: 'finance', label: 'Finans', color: '#4ad68f' },
  { id: 'healthcare', label: 'Sağlık', color: '#3fc9c0' },
  { id: 'research', label: 'Araştırma', color: '#9a7bff' },
];
const FALLBACK_DIVISION: DivisionDef = { id: 'other', label: 'Diğer', color: '#8c93ff' };
export const divisionOf = (id: string): DivisionDef => DIVISIONS.find((d) => d.id === id) ?? { ...FALLBACK_DIVISION, id };

/* ───────── Çalıştırmalar (agent_runs) ───────── */
export const AGENCY_PREFIX = 'agency:';
export const agencyAgentId = (slug: string) => `${AGENCY_PREFIX}${slug}`;
export const isAgencyAgent = (agent: string) => agent.startsWith(AGENCY_PREFIX);
/** Bu süre içinde çalışmış rol ofiste "az önce çalıştı" görünür. */
export const RECENT_WINDOW_MS = 24 * 60 * 60 * 1000;

export interface AgencyRunView {
  id: string; slug: string; project_id: string | null; task_id: string | null; brief: string; by: string | null;
  /** Elle seçilen tipleme (yoksa rolün varsayılanı kullanılır). */
  persona: string | null;
  status: 'ok' | 'error' | 'demo'; created_at: string; text: string; cost_usd: number;
}
const str = (v: unknown) => (typeof v === 'string' ? v : '');
const strOrNull = (v: unknown) => (typeof v === 'string' && v ? v : null);
/** agent_runs satırı → ofis görünümü (Agency çalıştırması değilse null). */
export function toAgencyRun(run: { id: string; agent: string; input: unknown; output: unknown; status: string; created_at: string; cost_usd?: number | string }): AgencyRunView | null {
  if (!isAgencyAgent(run.agent)) return null;
  const input = (run.input && typeof run.input === 'object' ? run.input : {}) as Record<string, unknown>;
  const output = (run.output && typeof run.output === 'object' ? run.output : {}) as Record<string, unknown>;
  return {
    id: run.id, slug: run.agent.slice(AGENCY_PREFIX.length),
    project_id: strOrNull(input.project_id), task_id: strOrNull(input.task_id), brief: str(input.brief), by: strOrNull(input.by), persona: strOrNull(input.persona),
    status: run.status === 'ok' || run.status === 'error' ? run.status : 'demo',
    created_at: run.created_at, text: str(output.text), cost_usd: Number(run.cost_usd ?? 0),
  };
}

export type SeatState = 'working' | 'recent' | 'idle';
export interface SeatActivity { state: SeatState; last: AgencyRunView | null; count: number }
/**
 * Rol başına durum: `working` (şu an çalışan istek), `recent` (son 24 sa içinde çalıştı), `idle`.
 * `projectId` verilirse yalnızca o projedeki çalıştırmalar sayılır.
 */
export function agencyActivity(runs: AgencyRunView[], nowMs: number, working: Iterable<string> = [], projectId?: string | null): Map<string, SeatActivity> {
  const out = new Map<string, SeatActivity>();
  const sorted = [...runs].filter((r) => !projectId || r.project_id === projectId).sort((a, b) => b.created_at.localeCompare(a.created_at));
  for (const r of sorted) {
    const cur = out.get(r.slug);
    if (cur) { cur.count += 1; continue; }
    const age = nowMs - Date.parse(r.created_at);
    out.set(r.slug, { state: age >= 0 && age <= RECENT_WINDOW_MS ? 'recent' : 'idle', last: r, count: 1 });
  }
  for (const slug of working) out.set(slug, { state: 'working', last: out.get(slug)?.last ?? null, count: out.get(slug)?.count ?? 0 });
  return out;
}

/** Arama: ad, açıklama, bölüm etiketi (tr küçük harf). */
export function searchRoster(q: string, division: string | null, roster: AgencyRole[] = AGENCY_ROSTER): AgencyRole[] {
  const needle = q.trim().toLocaleLowerCase('tr');
  return roster.filter((r) => (!division || r.division === division)
    && (!needle || `${r.name} ${r.description} ${divisionOf(r.division).label} ${r.slug}`.toLocaleLowerCase('tr').includes(needle)));
}

/** Demo / anahtarsız mod: gerçek model çağrısı yok, deterministik örnek çıktı. */
export function demoAgencyOutput(role: AgencyRole, brief: string, projectName: string | null): string {
  const b = brief.trim().replace(/\s+/g, ' ').slice(0, 160);
  return [
    `${role.emoji} ${role.name} — demo çıktısı (gerçek model çağrısı yapılmadı)`,
    projectName ? `Proje: ${projectName}` : 'Proje: seçilmedi',
    `Görev: ${b}`,
    '',
    '1. Kapsamı netleştir: hedef kitle, başarı ölçütü ve teslim tarihi.',
    '2. İlk taslağı üret ve varsayımları açıkça listele.',
    '3. Taslağı proje sahibine onaya gönder; geri bildirimi tek turda işle.',
  ].join('\n');
}

export * from './personas';
