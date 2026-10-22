import { BOARD_AGENTS, type AgentName, type BoardProposalOutput, type InboxDraft, type InboxDraftsOutput, type TwinBidOutput } from '@jscore/contracts';

export const DEMO_TODAY = '2026-10-14';
const addDays = (iso: string, n: number) => { const d = new Date(`${iso}T12:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };

/** Deterministik "AI" görev taslakları (anahtar sözcük kuralları). */
export function demoInboxDrafts(input: { subject?: string; body?: string }): InboxDraftsOutput {
  const text = `${input.subject ?? ''}\n${input.body ?? ''}`.toLocaleLowerCase('tr');
  const urgent = /acil|yarın|cuma|bugün/.test(text);
  const base: Pick<InboxDraft, 'priority' | 'due_at'> = { priority: urgent ? 'high' : 'normal', due_at: addDays(DEMO_TODAY, urgent ? 2 : 5) };
  const drafts: InboxDraft[] = [];
  const vis = text.match(/(\d+)\s*(?:ek\s*)?(?:sosyal\s*)?görsel/);
  if (vis || /sosyal görsel|post/.test(text)) drafts.push({ title: 'Ek sosyal görsel', task_type: 'social_visual', qty: vis ? Number(vis[1]) : 1, ...base, rationale: 'E-postada ek sosyal görsel talebi geçiyor.' });
  if (/reels|video|kurgu/.test(text)) drafts.push({ title: 'Reels / video kesiti', task_type: 'reels', qty: 1, ...base, rationale: 'Video içerik talebi tespit edildi.' });
  if (/sunum|teklif|toplantı/.test(text)) drafts.push({ title: 'Sunum / teklif hazırlığı', task_type: 'proposal_deck', qty: 1, ...base, rationale: 'Sunum veya teklif isteniyor.' });
  if (/revizyon|revize|düzelt|tipografi/.test(text)) drafts.push({ title: 'Ana görsel revizyonu', task_type: 'main_visual', qty: 1, ...base, rationale: 'Revizyon notu içeriyor.' });
  if (/takvim|onay/.test(text) && !drafts.length) drafts.push({ title: 'Müşteri onay takibi', task_type: 'status_report', qty: 1, ...base, rationale: 'Onay bekleyen bir talep var.' });
  if (!drafts.length) drafts.push({ title: 'Talebi değerlendir ve yanıtla', task_type: 'general', qty: 1, ...base, rationale: 'Net bir iş kalemi çıkarılamadı; manuel inceleme önerilir.' });
  return { summary: `${drafts.length} görev taslağı çıkarıldı (demo kuralları, gerçek model çağrısı yok).`, drafts };
}

export interface TwinBidInput {
  task: { id: string; title: string; task_type: string; priority?: string; planned_minutes?: number };
  twins: Array<{ id: string; employee_id?: string | null; name: string; skills: string[]; weekly_hours?: number }>;
}
const TYPE_SKILLS: Record<string, string[]> = {
  social_visual: ['Sosyal set', 'Ana görsel', 'Banner'], main_visual: ['Ana görsel', 'Sunum tasarımı'], reels: ['Offline kurgu', 'Çekim', 'Motion'],
  proposal_deck: ['Sunum tasarımı', 'Teklif'], status_report: ['Müşteri yönetimi', 'Marka planı'],
};
const hash = (s: string) => Array.from(s).reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 7);
/** Deterministik kurgusal ihale teklifleri: beceri eşleşmesi + sabit tohumlu sapma; en yüksek 2–3 ikiz. */
export function demoTwinBids(input: TwinBidInput): TwinBidOutput {
  const want = TYPE_SKILLS[input.task?.task_type] ?? [];
  const hours = Math.max(1, (input.task?.planned_minutes || 240) / 60);
  const scored = (input.twins ?? []).map((t) => {
    const hit = t.skills.filter((s) => want.includes(s));
    const ratio = want.length ? hit.length / Math.min(want.length, 3) : 0.4;
    const confidence = Math.min(98, Math.round(52 + 34 * Math.min(1, ratio) + (hash(`${t.id}:${input.task?.id}`) % 10)));
    const eta = Math.max(2, Math.round(hours * (1.7 - confidence / 100) * 2) / 2);
    const rationale = hit.length
      ? `${hit.join(', ')} becerileri bu iş türüyle eşleşiyor; haftalık ${t.weekly_hours ?? 36} saat kapasite ile tahmini ${eta} saatte teslim edilir (demo, model çağrısı yok).`
      : `Doğrudan beceri eşleşmesi yok; genel kapasite uygun, tahmini ${eta} saat (demo, model çağrısı yok).`;
    return { twin_id: t.id, confidence, eta_hours: eta, rationale };
  }).sort((a, b) => b.confidence - a.confidence || a.twin_id.localeCompare(b.twin_id)).slice(0, 3);
  return { summary: `${scored.length} ikiz teklif verdi (demo kuralları).`, bids: scored };
}

export function demoBoardOutput(agent: AgentName): BoardProposalOutput {
  const role = agent.toUpperCase();
  return {
    summary: `${role}: demo özeti — gerçek veri ve model bağlandığında üretilir.`,
    proposals: [{ action: `${role} · haftalık durum gözden geçirmesi`, rationale: 'Demo modunda örnek öneri.', level: 1, risk: 'low' }],
  };
}

export function demoAgentOutput(agent: AgentName, input: Record<string, unknown>): unknown {
  if (agent === 'inbox_drafts') return demoInboxDrafts(input as { subject?: string; body?: string });
  if (agent === 'studio_draft') {
    const brand = String(input.brand ?? 'Marka');
    const goal = String(input.goal ?? 'bilinirlik');
    return { summary: `${brand} için ${goal} odaklı 3 konsept (demo, model çağrısı yok).`, concepts: [
      { title: 'Gündelik an', idea: `${brand} ürününü günlük rutinin içinde, abartısız bir an olarak göster.`, tone: 'samimi' },
      { title: 'Önce / sonra', idea: 'Tek karede fark yaratan sade bir karşılaştırma serisi; beyan içermeden.', tone: 'güven veren' },
      { title: 'Ekip hikâyesi', idea: 'Üretimin arkasındaki insanlar; kısa dikey video serisi.', tone: 'sıcak' },
    ] };
  }
  if (agent === 'twin_bid') return demoTwinBids(input as unknown as TwinBidInput);
  if (agent === 'twin_person' || agent === 'twin_role') return { summary: 'Demo ikiz değerlendirmesi', fit: 80, notes: ['Kapasite uygun', 'Beceri eşleşmesi yüksek'] };
  return demoBoardOutput(agent);
}
export const isBoardAgent = (a: AgentName) => (BOARD_AGENTS as readonly string[]).includes(a);
