import { describe, expect, it } from 'vitest';
import { MODULES, NAV_GROUPS, canAccessModule, orgSettingsPatchSchema } from '@jscore/contracts';
import {
  DepartmentQuotaError, HUB_PROVIDERS, demoHubReply, departmentSpendUsd, hubAgentId, hubChatSchema, hubSystemPrompt, isHubAgent, quotaStatus, routeProvider, trimHistory,
  type HubContext, type HubMessage,
} from '@jscore/ai-hub';
import { availableProviders, callProvider, GATEWAY_URL, hubCostUsd, hubModel } from '@jscore/ai-hub/server';

const ctx: HubContext = { org: 'Jobs Studio', name: 'Seda', title: 'Art Director', roleLabel: 'Creative', tierLabel: 'Ekip Üyesi', department: 'Kreatif', brands: ['Anova', 'Wellana'], projects: ['Anova · Lansman filmi'] };
const ALL = [...HUB_PROVIDERS];

describe('AI Çalışma Alanı — yönlendirme', () => {
  it('işin türüne göre sağlayıcı seçer', () => {
    expect(routeProvider('Bu TypeScript fonksiyonundaki hata nedir?', ALL)).toMatchObject({ provider: 'claude', fallback: false });
    expect(routeProvider('Lansman için slogan ve reklam metni öner', ALL)).toMatchObject({ provider: 'chatgpt', fallback: false });
    expect(routeProvider('Rakip analizi için güncel kaynak araştır', ALL)).toMatchObject({ provider: 'gemini', fallback: false });
    expect(routeProvider('Merhaba', ALL)).toMatchObject({ provider: 'claude', reason: 'genel istek' });
  });
  it('seçilen sağlayıcı yoksa kullanılabilir olana düşer; hiçbiri yoksa null', () => {
    expect(routeProvider('slogan öner', ['claude'])).toMatchObject({ provider: 'claude', fallback: true });
    expect(routeProvider('x', ['gemini'], 'chatgpt')).toMatchObject({ provider: 'gemini', fallback: true });
    expect(routeProvider('x', ALL, 'gemini')).toMatchObject({ provider: 'gemini', reason: 'elle seçildi', fallback: false });
    expect(routeProvider('x', [])).toBeNull();
  });
});

describe('AI Çalışma Alanı — bağlam ve şema', () => {
  it('sistem bağlamı rol, departman ve yalnızca verilen marka/proje adlarını taşır', () => {
    const s = hubSystemPrompt(ctx);
    expect(s).toContain('Departman: Kreatif');
    expect(s).toContain('Anova, Wellana');
    expect(s).toContain('erişimim yok');
    expect(hubSystemPrompt({ ...ctx, department: null, brands: [] })).toContain('Yetkili olduğu markalar: yok');
    const many = hubSystemPrompt({ ...ctx, brands: Array.from({ length: 35 }, (_, i) => `M${i}`) });
    expect(many).toContain('(+5)'); expect(many).not.toContain('M34');
  });
  it('istek şeması: son mesaj kullanıcıdan, sınırlar', () => {
    expect(hubChatSchema.safeParse({ messages: [{ role: 'user', content: 'selam' }] }).success).toBe(true);
    expect(hubChatSchema.safeParse({ messages: [{ role: 'assistant', content: 'x' }] }).success).toBe(false);
    expect(hubChatSchema.safeParse({ provider: 'llama', messages: [{ role: 'user', content: 'x' }] }).success).toBe(false);
    expect(hubChatSchema.safeParse({ messages: [] }).success).toBe(false);
  });
  it('geçmiş bütçeye sığdırılır; son mesaj kalır, ilk mesaj kullanıcıdan', () => {
    const m: HubMessage[] = [{ role: 'user', content: 'a'.repeat(50) }, { role: 'assistant', content: 'b'.repeat(50) }, { role: 'user', content: 'c'.repeat(50) }];
    expect(trimHistory(m, 1000)).toHaveLength(3);
    expect(trimHistory(m, 110)).toEqual([m[2]]); // asistanla başlayan parça atılır
    expect(trimHistory(m, 10)).toEqual([m[2]]);
  });
  it('demo yanıtı model çağrısı yapılmadığını söyler', () => { expect(demoHubReply('gemini', 'soru', ctx)).toContain('gerçek model çağrısı yapılmadı'); });
});

describe('AI Çalışma Alanı — kota ve kayıt', () => {
  const rows = [
    { input: { department: 'Kreatif' }, cost_usd: '1.5', created_at: '2026-12-02T10:00:00Z' },
    { input: { department: 'Kreatif' }, cost_usd: 0.5, created_at: '2026-12-09T10:00:00Z' },
    { input: { department: 'Hesap' }, cost_usd: 9, created_at: '2026-12-09T10:00:00Z' },
    { input: { department: 'Kreatif' }, cost_usd: 4, created_at: '2026-11-30T10:00:00Z' },
    { input: null, cost_usd: 7, created_at: '2026-12-01T10:00:00Z' },
  ];
  it('departman harcaması yalnızca o departman ve o ay', () => { expect(departmentSpendUsd(rows, 'Kreatif', '2026-12')).toBe(2); expect(departmentSpendUsd(rows, 'Yok', '2026-12')).toBe(0); });
  it('kota: tanımsız / 0 sınırsız; dolunca aşılmış', () => {
    expect(quotaStatus(2, undefined)).toMatchObject({ capUsd: null, exceeded: false, pct: null });
    expect(quotaStatus(2, 0).capUsd).toBeNull();
    expect(quotaStatus(2, 8)).toMatchObject({ remainingUsd: 6, exceeded: false, pct: 25 });
    expect(quotaStatus(8, 8)).toMatchObject({ remainingUsd: 0, exceeded: true, pct: 100 });
    expect(new DepartmentQuotaError('Kreatif', quotaStatus(8, 8)).message).toContain('$8.00 / $8.00');
  });
  it('ajan kimliği ve ayar şeması', () => {
    expect(hubAgentId('chatgpt')).toBe('hub:chatgpt'); expect(isHubAgent('hub:claude')).toBe(true); expect(isHubAgent('agency:x')).toBe(false);
    expect(orgSettingsPatchSchema.safeParse({ ai: { monthly_cap_usd: 50, default_model: 'm', board_enabled: true, department_caps_usd: { Kreatif: 10 } } }).success).toBe(true);
    expect(orgSettingsPatchSchema.safeParse({ ai: { monthly_cap_usd: 50, default_model: 'm', board_enabled: true, department_caps_usd: { Kreatif: -1 } } }).success).toBe(false);
  });
  it('modül kaydı ve erişim', () => {
    expect(MODULES.find((m) => m.id === 'aihub')).toMatchObject({ slug: 'ai', live: true });
    expect(NAV_GROUPS.find((g) => g.id === 'team')!.children.some((c) => c.href === '/app/ai')).toBe(true);
    for (const r of ['owner', 'pm', 'creative', 'finance', 'hr'] as const) expect(canAccessModule(r, 'aihub'), r).toBe(true);
    for (const r of ['client_admin', 'client_viewer', 'freelancer'] as const) expect(canAccessModule(r, 'aihub'), r).toBe(false);
  });
});

describe('AI Çalışma Alanı — sağlayıcı çağrıları (ağ taklidi)', () => {
  const sys = 'SİSTEM';
  const messages: HubMessage[] = [{ role: 'user', content: 'selam' }, { role: 'assistant', content: 'merhaba' }, { role: 'user', content: 'devam' }];
  it('OpenAI: sistem mesajı başta, Bearer anahtar, kullanım okunur', async () => {
    process.env.OPENAI_API_KEY = 'sk-test';
    let seen: { url: string; init: RequestInit } | null = null;
    const fetchImpl = (async (url: string, init: RequestInit) => { seen = { url, init }; return new Response(JSON.stringify({ choices: [{ message: { content: ' yanıt ' } }], usage: { prompt_tokens: 12, completion_tokens: 5 } }), { status: 200 }); }) as unknown as typeof fetch;
    const r = await callProvider({ provider: 'chatgpt', model: hubModel('chatgpt', 'c'), system: sys, messages, fetchImpl });
    expect(r).toMatchObject({ text: 'yanıt', tokens_in: 12, tokens_out: 5 });
    const body = JSON.parse(String(seen!.init.body));
    expect(seen!.url).toBe('https://api.openai.com/v1/chat/completions');
    expect((seen!.init.headers as Record<string, string>).authorization).toBe('Bearer sk-test');
    expect(body.messages[0]).toEqual({ role: 'system', content: sys });
    expect(body.messages).toHaveLength(4);
    delete process.env.OPENAI_API_KEY;
  });
  it('Gemini: asistan → model rolü, sistem talimatı ayrı, anahtar başlıkta', async () => {
    process.env.GOOGLE_GENERATIVE_AI_API_KEY = 'g-test';
    let seen: { url: string; init: RequestInit } | null = null;
    const fetchImpl = (async (url: string, init: RequestInit) => { seen = { url, init }; return new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: 'a' }, { text: 'b' }] } }], usageMetadata: { promptTokenCount: 7, candidatesTokenCount: 3 } }), { status: 200 }); }) as unknown as typeof fetch;
    const r = await callProvider({ provider: 'gemini', model: 'gemini-x', system: sys, messages, fetchImpl });
    expect(r).toMatchObject({ text: 'ab', tokens_in: 7, tokens_out: 3 });
    const body = JSON.parse(String(seen!.init.body));
    expect(seen!.url).toContain('/models/gemini-x:generateContent');
    expect(seen!.url).not.toContain('g-test'); // anahtar URL'de değil
    expect((seen!.init.headers as Record<string, string>)['x-goog-api-key']).toBe('g-test');
    expect(body.contents.map((c: { role: string }) => c.role)).toEqual(['user', 'model', 'user']);
    expect(body.systemInstruction.parts[0].text).toBe(sys);
    delete process.env.GOOGLE_GENERATIVE_AI_API_KEY;
  });
  it('sağlayıcı hatası anlaşılır mesajla fırlatılır; anahtar yoksa çağrı yapılmaz', async () => {
    process.env.OPENAI_API_KEY = 'sk-test';
    const bad = (async () => new Response(JSON.stringify({ error: { message: 'model not found' } }), { status: 404 })) as unknown as typeof fetch;
    await expect(callProvider({ provider: 'chatgpt', model: 'yok', system: sys, messages, fetchImpl: bad })).rejects.toThrow('OpenAI 404: model not found');
    delete process.env.OPENAI_API_KEY;
    await expect(callProvider({ provider: 'chatgpt', model: 'x', system: sys, messages })).rejects.toThrow('anahtarı tanımlı değil');
    expect(hubCostUsd('claude', 1_000_000, 0)).toBe(3);
  });
  it('anahtar yoksa Vercel üzerinde AI Gateway yedeği: sağlayıcı ön ekli model, Bearer token, OpenAI biçimi', async () => {
    process.env.AI_GATEWAY_API_KEY = 'gw-test';
    expect(availableProviders()).toEqual(expect.arrayContaining(['chatgpt', 'gemini']));
    expect(hubModel('chatgpt', 'c')).toBe('openai/gpt-4o');
    expect(hubModel('gemini', 'c')).toBe('google/gemini-2.5-flash');
    let seen: { url: string; init: RequestInit } | null = null;
    const fetchImpl = (async (url: string, init: RequestInit) => { seen = { url, init }; return new Response(JSON.stringify({ choices: [{ message: { content: 'gw' } }], usage: { prompt_tokens: 4, completion_tokens: 2 } }), { status: 200 }); }) as unknown as typeof fetch;
    const r = await callProvider({ provider: 'gemini', model: hubModel('gemini', 'c'), system: sys, messages, fetchImpl });
    expect(r).toMatchObject({ text: 'gw', tokens_in: 4, tokens_out: 2, model: 'google/gemini-2.5-flash' });
    expect(seen!.url).toBe(GATEWAY_URL);
    expect((seen!.init.headers as Record<string, string>).authorization).toBe('Bearer gw-test');
    expect(JSON.parse(String(seen!.init.body)).messages[0]).toEqual({ role: 'system', content: sys });
    process.env.AI_HUB_GATEWAY = 'off';
    expect(availableProviders()).not.toContain('chatgpt');
    delete process.env.AI_HUB_GATEWAY; delete process.env.AI_GATEWAY_API_KEY;
  });
});

describe('AI sağlayıcı seçimi — ajan çalıştırmaları', () => {
  it('anahtarı olmayan sağlayıcı açık hatayla reddedilir; sessizce başka modele düşülmez', async () => {
    const { ProviderUnavailableError, requireProvider } = await import('@jscore/ai-hub/server');
    const keep = { a: process.env.ANTHROPIC_API_KEY, o: process.env.OPENAI_API_KEY, g: process.env.GOOGLE_GENERATIVE_AI_API_KEY, g2: process.env.GEMINI_API_KEY };
    try {
      process.env.ANTHROPIC_API_KEY = 'x'; delete process.env.OPENAI_API_KEY; delete process.env.GOOGLE_GENERATIVE_AI_API_KEY; delete process.env.GEMINI_API_KEY;
      expect(requireProvider(null)).toBe('claude');
      expect(requireProvider(undefined)).toBe('claude');
      expect(() => requireProvider('chatgpt')).toThrow(ProviderUnavailableError);
      expect(() => requireProvider('gemini')).toThrow(/Gemini kullanılamıyor/);
      process.env.OPENAI_API_KEY = 'y'; process.env.GEMINI_API_KEY = 'z';
      expect(requireProvider('chatgpt')).toBe('chatgpt');
      expect(requireProvider('gemini')).toBe('gemini');
    } finally {
      for (const [k, v] of [['ANTHROPIC_API_KEY', keep.a], ['OPENAI_API_KEY', keep.o], ['GOOGLE_GENERATIVE_AI_API_KEY', keep.g], ['GEMINI_API_KEY', keep.g2]] as const) { if (v === undefined) delete process.env[k]; else process.env[k] = v; }
    }
  });
});
