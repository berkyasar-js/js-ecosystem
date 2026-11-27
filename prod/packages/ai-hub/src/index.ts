/**
 * @jscore/ai-hub — saf çekirdek (istemci + sunucu + test). Sağlayıcı çağrıları `./server` içindedir.
 * Kayıt yeni tablo gerektirmez: `agent_runs.agent = 'hub:<sağlayıcı>'`; sohbet İÇERİĞİ kayda yazılmaz (yalnızca ölçüm + departman).
 */
import { z } from 'zod';

export const HUB_PROVIDERS = ['claude', 'chatgpt', 'gemini'] as const;
export type HubProvider = (typeof HUB_PROVIDERS)[number];
export type HubChoice = HubProvider | 'auto';
export const HUB_PROVIDER_INFO: Record<HubProvider, { label: string; vendor: string; strength: string; env: string }> = {
  claude: { label: 'Claude', vendor: 'Anthropic', strength: 'Kod, derin analiz, uzun metin ve strateji', env: 'ANTHROPIC_API_KEY' },
  chatgpt: { label: 'ChatGPT', vendor: 'OpenAI', strength: 'Yaratıcı reklam metni, beyin fırtınası, genel asistanlık', env: 'OPENAI_API_KEY' },
  gemini: { label: 'Gemini', vendor: 'Google', strength: 'Uzun doküman, araştırma ve Google ekosistemi', env: 'GOOGLE_GENERATIVE_AI_API_KEY' },
};
export const isHubProvider = (v: unknown): v is HubProvider => typeof v === 'string' && (HUB_PROVIDERS as readonly string[]).includes(v);

/* ───────── Otomatik yönlendirme (kurallı; model çağrısı yok) ───────── */
const tr = (s: string) => s.toLocaleLowerCase('tr');
const ROUTES: Array<{ provider: HubProvider; reason: string; re: RegExp }> = [
  { provider: 'claude', reason: 'kod / teknik iş', re: /\b(kod|code|bug|hata ayıkla|typescript|javascript|python|sql|api|regex|refactor|fonksiyon|script|deploy|migration)\b/ },
  { provider: 'gemini', reason: 'araştırma / uzun doküman', re: /\b(araştır|araştırma|kaynak|güncel|trend|rakip analizi|doküman|pdf|video|transkript|özetle|google|sheets|workspace)\b/ },
  { provider: 'chatgpt', reason: 'yaratıcı metin / beyin fırtınası', re: /\b(slogan|reklam metni|başlık öner|caption|post metni|beyin fırtınası|fikir üret|isim öner|senaryo|hikaye|kampanya fikri|yaratıcı)\b/ },
  { provider: 'claude', reason: 'analiz / strateji', re: /\b(strateji|analiz|plan|rapor|sözleşme|teklif|bütçe|risk|karşılaştır|değerlendir|yol haritası)\b/ },
];
export interface RouteResult { provider: HubProvider; reason: string; fallback: boolean }
/** İstekten sağlayıcı seçer. Seçilen sağlayıcı kullanılamıyorsa sıradaki kullanılabilir olana düşer (`fallback`). Hiçbiri yoksa null. */
export function routeProvider(text: string, available: HubProvider[], choice: HubChoice = 'auto'): RouteResult | null {
  if (available.length === 0) return null;
  const order = HUB_PROVIDERS.filter((p) => available.includes(p));
  if (choice !== 'auto') return available.includes(choice) ? { provider: choice, reason: 'elle seçildi', fallback: false } : { provider: order[0], reason: `${HUB_PROVIDER_INFO[choice].label} kullanılamıyor`, fallback: true };
  const hit = ROUTES.find((r) => r.re.test(tr(text)));
  if (!hit) return { provider: order[0], reason: 'genel istek', fallback: false };
  return available.includes(hit.provider) ? { provider: hit.provider, reason: hit.reason, fallback: false } : { provider: order[0], reason: `${hit.reason}; ${HUB_PROVIDER_INFO[hit.provider].label} kullanılamıyor`, fallback: true };
}

/* ───────── Rol ve kapsam bağlamı ───────── */
export interface HubContext {
  org: string; name: string; title: string | null; roleLabel: string; tierLabel: string; department: string | null;
  /** Kullanıcının GÖREBİLDİĞİ markalar ve projeler (RLS'ten geçen). Modele yalnızca bunlar verilir. */
  brands: string[]; projects: string[];
}
const list = (items: string[], max: number) => (items.length ? `${items.slice(0, max).join(', ')}${items.length > max ? ` (+${items.length - max})` : ''}` : 'yok');
export function hubSystemPrompt(ctx: HubContext): string {
  return [
    `Sen ${ctx.org} ajansının iç çalışma asistanısın. Yanıtlarını Türkçe ver; kısa, net ve uygulanabilir ol.`,
    '',
    'KONUŞTUĞUN KİŞİ',
    `- Ad: ${ctx.name}${ctx.title ? ` · ${ctx.title}` : ''}`,
    `- Rol: ${ctx.roleLabel} (${ctx.tierLabel})`,
    `- Departman: ${ctx.department ?? 'belirtilmemiş'}`,
    `- Yetkili olduğu markalar: ${list(ctx.brands, 30)}`,
    `- Görebildiği projeler: ${list(ctx.projects, 30)}`,
    '',
    'KAPSAM KURALLARI',
    '- Yukarıdaki listeler bu kişinin sistemde görebildiklerinin adlarıdır; elinde bunların dışında şirket verisi yok. Liste dışındaki marka, proje, kişi, maaş, bordro ya da finans rakamı hakkında bilgi uydurma; "bu bilgiye erişimim yok" de.',
    '- Araç, dosya ya da web erişimin yok: yalnızca metin üretirsin. Yapamadığın bir işi yapılmış gibi yazma.',
    '- Emin olmadığın şeyi varsayım olarak işaretle.',
  ].join('\n');
}

/* ───────── İstek şeması ───────── */
export const hubMessageSchema = z.object({ role: z.enum(['user', 'assistant']), content: z.string().trim().min(1).max(8000) });
export type HubMessage = z.infer<typeof hubMessageSchema>;
export const hubChatSchema = z.object({
  provider: z.enum(['auto', ...HUB_PROVIDERS]).default('auto'),
  messages: z.array(hubMessageSchema).min(1).max(40).refine((m) => m.length > 0 && m[m.length - 1].role === 'user', 'Son mesaj kullanıcıdan olmalı'),
  demo_spend_usd: z.number().min(0).optional(),
  demo_cap_usd: z.number().min(0).optional(),
});
/** Geçmişi sondan başlayarak karakter bütçesine sığdırır (son kullanıcı mesajı her zaman kalır; ilk kalan mesaj kullanıcıdan olur). */
export function trimHistory(messages: HubMessage[], maxChars = 24000): HubMessage[] {
  const out: HubMessage[] = [];
  let used = 0;
  for (let i = messages.length - 1; i >= 0; i -= 1) {
    used += messages[i].content.length;
    if (out.length && used > maxChars) break;
    out.unshift(messages[i]);
  }
  while (out.length > 1 && out[0].role !== 'user') out.shift();
  return out;
}

/* ───────── Kayıt ve departman kotası ───────── */
export const HUB_PREFIX = 'hub:';
export const hubAgentId = (p: HubProvider) => `${HUB_PREFIX}${p}`;
export const isHubAgent = (agent: string) => agent.startsWith(HUB_PREFIX);
export interface SpendRow { input: unknown; cost_usd: number | string; created_at: string }
/** Ay içi departman harcaması (USD): `input.department` eşleşen tüm ajan çalıştırmaları (AI alanı + Ajans Ofisi). */
export function departmentSpendUsd(rows: SpendRow[], department: string, month: string): number {
  return rows.reduce((a, r) => {
    const dep = r.input && typeof r.input === 'object' ? (r.input as Record<string, unknown>).department : null;
    return dep === department && r.created_at.startsWith(month) ? a + Number(r.cost_usd) : a;
  }, 0);
}
export interface QuotaStatus { capUsd: number | null; spentUsd: number; remainingUsd: number | null; exceeded: boolean; pct: number | null }
/** Kota: tanımlı değilse ya da 0 ise sınırsız (null). */
export function quotaStatus(spentUsd: number, capUsd: number | null | undefined): QuotaStatus {
  if (!capUsd || capUsd <= 0) return { capUsd: null, spentUsd, remainingUsd: null, exceeded: false, pct: null };
  return { capUsd, spentUsd, remainingUsd: Math.max(0, capUsd - spentUsd), exceeded: spentUsd >= capUsd, pct: Math.min(100, Math.round((spentUsd / capUsd) * 100)) };
}
export class DepartmentQuotaError extends Error {
  readonly status = 402;
  constructor(public department: string, public quota: QuotaStatus) {
    super(`“${department}” departmanının aylık yapay zekâ kotası doldu ($${quota.spentUsd.toFixed(2)} / $${(quota.capUsd ?? 0).toFixed(2)}). Kotayı yönetim panelinden (Ajanlar & Maliyet) artırabilirsin.`);
    this.name = 'DepartmentQuotaError';
  }
}

/** Demo / anahtarsız mod: gerçek model çağrısı yok. */
export function demoHubReply(provider: HubProvider, text: string, ctx: HubContext): string {
  return [
    `${HUB_PROVIDER_INFO[provider].label} — demo yanıtı (gerçek model çağrısı yapılmadı).`,
    `Soru: ${text.trim().replace(/\s+/g, ' ').slice(0, 200)}`,
    `Bağlam: ${ctx.roleLabel}${ctx.department ? ` · ${ctx.department}` : ''} · ${ctx.brands.length} marka, ${ctx.projects.length} proje.`,
  ].join('\n');
}
