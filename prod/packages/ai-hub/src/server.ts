import Anthropic from '@anthropic-ai/sdk';
import { HUB_PROVIDERS, type HubMessage, type HubProvider } from './index';

/**
 * Sağlayıcı katmanı (yalnızca sunucu). Anahtarlar ortam değişkenlerinden okunur; anahtarı olmayan sağlayıcı "kullanılamıyor" görünür.
 * Model adları ortamdan değiştirilebilir (AI_HUB_OPENAI_MODEL, AI_HUB_GEMINI_MODEL); Claude modeli org ayarından gelir.
 * Fiyatlar TAHMİNİDİR (USD / 1M token: giriş, çıkış) — maliyet tavanı ve kota için kullanılır; gerçek fatura sağlayıcıdadır.
 */
const env = (k: string) => (process.env[k] ?? '').trim();
const KEYS: Record<HubProvider, () => string> = {
  claude: () => env('ANTHROPIC_API_KEY'),
  chatgpt: () => env('OPENAI_API_KEY'),
  gemini: () => env('GOOGLE_GENERATIVE_AI_API_KEY') || env('GEMINI_API_KEY'),
};
export const availableProviders = (): HubProvider[] => HUB_PROVIDERS.filter((p) => !!KEYS[p]());
const DEFAULT_MODELS = { chatgpt: 'gpt-4o', gemini: 'gemini-2.0-flash' } as const;
export const hubModel = (p: HubProvider, claudeModel: string): string =>
  p === 'claude' ? claudeModel : p === 'chatgpt' ? env('AI_HUB_OPENAI_MODEL') || DEFAULT_MODELS.chatgpt : env('AI_HUB_GEMINI_MODEL') || DEFAULT_MODELS.gemini;
const PRICE: Record<HubProvider, [number, number]> = { claude: [3, 15], chatgpt: [3, 15], gemini: [3, 15] };
export const hubCostUsd = (p: HubProvider, tokensIn: number, tokensOut: number) =>
  Math.round(((tokensIn * PRICE[p][0] + tokensOut * PRICE[p][1]) / 1_000_000) * 100000) / 100000;

export interface HubCallResult { text: string; tokens_in: number; tokens_out: number; model: string }
export interface HubCallArgs { provider: HubProvider; model: string; system: string; messages: HubMessage[]; maxTokens?: number; fetchImpl?: typeof fetch }

async function json(res: Response, who: string): Promise<Record<string, unknown>> {
  const body = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok) {
    const err = body.error as { message?: string } | undefined;
    throw new Error(`${who} ${res.status}: ${err?.message ?? 'istek reddedildi'}`);
  }
  return body;
}

export async function callProvider(a: HubCallArgs): Promise<HubCallResult> {
  const key = KEYS[a.provider]();
  if (!key) throw new Error('Sağlayıcı anahtarı tanımlı değil');
  const max = a.maxTokens ?? 1500;
  const f = a.fetchImpl ?? fetch;
  if (a.provider === 'claude') {
    const res = await new Anthropic({ apiKey: key }).messages.create({ model: a.model, max_tokens: max, system: a.system, messages: a.messages });
    return { text: res.content.map((b) => (b.type === 'text' ? b.text : '')).join('').trim(), tokens_in: res.usage.input_tokens, tokens_out: res.usage.output_tokens, model: a.model };
  }
  if (a.provider === 'chatgpt') {
    const body = await json(await f('https://api.openai.com/v1/chat/completions', {
      method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${key}` },
      body: JSON.stringify({ model: a.model, max_completion_tokens: max, messages: [{ role: 'system', content: a.system }, ...a.messages] }),
    }), 'OpenAI');
    const choice = (body.choices as Array<{ message?: { content?: string } }> | undefined)?.[0];
    const usage = (body.usage ?? {}) as { prompt_tokens?: number; completion_tokens?: number };
    return { text: (choice?.message?.content ?? '').trim(), tokens_in: usage.prompt_tokens ?? 0, tokens_out: usage.completion_tokens ?? 0, model: a.model };
  }
  const body = await json(await f(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(a.model)}:generateContent`, {
    method: 'POST', headers: { 'content-type': 'application/json', 'x-goog-api-key': key },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: a.system }] },
      contents: a.messages.map((m) => ({ role: m.role === 'assistant' ? 'model' : 'user', parts: [{ text: m.content }] })),
      generationConfig: { maxOutputTokens: max },
    }),
  }), 'Gemini');
  const parts = (body.candidates as Array<{ content?: { parts?: Array<{ text?: string }> } }> | undefined)?.[0]?.content?.parts ?? [];
  const usage = (body.usageMetadata ?? {}) as { promptTokenCount?: number; candidatesTokenCount?: number };
  return { text: parts.map((p) => p.text ?? '').join('').trim(), tokens_in: usage.promptTokenCount ?? 0, tokens_out: usage.candidatesTokenCount ?? 0, model: a.model };
}
