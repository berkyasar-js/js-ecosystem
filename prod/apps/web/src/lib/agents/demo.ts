import { BOARD_AGENTS, type AgentName, type BoardProposalOutput, type InboxDraft, type InboxDraftsOutput } from '@jscore/contracts';

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
  if (agent === 'twin_person' || agent === 'twin_role') return { summary: 'Demo ikiz değerlendirmesi', fit: 80, notes: ['Kapasite uygun', 'Beceri eşleşmesi yüksek'] };
  return demoBoardOutput(agent);
}
export const isBoardAgent = (a: AgentName) => (BOARD_AGENTS as readonly string[]).includes(a);
