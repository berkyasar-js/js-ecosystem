import Anthropic from '@anthropic-ai/sdk';
import { outputSchemaFor, type AgentName, type AgentRun } from '@jscore/contracts';
import type { Repo } from '../repo/types';
import { costUsd } from './cost';
import { demoAgentOutput } from './demo';

export interface MessagesClient { messages: { create(args: Anthropic.MessageCreateParamsNonStreaming): Promise<Anthropic.Message> } }
export interface AgentResult { output: unknown; run: Omit<AgentRun, 'id' | 'org_id' | 'created_at'> }

const FALLBACK_MODEL = 'claude-sonnet-4-5';
const stripFences = (s: string) => s.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');

/**
 * Ajan çalıştırır. Demo modda veya ANTHROPIC_API_KEY yoksa deterministik çıktı döner (status: 'demo').
 * Gerçek çağrıda: aktif prompt (agent_prompts) → Claude → JSON → zod doğrulaması → maliyet kaydı.
 */
export async function runAgent(args: { agent: AgentName; input: Record<string, unknown>; repo: Repo; trigger?: string; client?: MessagesClient | null }): Promise<AgentResult> {
  const { agent, input, repo } = args;
  const schema = outputSchemaFor(agent);
  const trigger = args.trigger ?? 'manual';
  const client = args.client === undefined ? (process.env.ANTHROPIC_API_KEY ? new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY }) : null) : args.client;

  if (repo.mode === 'demo' || !client) {
    const output = schema.parse(demoAgentOutput(agent, input));
    return { output, run: { agent, trigger, input, output, model: 'demo', tokens_in: 0, tokens_out: 0, cost_usd: 0, latency_ms: 0, status: 'demo' } };
  }

  const prompt = await repo.getActivePrompt(agent);
  if (!prompt) throw new Error(`Aktif prompt bulunamadı: ${agent} (npm run prompts:sql ile yükleyin)`);
  const model = prompt.model || FALLBACK_MODEL;
  const t0 = Date.now();
  const res = await client.messages.create({
    model, max_tokens: 2000,
    system: `${prompt.system_prompt}\n\nYanıtını yalnızca tek bir JSON nesnesi olarak ver.`,
    messages: [{ role: 'user', content: JSON.stringify(input) }],
  });
  const text = res.content.map((b) => (b.type === 'text' ? b.text : '')).join('');
  const base = { agent, trigger, input, model, tokens_in: res.usage.input_tokens, tokens_out: res.usage.output_tokens, cost_usd: costUsd(model, res.usage.input_tokens, res.usage.output_tokens), latency_ms: Date.now() - t0 };
  let parsed: ReturnType<typeof schema.safeParse>;
  try { parsed = schema.safeParse(JSON.parse(stripFences(text))); } catch { parsed = schema.safeParse(undefined); }
  if (!parsed.success) {
    await repo.logAgentRun({ ...base, output: { raw: text.slice(0, 2000) }, status: 'error' });
    throw new Error('Model çıktısı şemaya uymuyor');
  }
  const run = { ...base, output: parsed.data, status: 'ok' as const };
  await repo.logAgentRun(run);
  return { output: parsed.data, run };
}
