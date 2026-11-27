import { z } from 'zod';
import { supervises, type TierActor, type TierPerson } from './tiers';

/**
 * Kişisel ajan filosu (Agency OS Faz 3, migration 0022).
 *  personal_agents  — ekip üyesine bağlı ajan (ad, uzmanlık, isteğe bağlı Agency rolü, durum, yürürlükteki sürüm)
 *  agent_versions   — ajanın talimat sürümleri: taslak → (onay) yürürlükte → (yenisi gelince) eski · reddedildi
 * Kural: hiçbir değişiklik onaysız yürürlüğe girmez. Ajanın kendi önerdiği güncelleme (`author='agent'`) da taslaktır.
 * Erişim: üye yalnızca kendi ajanlarını, ekip lideri kendi zincirini, ajans sahibi hepsini görür/yönetir (`supervises`; RLS'te `core.supervises`).
 */
export const AGENT_STATUS = ['active', 'paused', 'archived'] as const;
export const AGENT_STATUS_LABELS: Record<(typeof AGENT_STATUS)[number], string> = { active: 'Etkin', paused: 'Duraklatıldı', archived: 'Arşivlendi' };
export const VERSION_STATUS = ['draft', 'active', 'superseded', 'rejected'] as const;
export type VersionStatus = (typeof VERSION_STATUS)[number];
export const VERSION_STATUS_LABELS: Record<VersionStatus, string> = { draft: 'Taslak · onay bekliyor', active: 'Yürürlükte', superseded: 'Eski sürüm', rejected: 'Reddedildi' };
export const VERSION_AUTHORS = ['user', 'agent'] as const;

export interface PersonalAgent {
  id: string; org_id: string; created_at: string;
  owner_employee_id: string; base_role: string | null; status: (typeof AGENT_STATUS)[number];
  /** Yürürlükteki sürüm numarası; 0 = henüz onaylı sürüm yok. */
  current_version: number;
  name: string; specialty: string;
}
export interface AgentVersion {
  id: string; org_id: string; created_at: string;
  agent_id: string; version: number; status: VersionStatus; author: (typeof VERSION_AUTHORS)[number];
  created_by: string | null; decided_by: string | null; decided_at: string | null;
  /** Ajanın çalışma talimatı. */
  instructions: string;
  /** Hizmet kapsamı: yapabilecekleri / kesinlikle yapamayacakları. */
  can: string[]; cannot: string[];
  /** Değişikliğin kısa gerekçesi. */
  change_note: string;
}
const line = z.string().trim().min(1).max(240);
export const personalAgentSchema = z.object({
  owner_employee_id: z.string().min(1), base_role: z.string().max(120).nullable(), status: z.enum(AGENT_STATUS), current_version: z.number().int().min(0),
  name: z.string().trim().min(2).max(80), specialty: z.string().trim().max(200),
}).passthrough();
export const agentVersionSchema = z.object({
  agent_id: z.string().min(1), version: z.number().int().min(1), status: z.enum(VERSION_STATUS), author: z.enum(VERSION_AUTHORS),
  instructions: z.string().trim().min(10).max(12000), can: z.array(line).max(20), cannot: z.array(line).max(20), change_note: z.string().trim().max(500),
}).passthrough();

export const versionLabel = (n: number) => (n > 0 ? `v${n}` : 'sürüm yok');
export const versionsOf = (agentId: string, versions: AgentVersion[]) => versions.filter((v) => v.agent_id === agentId).sort((a, b) => b.version - a.version);
export const activeVersion = (agentId: string, versions: AgentVersion[]) => versions.find((v) => v.agent_id === agentId && v.status === 'active') ?? null;
export const pendingDrafts = (agentId: string, versions: AgentVersion[]) => versionsOf(agentId, versions).filter((v) => v.status === 'draft');
export const nextVersionNumber = (agentId: string, versions: AgentVersion[]) => versions.filter((v) => v.agent_id === agentId).reduce((a, v) => Math.max(a, v.version), 0) + 1;
/** Aktör bu ajanı yönetebilir mi (gör / düzenle / sürüm onayla)? */
export const canManageAgent = (actor: TierActor, agent: Pick<PersonalAgent, 'owner_employee_id'>, team: TierPerson[]) => supervises(actor, agent.owner_employee_id, team);
/** İzinli durum geçişleri: taslak → yürürlükte | reddedildi; yürürlükte → eski. Diğerleri kapalı (sürüm geçmişi değiştirilemez). */
export const versionTransitionAllowed = (from: VersionStatus, to: VersionStatus) =>
  from === to || (from === 'draft' && (to === 'active' || to === 'rejected')) || (from === 'active' && to === 'superseded');

/** Ajanın sistem talimatı: (varsa) Agency rol gövdesi + yürürlükteki talimat + kapsam sınırları. */
export function personalAgentPrompt(a: { name: string; specialty: string; ownerName: string; basePrompt: string | null; version: Pick<AgentVersion, 'instructions' | 'can' | 'cannot' | 'version'> }): string {
  const list = (items: string[]) => (items.length ? items.map((x) => `- ${x}`).join('\n') : '- (tanımlı değil)');
  return [
    ...(a.basePrompt ? [a.basePrompt, '', '---'] : []),
    `Sen “${a.name}” adlı kişisel ajansın; ${a.ownerName} adına çalışırsın.${a.specialty ? ` Uzmanlık: ${a.specialty}.` : ''} (talimat ${versionLabel(a.version.version)})`,
    '',
    'ÇALIŞMA TALİMATI',
    a.version.instructions,
    '',
    'YAPABİLECEKLERİN',
    list(a.version.can),
    '',
    'KESİNLİKLE YAPAMAYACAKLARIN',
    list(a.version.cannot),
    '- Araç, dosya, web ya da kod çalıştırma erişimin yok: yalnızca metin üretirsin. Yapamadığın işi yapılmış gibi yazma.',
    '- Bütçe onayı, yayın, gönderim ya da silme gibi kararları sen veremezsin; öneri olarak sunarsın.',
    '',
    'Yanıtını Türkçe ver; kısa ve uygulanabilir olsun. Varsayımlarını açıkça belirt.',
  ].join('\n');
}

/* ───────── Sürüm karşılaştırma (satır bazlı LCS) ───────── */
export interface DiffLine { kind: 'same' | 'add' | 'del'; text: string }
export function lineDiff(before: string, after: string): DiffLine[] {
  const a = before.split('\n');
  const b = after.split('\n');
  const n = a.length;
  const m = b.length;
  const lcs: number[][] = Array.from({ length: n + 1 }, () => new Array<number>(m + 1).fill(0));
  for (let i = n - 1; i >= 0; i -= 1) for (let j = m - 1; j >= 0; j -= 1) lcs[i][j] = a[i] === b[j] ? lcs[i + 1][j + 1] + 1 : Math.max(lcs[i + 1][j], lcs[i][j + 1]);
  const out: DiffLine[] = [];
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (a[i] === b[j]) { out.push({ kind: 'same', text: a[i] }); i += 1; j += 1; }
    else if (lcs[i + 1][j] >= lcs[i][j + 1]) { out.push({ kind: 'del', text: a[i] }); i += 1; }
    else { out.push({ kind: 'add', text: b[j] }); j += 1; }
  }
  while (i < n) { out.push({ kind: 'del', text: a[i] }); i += 1; }
  while (j < m) { out.push({ kind: 'add', text: b[j] }); j += 1; }
  return out;
}
/** Sürümün karşılaştırılabilir metni (talimat + kapsam). */
export const versionText = (v: Pick<AgentVersion, 'instructions' | 'can' | 'cannot'>) =>
  [v.instructions.trim(), '', 'Yapabilir:', ...v.can.map((x) => `+ ${x}`), '', 'Yapamaz:', ...v.cannot.map((x) => `- ${x}`)].join('\n');

/* ───────── Kayıt (agent_runs) ve günlük özet ───────── */
export const PERSONAL_AGENT_PREFIX = 'pa:';
export const personalAgentRunId = (agentId: string) => `${PERSONAL_AGENT_PREFIX}${agentId}`;
export interface AgentDigestInput { agentName: string; runs: number; approved: number; pending: number; proposedByAgent: number }
/** Günlük özet: en çok 3 madde; hiçbir şey olmadıysa boş dizi (bildirim gönderilmez). */
export function agentDigestLines(items: AgentDigestInput[]): string[] {
  const runs = items.reduce((a, x) => a + x.runs, 0);
  const approved = items.reduce((a, x) => a + x.approved, 0);
  const pending = items.reduce((a, x) => a + x.pending, 0);
  const proposed = items.reduce((a, x) => a + x.proposedByAgent, 0);
  if (!runs && !approved && !pending) return [];
  const busiest = [...items].sort((a, b) => b.runs - a.runs)[0];
  return [
    runs ? `Dün ${runs} görev tamamlandı${busiest && busiest.runs ? ` (en çok: ${busiest.agentName}, ${busiest.runs})` : ''}.` : 'Dün tamamlanan görev yok.',
    approved ? `${approved} talimat güncellemesi yürürlüğe girdi.` : 'Yürürlüğe giren talimat güncellemesi yok.',
    pending ? `${pending} güncelleme onayını bekliyor${proposed ? ` (${proposed} tanesini ajan önerdi)` : ''}.` : 'Onay bekleyen güncelleme yok.',
  ];
}
