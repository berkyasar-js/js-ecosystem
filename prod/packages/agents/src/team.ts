/**
 * Otomatik ekip kurma — proje açıklamasından Agency rolleri seçer.
 *  - Üretimde seçimi model yapar (kadro özeti + açıklama → JSON); bu dosya isteği kurar ve yanıtı DOĞRULAR (yalnızca kadrodaki roller kabul edilir).
 *  - Demo / anahtarsız modda ya da model yanıtı kullanılamazsa kurallı eşleme (`suggestTeamByRules`) devreye girer.
 */
import { z } from 'zod';
import type { AgencyRole } from './index';

export interface TeamPick { slug: string; reason: string; task: string }
export const TEAM_MIN = 3;
export const TEAM_MAX = 8;
export const teamRequestSchema = z.object({
  description: z.string().trim().min(20, 'Proje açıklaması en az 20 karakter olmalı').max(4000),
  project_id: z.string().max(80).nullable().optional(),
  size: z.number().int().min(TEAM_MIN).max(TEAM_MAX).default(5),
  /** Ekibi seçecek model sağlayıcısı; verilmezse Claude. */
  provider: z.enum(['claude', 'chatgpt', 'gemini']).nullable().optional(),
  demo_spend_usd: z.number().min(0).optional(), demo_cap_usd: z.number().min(0).optional(),
});

/** Eşleme için sadeleştirme: Türkçe küçük harf + noktasız ı → i ("Instagram" → "instagram", "tasarım" → "tasarim"). */
const tr = (s: string) => s.toLocaleLowerCase('tr').replace(/ı/g, 'i');
/** Açıklamadaki ajans ihtiyacı → o ihtiyaç için sırayla tercih edilen roller (kadroda olmayan slug yok sayılır) ve ihtiyacın Türkçe adı. */
const TERMS: Array<[RegExp, string[], string]> = [
  [/instagram|reels/, ['marketing-instagram-curator', 'marketing-carousel-growth-engine'], 'Instagram'],
  [/tiktok/, ['marketing-tiktok-strategist', 'marketing-short-video-editing-coach'], 'TikTok'],
  [/linkedin/, ['marketing-linkedin-content-creator'], 'LinkedIn'],
  [/twitter|\bx\b/, ['marketing-twitter-engager'], 'X / Twitter'],
  [/sosyal medya|paylaşım takvimi|topluluk/, ['marketing-social-media-strategist', 'marketing-instagram-curator'], 'sosyal medya'],
  [/reklam|meta ads|google ads|ppc|performans pazarlama|medya satın/, ['paid-media-creative-strategist', 'paid-media-paid-social-strategist', 'paid-media-ppc-strategist'], 'ücretli reklam'],
  [/seo|arama motoru|organik/, ['marketing-seo-specialist', 'marketing-ai-citation-strategist'], 'arama görünürlüğü'],
  [/web sitesi|website|web sayfası|landing|açılış sayfası|arayüz|frontend/, ['engineering-frontend-developer', 'design-ui-designer', 'design-ux-architect'], 'web sitesi / arayüz'],
  [/wordpress|cms|içerik yönetim/, ['engineering-cms-developer'], 'CMS'],
  [/tasarım|görsel|kimlik|logo|kreatif/, ['design-visual-storyteller', 'design-ui-designer', 'design-image-prompt-engineer'], 'tasarım'],
  [/marka|konumlandırma|ton of voice|mesaj/, ['design-brand-guardian'], 'marka'],
  [/içerik|metin|blog|yazı|copy|senaryo|bülten/, ['marketing-content-creator'], 'içerik ve metin'],
  [/e-?posta|mail|newsletter/, ['marketing-email-strategist'], 'e-posta'],
  [/video|film|kurgu|youtube|çekim/, ['marketing-video-optimization-specialist', 'marketing-short-video-editing-coach'], 'video'],
  [/podcast/, ['marketing-global-podcast-strategist'], 'podcast'],
  [/lansman|kampanya|büyüme|growth/, ['marketing-growth-hacker', 'project-management-studio-producer'], 'lansman / kampanya'],
  [/basın|pr\b|halkla ilişkiler|itibar|kriz iletişim/, ['marketing-pr-communications-manager'], 'iletişim / PR'],
  [/analiz|rapor|veri|dashboard|kpi/, ['support-analytics-reporter'], 'ölçüm ve raporlama'],
  [/dönüşüm takibi|etiket|pixel|ga4|ölçümleme/, ['paid-media-tracking-specialist'], 'dönüşüm takibi'],
  [/strateji|pazar araştır|rakip|trend/, ['product-trend-researcher'], 'pazar ve rakip araştırması'],
  [/kullanıcı araştır|ux|kullanılabilirlik/, ['design-ux-researcher', 'design-ux-architect'], 'kullanıcı deneyimi'],
  [/mobil|ios|android|uygulama/, ['engineering-mobile-app-builder', 'marketing-app-store-optimizer'], 'mobil uygulama'],
  [/teklif|sunum|ihale/, ['sales-proposal-strategist', 'support-executive-summary-generator'], 'teklif ve sunum'],
  [/satış|müşteri kazan|lead|potansiyel müşteri/, ['sales-offer-lead-gen-strategist', 'sales-outbound-strategist'], 'satış / müşteri kazanımı'],
  [/müşteri hizmet|destek|şikayet/, ['support-support-responder'], 'müşteri desteği'],
  [/erişilebilirlik|wcag/, ['testing-accessibility-auditor'], 'erişilebilirlik'],
  [/kvkk|gdpr|hukuk|sözleşme|yasal/, ['support-legal-compliance-checker'], 'yasal uyum'],
  [/bütçe|maliyet|finans/, ['support-finance-tracker'], 'bütçe takibi'],
  [/ürün yol haritası|roadmap|önceliklendir|mvp/, ['product-manager', 'product-sprint-prioritizer'], 'ürün yönetimi'],
];
/** Kurallı eşlemede adı geçen tüm roller (kadroyla tutarlılık testi için). */
export const TEAM_TERM_SLUGS = [...new Set(TERMS.flatMap(([, slugs]) => slugs))];
/** Her ekipte bulunması yararlı çekirdek roller (kural yolu boş kalırsa buradan tamamlanır). */
const CORE: Array<[string, string, string]> = [
  ['project-management-project-shepherd', 'Zaman çizelgesi ve ekipler arası eşgüdüm', 'İşi aşamalara böl, sorumluları ve teslim tarihlerini çıkar.'],
  ['testing-reality-checker', 'Teslim öncesi kanıta dayalı kalite kontrolü', 'Çıktıları açıklamadaki hedeflere göre denetle; eksikleri ve kanıtsız iddiaları listele.'],
  ['marketing-content-creator', 'Mesaj ve içerik üretimi', 'Ana mesajı ve içerik başlıklarını çıkar.'],
  ['design-brand-guardian', 'Marka tutarlılığı', 'Çıktıların marka diline ve görsel kimliğe uygunluğunu denetle.'],
  ['product-trend-researcher', 'Pazar ve rakip bağlamı', 'Açıklamadaki hedef için pazar ve rakip özetini çıkar.'],
];

/** Kurallı ekip önerisi: açıklamada geçen her ihtiyaç için tercih edilen rol, ihtiyaçlar arasında dönüşümlü alınır (önce her ihtiyacın birinci rolü → kapsam); son yer kalite kontrolüne ayrılır, boş yerler çekirdek rollerle tamamlanır. */
export function suggestTeamByRules(description: string, size: number, roster: AgencyRole[]): TeamPick[] {
  const text = tr(description);
  const valid = new Set(roster.map((r) => r.slug));
  // İhtiyaçlar açıklamada geçtikleri sıraya göre ele alınır.
  const needs = TERMS.map(([re, slugs, label]) => ({ at: text.search(new RegExp(re.source.replace(/ı/g, 'i'))), slugs: slugs.filter((x) => valid.has(x)), label })).filter((n) => n.at >= 0 && n.slugs.length).sort((a, b) => a.at - b.at);
  const out: TeamPick[] = [];
  for (let round = 0; round < 3 && out.length < size - 1; round++) {
    for (const n of needs) {
      if (out.length >= size - 1) break;
      const slug = n.slugs[round];
      if (!slug) continue;
      const had = out.find((p) => p.slug === slug);
      if (had) { if (!had.reason.includes(n.label)) had.reason = had.reason.replace(' ihtiyacını', `, ${n.label} ihtiyacını`); continue; }
      out.push({ slug, reason: `Açıklamadaki ${n.label} ihtiyacını karşılar`, task: `Proje açıklamasına göre ${n.label} tarafını planla ve ilk çıktıyı üret.` });
    }
  }
  for (const [slug, reason, task] of [CORE[1], CORE[0], ...CORE.slice(2)]) {
    if (out.length >= size) break;
    if (!out.some((p) => p.slug === slug) && valid.has(slug)) out.push({ slug, reason, task });
  }
  return out.slice(0, size);
}

/* ───────── Model yolu ───────── */
export const TEAM_SYSTEM = [
  'Bir ajansın proje açıklamasına göre uzman yapay zekâ rollerinden ekip kuruyorsun.',
  'Sana KADRO listesi verilir: her satır `slug | ad | bölüm | kısa tanım`. Yalnızca bu listedeki slug değerlerini kullan; liste dışı rol uydurma.',
  'Kurallar: istenen sayıda rol seç; birbirini tekrar eden roller seçme; proje gerçekten gerektirmiyorsa bölgeye/platforma özel rolleri (ör. Çin pazarı) seçme; teslim öncesi denetim için bir kalite/denetim rolü ekle.',
  'Yanıtını YALNIZCA şu biçimde tek bir JSON nesnesi olarak ver, başka metin yazma:',
  '{"team":[{"slug":"...","reason":"bu rol neden gerekli (Türkçe, en çok 140 karakter)","task":"bu role verilecek ilk görev (Türkçe, en çok 220 karakter)"}]}',
].join('\n');
export const rosterDigest = (roster: AgencyRole[]) => roster.map((r) => `${r.slug} | ${r.name} | ${r.division} | ${r.description.replace(/\s+/g, ' ').slice(0, 110)}`).join('\n');
export const teamUserPrompt = (description: string, size: number, roster: AgencyRole[], projectName: string | null) =>
  `KADRO\n${rosterDigest(roster)}\n\nPROJE${projectName ? ` (${projectName})` : ''}\n${description}\n\nİSTENEN EKİP BÜYÜKLÜĞÜ: ${size}`;

const pickSchema = z.object({ slug: z.string(), reason: z.string().default(''), task: z.string().default('') });
/** Model yanıtını çözer ve doğrular: kod bloğu ayıklanır, kadroda olmayan ya da yinelenen roller atılır. Kullanılabilir rol yoksa boş dizi. */
export function parseTeamReply(text: string, roster: AgencyRole[], size: number): TeamPick[] {
  const raw = text.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
  const start = raw.indexOf('{');
  const end = raw.lastIndexOf('}');
  if (start < 0 || end <= start) return [];
  let data: unknown;
  try { data = JSON.parse(raw.slice(start, end + 1)); } catch { return []; }
  const team = z.object({ team: z.array(pickSchema) }).safeParse(data);
  if (!team.success) return [];
  const valid = new Set(roster.map((r) => r.slug));
  const seen = new Set<string>();
  const out: TeamPick[] = [];
  for (const p of team.data.team) {
    if (!valid.has(p.slug) || seen.has(p.slug)) continue;
    seen.add(p.slug);
    out.push({ slug: p.slug, reason: p.reason.trim().slice(0, 200), task: p.task.trim().slice(0, 300) });
    if (out.length >= size) break;
  }
  return out;
}
